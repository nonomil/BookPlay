// Execute the real gate against controlled manifests, without media or a browser.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../../../..');
const code = fs.readFileSync(path.join(root, 'prj/engine/content-gate.js'), 'utf8');
async function check(kind, available) {
  const context = {
    document: {createElement: () => ({}), head: {appendChild() {}}, addEventListener() {}},
    fetch: async () => ({ok: true, json: async () => ({kind, available})}),
  };
  vm.runInNewContext(code, context);
  return {kind,
    jttw1Blocked: await context.BookPlayContentGate.isUnavailable('jttw', 1),
    jttw2Blocked: await context.BookPlayContentGate.isUnavailable('jttw', 2),
    minecraft1Blocked: await context.BookPlayContentGate.isUnavailable('minecraft', 1),
    mikey1Blocked: await context.BookPlayContentGate.isUnavailable('mikey-jj', 1),
  };
}
(async () => {
  console.log(JSON.stringify(await check('apk-builtin-starter', {jttw:{episodes:[1], collections:['c01']}}), null, 2));
})();
