// Entry point: watches YouTube's feeds, marks matching cards and keeps the controls current.
import { FEED_SELECTOR, findCards, isFeedPage, readCard } from './cards.js';
import { UI_ATTRIBUTE } from './constants.js';
import { createEditor } from './editor.js';
import { matchesFilters, needsSubscriptions } from './filters.js';
import { createMarks, PAGE_CSS, showMode } from './marks.js';
import { createPanel, guardKeyboard, HOST_ID } from './panel.js';
import { loadFilters, loadMode, saveFilters, saveMode } from './storage.js';
import { createSubscriptions, loadSubscriptions } from './subscriptions.js';

const SCAN_DELAY_MS = 100;
const NAVIGATION_EVENTS = ['yt-navigate-finish', 'yt-page-data-updated', 'yt-navigate-cache'];
const WATCHED_ATTRIBUTES = ['href', 'title', 'hidden', 'page-subtype', 'aria-label'];

start();

async function start() {
  let panel = null;
  // Runs at document-start, so this listener goes in before YouTube's hotkeys.
  guardKeyboard(window, () => panel?.closeOnEscape());
  if (!document.body) {
    await new Promise((resolve) => {
      document.addEventListener('DOMContentLoaded', resolve, { once: true });
    });
  }
  if (document.getElementById(HOST_ID)) return; // already running in this page

  let mode = loadMode();
  let { filters } = loadFilters();
  let scanTimer = null;

  GM_addStyle(PAGE_CSS);
  const subscriptions = createSubscriptions(
    () => loadSubscriptions(document),
    () => {
      render();
      scheduleScan();
    },
  );
  const marks = createMarks(render);
  const editor = createEditor(document, {
    load() {
      const result = loadFilters();
      // Unreadable storage: keep the rules already running, as the warning promises.
      if (result.warning) return { filters, warning: result.warning };
      filters = result.filters;
      scheduleScan();
      return result;
    },
    save(raw) {
      filters = saveFilters(raw);
      scheduleScan();
    },
    refreshSubscriptions: () => subscriptions.refresh(true),
  });
  panel = createPanel(document, {
    editor,
    onMode(next) {
      mode = next;
      render();
      saveMode(mode);
    },
  });

  function render() {
    showMode(document, mode);
    panel.render({ mode, matches: marks.size, filtered: marks.filteredCount(mode) });
    editor.render(subscriptions.status);
  }

  function scheduleScan() {
    if (scanTimer === null) scanTimer = setTimeout(scan, SCAN_DELAY_MS);
  }

  function updateVisibility() {
    panel.setVisible(isFeedPage(location.pathname) && !document.fullscreenElement);
  }

  function scan() {
    scanTimer = null;
    if (!panel.host.isConnected) document.body.append(panel.host);
    updateVisibility();
    if (isFeedPage(location.pathname) && needsSubscriptions(filters)) subscriptions.refresh();
    const matched = new Set();
    for (const card of findCards(document, location.pathname)) {
      const video = readCard(card);
      if (!video) continue;
      const subscribed = video.subscribedButton || subscriptions.isSubscribed(video.channelKeys);
      if (!matchesFilters(filters, video, subscribed)) continue;
      matched.add(card);
      marks.mark(card, video.fingerprint);
    }
    marks.keepOnly(matched);
    render();
  }

  new MutationObserver((records) => {
    if (records.some(touchesFeed)) scheduleScan();
  }).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: WATCHED_ATTRIBUTES,
  });
  for (const type of NAVIGATION_EVENTS) document.addEventListener(type, scheduleScan);
  window.addEventListener('popstate', scheduleScan);
  window.addEventListener('pageshow', scheduleScan);
  document.addEventListener('fullscreenchange', updateVisibility);
  scan();
}

/** True when a DOM change can add or change feed cards. Our own nodes never count. */
function touchesFeed(record) {
  if (isOwnNode(record.target)) return false;
  const changed = [...record.addedNodes, ...record.removedNodes];
  if (record.type === 'childList' && changed.length && changed.every(isOwnNode)) return false;
  if (asElement(record.target)?.closest(FEED_SELECTOR)) return true;
  return changed.some(
    (node) =>
      node.nodeType === Node.ELEMENT_NODE &&
      (node.matches(FEED_SELECTOR) || node.querySelector(FEED_SELECTOR)),
  );
}

function isOwnNode(node) {
  return Boolean(asElement(node)?.closest(`[${UI_ATTRIBUTE}]`));
}

function asElement(node) {
  return node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
}
