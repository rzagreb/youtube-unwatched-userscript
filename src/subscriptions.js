// Subscriptions: channel identity, reading the list from YouTube, and keeping it fresh.
/** @import { SubscriptionList } from './typedefs.js' */
import { LOG_PREFIX } from './constants.js';

const YOUTUBE = 'https://www.youtube.com';
const ID_FIELDS = ['channelId', 'contentId', 'browseId'];
const REFRESH_MS = 5 * 60 * 1000;
const RETRY_MS = 60 * 1000;
const TIMEOUT_MS = 15_000;
const MAX_PAGES = 100;

/** Canonical key for a channel URL, path or UC id; null for anything else. */
export function channelKey(value) {
  if (typeof value !== 'string') return null;
  if (/^UC[\w-]{22}$/.test(value)) return `/channel/${value}`;
  try {
    const url = new URL(value, YOUTUBE);
    if (!['www.youtube.com', 'youtube.com'].includes(url.hostname)) return null;
    const path = decodeURIComponent(url.pathname).replace(/\/+$/, '');
    if (/^\/channel\/UC[\w-]{22}$/.test(path)) return path;
    if (/^\/@[^/]+$/.test(path) || /^\/(?:c|user)\/[^/]+$/.test(path)) return path.toLowerCase();
  } catch {
    // An unusable link is not an identity.
  }
  return null;
}

