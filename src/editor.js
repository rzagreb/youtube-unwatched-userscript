// The Filters dialog: build rules from conditions, save them, import and export them.
/** @import { Rule, Settings } from './typedefs.js' */
import { ACTIONS, mergeRules, parseSettings, ruleName, SCHEMA_VERSION } from './filters.js';
import { migrateSchema4 } from './migrate-schema-4.js';

const EXPORT_FILE = 'youtube-unwatched-filters.json';
const SAMPLES_URL = 'https://github.com/rzagreb/youtube-unwatched-userscript#use-cases';

/** Condition types in menu order. A type without a placeholder takes no value. */
const CONDITION_TYPES = [
  { type: 'titleContains', label: 'Title contains', placeholder: 'spoiler, or /\\bspoilers?\\b/i' },
  { type: 'titleDoesNotContain', label: 'Title does not contain', placeholder: 'trailer' },
  { type: 'channelContains', label: 'Channel contains', placeholder: 'News, or /^Exact name$/' },
  { type: 'channelDoesNotContain', label: 'Channel does not contain', placeholder: 'Official' },
  { type: 'viewsBelow', label: 'Views below', placeholder: '10K' },
  { type: 'viewsAbove', label: 'Views above', placeholder: '1M' },
  { type: 'viewsMissing', label: 'View count is missing' },
  { type: 'subscribed', label: 'Channel is subscribed' },
  { type: 'notSubscribed', label: 'Channel is not subscribed' },
];

const EDITOR_CSS = `
  dialog { --lead: 3em; box-sizing: border-box; width: min(680px, calc(100vw - 32px));
    max-height: calc(100vh - 40px); overflow: auto; padding: 20px 20px 0; border: 1px solid #555;
    border-radius: 18px; background: #181818; color: #fff; color-scheme: dark;
    box-shadow: 0 12px 48px #0008; font: 14px/1.5 system-ui, sans-serif; }
  dialog::backdrop { background: #0009; }
  h2 { margin: 0 0 8px; font-size: 20px; }
  p { margin: 0 0 8px; color: #ccc; }
  a { color: #80c7ff; }
  .hint { font-size: 12px; }
  .hint:empty { display: none; }
  input[type="text"], select { box-sizing: border-box; width: 100%; padding: 8px 10px;
    border: 1px solid #666; border-radius: 8px; background: #2a2a2a; color: #fff; font: inherit; }
  input[aria-invalid="true"] { border-color: #ff8a8a; box-shadow: 0 0 0 1px #ff8a8a; }
  button { padding: 7px 12px; border: 1px solid #5c5c5c; border-radius: 18px; background: #333;
    color: #eee; font: inherit; cursor: pointer; }
  button:disabled { opacity: 0.4; cursor: default; }
  :focus-visible { outline: 2px solid #80c7ff; outline-offset: 2px; }
  .danger { border-color: #b85c5c; background: transparent; color: #ffb4b4; }
  .add-rule, .add-condition { border-style: dashed; background: transparent; }
  .rules { display: grid; gap: 14px; margin: 16px 0 12px; }
  .rules:empty { display: none; }
  .empty { margin: 16px 0 12px; padding: 14px; border: 1px dashed #555; border-radius: 12px; }
  .rule { box-sizing: border-box; min-width: 0; margin: 0; padding: 14px;
    border: 1px solid #505050; border-radius: 12px; background: #222; }
  .rule-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
  .rule-head label { flex: none; width: var(--lead); color: #aaa; text-align: right; }
  .rule-head input { flex: 1 1 12em; width: auto; font-size: 15px; font-weight: 600; }
  .condition { display: grid; grid-template-columns: var(--lead) minmax(0, 15em) minmax(0, 1fr) 2.25em;
    gap: 8px; align-items: center; margin-bottom: 8px; }
  .joiner { grid-column: 1; color: #aaa; text-align: right; }
  .condition select { grid-column: 2; }
  .condition input { grid-column: 3; font: 13px/1.5 ui-monospace, monospace; }
  .condition .remove { grid-column: 4; width: 2.25em; height: 2.25em; padding: 0; }
  .add-condition { margin-left: calc(var(--lead) + 8px); }
  .then { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
  .then label { flex: none; width: var(--lead); color: #aaa; text-align: right; }
  .then select { width: auto; min-width: 8em; }
  .footer { position: sticky; bottom: 0; margin: 16px -20px 0; padding: 12px 20px 20px;
    border-top: 1px solid #333; background: #181818; }
  .ask { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px;
    padding: 10px 12px; border: 1px solid #b85c5c; border-radius: 10px; }
  .ask[hidden] { display: none; }
  .ask p { flex: 1 1 100%; margin: 0; color: #ffb4b4; }
  .status { margin-bottom: 10px; color: #b8dcff; white-space: pre-wrap; overflow-wrap: anywhere; }
  .status:empty { display: none; }
  .status[data-kind="error"] { color: #ffb4b4; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .save { margin-left: auto; background: #e7f3ff; color: #111; }
  @media (max-width: 520px) {
    .condition { grid-template-columns: var(--lead) minmax(0, 1fr) 2.25em; }
    .condition select { grid-row: 1; }
    .condition .remove { grid-column: 3; grid-row: 1; }
    .condition input { grid-column: 2; grid-row: 2; }
  }
`;

