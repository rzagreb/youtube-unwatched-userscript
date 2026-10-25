import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { findCards, readCard } from '../src/cards.js';

const documentWith = (body) => new JSDOM(`<!doctype html><body>${body}</body>`).window.document;
const cardFrom = (html) => documentWith(html).body.firstElementChild;

// Markup modeled on YouTube's lockup layout (2025+), trimmed to what the script reads.
const field = (text, attributes = '') =>
  `<span class="ytContentMetadataViewModelMetadataText" ${attributes}>${text}</span>`;
const row = (...fields) =>
  `<div class="ytContentMetadataViewModelMetadataRow">${fields.join('')}</div>`;
const channelField = field('<a href="/@lockup">Lockup Channel</a>');
const lockup = (...rows) => `<yt-lockup-view-model>
  <a href="/watch?v=lockup"></a>
  <h3 title="Lockup title"><a class="ytLockupMetadataViewModelTitle" href="/watch?v=lockup">Lockup title</a></h3>
  <yt-content-metadata-view-model>${rows.join('')}</yt-content-metadata-view-model>
</yt-lockup-view-model>`;

// The older grid layout.
const classic = `<ytd-rich-item-renderer>
  <a id="thumbnail" href="/watch?v=classic"></a>
  <h3><a id="video-title-link" href="/watch?v=classic" title="Classic   title">Classic title</a></h3>
  <ytd-channel-name><div id="text"><a href="/channel/UC${'c'.repeat(22)}">Classic Channel</a></div></ytd-channel-name>
  <ytd-subscribe-button-renderer subscribed></ytd-subscribe-button-renderer>
  <div id="metadata-line"><span class="inline-metadata-item">15K views</span><span>1 day ago</span></div>
</ytd-rich-item-renderer>`;

test('readCard reads title, channel, channel keys and views from both layouts', () => {
  const cases = [
    [
      'lockup',
      lockup(row(channelField), row(field('1.2M views'), field('2 days ago'))),
      {
        title: 'Lockup title',
        channels: ['Lockup Channel'],
        channelKeys: ['/@lockup'],
        views: 1_200_000,
        subscribedButton: false,
      },
    ],
    [
      'classic',
      classic,
      {
        title: 'Classic title',
        channels: ['Classic Channel'],
        channelKeys: [`/channel/UC${'c'.repeat(22)}`],
        views: 15_000,
        subscribedButton: true,
      },
    ],
  ];
  for (const [name, html, expected] of cases) {
    const { fingerprint, ...video } = readCard(cardFrom(html));
    assert.deepEqual(video, expected, name);
    assert.ok(fingerprint.includes(expected.title), name);
  }
});

test('readCard finds the view count without mistaking dates or live viewers', () => {
  const cases = [
    ['visible label', [field('1.2M views'), field('2 days ago')], 1_200_000],
    ['precise aria-label', [field('1.2M views', 'aria-label="1,234,567 views"')], 1_234_567],
    ['bare count by a view icon', [field('42K'), field('2024')], 42_000],
    ['bare number after a date', [field('3 years ago'), field('2024')], null],
    ['date only', [field('3 years ago')], null],
    ['live stream', [field('1.2K watching')], null],
  ];
  for (const [name, fields, expected] of cases) {
    const card = cardFrom(lockup(row(channelField), row(...fields)));
    assert.equal(readCard(card).views, expected, name);
  }
});

test('readCard takes an unlinked channel from the first metadata field', () => {
  const card = cardFrom(lockup(row(field('Plain Channel')), row(field('3K views'))));
  const video = readCard(card);
  assert.deepEqual(video.channels, ['Plain Channel']);
  assert.equal(video.views, 3000);
});

test('readCard skips cards without a video link, like ads', () => {
  assert.equal(
    readCard(cardFrom('<yt-lockup-view-model><h3 title="Ad"></h3></yt-lockup-view-model>')),
    null,
  );
});

test('findCards returns each outermost card once, only from visible feeds', () => {
  const document = documentWith(`
    <div hidden><div id="related"><yt-lockup-view-model id="stale"></yt-lockup-view-model></div></div>
    <ytd-watch-flexy><div id="secondary"><div id="related">
      <ytd-compact-video-renderer id="outer"><yt-lockup-view-model></yt-lockup-view-model></ytd-compact-video-renderer>
      <yt-lockup-view-model id="next"></yt-lockup-view-model>
    </div></div></ytd-watch-flexy>`);
  assert.deepEqual(
    findCards(document, '/watch').map((card) => card.id),
    ['outer', 'next'],
  );
  assert.deepEqual(findCards(document, '/results'), []);
});

test('findCards prefers the Home browse page over other grids', () => {
  const document = documentWith(`
    <ytd-rich-grid-renderer><ytd-rich-item-renderer id="elsewhere"></ytd-rich-item-renderer></ytd-rich-grid-renderer>
    <ytd-browse page-subtype="home"><ytd-rich-item-renderer id="home"></ytd-rich-item-renderer></ytd-browse>`);
  assert.deepEqual(
    findCards(document, '/').map((card) => card.id),
    ['home'],
  );
});
