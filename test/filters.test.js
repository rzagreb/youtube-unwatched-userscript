import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  actionFor,
  mergeRules,
  needsSubscriptions,
  parseSettings,
  ruleName,
} from '../src/filters.js';

const video = (overrides) => ({
  title: 'A video',
  channels: ['Some Channel'],
  channelKeys: [],
  views: 5000,
  subscribedButton: false,
  fingerprint: '',
  ...overrides,
});
const condition = (type, value = null) => ({ type, value });
const rule = (conditions, action = 'blur', name = '') => ({ name, conditions, action });
const settings = (...rules) => ({ schemaVersion: 5, rules });
const filters = (...rules) => parseSettings(settings(...rules));

test('parseSettings trims values, reads counts and names blank rules by position', () => {
  const parsed = filters(
    rule([condition('titleContains', '  crash ')], 'hide', ' Crashes '),
    rule([condition('viewsBelow', '1.5K'), condition('viewsMissing', 'ignored')]),
  );
  assert.deepEqual(parsed.settings.rules, [
    { name: 'Crashes', conditions: [condition('titleContains', 'crash')], action: 'hide' },
    {
      name: 'Rule 2',
      conditions: [condition('viewsBelow', 1500), condition('viewsMissing')],
      action: 'blur',
    },
  ]);
});

test('ruleName uses the position, or the next free number', () => {
  assert.equal(ruleName(2, ['Less politics', 'Other']), 'Rule 3');
  assert.equal(ruleName(1, ['Rule 2']), 'Rule 3');
  assert.equal(ruleName(0, ['rule 1', 'Rule 2']), 'Rule 3');
});

test('parseSettings rejects bad settings with a message the editor can show', () => {
  const text = condition('titleContains', 'x');
  const cases = [
    [null, /schemaVersion 5/],
    [{ schemaVersion: 4, titles: [], channels: [] }, /schemaVersion 5/],
    [settings(42), /Rule 1: expected a name/],
    [settings(rule([])), /Rule 1: add at least one condition/],
    [settings(rule([text], 'mute')), /Rule 1: Then must be blur or hide/],
    [settings({ ...rule([text]), name: 7 }), /Rule 1: the name must be text/],
    [settings(rule([text, condition('sparkle')])), /Rule 1, condition 2: unknown condition type/],
    [settings(rule([condition('titleContains', '  ')])), /Rule 1, condition 1: enter some text/],
    [settings(rule([condition('channelContains', '/(/')])), /condition 1: Invalid regular/],
    [settings(rule([condition('viewsAbove', 'lots')])), /Rule 1, condition 1: enter a count/],
    [settings(rule([condition('viewsBelow', -1)])), /enter a count/],
    [settings(rule([condition('viewsBelow', '')], 'blur', 'Small')), /Rule "Small", condition 1/],
  ];
  for (const [raw, message] of cases) {
    assert.throws(() => parseSettings(raw), message, JSON.stringify(raw));
  }
});

test('errors about one field say which, so the editor can focus it', () => {
  const missing = condition('viewsMissing');
  assert.throws(() => filters(rule([missing]), rule([missing, condition('viewsBelow', '')])), {
    field: { rule: 1, condition: 1 },
  });
  assert.throws(() => filters(rule([missing], 'blur', 'Same'), rule([missing], 'blur', ' same ')), {
    message: /Two rules are named "same"/,
    field: { rule: 1 },
  });
});

test('plain text matches anywhere ignoring case, and /source/flags is a regex', () => {
  const cases = [
    ['crash', 'Market CRASH today', true],
    ['crash', 'Nice weather', false],
    ['a.b', 'axb', false],
    ['a.b', 'see a.b here', true],
    ['/^Exact$/', 'Exact', true],
    ['/^Exact$/', 'exact', false],
    ['/\\bhate\\b/i', 'I HATE Mondays', true],
    ['/\\bhate\\b/i', 'Whatever', false],
  ];
  for (const [value, title, expected] of cases) {
    const parsed = filters(rule([condition('titleContains', value)]));
    assert.equal(
      actionFor(parsed, video({ title }), false) === 'blur',
      expected,
      `${value}: ${title}`,
    );
  }
  // g and y make test() stateful, so they are dropped.
  const sticky = filters(rule([condition('titleContains', '/x/gy')]));
  assert.equal(actionFor(sticky, video({ title: 'x' }), false), 'blur');
  assert.equal(actionFor(sticky, video({ title: 'x' }), false), 'blur');
});

