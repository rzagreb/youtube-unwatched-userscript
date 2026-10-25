// The Filters dialog: edit, save, import and export the saved settings.
/** @import { Settings } from './typedefs.js' */
import { parseSettings, SCHEMA_VERSION } from './filters.js';

const EXPORT_FILE = 'youtube-unwatched-filters.json';
const PATTERN_HELP = 'One regex per line; bare patterns ignore case, or use /pattern/flags.';
const LIMIT_HELP = 'Leave blank to disable. Equal counts pass; rounded counts are approximate.';

/** One block per filter, in display order. `setting` defaults to `name`. */
const BLOCKS = [
  {
    name: 'titles',
    widget: 'lines',
    title: 'Title keywords',
    help: `Match video titles. ${PATTERN_HELP}`,
    label: 'Title blacklist',
    placeholder: '/\\bspoilers?\\b/i',
  },
  {
    name: 'channels',
    widget: 'lines',
    title: 'Channel keywords',
    help: `Match channel names. ${PATTERN_HELP}`,
    label: 'Channel blacklist',
    placeholder: '/^Channel name$/i',
  },
  {
    name: 'minViews',
    widget: 'count',
    title: 'Minimum views',
    help: LIMIT_HELP,
    label: 'At least (optional)',
    placeholder: 'e.g. 1000',
  },
  {
    name: 'maxViews',
    widget: 'count',
    title: 'Maximum views',
    help: LIMIT_HELP,
    label: 'At most (optional)',
    placeholder: 'e.g. 1M',
  },
  {
    name: 'missingViews',
    setting: 'allowUnknownViews',
    widget: 'check',
    title: 'Missing view counts',
    help: 'Choose whether videos without a readable count can pass. A count of zero is readable.',
    label: 'Allow videos with no readable view count',
  },
];

/** How each widget is built, filled from settings and read back. */
const WIDGETS = {
  lines: {
    build: (make) => make('textarea', { rows: 4 }),
    fill: (input, value) => {
      input.value = value.join('\n');
    },
    read: (input) => input.value.split(/\r\n?|\n/),
  },
  count: {
    build: (make) => make('input', { type: 'text' }),
    fill: (input, value) => {
      input.value = value === null ? '' : String(value);
    },
    read: (input) => input.value,
  },
  check: {
    build: (make) => make('input', { type: 'checkbox' }),
    fill: (input, value) => {
      input.checked = value;
    },
    read: (input) => input.checked,
  },
};

const EDITOR_CSS = `
  dialog { box-sizing: border-box; width: min(640px, calc(100vw - 32px));
    max-height: calc(100vh - 40px); overflow: auto; padding: 20px; border: 1px solid #555;
    border-radius: 18px; background: #181818; color: #fff; color-scheme: dark;
    box-shadow: 0 12px 48px #0008; font: 14px/1.5 system-ui, sans-serif; }
  dialog::backdrop { background: #0009; }
  h2 { margin: 0 0 8px; font-size: 20px; }
  p { margin: 0 0 16px; color: #ccc; }
  label { display: block; margin: 16px 0 6px; font-weight: 600; }
  .hint { font-size: 12px; }
  .filter-sections { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .filter-block { grid-column: 1 / -1; box-sizing: border-box; min-width: 0; margin: 0;
    padding: 14px 16px 16px; border: 1px solid #505050; border-radius: 12px; background: #222; }
  .filter-block.count { grid-column: auto; }
  @media (max-width: 520px) { .filter-block.count { grid-column: 1 / -1; } }
  .filter-block legend { padding: 0 7px; color: #fff; font-size: 14px; font-weight: 650; }
  .field-label { margin: 0 0 7px; font-size: 12px; color: #ddd; }
  .block-help { margin: 0 0 10px; color: #bbb; font-size: 12px; }
  textarea { display: block; box-sizing: border-box; width: 100%; min-height: 100px;
    padding: 10px; border: 1px solid #666; border-radius: 8px; background: #242424;
    color: #fff; resize: vertical; font: 13px/1.5 ui-monospace, monospace; }
  input[type="text"] { box-sizing: border-box; width: 100%; padding: 10px;
    border: 1px solid #666; border-radius: 8px; background: #242424; color: #fff; font: inherit; }
  textarea:focus-visible, input[type="text"]:focus-visible { outline: 2px solid #80c7ff; outline-offset: 2px; }
  .check { display: flex; align-items: flex-start; gap: 9px; font-weight: 400; }
  .check input { flex: none; width: 16px; height: 16px; margin: 3px 0 0; accent-color: #80c7ff; }
  .filter-block > .check { margin: 0; }
  .filter-block > .subscribed-check { margin: 14px 0 0; padding-top: 12px;
    border-top: 1px solid #444; font-size: 12px; color: #ccc; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
  .save { margin-left: auto; background: #e7f3ff; color: #111; }
  .status { margin-top: 12px; color: #b8dcff; white-space: pre-wrap; overflow-wrap: anywhere; }
  .status:empty { display: none; }
  .status[data-kind="error"] { color: #ffb4b4; }
`;

/**
 * Builds the dialog. `load` re-reads storage, `save` validates and persists.
 * Both apply the result, so the page updates right away.
 */
