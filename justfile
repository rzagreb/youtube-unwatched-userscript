# List available recipes
default:
    @just --list

# Bundle src/ into dist/youtube-unwatched.user.js
build: _node
    node scripts/build.js

# Rebuild on save and serve a dev copy on localhost
dev: _node
    node scripts/build.js --watch

# Run hermetic tests
test *args: _node
    node --test {{args}}

# Everything that must pass before pushing
check: test
    npx biome check .

# Bump the version (major, minor, patch or x.y.z), like uv version --bump
version-bump type: _node
    #!/usr/bin/env bash
    set -euo pipefail
    before=$(node -p 'const p = require("./package.json"); `${p.name} ${p.version}`')
    after=$(npm version "{{type}}" --no-git-tag-version)
    echo "$before => ${after#v}"

# Stop with a clear message when the shell's Node is older than .nvmrc
_node:
    @node -e 'const want = Number(require("fs").readFileSync(".nvmrc", "utf8")); if (parseInt(process.versions.node) < want) { console.error(`Node ${want}+ needed (see .nvmrc), found ${process.version}. Run: nvm install`); process.exit(1); }'
