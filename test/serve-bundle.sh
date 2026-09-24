#!/bin/sh
# Serves the preview pages with the assets from the published bundle, so the tests cover what the
# sites actually get: CSS minified by cssnano with the custom properties resolved, not the preview build.
set -e
cd "$(dirname "$0")/.."
node_modules/.bin/gulp bundle:preview > /dev/null
exec node_modules/.bin/gulp preview:serve