export function createEditor(document, { load, save, refreshSubscriptions }) {
  const make = (tag, properties = {}) => Object.assign(document.createElement(tag), properties);

  const dialog = make('dialog');
  dialog.setAttribute('aria-labelledby', 'ytuw-editor-heading');
  const form = make('form');
  const subscriptionMessage = make('p', { id: 'ytuw-subscription-status', className: 'hint' });
  subscriptionMessage.setAttribute('role', 'status');
  const sections = make('div', { className: 'filter-sections' });
  const fields = BLOCKS.map((block) => createBlock(make, block, subscriptionMessage.id));
  sections.append(...fields.map((field) => field.fieldset));

  const status = make('div', { className: 'status' });
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const importInput = make('input', {
    type: 'file',
    accept: '.json,application/json',
    hidden: true,
  });
  const actions = make('div', { className: 'actions' });
  const action = (text, onClick, type = 'button') => {
    const button = make('button', { type, textContent: text });
    if (onClick) button.addEventListener('click', onClick);
    actions.append(button);
    return button;
  };
  action('Export JSON', exportBackup);
  action('Import JSON', () => importInput.click());
  const refreshButton = action('Refresh subscriptions', () => refreshSubscriptions());
  action('Cancel', () => dialog.close());
  action('Save', null, 'submit').className = 'save';

  form.append(
    make('h2', { id: 'ytuw-editor-heading', textContent: 'Video filters' }),
    make('p', {
      textContent: 'These lists are saved separately from the script and kept when you update it.',
    }),
    make('p', {
      className: 'hint',
      textContent:
        'Each block works independently. Any matching keyword or failed view rule filters a video.',
    }),
    subscriptionMessage,
    sections,
    status,
    actions,
    importInput,
  );
  dialog.append(make('style', { textContent: EDITOR_CSS }), form);

  /** @param {Settings} settings */
  function fill(settings) {
    for (const { block, input, subscribed } of fields) {
      WIDGETS[block.widget].fill(input, settings[block.setting ?? block.name]);
      subscribed.checked = settings.applyToSubscribed[block.name];
    }
  }

  function read() {
    const raw = { schemaVersion: SCHEMA_VERSION, applyToSubscribed: {} };
    for (const { block, input, subscribed } of fields) {
      raw[block.setting ?? block.name] = WIDGETS[block.widget].read(input);
      raw.applyToSubscribed[block.name] = subscribed.checked;
    }
    return raw;
  }

  function showStatus(message, isError = false) {
    status.textContent = message;
    status.dataset.kind = isError ? 'error' : 'info';
  }

  function exportBackup() {
    try {
      const { settings } = parseSettings(read());
      const json = `${JSON.stringify(settings, null, 2)}\n`;
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = make('a', { href: url, download: EXPORT_FILE });
      dialog.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showStatus('Backup downloaded.');
    } catch (error) {
      showStatus(error.message, true);
    }
  }

  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      fill(parseSettings(JSON.parse(await file.text())).settings);
      showStatus('Backup loaded into the editor. Click Save to apply it.');
    } catch (error) {
      showStatus(`Could not import backup: ${error.message}`, true);
    } finally {
      importInput.value = '';
    }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      save(read());
      dialog.close();
    } catch (error) {
      showStatus(`Could not save filters: ${error.message}`, true);
    }
  });

  return {
    element: dialog,
    isOpen: () => dialog.open,
    /** Re-reads storage, so another tab's saved changes show up. */
    open() {
      const { filters, warning } = load();
      fill(filters.settings);
      showStatus(warning, Boolean(warning));
      if (!dialog.open) dialog.showModal();
    },
    close() {
      if (dialog.open) dialog.close();
    },
    render({ loading, error, signedOut }) {
      const message = subscriptionText({ loading, error, signedOut });
      if (subscriptionMessage.textContent !== message) subscriptionMessage.textContent = message;
      refreshButton.disabled = loading;
      refreshButton.title = error || 'Read your current subscriptions from YouTube';
    },
  };
}

/** One filter's fieldset: help, its widget, and the subscribed-channels switch. */
function createBlock(make, block, subscriptionStatusId) {
  const fieldset = make('fieldset', { className: `filter-block ${block.widget}` });
  const help = make('p', {
    id: `ytuw-help-${block.name}`,
    className: 'block-help',
    textContent: block.help,
  });
  const input = WIDGETS[block.widget].build(make);
  input.id = `ytuw-${block.name}`;
  input.setAttribute('aria-describedby', help.id);
  fieldset.append(make('legend', { textContent: block.title }), help);
  if (block.widget === 'check') {
    const label = make('label', { className: 'check' });
    label.append(input, make('span', { textContent: block.label }));
    fieldset.append(label);
  } else {
    Object.assign(input, {
      spellcheck: false,
      autocomplete: 'off',
      placeholder: block.placeholder,
    });
    fieldset.append(
      make('label', { htmlFor: input.id, className: 'field-label', textContent: block.label }),
      input,
    );
  }
  const subscribed = make('input', { type: 'checkbox', id: `ytuw-subscribed-${block.name}` });
  subscribed.setAttribute(
    'aria-label',
    `Also apply ${block.title.toLowerCase()} to subscribed channels`,
  );
  subscribed.setAttribute('aria-describedby', subscriptionStatusId);
  const subscribedLabel = make('label', { className: 'check subscribed-check' });
  subscribedLabel.append(
    subscribed,
    make('span', { textContent: 'Also filter subscribed channels' }),
  );
  fieldset.append(subscribedLabel);
  return { block, fieldset, input, subscribed };
}

/** @param {{ loading: boolean, error: string, signedOut: boolean }} status */
function subscriptionText({ loading, error, signedOut }) {
  if (loading) return 'Checking subscriptions…';
  if (error) {
    return 'Subscription check failed. Unchecked filters are paused for channels whose status is unknown. Try Refresh subscriptions.';
  }
  if (signedOut) return 'Not signed in: filters apply to all videos.';
  return 'Subscribed channels are exempt unless their filter checkbox is checked. Title/channel checkboxes apply to the whole list.';
}
