#!/usr/bin/env bash
# Download WordPress core and WooCommerce for the PHP integration suite, and
# create the test database. Used by CI; works locally too (see tests/php/README.md).
#
#   tests/php/bin/install-wp.sh <dir> [wp-version] [wc-version]
#
# Database settings come from WP_DB_HOST, WP_DB_USER, WP_DB_PASSWORD, WP_DB_NAME.
set -euo pipefail

dir=${1:?usage: install-wp.sh <dir> [wp-version] [wc-version]}
wp_version=${2:-latest}
wc_version=${3:-latest-stable}

mkdir -p "$dir"
cd "$dir"

if [ "$wp_version" = latest ]; then
	wp_url=https://wordpress.org/latest.zip
else
	wp_url="https://wordpress.org/wordpress-${wp_version}.zip"
fi
curl -sSfL -o wordpress.zip "$wp_url"
rm -rf wordpress && unzip -q wordpress.zip && rm wordpress.zip

curl -sSfL -o woocommerce.zip "https://downloads.wordpress.org/plugin/woocommerce.${wc_version}.zip"
unzip -q woocommerce.zip -d wordpress/wp-content/plugins && rm woocommerce.zip

# The plugin under test is loaded from the plugins directory, as WordPress does.
ln -sfn "$OLDPWD" wordpress/wp-content/plugins/blumoon-product-studio

# Create the test database with PHP's mysqli, which the tests need anyway.
php -r '
	[$host, $port] = array_pad(explode(":", getenv("WP_DB_HOST") ?: "127.0.0.1:3306"), 2, "3306");
	$db = new mysqli($host, getenv("WP_DB_USER") ?: "root", getenv("WP_DB_PASSWORD") ?: "root", "", (int) $port);
	$name = getenv("WP_DB_NAME") ?: "wp_tests";
	$db->query("CREATE DATABASE IF NOT EXISTS `" . $db->real_escape_string($name) . "`") or exit(1);
'

echo "WordPress $(grep -o "wp_version = '[^']*'" wordpress/wp-includes/version.php) and WooCommerce ready in $dir/wordpress"
echo "Run: WP_CORE_DIR=$dir/wordpress composer test:integration"
