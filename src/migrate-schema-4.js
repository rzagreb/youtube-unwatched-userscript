// Converts 1.0.0 settings to rules. Remove with its test and two callers.

const REGEX_CHARACTERS = /[\\^$.*+?()[\]{}|]/;
const NOT_SUBSCRIBED = { type: 'notSubscribed', value: null };

/**
 * Schema 4 settings as schema 5, one rule per old filter with the same effect.
 * Anything else comes back unchanged, for parseSettings to judge.
 * @param {unknown} raw
 * @param {unknown} [oldMode] the 1.0.0 mode, whose "hide" becomes each rule's action
 */
export function migrateSchema4(raw, oldMode) {
  if (raw?.schemaVersion !== 4) return raw;
  if (!Array.isArray(raw.titles) || !Array.isArray(raw.channels)) {
    throw new Error('Expected 1.0.0 settings with lists of titles and channels.');
  }
  const action = oldMode === 'hide' ? 'hide' : 'blur';
  const covered = raw.applyToSubscribed ?? {};
  // Subscribed channels were exempt unless the filter's box was ticked.
  const rule = (filter, condition) => ({
    name: '',
    conditions: covered[filter] === true ? [condition] : [condition, NOT_SUBSCRIBED],
    action,
  });
  const textRules = (lines, filter, type) =>
    lines
      .filter((line) => typeof line !== 'string' || line.trim())
      .map((line) => rule(filter, { type, value: asRegex(line) }));
  return {
    schemaVersion: 5,
    rules: [
      ...textRules(raw.titles, 'titles', 'titleContains'),
      ...textRules(raw.channels, 'channels', 'channelContains'),
      ...(isSet(raw.minViews)
        ? [rule('minViews', { type: 'viewsBelow', value: raw.minViews })]
        : []),
      ...(isSet(raw.maxViews)
        ? [rule('maxViews', { type: 'viewsAbove', value: raw.maxViews })]
        : []),
      ...(raw.allowUnknownViews === false
        ? [rule('missingViews', { type: 'viewsMissing', value: null })]
        : []),
    ],
  };
}

/** Old bare lines were case-insensitive regexes. Plain words keep working as plain text. */
function asRegex(line) {
  if (typeof line !== 'string') return line;
  const value = line.trim();
  if (/^\/.+\/[a-z]*$/i.test(value) || !REGEX_CHARACTERS.test(value)) return value;
  return `/${value}/i`;
}

function isSet(limit) {
  return limit !== null && limit !== undefined && limit !== '';
}