test('"does not contain" passes only when no title or channel name contains the text', () => {
  const noTrailers = filters(rule([condition('titleDoesNotContain', 'trailer')]));
  assert.equal(actionFor(noTrailers, video({ title: 'Official TRAILER' }), false), null);
  assert.equal(actionFor(noTrailers, video({ title: 'Full movie' }), false), 'blur');
  const notNews = filters(rule([condition('channelDoesNotContain', '/news/i')]));
  assert.equal(actionFor(notNews, video({ channels: ['Daily', 'World News'] }), false), null);
  assert.equal(actionFor(notNews, video({ channels: ['Daily'] }), false), 'blur');
});

test('a rule needs every condition, any rule can match, and hide beats blur', () => {
  const parsed = filters(
    rule([condition('titleContains', 'hate'), condition('viewsBelow', '10K')], 'hide'),
    rule([condition('titleContains', 'spoiler')], 'blur'),
  );
  const cases = [
    ['title only', video({ title: 'I hate it', views: 50_000 }), null],
    ['views only', video({ views: 500 }), null],
    ['both conditions', video({ title: 'I hate it', views: 500 }), 'hide'],
    ['other rule', video({ title: 'Spoiler alert' }), 'blur'],
    ['both rules', video({ title: 'I hate spoilers', views: 500 }), 'hide'],
  ];
  for (const [name, item, expected] of cases) {
    assert.equal(actionFor(parsed, item, false), expected, name);
  }
});

test('view limits skip equal and missing counts, which have their own condition', () => {
  const cases = [
    ['viewsBelow', 999, 'blur'],
    ['viewsBelow', 1000, null],
    ['viewsBelow', null, null],
    ['viewsAbove', 1001, 'blur'],
    ['viewsAbove', 1000, null],
    ['viewsAbove', null, null],
    ['viewsMissing', null, 'blur'],
    ['viewsMissing', 0, null],
  ];
  for (const [type, views, expected] of cases) {
    const parsed = filters(rule([condition(type, type === 'viewsMissing' ? null : 1000)]));
    assert.equal(actionFor(parsed, video({ views }), false), expected, `${type} at ${views}`);
  }
});

test('subscription conditions need a known status, and other rules cover every channel', () => {
  const crash = condition('titleContains', 'crash');
  const plain = filters(rule([crash]));
  const notSubscribed = filters(rule([crash, condition('notSubscribed')]));
  const subscribed = filters(rule([crash, condition('subscribed')]));
  const cases = [
    ['plain, subscribed', plain, true, 'blur'],
    ['plain, unknown', plain, null, 'blur'],
    ['not subscribed, matches', notSubscribed, false, 'blur'],
    ['not subscribed, subscribed', notSubscribed, true, null],
    ['not subscribed, unknown', notSubscribed, null, null],
    ['subscribed, matches', subscribed, true, 'blur'],
    ['subscribed, unknown', subscribed, null, null],
  ];
  for (const [name, parsed, status, expected] of cases) {
    assert.equal(actionFor(parsed, video({ title: 'crash' }), status), expected, name);
  }
});

test('needsSubscriptions is true only when a rule has a subscription condition', () => {
  const text = rule([condition('titleContains', 'x')]);
  assert.equal(needsSubscriptions(filters()), false);
  assert.equal(needsSubscriptions(filters(text)), false);
  assert.equal(needsSubscriptions(filters(text, rule([condition('subscribed')]))), true);
});

test('mergeRules adds new names and replaces or skips taken ones, ignoring case', () => {
  const missing = [condition('viewsMissing')];
  const mine = [rule(missing, 'blur', 'Less politics'), rule(missing, 'blur', 'Rule 2')];
  const theirs = [rule(missing, 'hide', 'less politics'), rule(missing, 'hide', 'New')];

  const kept = mergeRules(mine, theirs, false);
  assert.deepEqual(kept.conflicts, ['less politics']);
  assert.deepEqual(
    kept.rules.map(({ name, action }) => `${name}:${action}`),
    ['Less politics:blur', 'Rule 2:blur', 'New:hide'],
  );
  const replaced = mergeRules(mine, theirs, true);
  assert.deepEqual(
    replaced.rules.map(({ name, action }) => `${name}:${action}`),
    ['less politics:hide', 'Rule 2:blur', 'New:hide'],
  );
});
