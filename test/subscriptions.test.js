import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import {
  channelKey,
  createSubscriptions,
  loadSubscriptions,
  readYouTubeConfig,
} from '../src/subscriptions.js';

const ID_A = `UC${'a'.repeat(22)}`;
const ID_B = `UC${'b'.repeat(22)}`;

const channel = (id, handle) => ({
  channelRenderer: {
    channelId: id,
    navigationEndpoint: { browseEndpoint: { canonicalBaseUrl: `/@${handle}` } },
  },
});
const more = (token) => ({
  continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token } } },
});
const feed = (items, extra = {}) => ({
  contents: {
    twoColumnBrowseResultsRenderer: {
      tabs: [
        { tabRenderer: { selected: true, content: { sectionListRenderer: { contents: items } } } },
      ],
    },
  },
  ...extra,
});
const page = (items) => ({
  onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: items } }],
});
const pageWith = (config) =>
  new JSDOM(`<script>ytcfg.set(${JSON.stringify(config)})</script>`).window.document;

/** Fake YouTube: serves the feed page, then continuation pages by token. */
function fakeYouTube({ config = {}, data, pages = {} }) {
  const calls = [];
  const ytcfg = { LOGGED_IN: true, INNERTUBE_CONTEXT: { client: {} }, ...config };
  const html = `<script>ytcfg.set(${JSON.stringify(ytcfg)})</script>
<script>var ytInitialData = ${JSON.stringify(data)};</script>`;
  async function request(path, options) {
    calls.push({ path, options });
    const body = path.startsWith('/feed/channels')
      ? html
      : pages[JSON.parse(options.body).continuation];
    return { text: async () => body, json: async () => body };
  }
  return { request, calls };
}

test('channelKey turns channel links and ids into one canonical key', () => {
  const cases = [
    [ID_A, `/channel/${ID_A}`],
    [`/channel/${ID_A}/`, `/channel/${ID_A}`],
    ['/@Some.Handle', '/@some.handle'],
    ['https://youtube.com/c/OldName/', '/c/oldname'],
    ['/user/Legacy', '/user/legacy'],
    ['/@caf%C3%A9', '/@café'],
    ['/@handle/videos', null],
    ['/watch?v=abc', null],
    ['https://example.com/@handle', null],
    ['/@%E0%A4%A', null],
    [42, null],
  ];
  for (const [value, expected] of cases) assert.equal(channelKey(value), expected, String(value));
});

test('readYouTubeConfig merges ytcfg.set calls and skips braces inside strings', () => {
  const source =
    'ytcfg.set({"A": 1, "S": "a } brace and \\" quote"}); ytcfg.set({bad}); ytcfg.set({"B": 2});';
  assert.deepEqual(readYouTubeConfig(source), { A: 1, S: 'a } brace and " quote', B: 2 });
});

test('loadSubscriptions reads every page of the list for the same account', async () => {
  const youtube = fakeYouTube({
    data: feed([channel(ID_A, 'first'), more('page-2')]),
    pages: { 'page-2': page([channel(ID_B, 'second')]) },
  });
  const list = await loadSubscriptions(
    pageWith({ LOGGED_IN: true, SESSION_INDEX: 0 }),
    youtube.request,
  );
  assert.deepEqual(
    [...list.keys].sort(),
    [`/channel/${ID_A}`, `/channel/${ID_B}`, '/@first', '/@second'].sort(),
  );
  assert.equal(youtube.calls[0].path, '/feed/channels?authuser=0');
  assert.equal(youtube.calls[1].options.headers['X-Goog-AuthUser'], '0');
  assert.equal(JSON.parse(youtube.calls[1].options.body).continuation, 'page-2');
});

test('loadSubscriptions trusts a signed-out page without asking YouTube', async () => {
  const youtube = fakeYouTube({ data: feed([]) });
  const list = await loadSubscriptions(pageWith({ LOGGED_IN: false }), youtube.request);
  assert.deepEqual(list, { signedOut: true });
  assert.equal(youtube.calls.length, 0);
});

test('loadSubscriptions accepts an empty list', async () => {
  const youtube = fakeYouTube({ data: feed([]) });
  const list = await loadSubscriptions(pageWith({ LOGGED_IN: true }), youtube.request);
  assert.equal(list.keys.size, 0);
});

test('loadSubscriptions refuses a list it cannot trust', async () => {
  const signedOutData = { responseContext: { mainAppWebResponseContext: { loggedOut: true } } };
  const cases = [
    ['signed-out data', { data: feed([], signedOutData) }, /could not verify/],
    ['another account', { config: { SESSION_INDEX: 1 }, data: feed([]) }, /different account/],
    ['unknown layout', { data: feed([{ somethingNew: {} }]) }, /unrecognized/],
    [
      'nameless channel',
      { data: feed([{ channelRenderer: { title: 'Name' } }]) },
      /usable identity/,
    ],
    [
      'looping pages',
      { data: feed([channel(ID_A, 'a'), more('loop')]), pages: { loop: page([more('loop')]) } },
      /incomplete/,
    ],
  ];
  for (const [name, setup, message] of cases) {
    const youtube = fakeYouTube(setup);
    const document = pageWith({ LOGGED_IN: true, SESSION_INDEX: 0 });
    await assert.rejects(loadSubscriptions(document, youtube.request), message, name);
  }
});

test('a refresh keeps using the previous list until the new one arrives', async () => {
  const waiting = [];
  const load = () => new Promise((resolve) => waiting.push(resolve));
  const subscriptions = createSubscriptions(load, () => {});

  const first = subscriptions.refresh();
  waiting.shift()({ signedOut: false, keys: new Set(['/@old']) });
  await first;
  const second = subscriptions.refresh(true);
  assert.equal(subscriptions.status.loading, true);
  assert.equal(subscriptions.isSubscribed(['/@old']), true);

  waiting.shift()({ signedOut: false, keys: new Set(['/@new']) });
  await second;
  assert.equal(subscriptions.isSubscribed(['/@old']), false);
  assert.equal(subscriptions.isSubscribed(['/@new']), true);
  assert.equal(subscriptions.isSubscribed([]), null);
});

test('checks run at most every 5 minutes, or every minute after a failure', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  t.mock.method(console, 'warn', () => {});
  const results = [{ signedOut: true }, new Error('offline'), { signedOut: true }];
  let calls = 0;
  const load = async () => {
    calls++;
    const next = results.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  const subscriptions = createSubscriptions(load, () => {});

  await subscriptions.refresh();
  assert.equal(subscriptions.isSubscribed(['/@any']), false, 'signed out: nothing is subscribed');
  t.mock.timers.tick(4 * 60_000);
  await subscriptions.refresh();
  assert.equal(calls, 1, 'reuses a fresh list');

  t.mock.timers.tick(60_000);
  await subscriptions.refresh();
  assert.equal(calls, 2, 'refreshes after 5 minutes');
  assert.equal(subscriptions.isSubscribed(['/@any']), null, 'a failure forgets the old list');
  assert.equal(subscriptions.status.error, 'offline');

  t.mock.timers.tick(60_000);
  await subscriptions.refresh();
  assert.equal(calls, 3, 'retries a minute after a failure');
});
