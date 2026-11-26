# Changelog

## [2.0.0] - 2026-11-25

### Added

- Rules: each rule has a name and one or more conditions, and it blurs or hides the videos that match all of them.
- Title and channel conditions each have a "does not contain" form.
- Each rule has its own Export button.
- Import adds rules by name, and it shows a question before it overwrites a rule with the same name.
- The README links two sample rules, Less politics and Less negativity.

### Changed

- **Text without slashes matches as plain text.** To use a regex, put it between slashes, for example `/spoilers?/i`.
- The Blur, Hide and Off buttons of the panel change to On and Off, because each rule sets Blur or Hide.
- A new rule applies to the channels that you subscribe to, unless you give it the "Channel is not subscribed" condition.
- When 1.0.0 filters load from storage or from a file, they change to rules with the same effect.

## [1.0.0] - 2026-10-25

First public release.
