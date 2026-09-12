import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const storybook = fs.readFileSync(path.join(dir, "storybook.js"), "utf8");

test("jttw completion card enters the word-memory map before the Boss battle", () => {
  assert.match(storybook, /window\.location\.href\s*=\s*`game\.html\?ep=\$\{ep\}`/);
});
