import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

export function checkX35sWeb() {
  const failures = [];
  const need = [
    'docs/x35s-web-port/README.md',
    'docs/x35s-web-port/01-发布版本与两条产物.md',
    'docs/x35s-web-port/02-网页适配合同.md',
    'docs/x35s-web-port/03-从构建到上卡.md',
    'docs/x35s-web-port/04-空白页与日志.md',
    'docs/x35s-web-port/demo/index.html',
    'docs/x35s-web-port/demo/probe.mjs',
    '发布/README.md',
    '发布/本版-掌机-20260919/README.md',
    '发布/西游记vs我的世界-x35s/inner-西游记vs我的世界.sh',
    '发布/西游记vs我的世界-x35s/httpd.conf',
    '发布/西游记vs我的世界-x35s/config.toml',
    '发布/西游记vs我的世界-x35s/serve.py',
    '发布/西游记vs我的世界-x35s/x35s.gptk',
    '发布/西游记vs我的世界-x35s/bindings.toml',
    'prj/engine/handheld.css',
    'prj/engine/handheld-controls.js',
    'prj/engine/play-map.html',
    'prj/engine/play-map.js',
  ];
  need.forEach((rel) => {
    if (!exists(rel)) failures.push('missing ' + rel);
  });

  const css = exists('prj/engine/handheld.css') ? read('prj/engine/handheld.css') : '';
  if (!/min-height:\s*var\(--handheld-hit,\s*44px\)|min-height:\s*44px/.test(css)) {
    failures.push('handheld.css missing 44px hit');
  }
  if (!/backdrop-filter:\s*none/.test(css)) failures.push('handheld.css must kill backdrop-filter');
  if (!/cursor:\s*none/.test(css)) failures.push('handheld.css must hide cursor');
  if (/transform:\s*scale/.test(css)) failures.push('handheld.css must not scale the page');

  const gptk = exists('发布/西游记vs我的世界-x35s/x35s.gptk') ? read('发布/西游记vs我的世界-x35s/x35s.gptk') : '';
  if (!/^left_analog_as_mouse = false$/m.test(gptk)) failures.push('gptk must disable left analog mouse');
  if (!/^right_analog_as_mouse = false$/m.test(gptk)) failures.push('gptk must disable right analog mouse');
  if (!/^left_analog_up = up$/m.test(gptk)) failures.push('gptk analog must be arrows like plainland');
  if (/deadzone_delay/.test(gptk)) failures.push('gptk must not use analog delay');
  if (/mouse_movement/.test(gptk)) failures.push('gptk must not map analog to mouse_movement');

  const toml = exists('发布/西游记vs我的世界-x35s/config.toml') ? read('发布/西游记vs我的世界-x35s/config.toml') : '';
  if (!/width = 640/.test(toml) || !/height = 480/.test(toml)) failures.push('config.toml must be 640x480');
  if (!/cursor_mode = "scroll"/.test(toml)) failures.push('config.toml must default cursor_mode scroll');
  if (!/127\.0\.0\.1:18787/.test(toml)) failures.push('config.toml home_page must stay on 18787 (plainland uses 18888)');

  const httpd = exists('发布/西游记vs我的世界-x35s/httpd.conf') ? read('发布/西游记vs我的世界-x35s/httpd.conf') : '';
  if (!/\.html:text\/html/.test(httpd)) failures.push('httpd.conf must map .html');
  if (!/\.mjs:text\/javascript/.test(httpd)) failures.push('httpd.conf must map .mjs');
  if (!/\.js:application\/javascript/.test(httpd)) failures.push('httpd.conf must map .js');

  const bindings = exists('发布/西游记vs我的世界-x35s/bindings.toml') ? read('发布/西游记vs我的世界-x35s/bindings.toml') : '';
  if (!/^a = "none"$/m.test(bindings)) failures.push('bindings.toml must not let retsurf eat gamepad A');
  if (!/^left = "none"$/m.test(bindings)) failures.push('bindings.toml must not steal ArrowLeft from the page');

  const inner = exists('发布/西游记vs我的世界-x35s/inner-西游记vs我的世界.sh') ? read('发布/西游记vs我的世界-x35s/inner-西游记vs我的世界.sh') : '';
  if (inner.includes('\r')) failures.push('inner launcher must be LF, not CRLF');
  if (!/-c "\$GAMEDIR\/httpd\.conf"/.test(inner)) failures.push('inner sh must pass -c httpd.conf');
  if (!/"\$BIN" "\$URL"/.test(inner)) failures.push('inner sh must pass URL argv to retsurf');
  if (!/busybox httpd/.test(inner)) failures.push('inner sh must use busybox httpd');
  if (inner.includes('方块学园') && !inner.includes('不要')) {
    failures.push('BookPlay inner sh must not launch 方块学园');
  }

  if (exists('docs/x35s-web-port/demo/index.html')) {
    const demo = read('docs/x35s-web-port/demo/index.html');
    const styles = exists('docs/x35s-web-port/demo/styles.css') ? read('docs/x35s-web-port/demo/styles.css') : '';
    if (!/width:\s*640px/.test(styles)) failures.push('demo must lock 640px');
    if (!/min-height:\s*44px/.test(styles)) failures.push('demo buttons must be 44px');
    if (/src=["'][^"']*\?v=feel/.test(demo)) failures.push('demo must not use ?v=feel cache bust');
    if (!/我不会/.test(demo)) failures.push('demo learn case missing 我不会');
  }

  const docs = [
    'docs/x35s-web-port/README.md',
    'docs/x35s-web-port/01-发布版本与两条产物.md',
    '发布/README.md',
  ].filter(exists).map(read).join('\n');
  if (!docs.includes('西游记vs我的世界')) failures.push('doorway docs must name 西游记vs我的世界 as the live Ports entry');
  if (!docs.includes('方块学园是另一个项目') && !docs.includes('方块学园是另一个')) {
    failures.push('doorway docs must say 方块学园 is a different project');
  }
  if (!/不要开 `bookplay`/.test(docs) && !/不要开 bookplay/.test(docs) && !/不要用 `ports\/bookplay`/.test(docs)) {
    failures.push('doorway docs must forbid bookplay as the player-facing Ports entry');
  }

  return { ok: failures.length === 0, failures };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkX35sWeb();
  if (!result.ok) {
    console.error(result.failures.join('\n'));
    process.exit(1);
  }
  console.log('x35s-web-port contract ok');
}
