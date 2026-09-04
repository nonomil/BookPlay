import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function assembleMobileDist(fromRoot = projectRoot) {
  const src = path.join(fromRoot, "prj", "engine");
  const dest = path.join(fromRoot, "dist", "engine");
  await fs.rm(path.join(fromRoot, "dist"), { recursive: true, force: true });
  await fs.mkdir(dest, { recursive: true });
  await fs.cp(src, dest, { recursive: true });
  await fs.writeFile(
    path.join(fromRoot, "dist", "index.html"),
    `<!DOCTYPE html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=engine/setup.html">`,
    "utf8",
  );
  return dest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dest = await assembleMobileDist();
  console.log(`[prepare-mobile] engine -> ${dest}`);
}
