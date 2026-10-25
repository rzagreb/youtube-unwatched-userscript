// Data model shared across modules. JSDoc only, nothing here runs.

/** @typedef {'blur' | 'hide' | 'off'} Mode */

/** @typedef {'titles' | 'channels' | 'minViews' | 'maxViews' | 'missingViews'} FilterName */

/**
 * Saved filters: the storage value and the JSON backup format.
 * @typedef {object} Settings
 * @property {4} schemaVersion
 * @property {string[]} titles
 * @property {string[]} channels
 * @property {number | null} minViews
 * @property {number | null} maxViews
 * @property {boolean} allowUnknownViews
 * @property {Record<FilterName, boolean>} applyToSubscribed
 */

/**
 * Settings with their patterns compiled.
 * @typedef {object} Filters
 * @property {Settings} settings
 * @property {RegExp[]} titlePatterns
 * @property {RegExp[]} channelPatterns
 */

/**
 * What one feed card shows.
 * @typedef {object} Video
 * @property {string} title
 * @property {string[]} channels
 * @property {string[]} channelKeys
 * @property {number | null} views
 * @property {boolean} subscribedButton
 * @property {string} fingerprint
 */

/**
 * Result of the last finished subscription check.
 * @typedef {{ signedOut: true } | { signedOut: false, keys: Set<string> }} SubscriptionList
 */

export {};
