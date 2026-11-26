import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { actionFor, parseSettings } from '../src/filters.js';

const SAMPLES = new URL('../samples/', import.meta.url);

/** Titles each sample must hide or let through. Every sample file needs an entry. */
const CASES = {
  'less-politics.json': {
    hides: [
      'Putin speech today',
      "Trump's new tariffs",
      'Israeli strikes',
      'Iranian drones',
      'Russia and Ukraine talks',
      'War in Sudan',
    ],
    passes: [
      'Quantum computing explained',
      'Software award winners',
      'Trumpet solo',
      'Star Wars trailer',
      'Miranda live',
    ],
  },
  'less-negativity.json': {
    hides: [
      'The worst phone of 2026',
      'Why this company died',
      'I hate this update',
      'WTF is happening with prices',
      'The fall of an empire',
    ],
    passes: ['Fall Guys funny moments', 'Whatever happened to Vine', 'Fallout 5 trailer'],
  },
};

const video = (title) => ({
  title,
  channels: ['Some Channel'],
  channelKeys: [],
  views: 5000,
  subscribedButton: false,
  fingerprint: '',
});

test('every sample parses and hides only the titles it should', () => {
  assert.deepEqual(readdirSync(SAMPLES).sort(), Object.keys(CASES).sort());
  for (const [file, { hides, passes }] of Object.entries(CASES)) {
    const filters = parseSettings(JSON.parse(readFileSync(new URL(file, SAMPLES), 'utf8')));
    for (const title of hides) {
      assert.equal(actionFor(filters, video(title), false), 'hide', `${file}: ${title}`);
    }
    for (const title of passes) {
      assert.equal(actionFor(filters, video(title), false), null, `${file}: ${title}`);
    }
  }
});
