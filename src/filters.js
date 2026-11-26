// Rules: validating saved settings (schema 5) and picking the action for one video.
/** @import { Action, Filters, Rule, Settings, Video } from './typedefs.js' */
import { parseCount } from './view-counts.js';

export const SCHEMA_VERSION = 5;

/** @type {Action[]} */
export const ACTIONS = ['blur', 'hide'];

/** @type {Settings} First run: nothing is filtered until you add rules. */
export const DEFAULT_SETTINGS = { schemaVersion: SCHEMA_VERSION, rules: [] };

const inTitle = (value) => {
  const contains = parseText(value);
  return (video) => contains(video.title);
};
const inChannel = (value) => {
  const contains = parseText(value);
  return (video) => video.channels.some(contains);
};
const not = (build) => (value) => {
  const test = build(value);
  return (video, subscribed) => !test(video, subscribed);
};

/**
 * One row per condition type: `read` checks the saved value, `match` builds the test.
 * `subscription` rows need the subscription list.
 */
const CONDITIONS = {
  titleContains: { read: readText, match: inTitle },
  titleDoesNotContain: { read: readText, match: not(inTitle) },
  channelContains: { read: readText, match: inChannel },
  channelDoesNotContain: { read: readText, match: not(inChannel) },
  viewsBelow: {
    read: readCount,
    match: (limit) => (video) => video.views !== null && video.views < limit,
  },
  viewsAbove: {
    read: readCount,
    match: (limit) => (video) => video.views !== null && video.views > limit,
  },
  viewsMissing: { read: readNothing, match: () => (video) => video.views === null },
  subscribed: {
    read: readNothing,
    match: () => (_video, subscribed) => subscribed === true,
    subscription: true,
  },
  notSubscribed: {
    read: readNothing,
    match: () => (_video, subscribed) => subscribed === false,
    subscription: true,
  },
};

/**
 * Validates settings from storage, the editor or a file. Throws editor-ready messages.
 * Errors about one field carry `field: { rule, condition? }`, both zero-based.
 * @returns {Filters}
 */
export function parseSettings(raw) {
  if (!isRecord(raw) || raw.schemaVersion !== SCHEMA_VERSION || !Array.isArray(raw.rules)) {
    throw new Error('Expected filter settings with schemaVersion 5 and a list of rules.');
  }
  const parsed = raw.rules.map(parseRule);
  const names = fillNames(parsed.map((rule) => rule.name));
  checkUnique(names);
  const rules = parsed.map(({ conditions, action }, index) => ({
    name: names[index],
    conditions: conditions.map(({ type, value }) => ({ type, value })),
    action,
  }));
  return {
    settings: { schemaVersion: SCHEMA_VERSION, rules },
    rules: parsed.map(({ conditions, action }) => ({
      action,
      tests: conditions.map(({ test }) => test),
    })),
  };
}

/**
 * "hide" when any matching rule hides, else "blur", or null when no rule matches.
 * `subscribed` is null while unknown, so subscription conditions wait for it.
 * @param {Filters} filters
 * @param {Video} video
 * @param {boolean | null} subscribed
 * @returns {Action | null}
 */
export function actionFor(filters, video, subscribed) {
  const actions = filters.rules
    .filter((rule) => rule.tests.every((test) => test(video, subscribed)))
    .map((rule) => rule.action);
  return actions.includes('hide') ? 'hide' : (actions[0] ?? null);
}

/** True when a rule checks subscriptions, so the list must be loaded. */
export function needsSubscriptions(filters) {
  return filters.settings.rules.some((rule) =>
    rule.conditions.some(({ type }) => CONDITIONS[type].subscription),
  );
}

/**
 * "Rule N" for the rule at `index`: its position, or the next free number.
 * @param {number} index
 * @param {string[]} names the other rules' names
 */
