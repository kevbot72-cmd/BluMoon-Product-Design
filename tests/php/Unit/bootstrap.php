<?php
/**
 * Unit test bootstrap: no WordPress, WordPress functions are stubbed with Brain Monkey.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

require dirname( __DIR__, 3 ) . '/vendor/autoload.php';

define( 'ABSPATH', sys_get_temp_dir() . '/bps-unit/' );
define( 'BPS_VERSION', '0.0.0-test' );
define( 'BPS_FILE', dirname( __DIR__, 3 ) . '/blumoon-product-studio.php' );
define( 'DAY_IN_SECONDS', 86400 );
define( 'MB_IN_BYTES', 1048576 );