/** Merged `ytcfg.set({...})` objects found in page source. */
export function readYouTubeConfig(source) {
  const config = {};
  for (const match of source.matchAll(/\bytcfg\.set\s*\(\s*/g)) {
    const value = readJSONObject(source, match.index + match[0].length);
    if (value) Object.assign(config, value);
  }
  return config;
}

/** The `ytInitialData` object in page source; throws when there is none. */
export function readInitialData(source) {
  for (const match of source.matchAll(/\bytInitialData(?:["']\])?\s*=\s*/g)) {
    const value = readJSONObject(source, match.index + match[0].length);
    if (value) return value;
  }
  throw new Error('YouTube did not return a readable subscription list.');
}

/**
 * The signed-in account's whole subscription list. Throws rather than return part of it.
 * @returns {Promise<SubscriptionList>}
 */
export async function loadSubscriptions(document, request = fetchYouTube) {
  const inline = [...document.querySelectorAll('script:not([src])')]
    .map((script) => script.textContent)
    .join('\n');
  const pageConfig = readYouTubeConfig(inline);
  if (pageConfig.LOGGED_IN === false) return { signedOut: true };

  const html = await (await request(feedPath(pageConfig))).text();
  const fetchedConfig = readYouTubeConfig(html);
  const config = { ...pageConfig, ...fetchedConfig };
  const data = readInitialData(html);
  checkSameAccount(pageConfig, fetchedConfig);
  if (
    config.LOGGED_IN === false ||
    data.responseContext?.mainAppWebResponseContext?.loggedOut === true
  ) {
    // Signed-out data for a signed-in page is a session problem, not zero subscriptions.
    if (pageConfig.LOGGED_IN === true) {
      throw new Error('YouTube could not verify your signed-in account.');
    }
    return { signedOut: true };
  }
  const content = selectedTab(data);
  const keys = new Set();
  const first = collectChannels(content, keys);
  if (!first.channels && !isEmptyList(content)) {
    throw new Error('YouTube returned an unrecognized subscription-list layout.');
  }
  await readContinuations(first.tokens, config, keys, request);
  return { signedOut: false, keys };
}

/**
 * Holds the last list and refreshes it at most every 5 minutes, or 1 after a failure.
 * The old list stays in use during a refresh, so filtered cards don't flash.
 */
export function createSubscriptions(load, onChange) {
  /** @type {SubscriptionList | null} */
  let list = null;
  let loading = false;
  let error = '';
  let attemptedAt = Number.NEGATIVE_INFINITY;

  async function refresh(force = false) {
    const wait = error ? RETRY_MS : REFRESH_MS;
    if (loading || (!force && Date.now() - attemptedAt < wait)) return;
    loading = true;
    error = '';
    attemptedAt = Date.now();
    onChange();
    try {
      list = await load();
    } catch (failure) {
      list = null;
      error = failure.message;
      console.warn(LOG_PREFIX, 'Subscription check:', error);
    } finally {
      loading = false;
      onChange();
    }
  }

  /** true or false once known; null while this channel's status is unknown. */
  function isSubscribed(channelKeys) {
    if (!list) return null;
    if (list.signedOut) return false;
    if (channelKeys.some((key) => list.keys.has(key))) return true;
    return channelKeys.length ? false : null;
  }

  return {
    refresh,
    isSubscribed,
    get status() {
      return { loading, error, signedOut: list?.signedOut === true };
    },
  };
}

/** Same-origin fetch with the signed-in session. Refuses to leave YouTube. */
async function fetchYouTube(path, options = {}) {
  const url = new URL(path, location.origin);
  if (url.origin !== location.origin) {
    throw new Error('Subscription requests must stay on YouTube.');
  }
  const response = await fetch(url.href, {
    ...options,
    credentials: 'same-origin',
    cache: 'no-store',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`YouTube subscription request failed (${response.status}).`);
  if (response.url && new URL(response.url).origin !== location.origin) {
    throw new Error('YouTube redirected the subscription check.');
  }
  return response;
}

function feedPath(pageConfig) {
  const query = new URLSearchParams();
  if (pageConfig.SESSION_INDEX !== undefined) {
    query.set('authuser', String(pageConfig.SESSION_INDEX));
  }
  if (pageConfig.DELEGATED_SESSION_ID) query.set('pageid', pageConfig.DELEGATED_SESSION_ID);
  const search = query.toString();
  return search ? `/feed/channels?${search}` : '/feed/channels';
}

function checkSameAccount(pageConfig, fetchedConfig) {
  if (
    pageConfig.SESSION_INDEX !== undefined &&
    fetchedConfig.SESSION_INDEX !== undefined &&
    String(pageConfig.SESSION_INDEX) !== String(fetchedConfig.SESSION_INDEX)
  ) {
    throw new Error('YouTube returned a different account.');
  }
  if (
    pageConfig.DELEGATED_SESSION_ID &&
    fetchedConfig.DELEGATED_SESSION_ID !== pageConfig.DELEGATED_SESSION_ID
  ) {
    throw new Error('YouTube returned a different channel account.');
  }
}

function selectedTab(data) {
  const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
  const tab =
    tabs.find((item) => item.tabRenderer?.selected) ||
    tabs.find((item) => item.tabRenderer?.content);
  const content = tab?.tabRenderer?.content;
  if (!content || data.alerts?.length || data.error) {
    throw new Error('YouTube subscription list is unavailable.');
  }
  return content;
}

/** True for a list YouTube shows as empty: a message, or no sections. */
function isEmptyList(content) {
  return [...jsonObjects(content)].some(
    (node) =>
      node.messageRenderer ||
      (Array.isArray(node.sectionListRenderer?.contents) &&
        !node.sectionListRenderer.contents.length),
  );
}

async function readContinuations(tokens, config, keys, request) {
  const pending = [...tokens];
  const seen = new Set();
  const context = config.INNERTUBE_CONTEXT;
  while (pending.length) {
    const token = pending.shift();
    if (seen.has(token) || seen.size >= MAX_PAGES) {
      throw new Error('YouTube returned an incomplete subscription list.');
    }
    seen.add(token);
    if (!context?.client) {
      throw new Error('YouTube did not provide subscription pagination details.');
    }
    const page = await (await request(...browseRequest(config, context, token))).json();
    if (page.error || page.responseContext?.mainAppWebResponseContext?.loggedOut === true) {
      throw new Error('YouTube could not finish checking subscriptions.');
    }
    if (!isContinuation(page)) {
      throw new Error('YouTube returned an unreadable subscription-list continuation.');
    }
    pending.push(...collectChannels(page, keys).tokens);
    if (page.responseContext?.visitorData) {
      context.client.visitorData = page.responseContext.visitorData;
    }
  }
}

function browseRequest(config, context, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (config.SESSION_INDEX !== undefined) headers['X-Goog-AuthUser'] = String(config.SESSION_INDEX);
  if (config.DELEGATED_SESSION_ID) headers['X-Goog-PageId'] = String(config.DELEGATED_SESSION_ID);
  const key = config.INNERTUBE_API_KEY
    ? `&key=${encodeURIComponent(config.INNERTUBE_API_KEY)}`
    : '';
  const body = JSON.stringify({ context, continuation: token });
  return [`/youtubei/v1/browse?prettyPrint=false${key}`, { method: 'POST', headers, body }];
}

function isContinuation(page) {
  return [...jsonObjects(page)].some(
    (node) =>
      Array.isArray(node.appendContinuationItemsAction?.continuationItems) ||
      Array.isArray(node.reloadContinuationItemsCommand?.continuationItems) ||
      node.sectionListContinuation ||
      node.gridContinuation ||
      node.itemSectionContinuation,
  );
}

/** Counts channels and gathers continuation tokens; adds channel keys to `keys`. */
function collectChannels(root, keys) {
  const tokens = new Set();
  let channels = 0;
  for (const node of jsonObjects(root)) {
    const channel =
      node.channelRenderer ||
      node.gridChannelRenderer ||
      node.channelViewModel ||
      (node.lockupViewModel?.contentType === 'LOCKUP_CONTENT_TYPE_CHANNEL'
        ? node.lockupViewModel
        : null);
    if (channel) {
      channels++;
      if (!addChannelKeys(channel, keys)) {
        throw new Error('YouTube returned a channel without a usable identity.');
      }
    }
    const token =
      node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token ||
      node.nextContinuationData?.continuation;
    if (typeof token === 'string' && token) tokens.add(token);
  }
  return { tokens: [...tokens], channels };
}

/** Adds one channel's ids and URL aliases. Display names never count. */
function addChannelKeys(channel, keys) {
  let found = false;
  for (const node of jsonObjects(channel)) {
    for (const [field, value] of Object.entries(node)) {
      if (typeof value !== 'string') continue;
      const key = channelKey(value.startsWith('@') ? `/${value}` : value);
      if (key && (/^(?:\/|http|@)/.test(value) || ID_FIELDS.includes(field))) {
        keys.add(key);
        found = true;
      }
    }
  }
  return found;
}

/** Every object nested in a JSON value, the root included. */
function* jsonObjects(root) {
  const pending = [root];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== 'object') continue;
    yield value;
    pending.push(...Object.values(value).filter((item) => item && typeof item === 'object'));
  }
}

/** JSON object starting at `start`, found by matching braces outside strings. */
function readJSONObject(source, start) {
  if (source[start] !== '{') return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') {
      quoted = true;
    } else if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) return parseJSON(source.slice(start, index + 1));
    }
  }
  return null;
}

// Page code that isn't plain JSON simply isn't a config; never eval it.
function parseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
