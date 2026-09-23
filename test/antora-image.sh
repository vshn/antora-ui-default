#!/bin/sh
# Builds a small site with build/ui-bundle.zip inside the Antora image the documentation sites use.
# A bundle that image cannot load makes Antora exit 0 without writing anything, so check the output.
set -e
IMAGE=${ANTORA_IMAGE:-ghcr.io/vshn/antora:3.1.14}
cd "$(dirname "$0")/.."
[ -f build/ui-bundle.zip ] || { echo "build/ui-bundle.zip is missing: run gulp bundle first"; exit 1; }
rm -rf build/antora-site
# Antora reads content from a git repository, so commit the fixture into one inside the container
# run as the calling user, so the generated files do not end up owned by root in the workspace
docker run --rm -v "$PWD":/antora -w /antora -u "$(id -u):$(id -g)" -e HOME=/tmp \
  --entrypoint /bin/sh "$IMAGE" -c '
  set -e
  cp -r test/fixtures/antora-site /tmp/fixture-content
  cd /tmp/fixture-content
  git init -q && git add . && git -c user.name=ci -c user.email=ci@example.org commit -q -m fixture
  cd /antora
  antora test/fixtures/antora-playbook.yml'
page=build/antora-site/fixture/index.html
if [ ! -f "$page" ]; then
  echo "FAIL: Antora in $IMAGE generated no page with this UI bundle"
  exit 1
fi
grep -q '_/css/site.css' "$page" || { echo "FAIL: $page does not use the UI bundle"; exit 1; }
grep -q 'admonitionblock note' "$page" || { echo "FAIL: $page is missing the admonition"; exit 1; }
echo "OK: Antora in $IMAGE built $page with this UI bundle"
