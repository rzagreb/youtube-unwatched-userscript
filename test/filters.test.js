import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_SETTINGS,
  matchesFilters,
  needsSubscriptions,
  parseSettings,
} from '../src/filters.js';

const settings = (overrides) => ({ ...DEFAULT_SETTINGS, ...overrides });
const video = (overrides) => ({
  title: 'A video',
  channels: ['Some Channel'],
  channelKeys: [],
  views: 5000,
  subscribedButton: false,
  fingerprint: '',
  ...overrides,
});

test('parseSettings fills missing fields, trims lines and drops blank ones', () => {
  const parsed = parseSettings({ schemaVersion: 4, titles: ['  crash ', '', ' '], channels: [] });
  assert.deepEqual(parsed.settings, { ...DEFAULT_SETTINGS, titles: ['crash'] });
});

test('parseSettings reads view limits typed as counts', () => {
  const parsed = parseSettings(settings({ minViews: '1.5K', maxViews: 2_000_000 }));
  assert.equal(parsed.settings.minViews, 1500);
  assert.equal(parsed.settings.maxViews, 2_000_000);
});

test('parseSettings keeps /pattern/flags, drops g and y, and makes bare patterns ignore case', () => {
  const parsed = parseSettings(settings({ titles: ['/^Exact$/', 'loud', '/x/gy'] }));
  assert.deepEqual(parsed.titlePatterns.map(String), ['/^Exact$/', '/loud/i', '/x/']);
});

test('parseSettings drops fields it does not know, like old archived view rules', () => {
  const parsed = parseSettings(settings({ archivedViewRules: ['>1M'] }));
  assert.equal('archivedViewRules' in parsed.settings, false);
});

test('parseSettings rejects bad settings with a message the editor can show', () => {
  const cases = [
    [null, /schemaVersion 4/],
    [{ schemaVersion: 3, titles: [], channels: [] }, /schemaVersion 4/],
    [settings({ titles: 'crash' }), /schemaVersion 4/],
    [settings({ titles: [42] }), /Titles, entry 1: use a string/],
    [settings({ channels: ['ok', '('] }), /Channels, rule 2: Invalid regular expression/],
    [settings({ minViews: 'lots' }), /Minimum views: enter a count/],
    [settings({ maxViews: -1 }), /Maximum views: enter a count/],
    [settings({ minViews: 10, maxViews: 5 }), /Minimum views must not be greater/],
    [settings({ allowUnknownViews: 'yes' }), /allowUnknownViews must be true or false/],
    [settings({ applyToSubscribed: { titles: 1 } }), /applyToSubscribed.titles must be true/],
    [settings({ applyToSubscribed: [] }), /applyToSubscribed must be an object/],
  ];
  for (const [raw, message] of cases) {
    assert.throws(() => parseSettings(raw), message, JSON.stringify(raw));
  }
});

test('matchesFilters applies each filter, with inclusive view limits', () => {
  const filters = parseSettings(
    settings({
      titles: ['crash'],
      channels: ['^Bad Channel$'],
      minViews: 1000,
      maxViews: 1_000_000,
      allowUnknownViews: false,
    }),
  );
  const cases = [
    ['title match', video({ title: 'Market CRASH today' }), true],
    ['channel match', video({ channels: ['Other', 'Bad Channel'] }), true],
    ['below minimum', video({ views: 999 }), true],
    ['at minimum', video({ views: 1000 }), false],
    ['at maximum', video({ views: 1_000_000 }), false],
    ['above maximum', video({ views: 1_000_001 }), true],
    ['missing count', video({ views: null }), true],
    ['nothing matches', video(), false],
  ];
  for (const [name, item, expected] of cases) {
    assert.equal(matchesFilters(filters, item, false), expected, name);
  }
});

test('a missing count passes view limits while missing counts are allowed', () => {
  const filters = parseSettings(settings({ minViews: 1000 }));
  assert.equal(matchesFilters(filters, video({ views: null }), false), false);
});

test('subscribed and unknown channels are exempt unless the filter covers them', () => {
  const exempting = parseSettings(settings({ titles: ['crash'] }));
  const covering = parseSettings(
    settings({ titles: ['crash'], applyToSubscribed: { titles: true } }),
  );
  const crash = video({ title: 'crash' });
  const cases = [
    ['not subscribed', exempting, false, true],
    ['subscribed', exempting, true, false],
    ['unknown', exempting, null, false],
    ['subscribed, covered', covering, true, true],
    ['unknown, covered', covering, null, true],
  ];
  for (const [name, filters, subscribed, expected] of cases) {
    assert.equal(matchesFilters(filters, crash, subscribed), expected, name);
  }
});

test('needsSubscriptions is true only when an active filter exempts subscriptions', () => {
  const cases = [
    ['no rules', DEFAULT_SETTINGS, false],
    ['title rule', settings({ titles: ['x'] }), true],
    ['covered title rule', settings({ titles: ['x'], applyToSubscribed: { titles: true } }), false],
    ['missing counts filtered', settings({ allowUnknownViews: false }), true],
  ];
  for (const [name, raw, expected] of cases) {
    assert.equal(needsSubscriptions(parseSettings(raw)), expected, name);
  }
});
