import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { createMarks } from '../src/marks.js';

function cards(...ids) {
  const { document } = new JSDOM(ids.map((id) => `<div id="${id}"><a>video</a></div>`).join(''))
    .window;
  return ids.map((id) => document.getElementById(id));
}

test('Reveal toggles one blurred card, and the count skips revealed ones', () => {
  const [blurred, hidden] = cards('blurred', 'hidden');
  let toggles = 0;
  const marks = createMarks(() => toggles++);
  marks.mark(blurred, 'video-1', 'blur');
  marks.mark(blurred, 'video-1', 'blur');
  marks.mark(hidden, 'video-2', 'hide');
  const buttons = blurred.querySelectorAll('button');
  assert.equal(buttons.length, 1);
  assert.equal(marks.filteredCount('on'), 2);

  buttons[0].click();
  assert.equal(toggles, 1);
  assert.equal(buttons[0].textContent, 'Blur again');
  assert.deepEqual(
    ['on', 'off'].map((mode) => marks.filteredCount(mode)),
    [1, 0],
  );
});

test('a marked card takes the action of its latest match', () => {
  const [card] = cards('card');
  const marks = createMarks(() => {});
  marks.mark(card, 'video-1', 'blur');
  marks.mark(card, 'video-1', 'hide');
  assert.equal(card.getAttribute('data-ytuw-action'), 'hide');
});

test('a reveal ends when YouTube reuses the card for another video', () => {
  const [card] = cards('card');
  const marks = createMarks(() => {});
  marks.mark(card, 'video-1', 'blur');
  card.querySelector('button').click();
  marks.mark(card, 'video-2', 'blur');
  assert.equal(marks.filteredCount('on'), 1);
  assert.equal(card.querySelector('button').textContent, 'Reveal');
});

test('a marked card gets its button back after YouTube replaces its children', () => {
  const [card] = cards('card');
  const marks = createMarks(() => {});
  marks.mark(card, 'video-1', 'blur');
  card.replaceChildren();
  marks.mark(card, 'video-1', 'blur');
  assert.equal(card.querySelectorAll('button').length, 1);
});

test('keepOnly unmarks cards that stopped matching', () => {
  const [kept, dropped] = cards('kept', 'dropped');
  const marks = createMarks(() => {});
  marks.mark(kept, 'a', 'blur');
  marks.mark(dropped, 'b', 'hide');
  marks.keepOnly(new Set([kept]));
  assert.equal(marks.size, 1);
  assert.equal(dropped.className, '');
  assert.equal(dropped.hasAttribute('data-ytuw-action'), false);
  assert.equal(dropped.querySelector('button'), null);
});
