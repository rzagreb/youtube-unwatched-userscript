import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSettings } from '../src/filters.js';
import { migrateSchema4 } from '../src/migrate-schema-4.js';
import { loadFilters } from '../src/storage.js';

const NOT_SUBSCRIBED = { type: 'notSubscribed', value: null };

test('each 1.0.0 filter becomes one rule with the same effect', () => {
  const old = {
    schemaVersion: 4,
    titles: ['crash', '', 'spoilers?', '/^Exact$/'],
    channels: ['^Bad Channel$'],
    minViews: 1000,
    maxViews: null,
    allowUnknownViews: false,
    applyToSubscribed: { titles: true, missingViews: true },
  };
  const { rules } = parseSettings(migrateSchema4(old, 'blur')).settings;
  const rule = (name, ...conditions) => ({ name, conditions, action: 'blur' });
  assert.deepEqual(rules, [
    rule('Rule 1', { type: 'titleContains', value: 'crash' }),
    rule('Rule 2', { type: 'titleContains', value: '/spoilers?/i' }),
    rule('Rule 3', { type: 'titleContains', value: '/^Exact$/' }),
    rule('Rule 4', { type: 'channelContains', value: '/^Bad Channel$/i' }, NOT_SUBSCRIBED),
    rule('Rule 5', { type: 'viewsBelow', value: 1000 }, NOT_SUBSCRIBED),
    rule('Rule 6', { type: 'viewsMissing', value: null }),
  ]);
});

test('the 1.0.0 Hide mode becomes each rule action, and newer input passes through', () => {
  const { rules } = migrateSchema4({ schemaVersion: 4, titles: ['x'], channels: [] }, 'hide');
  assert.equal(rules[0].action, 'hide');
  const current = { schemaVersion: 5, rules: [] };
  assert.equal(migrateSchema4(current, 'hide'), current);
  assert.throws(() => migrateSchema4({ schemaVersion: 4 }), /lists of titles and channels/);
});

test('loadFilters converts saved 1.0.0 settings once and writes them back', () => {
  const values = new Map([
    ['filters', { schemaVersion: 4, titles: ['crash'], channels: [] }],
    ['mode', 'hide'],
  ]);
  globalThis.GM_getValue = (key, fallback) => (values.has(key) ? values.get(key) : fallback);
  globalThis.GM_setValue = (key, value) => values.set(key, value);

  const { filters, warning } = loadFilters();
  assert.equal(warning, '');
  assert.deepEqual(values.get('filters'), filters.settings);
  assert.deepEqual(filters.settings.rules, [
    {
      name: 'Rule 1',
      conditions: [{ type: 'titleContains', value: 'crash' }, NOT_SUBSCRIBED],
      action: 'hide',
    },
  ]);
});
