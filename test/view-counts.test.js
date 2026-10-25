import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCount, parseViewLabel } from '../src/view-counts.js';

test('parseCount reads plain, grouped and abbreviated counts', () => {
  const cases = [
    ['1000', 1000],
    ['1,000', 1000],
    ['1 234 567', 1234567],
    ['1.5K', 1500],
    ['2m', 2_000_000],
    ['3 billion', 3_000_000_000],
    [' 42 ', 42],
    ['1,00', null],
    ['-5', null],
    ['1.5.0', null],
    ['ten', null],
    ['', null],
    ['9'.repeat(400), null],
  ];
  for (const [text, expected] of cases) assert.equal(parseCount(text), expected, text);
});

test('parseViewLabel reads view labels and refuses other metadata', () => {
  const cases = [
    ['1.2M views', {}, 1_200_000],
    ['1 view', {}, 1],
    ['No views', {}, 0],
    ['1,234,567  views', {}, 1234567],
    ['42K', {}, null],
    ['42K', { bare: true }, 42_000],
    ['3 years ago', { bare: true }, null],
    ['1.2K watching', {}, null],
    ['Interviews', {}, null],
  ];
  for (const [text, options, expected] of cases) {
    assert.equal(parseViewLabel(text, options), expected, text);
  }
});
