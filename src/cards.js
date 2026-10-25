// YouTube feed markup: finding video cards and reading them. All feed selectors live here.
/** @import { Video } from './typedefs.js' */
import { channelKey } from './subscriptions.js';
import { parseViewLabel } from './view-counts.js';

const CARD = [
  'ytd-rich-item-renderer',
  'ytd-rich-grid-media',
  'ytd-compact-video-renderer',
  'ytd-video-renderer',
  'ytd-grid-video-renderer',
  'yt-lockup-view-model',
].join(',');

/** Feed roots per supported page. The first selector found in the page wins. */
const ROOTS = {
  '/': ['ytd-browse[page-subtype="home"]', 'ytd-rich-grid-renderer'],
  '/watch': ['#related, ytd-watch-next-secondary-results-renderer, ytd-watch-flexy #secondary'],
};

/** Page areas whose changes can add or change cards. */
export const FEED_SELECTOR = [...new Set(Object.values(ROOTS).flat())].join(',');

const VIDEO_LINK = 'a[href*="/watch?"], a[href^="/shorts/"]';
const TITLE = [
  '#video-title',
  '#video-title-link',
  'a.ytLockupMetadataViewModelTitle',
  'a.yt-lockup-metadata-view-model__title',
  'a.yt-lockup-metadata-view-model-wiz__title',
  'h3 a[href*="/watch?"]',
  'h3 a[href^="/shorts/"]',
  'h3[title]',
].join(',');
const CHANNEL = [
  '#channel-name a',
  'ytd-channel-name #text',
  '#byline-container #text',
  'yt-content-metadata-view-model a[href^="/@"]',
  'yt-content-metadata-view-model a[href^="/channel/"]',
  'yt-content-metadata-view-model a[href^="/c/"]',
  'yt-content-metadata-view-model a[href^="/user/"]',
].join(',');
const METADATA_ROW = [
  '.ytContentMetadataViewModelMetadataRow',
  '.yt-content-metadata-view-model__metadata-row',
  '.yt-content-metadata-view-model-wiz__metadata-row',
].join(',');
const ROW = `${METADATA_ROW},#metadata-line`;
const VIEW_TEXT = [
  '#metadata-line > span',
  '#metadata-line .inline-metadata-item',
  'yt-content-metadata-view-model .ytContentMetadataViewModelMetadataText',
  'yt-content-metadata-view-model .yt-content-metadata-view-model__metadata-text',
  'yt-content-metadata-view-model .yt-content-metadata-view-model-wiz__metadata-text',
].join(',');
const SUBSCRIBED_BUTTON =
  'ytd-subscribe-button-renderer[subscribed], subscribe-button-view-model[subscribed]';
const NOT_VIEWS = /\b(watching|waiting|premiere|scheduled|subscribers?)\b/i;

export function isFeedPage(pathname) {
  return Object.hasOwn(ROOTS, pathname);
}

/** Outermost cards in the visible feeds of this page, one per video. */
export function findCards(document, pathname) {
  const selector = ROOTS[pathname]?.find((candidate) => document.querySelector(candidate));
  if (!selector) return [];
  const cards = new Set();
  for (const root of document.querySelectorAll(selector)) {
    if (root.closest('[hidden]')) continue;
    for (const card of root.querySelectorAll(CARD)) {
      const outer = card.parentElement?.closest(CARD);
      if (!outer || !root.contains(outer)) cards.add(card);
    }
  }
  return [...cards];
}

/**
 * What a card shows, or null without a video link and title (ads, shelves).
 * @returns {Video | null}
 */
export function readCard(card) {
  const link = card.querySelector(VIDEO_LINK);
  const titleNode = card.querySelector(TITLE);
  if (!link || !titleNode) return null;
  const title = (titleNode.getAttribute('title') || text(titleNode)).replace(/\s+/g, ' ').trim();
  const channels = unique([...card.querySelectorAll(CHANNEL)].map(text));
  if (!channels.length) {
    // Metadata rows also hold views and dates; the first field is the channel.
    const first = text(card.querySelector(METADATA_ROW)?.firstElementChild);
    if (first) channels.push(first);
  }
  const channelKeys = unique(
    [...card.querySelectorAll('a[href]')].map((node) => channelKey(node.getAttribute('href'))),
  );
  return {
    title,
    channels,
    channelKeys,
    views: readViews(card, channels),
    subscribedButton: Boolean(card.querySelector(SUBSCRIBED_BUTTON)),
    fingerprint: JSON.stringify([link.getAttribute('href'), title, channels, channelKeys]),
  };
}

/** View count from metadata fields only, never titles or durations. */
function readViews(card, channels) {
  const fields = [...card.querySelectorAll(VIEW_TEXT)].filter(
    (node) => !node.closest('a') && !node.querySelector('a') && !channels.includes(text(node)),
  );
  // Accessible labels sometimes hold a more precise count than the visible text.
  for (const read of [(node) => node.getAttribute('aria-label') || '', text]) {
    for (const node of fields) {
      const count = parseViewLabel(read(node));
      if (count !== null) return count;
    }
  }
  // Newer layouts show a bare "42K" beside a view icon.
  for (const node of fields) {
    if (node.getAttribute('aria-label')) continue; // an unreadable label isn't a guess
    const row = node.closest(ROW);
    if (!row || NOT_VIEWS.test(text(row))) continue;
    const first = fields.find((other) => other.closest(ROW) === row && text(other));
    if (first !== node) continue; // first field only, so dates aren't read as views
    const count = parseViewLabel(text(node), { bare: true });
    if (count !== null) return count;
  }
  return null;
}

function text(node) {
  return (node?.textContent || '').replace(/\s+/g, ' ').trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
