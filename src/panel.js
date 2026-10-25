// Always-visible controls: the side tab with its count, and the mode and Filters bar.
/** @import { Mode } from './typedefs.js' */
import { DEFAULT_MODE, MODES, REVEAL_ON_HOVER, UI_ATTRIBUTE } from './constants.js';

export const HOST_ID = 'ytuw-controls';

const MODE_TITLES = {
  blur: REVEAL_ON_HOVER
    ? 'Blur matches; hover or click Reveal to see one'
    : 'Blur matches; click Reveal to see one',
  hide: 'Remove all matching cards',
  off: 'Show all videos normally',
};

const PANEL_CSS = `
  :host { all: initial; position: fixed; display: block; right: 0;
    top: 72px; z-index: 2147483647; font: 12px/1.4 system-ui, sans-serif; }
  :host([hidden]) { display: none !important; }
  .bar { position: absolute; right: calc(100% + 6px); top: 0;
    display: flex; flex-wrap: wrap; align-items: center; gap: 5px; width: max-content;
    max-width: calc(100vw - 40px); box-sizing: border-box; padding: 8px; border: 1px solid #555;
    border-radius: 24px; background: #181818; color: #fff; box-shadow: 0 3px 16px #0006;
    font: 12px/1.4 system-ui, sans-serif; }
  .bar[hidden] { display: none !important; }
  .count { margin: 0 5px; white-space: nowrap; }
  button { border: 1px solid transparent; border-radius: 18px; padding: 6px 10px;
    background: #333; color: #eee; font: inherit; cursor: pointer; }
  button[aria-pressed="true"] { background: #e7f3ff; color: #111; }
  button:focus-visible { outline: 3px solid #80c7ff; outline-offset: 2px; }
  .side-tab { display: flex; align-items: center; justify-content: center;
    box-sizing: border-box; min-width: 20px; width: max-content; height: 28px; padding: 0 4px;
    border: 1px solid #626262; border-right: 0; border-radius: 7px 0 0 7px;
    background: #181818; color: #eee; opacity: 0.5; font: 600 11px/1 system-ui, sans-serif;
    font-variant-numeric: tabular-nums; }
  .side-tab:hover, .side-tab:focus-visible, .side-tab[aria-expanded="true"] { opacity: 1; }
  .side-tab:focus-visible { outline-offset: -3px; }
`;

/**
 * Stops key events from our UI at window capture, before YouTube's hotkeys see them.
 * Never calls preventDefault, so typing, clipboard, Tab and Escape still work.
 */
export function guardKeyboard(window, onEscape) {
  const guard = (event) => {
    const fromUI = event
      .composedPath()
      .some((node) => node?.nodeType === 1 && node.hasAttribute(UI_ATTRIBUTE));
    if (!fromUI) return;
    if (event.type === 'keydown' && event.key === 'Escape') onEscape();
    event.stopImmediatePropagation();
  };
  for (const type of ['keydown', 'keypress', 'keyup']) {
    window.addEventListener(type, guard, { capture: true });
  }
}

/** Builds the shadow-DOM controls around the editor dialog. */
export function createPanel(document, { editor, onMode }) {
  const make = (tag, properties = {}) => Object.assign(document.createElement(tag), properties);
  const button = (text, onClick) => {
    const element = make('button', { type: 'button', textContent: text });
    element.addEventListener('click', onClick);
    return element;
  };

  const host = make('div', { id: HOST_ID });
  host.setAttribute(UI_ATTRIBUTE, '');
  const shadow = host.attachShadow({ mode: 'open' });

  const bar = make('div', { id: 'ytuw-control-panel', className: 'bar', hidden: true });
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'YouTube Unwatched mode');
  const count = make('span', { className: 'count' });
  const modeButtons = new Map(
    MODES.map((mode) => {
      const element = button(mode[0].toUpperCase() + mode.slice(1), () => onMode(mode));
      element.dataset.mode = mode;
      element.title = MODE_TITLES[mode];
      return [mode, element];
    }),
  );
  const filtersButton = button('Filters', () => editor.open());
  filtersButton.title = 'Edit saved title, channel, and view-count settings or back them up';
  filtersButton.setAttribute('aria-haspopup', 'dialog');
  bar.append(count, ...modeButtons.values(), filtersButton);

  const sideTab = button('0', () => setOpen(bar.hidden));
  sideTab.className = 'side-tab';
  sideTab.setAttribute('aria-controls', bar.id);
  sideTab.setAttribute('aria-expanded', 'false');
  shadow.append(make('style', { textContent: PANEL_CSS }), bar, sideTab, editor.element);

  /** @type {{ mode: Mode, matches: number, filtered: number }} */
  let view = { mode: DEFAULT_MODE, matches: 0, filtered: 0 };

  function render(next = view) {
    view = next;
    const { mode, matches, filtered } = view;
    setText(count, `Filter · ${matches} ${matches === 1 ? 'match' : 'matches'}`);
    setText(sideTab, String(filtered));
    const filteredLabel = `${filtered} filtered ${filtered === 1 ? 'video' : 'videos'}`;
    const action = bar.hidden ? 'Show' : 'Hide';
    sideTab.setAttribute('aria-label', `${action} YouTube Unwatched controls, ${filteredLabel}`);
    sideTab.title = `${action} YouTube Unwatched · ${mode} · ${filteredLabel}`;
    for (const [value, element] of modeButtons) {
      element.setAttribute('aria-pressed', String(value === mode));
    }
  }

  function setOpen(open, restoreFocus = false) {
    bar.hidden = !open;
    sideTab.setAttribute('aria-expanded', String(open));
    render();
    if (!open && restoreFocus) sideTab.focus();
  }

  editor.element.addEventListener('close', () => {
    if (!host.hidden) (bar.hidden ? sideTab : filtersButton).focus();
  });
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!bar.hidden && !editor.isOpen() && !event.composedPath().includes(host)) setOpen(false);
    },
    { capture: true },
  );

  return {
    host,
    render,
    /** Hidden off feed pages and in fullscreen video; closes whatever was open. */
    setVisible(visible) {
      host.hidden = !visible;
      if (visible) return;
      if (!bar.hidden) setOpen(false);
      editor.close();
    },
    /** The dialog keeps its own native Escape. */
    closeOnEscape() {
      if (!editor.isOpen() && !bar.hidden) setOpen(false, true);
    },
  };
}

function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}
