# YouTube Unwatched

> Your YouTube feed, minus the videos you always regret clicking.

YouTube picks what lands on your Home page and beside every video. YouTube Unwatched lets your own rules push back: matching videos get blurred, with a Reveal button, or hidden. Channels you subscribe to stay visible unless you say otherwise.

## Use cases

| You want to | Set this in Filters |
| --- | --- |
| Catch up on a show before the internet spoils it | Title keywords `/\b(spoilers?\|finale\|ending explained)\b/i`, and keep Blur mode so Reveal is one click away |
| Skip doom and drama from strangers, but not from creators you follow | Title keywords `/\b(collapse\|worst\|drama\|exposed)\b/i`. Subscribed channels are exempt by default. |
| Find smaller creators instead of the same viral hits | Maximum views `250K` |
| Skip near-empty uploads and reupload spam | Minimum views `1K` |
| See suggestions only from channels you subscribe to | Channel keywords `.`, which matches every channel, then switch to Hide mode |

## Install

You need a userscript manager first: [Violentmonkey](https://violentmonkey.github.io/) or [Tampermonkey](https://www.tampermonkey.net/). On Chrome, also turn on the Allow User Scripts toggle in the manager's details on `chrome://extensions`.

Then open this link and confirm the install:

**[Install YouTube Unwatched](https://rzagreb.github.io/youtube-unwatched-userscript/youtube-unwatched.user.js)**

Your manager checks the same link for updates.

## Quick start

1. Open [youtube.com](https://www.youtube.com/). A small counter tab sits on the right edge of the page, near the top.
2. Click it, then click Filters.
3. Type `spoiler` under Title keywords and click Save.

Within a second or two, videos with "spoiler" in the title are blurred, except ones from channels you subscribe to. The counter shows how many, and Reveal on a card shows that one.

## Usage

### Modes

| Mode | What happens to matching cards |
| --- | --- |
| Blur | Blurred. Reveal shows a card until its video changes or the page reloads. |
| Hide | Removed from the page. |
| Off | Shown as usual. Your rules stay saved. |

Click outside the bar or press Escape to collapse it. The controls hide in fullscreen video.

### Rules

| Rule | How to write it |
| --- | --- |
| Title keywords, Channel keywords | One regular expression per line. A bare pattern ignores case, so `crash` matches "Market CRASH". Use `/pattern/flags` to pick flags, like `/^Exact Title$/`. |
| Minimum views, Maximum views | Inclusive limits. Leave blank to turn off. `1000`, `1,000`, `1.5K` and `2M` all work. |
| Missing view counts | Videos without a readable count pass by default. Untick the box to filter them too. |

A video is filtered when any title or channel rule matches, or when it falls outside a view limit. View counts are read from English labels; in other languages they count as missing.

### Subscriptions

Every rule has an Also filter subscribed channels box, off by default. The script reads your subscription list from YouTube with your signed-in session and keeps it in memory for that tab.

Until the first check finishes, rules with the box unticked don't apply yet. After switching accounts or subscribing to someone new, click Refresh subscriptions in Filters.

### Back up or move your settings

Rules live in your userscript manager's storage, so updates keep them. In Filters, Export JSON saves a backup file, and Import JSON loads one into the editor for you to save.

## Privacy

The script doesn't track you or call third-party servers. Its only network requests go to youtube.com to read your subscription list, and only while some rule exempts subscribed channels.

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
| `just test` | Runs the tests. Pass a file to run just that one: `just test test/cards.test.js`. |
| `just check` | Tests, then Biome lint and format checks. CI runs this on every push. |
| `just version-bump minor` | Bumps the version by `major`, `minor` or `patch`, or sets an exact `x.y.z`. Prints the old and new version. |

To try a change in the browser, run `just dev`, open the localhost link and install it over your copy. In Violentmonkey, leave the install tab open and click Track external edits to pick up each rebuild. Installing from the Pages link puts the released version back.

The code lives in `src/`, with `main.js` wiring the pieces together. Every YouTube selector is in `src/cards.js`. When YouTube changes its layout, paste the new card markup into a case in `test/cards.test.js`, then fix the selectors until it passes.

### Release

1. Run `just version-bump patch`, or `minor` for new features and `major` when users must act.
2. In `CHANGELOG.md`, move the `[Unreleased]` notes under a heading for the printed version, like `## [1.0.1] - 2026-10-26`.
3. Commit and push to `main`. CI deploys to GitHub Pages, and installed copies update on their next check.

Before the first deploy, set Settings → Pages → Source to GitHub Actions in the repo.

## Contributing

Issues and pull requests are welcome. Please keep `just check` passing.

## License

[MIT](LICENSE)