export function ruleName(index, names) {
  const taken = new Set(names.map(nameKey));
  let number = index + 1;
  while (taken.has(nameKey(`Rule ${number}`))) number += 1;
  return `Rule ${number}`;
}

/**
 * Adds `incoming` to `current` by name. A taken name is replaced in place
 * when `overwrite`, else skipped. `conflicts` lists those names either way.
 * @param {Rule[]} current
 * @param {Rule[]} incoming
 * @param {boolean} overwrite
 */
export function mergeRules(current, incoming, overwrite) {
  const rules = [...current];
  const conflicts = [];
  for (const rule of incoming) {
    const index = rules.findIndex((other) => nameKey(other.name) === nameKey(rule.name));
    if (index === -1) {
      rules.push(rule);
      continue;
    }
    conflicts.push(rule.name);
    if (overwrite) rules[index] = rule;
  }
  return { rules, conflicts };
}

/** Names compare ignoring case and outer spaces. */
function nameKey(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase();
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRule(raw, index) {
  const name = typeof raw?.name === 'string' ? raw.name.trim() : '';
  const label = name ? `Rule "${name}"` : `Rule ${index + 1}`;
  if (!isRecord(raw)) throw new Error(`${label}: expected a name, conditions and an action.`);
  if (raw.name !== undefined && typeof raw.name !== 'string') {
    throw new Error(`${label}: the name must be text.`);
  }
  if (!ACTIONS.includes(raw.action)) throw new Error(`${label}: Then must be blur or hide.`);
  if (!Array.isArray(raw.conditions) || !raw.conditions.length) {
    throw new Error(`${label}: add at least one condition.`);
  }
  return {
    name,
    conditions: raw.conditions.map((condition, at) => parseCondition(condition, label, index, at)),
    action: raw.action,
  };
}

function parseCondition(raw, ruleLabel, rule, condition) {
  const label = `${ruleLabel}, condition ${condition + 1}`;
  const row = isRecord(raw) && Object.hasOwn(CONDITIONS, raw.type) ? CONDITIONS[raw.type] : null;
  if (!row) throw new Error(`${label}: unknown condition type.`);
  try {
    const value = row.read(raw.value);
    return { type: raw.type, value, test: row.match(value) };
  } catch (error) {
    throw fieldError(`${label}: ${error.message}`, { rule, condition });
  }
}

/** Blank names become "Rule N", in order, so later ones see earlier picks. */
function fillNames(names) {
  const filled = [...names];
  for (const [index, name] of filled.entries()) {
    if (!name) filled[index] = ruleName(index, filled);
  }
  return filled;
}

function checkUnique(names) {
  const seen = new Set();
  for (const [index, name] of names.entries()) {
    if (seen.has(nameKey(name))) {
      throw fieldError(`Two rules are named "${name}". Rename one.`, { rule: index });
    }
    seen.add(nameKey(name));
  }
}

function fieldError(message, field) {
  return Object.assign(new Error(message), { field });
}

function readText(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('enter some text, or a regex in slashes such as /\\bword\\b/i.');
  }
  return value.trim();
}

function readCount(value) {
  const count = typeof value === 'string' ? parseCount(value) : value;
  if (
    typeof count !== 'number' ||
    !Number.isFinite(count) ||
    count < 0 ||
    count > Number.MAX_SAFE_INTEGER
  ) {
    throw new Error('enter a count such as 1000, 1.5K or 2M.');
  }
  return count;
}

function readNothing() {
  return null;
}

/** "/source/flags" is a regex. Anything else is plain text, matched ignoring case. Never evals. */
function parseText(value) {
  const literal = /^\/(.+)\/([a-z]*)$/i.exec(value);
  if (!literal) {
    const needle = value.toLowerCase();
    return (text) => text.toLowerCase().includes(needle);
  }
  // g and y make test() stateful, which would skip every other matching card.
  const regex = new RegExp(literal[1], literal[2].replace(/[gy]/g, ''));
  return (text) => regex.test(text);
}
