// Data model shared across modules. JSDoc only, nothing here runs.

/** @typedef {'on' | 'off'} Mode */

/** @typedef {'blur' | 'hide'} Action */

/**
 * @typedef {'titleContains' | 'titleDoesNotContain' | 'channelContains' | 'channelDoesNotContain'
 *   | 'viewsBelow' | 'viewsAbove' | 'viewsMissing' | 'subscribed' | 'notSubscribed'} ConditionType
 */

/**
 * Text for title and channel types, a count for view limits, else null.
 * @typedef {object} Condition
 * @property {ConditionType} type
 * @property {string | number | null} value
 */

/**
 * When every condition matches, the action applies.
 * @typedef {object} Rule
 * @property {string} name
 * @property {Condition[]} conditions
 * @property {Action} action
 */

/**
 * Saved rules: the storage value and the export file format.
 * @typedef {object} Settings
 * @property {5} schemaVersion
 * @property {Rule[]} rules
 */

/** @typedef {(video: Video, subscribed: boolean | null) => boolean} ConditionTest */

/**
 * Settings with each rule's conditions built into tests.
 * @typedef {object} Filters
 * @property {Settings} settings
 * @property {{ action: Action, tests: ConditionTest[] }[]} rules
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
