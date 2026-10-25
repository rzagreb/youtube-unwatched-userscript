# YouTube Unwatched

Userscript that blurs or hides YouTube feed cards matching the user's keyword and view-count rules. ES modules in `src/` bundle into one `.user.js`, served from GitHub Pages.

## Commands

- `npm ci` once, then `just check` before pushing: tests plus Biome.
- `just build` writes `dist/`. `just dev` serves a dev copy on localhost.
- Releasing: README → Release. Every push to `main` deploys Pages, but installed copies only update when `version` rises.

## Architecture

Each scan in `src/main.js`: `findCards` → `readCard` → `matchesFilters(filters, video, subscribed)` → `marks.mark` and `keepOnly` → `panel.render`. A body MutationObserver and YouTube's navigation events trigger it, debounced.

- `filters.js` holds `RULES`, one row per filter, read by `matchesFilters` and `needsSubscriptions`. Adding a filter means a `RULES` row, a `BLOCKS` row in `editor.js` and its field in `parseSettings`.
- YouTube knowledge lives in two modules: `cards.js` owns every feed selector, `subscriptions.js` owns page-config parsing and the paged crawl.
- `storage.js` is the only GM_getValue/GM_setValue caller. `scripts/build.js` owns the metadata header.
- Imports point down: `main` → `panel`, `editor`, `marks`, `storage` → `cards`, `subscriptions`, `filters` → `view-counts`, `constants`. One sideways edge: `cards` uses `channelKey` from `subscriptions`.
- Below `main`, modules take `document` or elements as arguments and network access as an injected `request`, so tests run on jsdom.
- `test/bundle.test.js` builds with `buildOptions()` and runs the real bundle in jsdom.
- Data model: `src/typedefs.js`. Shared values: `src/constants.js`.

@.claude/MEMORY.md
