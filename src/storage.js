// Saved mode and filters, via the userscript manager. The only GM_getValue/GM_setValue caller.
/** @import { Filters, Mode } from './typedefs.js' */
import { DEFAULT_MODE, LOG_PREFIX, MODES } from './constants.js';
import { DEFAULT_SETTINGS, parseSettings } from './filters.js';

// Persisted names: renaming them loses every user's saved settings.
const MODE_KEY = 'mode';
const FILTERS_KEY = 'filters';

/** @returns {Mode} */
export function loadMode() {
  const mode = GM_getValue(MODE_KEY, DEFAULT_MODE);
  return MODES.includes(mode) ? mode : DEFAULT_MODE;
}

export function saveMode(mode) {
  GM_setValue(MODE_KEY, mode);
}

/**
 * Saved filters; the defaults are written on first run only.
 * Unreadable saved data stays untouched and comes back as a warning.
 * @returns {{ filters: Filters, warning: string }}
 */
export function loadFilters() {
  const saved = GM_getValue(FILTERS_KEY, null);
  if (saved === null) {
    const filters = parseSettings(DEFAULT_SETTINGS);
    GM_setValue(FILTERS_KEY, filters.settings);
    return { filters, warning: '' };
  }
  try {
    return { filters: parseSettings(saved), warning: '' };
  } catch (error) {
    const warning = `Saved filters could not be loaded. Your existing data has not been replaced. ${error.message}`;
    console.warn(LOG_PREFIX, warning);
    return { filters: parseSettings(DEFAULT_SETTINGS), warning };
  }
}

/** Validates everything before writing anything. Throws on invalid settings. */
export function saveFilters(raw) {
  const filters = parseSettings(raw);
  GM_setValue(FILTERS_KEY, filters.settings);
  return filters;
}
