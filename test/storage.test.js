import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SETTINGS } from '../src/filters.js';
import { loadFilters, loadMode, saveFilters } from '../src/storage.js';

/** Fake userscript-manager storage, installed as the GM_* globals. */
function fakeStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  globalThis.GM_getValue = (key, fallback) => (values.has(key) ? values.get(key) : fallback);
  globalThis.GM_setValue = (key, value) => values.set(key, value);
  return values;
}

test('first run saves the default filters', () => {
  const values = fakeStorage();
  const { filters, warning } = loadFilters();
  assert.equal(warning, '');
  assert.deepEqual(values.get('filters'), DEFAULT_SETTINGS);
  assert.deepEqual(filters.settings, DEFAULT_SETTINGS);
});

test('unreadable saved filters are reported and left untouched', (t) => {
  t.mock.method(console, 'warn', () => {});
  const broken = { schemaVersion: 4, titles: ['('], channels: [] };
  const values = fakeStorage({ filters: broken });
  const { filters, warning } = loadFilters();
  assert.match(warning, /has not been replaced.*Titles, rule 1/);
  assert.equal(values.get('filters'), broken);
  assert.deepEqual(filters.settings, DEFAULT_SETTINGS);
});

test('saveFilters writes nothing when any setting is invalid', () => {
  const values = fakeStorage({ filters: DEFAULT_SETTINGS });
  assert.throws(() => saveFilters({ ...DEFAULT_SETTINGS, titles: ['ok'], minViews: 'lots' }));
  assert.equal(values.get('filters'), DEFAULT_SETTINGS);
});

test('an unknown saved mode falls back to blur', () => {
  fakeStorage({ mode: 'sparkle' });
  assert.equal(loadMode(), 'blur');
});
