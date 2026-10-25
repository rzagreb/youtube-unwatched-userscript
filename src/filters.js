// Filter rules: validating saved settings (schema 4) and matching one video against them.
/** @import { FilterName, Filters, Settings, Video } from './typedefs.js' */
import { parseCount } from './view-counts.js';

export const SCHEMA_VERSION = 4;

/** One row per filter: is it switched on, and does it block this video. */
const RULES = {
  titles: {
    active: (filters) => filters.titlePatterns.length > 0,
    blocks: (filters, video) => filters.titlePatterns.some((pattern) => pattern.test(video.title)),
  },
  channels: {
    active: (filters) => filters.channelPatterns.length > 0,
    blocks: (filters, video) =>
      filters.channelPatterns.some((pattern) => video.channels.some((name) => pattern.test(name))),
  },
  minViews: {
    active: (filters) => filters.settings.minViews !== null,
    blocks: (filters, video) => video.views !== null && video.views < filters.settings.minViews,
  },
  maxViews: {
    active: (filters) => filters.settings.maxViews !== null,
    blocks: (filters, video) => video.views !== null && video.views > filters.settings.maxViews,
  },
  missingViews: {
    active: (filters) => !filters.settings.allowUnknownViews,
    blocks: (_filters, video) => video.views === null,
  },
};

/** @type {FilterName[]} */
export const FILTER_NAMES = Object.keys(RULES);

/** @type {Settings} First run: nothing is filtered until you add rules. */
export const DEFAULT_SETTINGS = {
  schemaVersion: SCHEMA_VERSION,
  titles: [],
  channels: [],
  minViews: null,
  maxViews: null,
  allowUnknownViews: true,
  applyToSubscribed: Object.fromEntries(FILTER_NAMES.map((name) => [name, false])),
};

/**
 * Validates settings from storage, the editor or a backup; throws editor-ready messages.
 * @returns {Filters}
 */
export function parseSettings(raw) {
  if (
    !isRecord(raw) ||
    raw.schemaVersion !== SCHEMA_VERSION ||
    !Array.isArray(raw.titles) ||
    !Array.isArray(raw.channels)
  ) {
    throw new Error(
      'Expected filter settings with schemaVersion 4 and lists of titles and channels.',
    );
  }
  const minViews = parseLimit(raw.minViews, 'Minimum views');
  const maxViews = parseLimit(raw.maxViews, 'Maximum views');
  if (minViews !== null && maxViews !== null && minViews > maxViews) {
    throw new Error('Minimum views must not be greater than maximum views.');
  }
  const settings = {
    schemaVersion: SCHEMA_VERSION,
    titles: readLines(raw.titles, 'Titles'),
    channels: readLines(raw.channels, 'Channels'),
    minViews,
    maxViews,
    allowUnknownViews: readFlag(raw.allowUnknownViews, true, 'allowUnknownViews'),
    applyToSubscribed: readSubscribedFlags(raw.applyToSubscribed),
  };
  return {
    settings,
    titlePatterns: compile(settings.titles, 'Titles'),
    channelPatterns: compile(settings.channels, 'Channels'),
  };
}

/**
 * Whether filters block the video. `subscribed` is null while unknown,
 * so only filters that also cover subscribed channels apply.
 * @param {Filters} filters
 * @param {Video} video
 * @param {boolean | null} subscribed
 */
export function matchesFilters(filters, video, subscribed) {
  return FILTER_NAMES.some(
    (name) =>
      (subscribed === false || filters.settings.applyToSubscribed[name]) &&
      RULES[name].active(filters) &&
      RULES[name].blocks(filters, video),
  );
}

/** True when an active filter exempts subscribed channels, so the list matters. */
export function needsSubscriptions(filters) {
  return FILTER_NAMES.some(
    (name) => RULES[name].active(filters) && !filters.settings.applyToSubscribed[name],
  );
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseLimit(value, label) {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) {
    return null;
  }
  const count = typeof value === 'string' ? parseCount(value) : value;
  if (
    typeof count !== 'number' ||
    !Number.isFinite(count) ||
    count < 0 ||
    count > Number.MAX_SAFE_INTEGER
  ) {
    throw new Error(`${label}: enter a count such as 1000, 1.5K or 2M, or leave it blank.`);
  }
  return count;
}

function readLines(list, label) {
  return list
    .map((value, index) => {
      if (typeof value !== 'string') throw new Error(`${label}, entry ${index + 1}: use a string.`);
      return value.trim();
    })
    .filter(Boolean);
}

function readFlag(value, fallback, name) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new Error(`${name} must be true or false.`);
  return value;
}

function readSubscribedFlags(value = {}) {
  if (!isRecord(value)) {
    throw new Error('applyToSubscribed must be an object of true/false values.');
  }
  return Object.fromEntries(
    FILTER_NAMES.map((name) => [name, readFlag(value[name], false, `applyToSubscribed.${name}`)]),
  );
}

function compile(list, label) {
  return list.map((value, index) => {
    try {
      return parsePattern(value);
    } catch (error) {
      throw new Error(`${label}, rule ${index + 1}: ${error.message}`);
    }
  });
}

/** "/pattern/flags" keeps its flags; a bare pattern ignores case. Never evals. */
function parsePattern(value) {
  const literal = /^\/([\s\S]*)\/([a-z]*),?$/i.exec(value);
  const regex = literal ? new RegExp(literal[1], literal[2]) : new RegExp(value, 'i');
  // g and y make test() stateful, which would skip every other matching card.
  return new RegExp(regex.source, regex.flags.replace(/[gy]/g, ''));
}