/**
 * Builds the dialog. `load` re-reads storage, `save` validates and persists.
 * Both apply the result, so the page updates right away.
 */
export function createEditor(document, { load, save, refreshSubscriptions }) {
  const make = (tag, properties = {}) => Object.assign(document.createElement(tag), properties);
  const button = (text, onClick, className = '') => {
    const element = make('button', { type: 'button', textContent: text, className });
    element.addEventListener('click', onClick);
    return element;
  };

  const dialog = make('dialog');
  dialog.setAttribute('aria-labelledby', 'ytuw-editor-heading');
  const form = make('form');
  const subscriptionMessage = make('p', { className: 'hint' });
  subscriptionMessage.setAttribute('role', 'status');
  const list = make('div', { className: 'rules' });
  const empty = make('p', { className: 'empty' });
  empty.append(
    'No rules yet. Add a rule, or ',
    make('a', {
      href: SAMPLES_URL,
      target: '_blank',
      rel: 'noopener',
      textContent: 'import a sample',
    }),
    '.',
  );
  const addRule = button('+ Add rule', () => update(addNewRule, focusNewRule), 'add-rule');

  const ask = make('div', { className: 'ask', hidden: true });
  const askText = make('p', { id: 'ytuw-import-question' });
  ask.setAttribute('role', 'group');
  ask.setAttribute('aria-labelledby', askText.id);
  const overwriteButton = button('', () => answer(true), 'danger');
  const keepButton = button('Keep mine', () => answer(false));
  ask.append(askText, overwriteButton, keepButton);

  const status = make('div', { className: 'status' });
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const importInput = make('input', {
    type: 'file',
    accept: '.json,application/json',
    hidden: true,
  });
  const importButton = button('Import', () => importInput.click());
  const refreshButton = button('Refresh subscriptions', () => refreshSubscriptions());
  const actions = make('div', { className: 'actions' });
  actions.append(
    button('Export all', () => exportRules()),
    importButton,
    refreshButton,
    button('Cancel', () => dialog.close()),
    make('button', { type: 'submit', textContent: 'Save', className: 'save' }),
  );
  const footer = make('div', { className: 'footer' });
  footer.append(ask, status, actions);

  form.append(
    make('h2', { id: 'ytuw-editor-heading', textContent: 'Video filters' }),
    make('p', {
      textContent:
        'Each rule blurs or hides the videos that match all of its conditions. Save applies your changes. Cancel drops them.',
    }),
    make('p', {
      className: 'hint',
      textContent:
        'Text matches anywhere, ignoring case. For a regex, wrap it in slashes: /\\bhate\\b/i. Views take 1000, 1.5K or 2M.',
    }),
    subscriptionMessage,
    list,
    empty,
    addRule,
    footer,
    importInput,
  );
  dialog.append(make('style', { textContent: EDITOR_CSS }), form);

  /** Cards from the last fill, in order. */
  let cards = [];
  /** @type {Rule[] | null} Imported rules waiting for an overwrite answer. */
  let pending = null;

  /** @param {Settings} settings saved, or raw from `read` */
  function fill(settings) {
    cards = settings.rules.map(buildCard);
    list.replaceChildren(...cards.map((card) => card.fieldset));
    empty.hidden = cards.length > 0;
  }

  /** The rules on screen, not yet validated. */
  function read() {
    return {
      schemaVersion: SCHEMA_VERSION,
      rules: cards.map((card) => ({
        name: card.name.value,
        conditions: card.rows.map((row) => ({ type: row.type.value, value: row.value.value })),
        action: card.action.value,
      })),
    };
  }

  /** Edits the rules on screen and rebuilds them, so `fill` is the only builder. */
  function update(change, focus) {
    const settings = read();
    change(settings.rules);
    fill(settings);
    focus();
  }

  function addNewRule(rules) {
    const names = rules.map((rule) => rule.name);
    rules.push({
      name: ruleName(rules.length, names),
      conditions: [newCondition()],
      action: 'blur',
    });
  }

  function focusNewRule() {
    const { name } = cards.at(-1);
    name.focus();
    name.select();
  }

  /** One rule's fieldset, titled by its Name box: conditions, then Blur or Hide. */
  function buildCard(rule, index) {
    const name = make('input', {
      type: 'text',
      id: `ytuw-rule-${index + 1}-name`,
      value: rule.name,
      autocomplete: 'off',
      spellcheck: false,
    });
    const remove = () =>
      update(
        (rules) => rules.splice(index, 1),
        () => addRule.focus(),
      );
    const head = make('div', { className: 'rule-head' });
    head.append(
      make('label', { htmlFor: name.id, textContent: 'Name' }),
      name,
      button('Export', () => exportRules(index)),
      button('Delete rule', remove, 'danger'),
    );

    const rows = rule.conditions.map((condition, at) =>
      buildRow(condition, at, rule.conditions.length === 1, () =>
        update(
          (rules) => rules[index].conditions.splice(at, 1),
          () => cards[index].addCondition.focus(),
        ),
      ),
    );
    const conditions = make('div', { className: 'conditions' });
    conditions.append(...rows.map((row) => row.element));
    const addCondition = button(
      '+ Add condition',
      () =>
        update(
          (rules) => rules[index].conditions.push(newCondition()),
          () => cards[index].rows.at(-1).type.focus(),
        ),
      'add-condition',
    );

    const action = make('select', { id: `ytuw-rule-${index + 1}-action` });
    action.append(
      ...ACTIONS.map((value) =>
        make('option', { value, textContent: value[0].toUpperCase() + value.slice(1) }),
      ),
    );
    action.value = rule.action;
    const then = make('div', { className: 'then' });
    then.append(make('label', { htmlFor: action.id, textContent: 'Then' }), action);

    const fieldset = make('fieldset', { className: 'rule' });
    // Named by the Name box, so a screen reader hears the current name.
    fieldset.setAttribute('aria-labelledby', name.id);
    fieldset.append(head, conditions, addCondition, then);
    return { fieldset, name, rows, addCondition, action };
  }

  /** One "If/and [type] [value] [x]" line. */
  function buildRow(condition, at, only, onRemove) {
    const label = `Condition ${at + 1}`;
    const type = make('select');
    type.setAttribute('aria-label', label);
    type.append(
      ...CONDITION_TYPES.map((spec) =>
        make('option', { value: spec.type, textContent: spec.label }),
      ),
    );
    type.value = condition.type;
    const value = make('input', {
      type: 'text',
      value: String(condition.value ?? ''),
      autocomplete: 'off',
      spellcheck: false,
    });
    value.setAttribute('aria-label', `${label} value`);
    const remove = button('×', onRemove, 'remove');
    remove.setAttribute('aria-label', `Remove condition ${at + 1}`);
    remove.disabled = only;
    remove.title = only
      ? 'A rule needs at least one condition. Use Delete rule instead.'
      : 'Remove condition';
    const element = make('div', { className: 'condition' });
    element.append(
      make('span', { className: 'joiner', textContent: at === 0 ? 'If' : 'and' }),
      type,
      value,
      remove,
    );
    const row = { element, type, value };
    showType(row);
    type.addEventListener('change', () => showType(row));
    return row;
  }

  function showStatus(message, isError = false) {
    status.textContent = message;
    status.dataset.kind = isError ? 'error' : 'info';
  }

  /** Points at the field an error names, if any. */
  function markInvalid(field) {
    const card = field && cards[field.rule];
    const input = field?.condition === undefined ? card?.name : card?.rows[field.condition]?.value;
    if (!input) return;
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  }

  /** Validates every rule, then downloads one rule or all of them. */
  function exportRules(index) {
    try {
      const { settings } = parseSettings(read());
      const rules = index === undefined ? settings.rules : [settings.rules[index]];
      const file =
        index === undefined ? EXPORT_FILE : `youtube-unwatched-${slug(rules[0].name)}.json`;
      const json = `${JSON.stringify({ ...settings, rules }, null, 2)}\n`;
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = make('a', { href: url, download: file });
      dialog.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showStatus(`Downloaded ${file}.`);
    } catch (error) {
      showStatus(`Could not export: ${error.message}`, true);
      markInvalid(error.field);
    }
  }

  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;
    try {
      // 1.0.0 backups. Remove with migrate-schema-4.js.
      const raw = migrateSchema4(JSON.parse(await file.text()));
      offer(parseSettings(raw).settings.rules);
    } catch (error) {
      showStatus(`Could not import ${file.name}: ${error.message}`, true);
    } finally {
      importInput.value = '';
    }
  });

  /** Adds imported rules, asking first when a name is already taken. */
  function offer(incoming) {
    const { conflicts } = mergeRules(read().rules, incoming, false);
    if (!conflicts.length) {
      addImported(incoming, false);
      return;
    }
    pending = incoming;
    const [first] = conflicts;
    askText.textContent =
      conflicts.length === 1
        ? `"${first}" is already in your list.`
        : `${conflicts.length} rules are already in your list: ${conflicts.join(', ')}.`;
    overwriteButton.textContent =
      conflicts.length === 1 ? `Overwrite ${first}` : `Overwrite ${conflicts.length} rules`;
    ask.hidden = false;
    showStatus('');
    keepButton.focus();
  }

  function answer(overwrite) {
    const incoming = pending;
    closeAsk();
    addImported(incoming, overwrite);
    importButton.focus();
  }

  function closeAsk() {
    pending = null;
    ask.hidden = true;
  }

  function addImported(incoming, overwrite) {
    const settings = read();
    const { rules, conflicts } = mergeRules(settings.rules, incoming, overwrite);
    fill({ ...settings, rules });
    const count = overwrite ? incoming.length : incoming.length - conflicts.length;
    showStatus(
      count
        ? `Imported ${count} ${count === 1 ? 'rule' : 'rules'}. Click Save to apply.`
        : 'Nothing imported. Your rules are unchanged.',
    );
  }

  form.addEventListener('input', (event) => event.target.removeAttribute('aria-invalid'));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      save(read());
      dialog.close();
    } catch (error) {
      showStatus(`Could not save rules: ${error.message}`, true);
      markInvalid(error.field);
    }
  });

  return {
    element: dialog,
    isOpen: () => dialog.open,
    /** Re-reads storage, so another tab's saved changes show up. */
    open() {
      const { filters, warning } = load();
      closeAsk();
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

function newCondition() {
  return { type: CONDITION_TYPES[0].type, value: '' };
}

/** Hides the value box for types that take none. */
function showType({ type, value }) {
  const placeholder = CONDITION_TYPES.find((spec) => spec.type === type.value)?.placeholder;
  value.hidden = !placeholder;
  value.placeholder = placeholder ?? '';
}

/** File-name form of a rule name: "Less politics" becomes "less-politics". */
function slug(name) {
  return (
    name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-|-$/g, '') || 'rule'
  );
}

/** @param {{ loading: boolean, error: string, signedOut: boolean }} status */
function subscriptionText({ loading, error, signedOut }) {
  if (loading) return 'Checking subscriptions…';
  if (error) {
    return 'Subscription check failed, so rules with a subscription condition are paused. Try Refresh subscriptions.';
  }
  if (signedOut) return 'Not signed in, so no channel counts as subscribed.';
  return '';
}
