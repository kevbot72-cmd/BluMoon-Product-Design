<?php
/**
 * Runtime requirement checks.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio;

/**
 * Checks WordPress and WooCommerce versions. PHP is checked in the main file.
 */
final class Requirements {

	public const MIN_WP = '6.6';
	public const MIN_WC = '9.0';

	/**
	 * Return human-readable problems; empty when everything is fine.
	 *
	 * @param string      $wpVersion WordPress version.
	 * @param string|null $wcVersion WooCommerce version, or null when it isn't active.
	 * @return list<string>
	 */
	public static function check( string $wpVersion, ?string $wcVersion ): array {
		$problems = array();
		if ( version_compare( $wpVersion, self::MIN_WP, '<' ) ) {
			/* translators: 1: required WordPress version, 2: installed version. */
			$problems[] = sprintf( __( 'Blumoon Product Studio needs WordPress %1$s or newer (you have %2$s).', 'blumoon-product-studio' ), self::MIN_WP, $wpVersion );
		}
		if ( null === $wcVersion ) {
			$problems[] = __( 'Blumoon Product Studio needs WooCommerce. Install and activate it.', 'blumoon-product-studio' );
		} elseif ( version_compare( $wcVersion, self::MIN_WC, '<' ) ) {
			/* translators: 1: required WooCommerce version, 2: installed version. */
			$problems[] = sprintf( __( 'Blumoon Product Studio needs WooCommerce %1$s or newer (you have %2$s).', 'blumoon-product-studio' ), self::MIN_WC, $wcVersion );
		}
		return $problems;
	}

	/**
	 * Show problems as admin notices to users who can fix them.
	 *
	 * @param list<string> $problems Messages from check().
	 */
	public static function showNotices( array $problems ): void {
		add_action(
			'admin_notices',
			static function () use ( $problems ): void {
				if ( ! current_user_can( 'activate_plugins' ) ) {
					return;
				}
				foreach ( $problems as $problem ) {
					echo '<div class="notice notice-error"><p>' . esc_html( $problem ) . '</p></div>';
				}
			}
		);
	}
}
