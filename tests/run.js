'use strict';
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
global.test = (name, fn) => {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.message}`); }
};
global.eq = (actual, expected) => {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`expected ${b}\n       got      ${a}`);
};
global.ok = v => { if (!v) throw new Error(`expected truthy, got ${JSON.stringify(v)}`); };

for (const f of fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js'))) {
  console.log(f);
  require(path.join(__dirname, f));
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
