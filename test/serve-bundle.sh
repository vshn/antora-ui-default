#!/bin/sh
# Serves the preview pages with the assets from the published bundle, so the tests cover what the
# sites actually get: CSS minified by cssnano with the custom properties resolved, not the preview build.
set -e
cd "$(dirname "$0")/.."
node_modules/.bin/gulp bundle > /dev/null
node_modules/.bin/gulp preview:build > /dev/null
unzip -q -o build/ui-bundle.zip -d public/_
exec node_modules/.bin/gulp preview:serve
