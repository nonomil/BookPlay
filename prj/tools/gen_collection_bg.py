# -*- coding: utf-8 -*-
"""Generate JTTW collection background images via CliproxAPI.

OpenAI Images compatible endpoint: POST <base>/images/generations with model
gpt-image-2, n=1, response_format=b64_json. Writes JPEGs into
content/assets/collections (default), run records into
.agent-control/tasks/jttw-map-bg-01/gen-<id>.json and a final manifest.json.

API key comes from the CLIPROX_API_KEY environment variable ONLY; it is never
printed, logged, or written to any file.
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[2]
DEFAULT_SPEC = REPO / "prj" / "tools" / "collection_bg_prompts.json"
DEFAULT_OUT = REPO / "content" / "assets" / "collections"
RECORD_DIR = REPO / ".agent-control" / "tasks" / "jttw-map-bg-01"
DEFAULT_BASE = "https://rn6.nonom.top/v1"
CA_FILE = "prj/tools/cliproxy-rn6.pem"
MAX_BODY_KEEP = 4000


class CloudflareBlocked(Exception):
    """Hard stop: upstream answered Cloudflare 403/1010. Never retry it."""

    def __init__(self, status: int, cf_ray: str, url: str, cid: str) -> None:
        super().__init__(
            f"Cloudflare {status}/1010 cid={cid} cf-ray={cf_ray} url={url} "
            f"utc={datetime.now(timezone.utc).isoformat()}"
        )
        self.status = status
        self.cf_ray = cf_ray
        self.url = url
        self.cid = cid


def redact(text: str, key: str) -> str:
    """Strip the API key and any bearer header spelling out of text."""
    if key:
        text = text.replace("Bearer " + key, "[REDACTED]")
        text = text.replace(key, "[REDACTED]")
    return text


def api_key() -> str:
    k = os.environ.get("CLIPROX_API_KEY")
    if not k:
        raise SystemExit("CLIPROX_API_KEY missing")
    return k


def api_base() -> str:
    return os.environ.get("CLIPROX_API_BASE") or DEFAULT_BASE


def size_chain(requested: str, preference: list[str]) -> list[str]:
    """Attempt order: requested size first, then the rest of the spec preference."""
    if requested in preference:
        chain = preference[preference.index(requested):]
    else:
        chain = [requested] + preference
    seen: set[str] = set()
    out: list[str] = []
    for s in chain:
        if s not in seen:
            seen.add(s)
            out.append(s)
    return out


_OPENER = None


def opener() -> urllib.request.OpenerDirector:
    """One opener: pinned self-signed CA + explicit ambient-proxy bypass."""
    global _OPENER
    if _OPENER is None:
        ca = REPO / CA_FILE
        if not ca.is_file():
            raise SystemExit("CA_FILE missing")
        # create_default_context keeps check_hostname=True (SAN has rn6.nonom.top)
        ctx = ssl.create_default_context(cafile=str(ca))
        _OPENER = urllib.request.build_opener(
            urllib.request.ProxyHandler({}),           # bypass env HTTPS_PROXY 10808
            urllib.request.HTTPSHandler(context=ctx),  # trust cliproxy-rn6.pem
        )
    return _OPENER


def post_once(base: str, key: str, payload: dict, timeout: int):
    """POST /images/generations; return (status, body_bytes, headers).

    TLS is verified against the pinned self-signed CA (CA_FILE) and the
    ambient HTTP/HTTPS proxy is bypassed. Same fixed endpoint, same key.

    Raises urllib.error.HTTPError (4xx/5xx), URLError or TimeoutError.
    """
    url = base.rstrip("/") + "/images/generations"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": "Bearer " + key,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with opener().open(req, timeout=timeout) as resp:
        return resp.status, resp.read(), resp.headers


def parse_body(status: int, body: bytes, key: str):
    """Return ('ok', parsed) only when data[0].b64_json exists, else ('fail', reason)."""
    try:
        parsed = json.loads(body.decode("utf-8", errors="replace"))
    except json.JSONDecodeError as e:
        return "fail", f"response not JSON ({e})"
    if not isinstance(parsed, dict):
        return "fail", "response is not an object"
    if "error" in parsed:
        return "fail", "body has error: " + redact(json.dumps(parsed.get("error")), key)
    data = parsed.get("data")
    if not isinstance(data, list) or not data:
        return "fail", "response has no data array"
    if not isinstance(data[0], dict) or not data[0].get("b64_json"):
        return "fail", "data[0].b64_json missing"
    return "ok", parsed


def write_image(raw: bytes, target: Path):
    """Detect real signature; write cNN.jpg and return (format, width, height)."""
    if raw[:3] == b"\xff\xd8\xff":
        target.write_bytes(raw)
        with Image.open(target) as im:
            return im.format, im.size[0], im.size[1]
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        with Image.open(io.BytesIO(raw)) as im:
            im.convert("RGB").save(target, "JPEG", quality=88, optimize=True)
        with Image.open(target) as im:
            return im.format, im.size[0], im.size[1]
    raise ValueError("unknown image signature")


def generate_one(cid: str, spec: dict, key: str, base: str, out_dir: Path,
                 sizes: list[str], retries: int, timeout: int, overwrite: bool,
                 state: dict):
    record: dict = {
        "id": cid,
        "requested_size": sizes[0],
        "actual_size": None,
        "format": None,
        "bytes": None,
        "width": None,
        "height": None,
        "http_status": None,
        "attempts": 0,
        "tls_verified": True,
        "ok": False,
    }
    target = out_dir / (cid + ".jpg")
    col = next((c for c in spec["collections"] if c["id"] == cid), None)
    if col is None:
        record["error"] = f"id {cid} not found in spec"
        return record
    if target.exists() and not overwrite:
        with Image.open(target) as im:
            w, h = im.size
            fmt = im.format
        record.update(
            ok=True, actual_size="existing", format=fmt,
            bytes=target.stat().st_size, width=w, height=h,
            http_status=0, attempts=0,
        )
        return record

    prompt = (col["prompt"] + " " + spec["style_suffix"]).strip()
    model = spec.get("model", "gpt-image-2")
    last_status = None
    last_fail = None
    last_body = b""

    for size in sizes:
        payload = {
            "model": model,
            "prompt": prompt,
            "n": 1,
            "size": size,
            "response_format": "b64_json",
        }
        for _ in range(retries + 1):
            record["attempts"] += 1
            try:
                status, body, _headers = post_once(base, key, payload, timeout)
                state["timeouts"] = 0
            except urllib.error.HTTPError as e:
                state["timeouts"] = 0
                status = e.code
                body = e.read()
                if e.code == 403 or b"1010" in body:
                    raise CloudflareBlocked(
                        e.code,
                        (e.headers.get("cf-ray") or "?") if e.headers else "?",
                        base.rstrip("/") + "/images/generations",
                        cid,
                    )
                last_status = status
                last_body = body
                last_fail = f"HTTP {status}: {redact(body.decode('utf-8', errors='replace')[:200], key)}"
                if status >= 500:
                    continue  # transient upstream error: retry same size
                break  # other 4xx: drop to next size
            except (urllib.error.URLError, TimeoutError, OSError) as e:
                reason = getattr(e, "reason", e)
                is_timeout = isinstance(reason, TimeoutError) or isinstance(e, TimeoutError)
                if is_timeout:
                    state["timeouts"] += 1
                    if state["timeouts"] >= 2:
                        raise SystemExit(
                            f"UPSTREAM_TIMEOUT_X2 cid={cid} last_size={size} "
                            f"utc={datetime.now(timezone.utc).isoformat()} msg={e!r}"
                        )
                else:
                    state["timeouts"] = 0
                last_status = None
                last_fail = f"network error {type(e).__name__}: {e}"
                continue  # retry same size
            last_status = status
            verdict, info = parse_body(status, body, key)
            if verdict != "ok":
                last_fail = f"status={status} {info}"
                last_body = body
                break  # rejected body: drop to next size
            # success for this size
            try:
                raw = base64.b64decode(info["data"][0]["b64_json"])
            except (ValueError, TypeError) as e:
                last_fail = f"base64 decode failed: {type(e).__name__}: {e}"
                break
            try:
                written_format, w, h = write_image(raw, target)
            except ValueError as e:
                last_fail = f"{e} sig_hex={raw[:16].hex()}"
                record["sig_hex"] = raw[:16].hex()
                break
            # 这个接口会按 prompt 语义自己改画布比例（见 diag_image_size.py 的记录）。
            # 竖图铺到横向地图页上会被裁得只剩中间一条，必须当失败处理。
            if h <= 0 or (w / h) < 1.4:
                target.unlink(missing_ok=True)
                last_fail = f"NOT_LANDSCAPE got {w}x{h} ratio={w / max(1, h):.2f} (need >= 1.4)"
                continue  # 同一 size 再试，用完 retries 就落到下一个 size
            record.update(
                ok=True, actual_size=f"{w}x{h}", format=written_format,
                bytes=target.stat().st_size, width=w, height=h,
                http_status=status,
            )
            return record

    record["http_status"] = last_status
    record["error"] = last_fail or "unknown failure"
    if last_body:
        record["error_body"] = redact(
            last_body.decode("utf-8", errors="replace")[:MAX_BODY_KEEP], key
        )
    return record


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Generate collection background images via CliproxAPI"
    )
    ap.add_argument("--ids", required=True, help="comma-separated ids, e.g. c01,c02")
    ap.add_argument("--spec", default=str(DEFAULT_SPEC), help="prompts spec json")
    ap.add_argument("--out", default=str(DEFAULT_OUT), help="output dir")
    ap.add_argument("--size", default="1536x1024", help="first size to try")
    ap.add_argument("--retries", type=int, default=2, help="retries per size")
    ap.add_argument("--timeout", type=int, default=300, help="per-request timeout s")
    ap.add_argument("--overwrite", action="store_true", help="regenerate existing files")
    args = ap.parse_args()

    ids = [x.strip() for x in args.ids.split(",") if x.strip()]
    if not ids:
        ap.error("--ids must name at least one collection id")

    key = api_key()
    base = api_base()
    with io.open(args.spec, "r", encoding="utf-8") as f:
        spec = json.load(f)
    sizes = size_chain(args.size, spec["size_preference"])
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    RECORD_DIR.mkdir(parents=True, exist_ok=True)

    state = {"timeouts": 0}
    records: list[dict] = []
    for cid in ids:
        rec = generate_one(
            cid, spec, key, base, out_dir, sizes,
            args.retries, args.timeout, args.overwrite, state,
        )
        records.append(rec)
        rec_path = RECORD_DIR / f"gen-{cid}.json"
        with io.open(rec_path, "w", encoding="utf-8") as f:
            json.dump(rec, f, ensure_ascii=False, indent=2)
        print(
            f"{cid}: ok={rec['ok']} size={rec.get('actual_size')} "
            f"format={rec.get('format')} bytes={rec.get('bytes')} "
            f"status={rec.get('http_status')} attempts={rec.get('attempts')}",
            flush=True,
        )

    manifest = []
    for rec in records:
        if not rec.get("ok") or not rec.get("width"):
            continue
        manifest.append({
            "id": rec["id"],
            "file": "assets/collections/" + rec["id"] + ".jpg",
            "width": rec["width"],
            "height": rec["height"],
            "bytes": rec["bytes"],
            "model": spec.get("model", "gpt-image-2"),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        })
    man_path = out_dir / "manifest.json"
    with io.open(man_path, "w", encoding="utf-8") as f:
        json.dump({"generated": manifest}, f, ensure_ascii=False, indent=2)

    sys.exit(0 if sum(1 for r in records if r.get("ok")) == len(records) else 1)


if __name__ == "__main__":
    try:
        main()
    except CloudflareBlocked as e:
        print(
            f"BLOCKER: {e} cf-ray={e.cf_ray} status={e.status} url={e.url} "
            f"utc={datetime.now(timezone.utc).isoformat()}",
            file=sys.stderr,
        )
        rec = {
            "id": e.cid,
            "ok": False,
            "error": f"Cloudflare {e.status}/1010",
            "cf_ray": e.cf_ray,
            "url": e.url,
            "utc": datetime.now(timezone.utc).isoformat(),
        }
        rec_path = RECORD_DIR / f"gen-{e.cid}.json"
        try:
            RECORD_DIR.mkdir(parents=True, exist_ok=True)
            with io.open(rec_path, "w", encoding="utf-8") as f:
                json.dump(rec, f, ensure_ascii=False, indent=2)
        except OSError:
            pass
        sys.exit(1)
    except SystemExit:
        raise