import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as esbuild from 'esbuild';
import { JSDOM } from 'jsdom';
import { buildOptions } from '../scripts/build.js';

// Built fresh in memory, so a stale dist/ can never pass.
const { outputFiles } = await esbuild.build({ ...buildOptions(), write: false });
const script = outputFiles[0].text;

const card = (title) => `<ytd-rich-item-renderer>
  <a href="/watch?v=${encodeURIComponent(title)}"></a>
  <h3 title="${title}"></h3>
  <ytd-channel-name><div id="text"><a href="/@channel">Channel</a></div></ytd-channel-name>
  <div id="metadata-line"><span>10K views</span></div>
</ytd-rich-item-renderer>`;

/** Runs the built script on a signed-out Home page with the given saved values. */
function runOnHome(saved) {
  const { window } = new JSDOM(
    `<!doctype html><html><head></head><body>
      <script>ytcfg.set({"LOGGED_IN": false})</script>
      <ytd-browse page-subtype="home">${card('Market crash today')}${card('Nice weather')}</ytd-browse>
    </body></html>`,
    { url: 'https://www.youtube.com/', runScripts: 'outside-only' },
  );
  const values = new Map(Object.entries(saved));
  const { document } = window;
  Object.assign(window, {
    GM_getValue: (key, fallback) => (values.has(key) ? values.get(key) : fallback),
    GM_setValue: (key, value) => values.set(key, value),
    GM_addStyle: (css) => {
      document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
    },
  });
  // jsdom has <dialog> without its methods; these cover what the editor calls.
  Object.assign(window.HTMLDialogElement.prototype, {
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
      this.dispatchEvent(new window.Event('close'));
    },
  });
  window.eval(script);
  const [crash, weather] = document.querySelectorAll('ytd-rich-item-renderer');
  return { window, document, values, crash, weather };
}

async function until(condition, timeoutMs = 2000) {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for the page');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Saved settings with one rule that blurs titles containing "crash". */
function crashRule(...more) {
  const conditions = [{ type: 'titleContains', value: 'crash' }, ...more];
  return { schemaVersion: 5, rules: [{ name: 'No crashes', conditions, action: 'blur' }] };
}

/** The controls' shadow root and a lookup for its buttons by text. */
function controls(page) {
  const shadow = page.document.getElementById('ytuw-controls').shadowRoot;
  const button = (text) =>
    [...shadow.querySelectorAll('button')].find((item) => item.textContent === text);
  return { shadow, button };
}

test('the built script marks matching cards and remembers On or Off', (t) => {
  const page = runOnHome({ filters: crashRule() });
  t.after(() => page.window.close());

  assert.ok(page.crash.classList.contains('ytuw-match'));
  assert.equal(page.crash.getAttribute('data-ytuw-action'), 'blur');
  assert.ok(page.crash.querySelector('button.ytuw-reveal'));
  assert.equal(page.weather.classList.contains('ytuw-match'), false);
  const { shadow } = controls(page);
  assert.equal(shadow.querySelector('.side-tab').textContent, '1');

  shadow.querySelector('button[data-mode="off"]').click();
  assert.equal(page.document.documentElement.getAttribute('data-ytuw-mode'), 'off');
  assert.equal(page.values.get('mode'), 'off');
  assert.equal(shadow.querySelector('.side-tab').textContent, '0');
});

test('rules with a subscription condition wait for the check, then apply when signed out', async (t) => {
  const page = runOnHome({ filters: crashRule({ type: 'notSubscribed', value: null }) });
  t.after(() => page.window.close());

  assert.equal(page.crash.classList.contains('ytuw-match'), false, 'paused while unknown');
  await until(() => page.crash.classList.contains('ytuw-match'));
  assert.equal(page.weather.classList.contains('ytuw-match'), false);
});

test('a first run saves the defaults and shows the controls with nothing marked', (t) => {
  const page = runOnHome({});
  t.after(() => page.window.close());

  assert.ok(page.values.has('filters'));
  assert.ok(page.document.getElementById('ytuw-controls'));
  assert.equal(page.document.querySelectorAll('.ytuw-match').length, 0);
});

test('a new rule from the editor is saved and applied to the page', async (t) => {
  const page = runOnHome({});
  t.after(() => page.window.close());
  const { shadow, button } = controls(page);

  button('Filters').click();
  const dialog = shadow.querySelector('dialog');
  assert.equal(dialog.open, true);
  button('+ Add rule').click();
  assert.equal(shadow.activeElement, shadow.querySelector('.rule-head input'));
  shadow.querySelector('.condition input').value = ' weather ';
  button('Save').click();

  assert.equal(dialog.open, false);
  const expected = [
    { name: 'Rule 1', conditions: [{ type: 'titleContains', value: 'weather' }], action: 'blur' },
  ];
  assert.equal(JSON.stringify(page.values.get('filters').rules), JSON.stringify(expected));
  await until(() => page.weather.classList.contains('ytuw-match'));
  assert.equal(page.crash.classList.contains('ytuw-match'), false);
});

test('a save error names the field and keeps every input', (t) => {
  const page = runOnHome({ filters: crashRule() });
  t.after(() => page.window.close());
  const { shadow, button } = controls(page);

  button('Filters').click();
  const value = shadow.querySelector('.condition input');
  value.value = '';
  button('Save').click();

  assert.equal(shadow.querySelector('dialog').open, true);
  assert.match(
    shadow.querySelector('.status').textContent,
    /Rule "No crashes", condition 1: enter some text/,
  );
  assert.equal(value.getAttribute('aria-invalid'), 'true');
  assert.equal(shadow.activeElement, value);
  assert.equal(shadow.querySelector('.rule-head input').value, 'No crashes');
});

test('importing a rule whose name is taken asks first, and Keep mine skips it', async (t) => {
  const page = runOnHome({ filters: crashRule() });
  t.after(() => page.window.close());
  const { shadow, button } = controls(page);
  const incoming = crashRule().rules.map((rule) => ({ ...rule, action: 'hide' }));
  incoming.push({ name: 'Weather', conditions: [{ type: 'viewsMissing' }], action: 'blur' });
  const file = new page.window.File(
    [JSON.stringify({ schemaVersion: 5, rules: incoming })],
    'rules.json',
  );

  button('Filters').click();
  const input = shadow.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { value: [file] });
  input.dispatchEvent(new page.window.Event('change'));
  await until(() => !shadow.querySelector('.ask').hidden);
  assert.match(shadow.querySelector('.ask').textContent, /"No crashes" is already in your list/);
  assert.ok(button('Overwrite No crashes'));

  button('Keep mine').click();
  const names = [...shadow.querySelectorAll('.rule-head input')].map((item) => item.value);
  assert.equal(JSON.stringify(names), '["No crashes","Weather"]');
  assert.equal(shadow.querySelector('.then select').value, 'blur');
  assert.match(shadow.querySelector('.status').textContent, /Imported 1 rule/);
});

test('opening Filters on unreadable saved data warns and keeps the running rules', async (t) => {
  const page = runOnHome({ filters: crashRule() });
  t.after(() => page.window.close());
  page.window.console.warn = () => {};
  const broken = { schemaVersion: 99 };
  page.values.set('filters', broken);
  const { shadow, button } = controls(page);

  button('Filters').click();
  assert.match(shadow.querySelector('.status').textContent, /could not be loaded/);
  await new Promise((resolve) => setTimeout(resolve, 250)); // longer than one scan delay
  assert.ok(page.crash.classList.contains('ytuw-match'));
  assert.equal(page.values.get('filters'), broken);
});
