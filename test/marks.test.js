import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { createMarks } from '../src/marks.js';

function cards(...ids) {
  const { document } = new JSDOM(ids.map((id) => `<div id="${id}"><a>video</a></div>`).join(''))
    .window;
  return ids.map((id) => document.getElementById(id));
}

test('Reveal toggles one card, and only blur mode counts revealed cards as visible', () => {
  const [card] = cards('card');
  let toggles = 0;
  const marks = createMarks(() => toggles++);
  marks.mark(card, 'video-1');
  marks.mark(card, 'video-1');
  const buttons = card.querySelectorAll('button');
  assert.equal(buttons.length, 1);

  buttons[0].click();
  assert.equal(toggles, 1);
  assert.equal(buttons[0].textContent, 'Blur again');
  assert.deepEqual(
    ['blur', 'hide', 'off'].map((mode) => marks.filteredCount(mode)),
    [0, 1, 0],
  );
});

test('a reveal ends when YouTube reuses the card for another video', () => {
  const [card] = cards('card');
  const marks = createMarks(() => {});
  marks.mark(card, 'video-1');
  card.querySelector('button').click();
  marks.mark(card, 'video-2');
  assert.equal(marks.filteredCount('blur'), 1);
  assert.equal(card.querySelector('button').textContent, 'Reveal');
});

test('a marked card gets its button back after YouTube replaces its children', () => {
  const [card] = cards('card');
  const marks = createMarks(() => {});
  marks.mark(card, 'video-1');
  card.replaceChildren();
  marks.mark(card, 'video-1');
  assert.equal(card.querySelectorAll('button').length, 1);
});

test('keepOnly unmarks cards that stopped matching', () => {
  const [kept, dropped] = cards('kept', 'dropped');
  const marks = createMarks(() => {});
  marks.mark(kept, 'a');
  marks.mark(dropped, 'b');
  marks.keepOnly(new Set([kept]));
  assert.equal(marks.size, 1);
  assert.equal(dropped.className, '');
  assert.equal(dropped.querySelector('button'), null);
});
