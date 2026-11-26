# YouTube Unwatched

> Your YouTube feed, minus the videos you always regret clicking.

YouTube selects the videos on your Home page and the suggestions on each watch page. With YouTube Unwatched, your own rules select which of these videos you see.

A rule is a list of conditions about the title, channel, view count or subscription of a video. If a video matches all conditions of a rule, the rule blurs the video or hides it. A blurred video has a Reveal button.

## Use cases

| You want to | Add this rule in Filters |
| --- | --- |
| Avoid spoilers for a show before you finish it | Title contains `/\b(spoilers?\|finale\|ending explained)\b/i`, then Blur, so that one click on Reveal shows a video |
| Hide doom and drama from channels that you do not subscribe to | Title contains `/\b(collapse\|worst\|drama\|exposed)\b/i` and Channel is not subscribed, then Hide |
| Hide rage bait from small channels | Title contains `/\bhate\b/i` and Views below `10K`, then Hide |
| See fewer popular videos and more small channels | Views above `250K`, then Hide |
| Hide videos with almost no views, and spam copies of other videos | Views below `1K`, then Hide |
| See only videos from the channels that you subscribe to | Channel is not subscribed, then Hide |
| See fewer videos about politics | Import the sample [less-politics.json](samples/less-politics.json) |
| See fewer angry and negative videos | Import the sample [less-negativity.json](samples/less-negativity.json) |

To use a sample:

1. Open its link.
2. Click Download raw file.
3. In Filters, import the file with the Import button.
4. Click Save.

## Install

1. Install a userscript manager: [Violentmonkey](https://violentmonkey.github.io/) or [Tampermonkey](https://www.tampermonkey.net/).
2. If you use Chrome, turn on Allow User Scripts in the details of the manager on `chrome://extensions`.
3. Open [Install YouTube Unwatched](https://rzagreb.github.io/youtube-unwatched-userscript/youtube-unwatched.user.js).
4. In your manager, confirm the install.

Your manager looks for updates at the same link.

## Quick start

1. Open [youtube.com](https://www.youtube.com/). A small tab with a counter is on the right edge of the page, near the top.
2. Click the tab.
3. Click Filters.
4. Click + Add rule.
5. In the box adjacent to Title contains, type `spoiler`.
6. Click Save.

In one or two seconds, the script blurs the videos that have "spoiler" in the title. The counter shows the number of blurred videos. To see one of these videos, click Reveal on its card.

## On and Off

| Button | What happens to the cards that match |
| --- | --- |
| On | Each rule blurs or hides the cards that it matches. Reveal shows a blurred card until its video changes or the page reloads. |
| Off | All cards show as usual. The script keeps your rules. |

To close the bar, click outside it or press Escape. In fullscreen video, the script hides the controls.

## Rules

A rule has a name, one or more conditions and a Then field, which is Blur or Hide. If all conditions of a rule match a video, the rule blurs or hides that video. If one rule blurs a video and a second rule hides it, the script hides the video.

A new rule gets a name such as "Rule 3", and its Then field is Blur. You can change the name and the Then field. Two rules cannot have the same name.

| Condition | Value |
| --- | --- |
| Title contains, Title does not contain | Text anywhere in the title, in upper or lower case. `crash` matches "Market CRASH", and `hate` matches "whatever". For a regular expression (a search pattern), put it between slashes, for example `/\bhate\b/i`. |
| Channel contains, Channel does not contain | The same rules apply to the channel name. |
| Views below, Views above | A count, for example `1000`, `1,000`, `1.5K` or `2M`. An equal count does not match. |
| View count is missing | No value. The condition matches a video if the script cannot read its view count. |
| Channel is subscribed, Channel is not subscribed | No value. See [Subscriptions](#subscriptions). |

The script reads view counts only in English. In other languages, the view count is missing.

## Subscriptions

If a rule has no subscription condition, it applies to all channels. To skip the channels that you subscribe to, add Channel is not subscribed to the rule.

The script reads your subscription list from YouTube with your signed-in session. It keeps the list in memory for that tab. Until the first read finishes, rules with a subscription condition wait.

After you change accounts or subscribe to a new channel, click Refresh subscriptions in Filters.

## Import and export

Your userscript manager keeps your rules, so updates do not remove them. In Filters, Export all saves all rules to one file. The Export button of a rule saves only that rule.

Import adds the rules from a file to the editor, and Save keeps them. If your list has a rule with the same name, Filters shows a question before it overwrites that rule.

Saved filters and exported files from version 1.0.0 change to rules automatically, with the same effect.

## Privacy

The script does not track you, and it does not send requests to servers other than youtube.com. It sends requests to youtube.com only to read your subscription list. It reads the list only while a rule has a subscription condition.

## Development

You need Node 26 (see `.nvmrc`) and [just](https://github.com/casey/just).

```bash
git clone https://github.com/rzagreb/youtube-unwatched-userscript
cd youtube-unwatched-userscript
nvm install
npm ci
just check
```

| Command | What it does |
| --- | --- |
| `just build` | Writes `dist/youtube-unwatched.user.js` and the Pages redirect. |
| `just dev` | Rebuilds on save and serves a dev copy at `http://localhost:8000/youtube-unwatched.user.js`. |
| `just test` | Runs the tests. To run one test file, give its path, for example `just test test/cards.test.js`. |
| `just check` | Runs the tests, then Biome for lint and format errors. CI runs this command on every push. |
| `just version-bump minor` | Increases the `major`, `minor` or `patch` number of the version, or sets an exact `x.y.z`. Prints the old and the new version. |

To try a change in the browser:

1. Run `just dev`.
2. Open the localhost link.
3. Install the dev copy over your copy.

If you use Violentmonkey, click Track external edits in the install tab. Keep that tab open, and Violentmonkey loads each rebuild. To get the released version back, install it from the Pages link.

The code is in `src/`, and `main.js` connects the modules. Every YouTube selector is in `src/cards.js`.

When YouTube changes its layout, paste the new card markup into a case in `test/cards.test.js`. Then change the selectors until the test has no errors.

Sample rules are in `samples/`. `test/samples.test.js` makes sure that each sample hides the correct titles.

### Release

Before the first deploy, set Settings → Pages → Source to GitHub Actions in the repo.

1. Run `just version-bump patch`. For new features, use `minor`. If users must act, use `major`.
2. In `CHANGELOG.md`, move the `[Unreleased]` notes under a heading for the printed version, for example `## [1.0.1] - 2026-10-26`.
3. Commit the changes.
4. Push to `main`. CI deploys the script to GitHub Pages. Installed copies get the new version at their next update.

## Contributing and license

Issues and pull requests are welcome. Before you send a pull request, make sure that `just check` has no errors. The license is [MIT](LICENSE).
