// How matched cards look: page CSS for blur and hide, Reveal buttons, and counts.
/** @import { Mode } from './typedefs.js' */
import { BLUR_PIXELS, REVEAL_ON_HOVER, UI_ATTRIBUTE } from './constants.js';

const MATCH = 'ytuw-match';
const REVEALED = 'data-ytuw-revealed';
const MODE = 'data-ytuw-mode';
const BLURRED = `html[${MODE}="blur"] .${MATCH}`;
const CONTENT = `:not([${UI_ATTRIBUTE}])`;

// Same specificity as the blur rule, so it must come after it.
const HOVER_CSS = `
  ${BLURRED}:hover > ${CONTENT},
  ${BLURRED}:focus-within > ${CONTENT} {
    filter: none !important;
    opacity: 1 !important;
    pointer-events: auto !important;
    user-select: auto !important;
  }`;

export const PAGE_CSS = `
  .${MATCH} { position: relative !important; }
  html[${MODE}="hide"] .${MATCH} { display: none !important; }
  ${BLURRED}:not([${REVEALED}]) > ${CONTENT} {
    filter: blur(${BLUR_PIXELS}px) !important;
    opacity: 0.18 !important;
    pointer-events: none !important;
    user-select: none !important;
  }${REVEAL_ON_HOVER ? HOVER_CSS : ''}
  .ytuw-reveal { display: none !important; }
  ${BLURRED} > .ytuw-reveal {
    all: initial;
    display: block !important;
    box-sizing: border-box !important;
    position: absolute !important;
    top: 8px !important;
    right: 8px !important;
    z-index: 100 !important;
    padding: 7px 11px !important;
    border: 1px solid #737373 !important;
    border-radius: 20px !important;
    background: #181818 !important;
    color: #fff !important;
    font: 600 12px/1.3 system-ui, sans-serif !important;
    cursor: pointer !important;
    pointer-events: auto !important;
  }
  .ytuw-reveal:focus-visible { outline: 3px solid #80c7ff !important; }
`;

/** Switches the page CSS between blur, hide and off. */
export function showMode(document, mode) {
  document.documentElement.setAttribute(MODE, mode);
}

/**
 * Marks matched cards, each with a Reveal button.
 * A reveal lasts until YouTube reuses the card for another video.
 */
export function createMarks(onToggle) {
  /** @type {Map<Element, { fingerprint: string, button: HTMLButtonElement }>} */
  const marked = new Map();

  function mark(card, fingerprint) {
    let state = marked.get(card);
    if (state?.fingerprint !== fingerprint) {
      unmark(card);
      state = { fingerprint, button: revealButton(card, onToggle) };
      marked.set(card, state);
    }
    // YouTube may replace a card's children during navigation.
    if (state.button.parentElement !== card) card.append(state.button);
    card.classList.add(MATCH);
  }

  function unmark(card) {
    card.classList.remove(MATCH);
    card.removeAttribute(REVEALED);
    marked.get(card)?.button.remove();
    marked.delete(card);
  }

  return {
    mark,
    /** Unmarks every card missing from `cards`. */
    keepOnly(cards) {
      for (const card of marked.keys()) if (!cards.has(card)) unmark(card);
    },
    get size() {
      return marked.size;
    },
    /** Cards blurred or hidden right now. @param {Mode} mode */
    filteredCount(mode) {
      if (mode === 'off') return 0;
      if (mode === 'hide') return marked.size;
      return [...marked.keys()].filter((card) => !card.hasAttribute(REVEALED)).length;
    },
  };
}

function revealButton(card, onToggle) {
  const button = card.ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'ytuw-reveal';
  button.setAttribute(UI_ATTRIBUTE, '');
  setRevealLabel(button, false);
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setRevealLabel(button, card.toggleAttribute(REVEALED));
    button.blur(); // otherwise a focus-within preview stays on
    onToggle();
  });
  return button;
}

function setRevealLabel(button, revealed) {
  button.textContent = revealed ? 'Blur again' : 'Reveal';
  button.setAttribute(
    'aria-label',
    revealed ? 'Blur filtered video again' : 'Reveal filtered video',
  );
}
