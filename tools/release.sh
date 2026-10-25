#!/usr/bin/env bash
# Build dist/blumoon-product-studio.zip: built assets, PHP sources, production
# autoloader only. Allow-list, so nothing from tests/, reference/ or tools/ ships.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
stage="$root/dist/blumoon-product-studio"

cd "$root"
npm run build
rm -rf "$root/dist" && mkdir -p "$stage"

cp blumoon-product-studio.php uninstall.php composer.json composer.lock "$stage/"
cp -R src "$stage/src"
mkdir -p "$stage/schema" && cp -R schema/json "$stage/schema/json"
mkdir -p "$stage/assets" && cp -R assets/dist "$stage/assets/dist"
find "$stage/assets/dist" -name '*.map' -delete
[ -d languages ] && cp -R languages "$stage/languages"

composer install --working-dir="$stage" --no-dev --optimize-autoloader --classmap-authoritative --no-interaction --no-progress --quiet
rm "$stage/composer.json" "$stage/composer.lock"

(cd "$root/dist" && zip -qr blumoon-product-studio.zip blumoon-product-studio)
echo "dist/blumoon-product-studio.zip ($(du -h "$root/dist/blumoon-product-studio.zip" | cut -f1))"
