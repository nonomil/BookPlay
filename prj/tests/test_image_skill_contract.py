"""Regression checks for the unified image-generation skill contract.

The test intentionally reads the installed user skills through CODEX_HOME so
the project can catch drift without making a network request or exposing any
API key.
"""

from __future__ import annotations

import os
import re
import unittest
from pathlib import Path


def codex_home() -> Path:
    configured = (os.environ.get("CODEX_HOME") or "").strip()
    return Path(configured) if configured else Path.home() / ".codex"


SKILLS = codex_home() / "skills"
CANONICAL = SKILLS / "gpt-image-pipeline" / "SKILL.md"
ALIASES = (
    SKILLS / "gpt-image-workflow" / "SKILL.md",
    SKILLS / "gpt-image-ui-assets" / "SKILL.md",
    SKILLS / "gpt-game-asset-pipeline" / "SKILL.md",
)


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


class ImageSkillContractTests(unittest.TestCase):
    def test_canonical_skill_is_the_only_generation_entrypoint(self) -> None:
        text = read(CANONICAL)
        self.assertIn("bee_image_workflow.py", text)
        self.assertIn("--provider auto", text)
        self.assertIn("CLIPROX_API_KEY", text)
        self.assertIn("manifest", text.lower())
        self.assertIn("alpha", text.lower())
        self.assertNotIn(".claude", text.lower())
        self.assertNotRegex(text, r"--api-key\b")

    def test_aliases_route_to_canonical_without_provider_commands(self) -> None:
        for path in ALIASES:
            text = read(path)
            self.assertIn("gpt-image-pipeline", text)
            self.assertRegex(text.lower(), r"compatibility|alias|route")
            self.assertNotIn("bee_image_workflow.py", text)
            self.assertNotIn("run-pipeline.ps1", text)

    def test_generation_command_is_documented_once(self) -> None:
        all_text = [read(CANONICAL), *(read(path) for path in ALIASES)]
        self.assertEqual(sum(text.count("bee_image_workflow.py") for text in all_text), 1)

    def test_canonical_has_explicit_mode_routing_and_failure_stop(self) -> None:
        text = read(CANONICAL).lower()
        for marker in ("one image", "sprite", "transparent", "post-process"):
            self.assertIn(marker, text)
        for marker in ("no key", "stop", "do not claim"):
            self.assertIn(marker, text)

    def test_runner_uses_environment_only_credentials_and_codex_paths(self) -> None:
        runner = SKILLS / "gpt-image-workflow" / "scripts" / "bee_image_workflow.py"
        text = read(runner)
        self.assertIn("CLIPROX_API_KEY", text)
        self.assertIn("BEE_API_KEY", text)
        self.assertNotIn(".claude", text.lower())
        self.assertNotIn("GPT生图模型key", text)
        self.assertIn("resolve_postprocess_script", text)


if __name__ == "__main__":
    unittest.main()
