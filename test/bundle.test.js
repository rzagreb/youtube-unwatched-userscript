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

test('the built script marks matching cards and remembers the chosen mode', (t) => {
  const page = runOnHome({
    filters: {
      schemaVersion: 4,
      titles: ['crash'],
      channels: [],
      applyToSubscribed: { titles: true },
    },
  });
  t.after(() => page.window.close());

  assert.ok(page.crash.classList.contains('ytuw-match'));
  assert.ok(page.crash.querySelector('button.ytuw-reveal'));
  assert.equal(page.weather.classList.contains('ytuw-match'), false);
  const shadow = page.document.getElementById('ytuw-controls').shadowRoot;
  assert.equal(shadow.querySelector('.side-tab').textContent, '1');

  shadow.querySelector('button[data-mode="hide"]').click();
  assert.equal(page.document.documentElement.getAttribute('data-ytuw-mode'), 'hide');
  assert.equal(page.values.get('mode'), 'hide');
});

test('filters that exempt subscriptions wait for the check, then apply when signed out', async (t) => {
  const page = runOnHome({ filters: { schemaVersion: 4, titles: ['crash'], channels: [] } });
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

test('saving the Filters editor stores the rules and applies them to the page', async (t) => {
  const page = runOnHome({});
  t.after(() => page.window.close());
  const shadow = page.document.getElementById('ytuw-controls').shadowRoot;
  const button = (text) =>
    [...shadow.querySelectorAll('button')].find((item) => item.textContent === text);

  button('Filters').click();
  const dialog = shadow.querySelector('dialog');
  assert.equal(dialog.open, true);
  shadow.getElementById('ytuw-titles').value = 'weather\n\n';
  shadow.getElementById('ytuw-subscribed-titles').checked = true;
  button('Save').click();

  assert.equal(dialog.open, false);
  assert.equal(JSON.stringify(page.values.get('filters').titles), '["weather"]');
  await until(() => page.weather.classList.contains('ytuw-match'));
  assert.equal(page.crash.classList.contains('ytuw-match'), false);
});

test('opening Filters on unreadable saved data warns and keeps the running rules', async (t) => {
  const page = runOnHome({
    filters: {
      schemaVersion: 4,
      titles: ['crash'],
      channels: [],
      applyToSubscribed: { titles: true },
    },
  });
  t.after(() => page.window.close());
  page.window.console.warn = () => {};
  const broken = { schemaVersion: 99 };
  page.values.set('filters', broken);
  const shadow = page.document.getElementById('ytuw-controls').shadowRoot;

  [...shadow.querySelectorAll('button')].find((item) => item.textContent === 'Filters').click();
  assert.match(shadow.querySelector('.status').textContent, /could not be loaded/);
  await new Promise((resolve) => setTimeout(resolve, 250)); // longer than one scan delay
  assert.ok(page.crash.classList.contains('ytuw-match'));
  assert.equal(page.values.get('filters'), broken);
});
