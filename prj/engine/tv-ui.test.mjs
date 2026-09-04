import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const engineDir = path.dirname(fileURLToPath(import.meta.url));

test('all entry pages load the shared TV stylesheet', async () => {
  const htmlFiles = (await readdir(engineDir)).filter((name) => name.endsWith('.html'));
  assert.ok(htmlFiles.length >= 8, 'expected the complete set of entry pages');
  for (const name of htmlFiles) {
    const html = await readFile(path.join(engineDir, name), 'utf8');
    assert.match(html, /href=["']tv\.css(?:\?[^"']*)?["']/i, `${name} must load tv.css`);
  }
});

test('TV stylesheet provides ten-foot sizing, safe areas, and visible focus', async () => {
  const css = await readFile(path.join(engineDir, 'tv.css'), 'utf8');
  assert.match(css, /@media\s*\(min-width\s*:\s*1000px\)\s*and\s*\(orientation\s*:\s*landscape\)/i);
  assert.match(css, /min-height\s*:\s*64px/i, 'TV controls need at least 64px hit height');
  assert.match(css, /outline\s*:\s*(?:3|4)px[^;]*(?:#(?:ffd76a|e8c25a|c9a227)|var\(--tv-focus\))/i, 'focus ring must be high contrast');
  assert.match(css, /padding-inline\s*:\s*(?:clamp\([^)]*vw|var\(--tv-safe-inline\))/i, 'TV layout needs edge safe-area padding');
  assert.match(css, /prefers-reduced-motion/i, 'TV overrides must respect reduced motion');
});

test('TV stylesheet enlarges player and quiz controls without changing the mobile baseline', async () => {
  const css = await readFile(path.join(engineDir, 'tv.css'), 'utf8');
  assert.match(css, /#wala-player[^{}]*|#w-top[^{}]*/i);
  assert.match(css, /\.w-arrow\s*\{[^}]*min-width\s*:\s*32px/i);
  assert.match(css, /\.w-quiz-choice\s*\{[^}]*min-height\s*:\s*64px/i);
  assert.match(css, /\.vcard[^{}]*\{[^}]*padding/i);
});

test('TV entry pages load remote navigation and the handler supports directional focus', async () => {
  const htmlFiles = (await readdir(engineDir)).filter((name) => name.endsWith('.html'));
  for (const name of htmlFiles) {
    const html = await readFile(path.join(engineDir, name), 'utf8');
    assert.match(html, /src=["']tv-remote\.js(?:\?[^"']*)?["']/i, `${name} must load tv-remote.js`);
  }
  const js = await readFile(path.join(engineDir, 'tv-remote.js'), 'utf8');
  assert.match(js, /TV_QUERY\s*=\s*["'][^"']*orientation:\s*landscape/i);
  assert.match(js, /matchMedia\(/i);
  assert.match(js, /Arrow/);
  assert.match(js, /Up\|Down\|Left\|Right/);
  assert.match(js, /getBoundingClientRect/);
  assert.match(js, /\.focus\(\)/);
  assert.match(js, /focusInitial/);
  assert.match(js, /current\s*===\s*document\.body/);
});
