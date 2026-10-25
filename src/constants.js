// Values shared by several modules. Selectors live in cards.js, storage keys in storage.js.

/** @type {import('./typedefs.js').Mode[]} Button order. */
export const MODES = ['blur', 'hide', 'off'];
export const DEFAULT_MODE = 'blur';

/** Preview a blurred card on hover or focus. Click Reveal always works. */
export const REVEAL_ON_HOVER = false;
export const BLUR_PIXELS = 14;

/** Marks everything the script adds, so the observer and key guard skip it. */
export const UI_ATTRIBUTE = 'data-ytuw-ui';

export const LOG_PREFIX = '[YouTube Unwatched]';
