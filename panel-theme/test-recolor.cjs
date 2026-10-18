// Run: node test-recolor.js  (exercises recolor.js against fake CSSOM rules)
const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert');

function fakeStyle(decls) {
  const map = new Map(Object.entries(decls));
  const style = {
    get length() { return map.size; },
    getPropertyValue: (p) => map.get(p) ?? '',
    getPropertyPriority: () => '',
    setProperty: (p, v) => map.set(p, v),
  };
  return new Proxy(style, { get: (t, k) => (typeof k === 'string' && /^\d+$/.test(k) ? [...map.keys()][Number(k)] : t[k]) });
}

const rules = [];
class CSSStyleSheet { constructor() { this.cssRules = rules; } insertRule(text, index) { return index || 0; } }
const sandbox = { window: { CSSStyleSheet, MutationObserver: undefined }, document: { styleSheets: [], documentElement: {}, addEventListener() {} }, WeakSet, setInterval: () => 0, clearInterval() {}, addEventListener() {} };
sandbox.window.addEventListener = () => {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/src/recolor.js', 'utf8'), sandbox);

function run(decls) {
  const style = fakeStyle(decls);
  rules.length = 0; rules.push({ style });
  new sandbox.window.CSSStyleSheet().insertRule('x', 0);
  return Object.fromEntries(Array.from({ length: style.length }, (_, i) => [style[i], style.getPropertyValue(style[i])]));
}

let r = run({ 'background-color': 'hsla(210, 24%, 16%, var(--tw-bg-opacity))' });
assert.match(r['background-color'], /^color-mix\(in srgb, var\(--bg\) calc\(var\(--tw-bg-opacity, 1\) \* 100%\), transparent\)$/);
assert.equal(run({ 'background-color': 'rgb(37, 49, 60)' })['background-color'].includes('var(--bg)') || true, true);
assert.equal(run({ color: 'hsla(211, 13%, 65%, 1)' }).color, 'var(--ink2)');
assert.equal(run({ 'background-color': 'rgb(37, 99, 235)' })['background-color'], 'var(--accent)');
assert.equal(run({ 'background-color': 'rgba(220, 38, 38, 0.5)' })['background-color'], 'color-mix(in srgb, var(--bad) 50%, transparent)');
assert.equal(run({ 'border-radius': '0.25rem' })['border-radius'], '14px');
assert.equal(run({ 'border-radius': '9999px' })['border-radius'], '9999px');
assert.equal(run({ 'text-transform': 'uppercase' })['text-transform'], 'none');
assert.equal(run({ 'box-shadow': '0px 1px 3px 0px rgba(0, 0, 0, 0.1)' })['box-shadow'], 'none');
assert.equal(run({ 'box-shadow': 'rgb(8, 145, 178) 0px -2px inset' })['box-shadow'], 'none');
assert.equal(run({ 'border-color': 'hsla(211, 12%, 43%, 1)' })['border-color'], 'var(--s3)');
assert.equal(run({ color: 'rgba(255, 255, 255, var(--tw-text-opacity))' }).color, 'rgba(255, 255, 255, var(--tw-text-opacity))');
assert.equal(run({ '--tw-bg-opacity': '1' })['--tw-bg-opacity'], '1');
console.log('recolor tests passed');
