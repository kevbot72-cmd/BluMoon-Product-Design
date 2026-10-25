<?php
/**
 * Clipart library: Media Library attachments flagged for Product Studio.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Assets;

use Blumoon\ProductStudio\Infrastructure\Image\SvgSanitizer;
use WP_Post;
use WP_Query;

/**
 * Store managers mark attachments as clipart in the media modal and group
 * them with the bps_asset_cat taxonomy. Store managers may upload SVG;
 * every SVG is sanitised on upload.
 */
final class AssetLibrary {

	public const META_TYPE = '_bps_asset_type';
	public const META_SIZE = '_bps_svg_size';
	public const TAXONOMY  = 'bps_asset_cat';
	public const TYPES     = array( 'clipart' );

	/**
	 * Constructor.
	 *
	 * @param SvgSanitizer $svg SVG sanitiser.
	 */
	public function __construct( private readonly SvgSanitizer $svg ) {}

	/**
	 * Hook into WordPress.
	 */
	public function register(): void {
		add_action( 'init', array( $this, 'registerTaxonomy' ) );
		add_filter( 'attachment_fields_to_edit', array( $this, 'fields' ), 10, 2 );
		add_filter( 'attachment_fields_to_save', array( $this, 'save' ), 10, 2 );
		add_filter( 'upload_mimes', array( $this, 'allowSvg' ) );
		add_filter( 'wp_check_filetype_and_ext', array( $this, 'checkSvg' ), 10, 4 );
		add_filter( 'wp_handle_upload_prefilter', array( $this, 'sanitizeSvgUpload' ) );
		add_action( 'add_attachment', array( $this, 'storeSvgSize' ) );
	}

	/**
	 * Categories for clipart.
	 */
	public function registerTaxonomy(): void {
		register_taxonomy(
			self::TAXONOMY,
			'attachment',
			array(
				'labels'                => array(
					'name'          => __( 'Clipart categories', 'blumoon-product-studio' ),
					'singular_name' => __( 'Clipart category', 'blumoon-product-studio' ),
				),
				'public'                => false,
				'show_ui'               => true,
				'show_admin_column'     => true,
				'hierarchical'          => true,
				'show_in_rest'          => false,
				'capabilities'          => array(
					'manage_terms' => 'manage_woocommerce',
					'edit_terms'   => 'manage_woocommerce',
					'delete_terms' => 'manage_woocommerce',
					'assign_terms' => 'manage_woocommerce',
				),
				'update_count_callback' => '_update_generic_term_count',
			)
		);
	}

	/**
	 * "Product Studio" field in the media modal.
	 *
	 * @param array<string, array<string, mixed>> $fields Fields.
	 * @param WP_Post                             $post   Attachment.
	 * @return array<string, array<string, mixed>>
	 */
	public function fields( array $fields, WP_Post $post ): array {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			return $fields;
		}
		$current = (string) get_post_meta( $post->ID, self::META_TYPE, true );
		$name    = "attachments[{$post->ID}][bps_asset_type]";
		$options = '<option value="">' . esc_html__( 'Not used', 'blumoon-product-studio' ) . '</option>'
			. '<option value="clipart"' . selected( $current, 'clipart', false ) . '>' . esc_html__( 'Clipart', 'blumoon-product-studio' ) . '</option>';

		$fields['bps_asset_type'] = array(
			'label' => __( 'Product Studio', 'blumoon-product-studio' ),
			'input' => 'html',
			'html'  => '<select name="' . esc_attr( $name ) . '">' . $options . '</select>',
			'helps' => __( 'Offer this image to shoppers in the designer.', 'blumoon-product-studio' ),
		);
		return $fields;
	}

	/**
	 * Save the field.
	 *
	 * @param array<string, mixed> $post       Post data.
	 * @param array<string, mixed> $attachment Submitted fields.
	 * @return array<string, mixed>
	 */
	public function save( array $post, array $attachment ): array {
		if ( current_user_can( 'manage_woocommerce' ) && isset( $attachment['bps_asset_type'] ) ) {
			$type = sanitize_key( (string) $attachment['bps_asset_type'] );
			if ( in_array( $type, self::TYPES, true ) ) {
				update_post_meta( (int) $post['ID'], self::META_TYPE, $type );
			} else {
				delete_post_meta( (int) $post['ID'], self::META_TYPE );
			}
		}
		return $post;
	}

	/**
	 * Allow SVG uploads for store managers only.
	 *
	 * @param array<string, string> $mimes Allowed types.
	 * @return array<string, string>
	 */
	public function allowSvg( array $mimes ): array {
		if ( current_user_can( 'manage_woocommerce' ) ) {
			$mimes['svg'] = 'image/svg+xml';
		}
		return $mimes;
	}

	/**
	 * WordPress can't sniff SVG's real type; accept it for store managers.
	 *
	 * @param array<string, mixed>       $data     Detected ext/type.
	 * @param string                     $file     Path.
	 * @param string                     $filename Name.
	 * @param array<string, string>|null $mimes Allowed types.
	 * @return array<string, mixed>
	 */
	public function checkSvg( array $data, string $file, string $filename, ?array $mimes ): array { // phpcs:ignore Generic.CodeAnalysis.UnusedFunctionParameter.FoundAfterLastUsed -- WP filter signature.
		if ( current_user_can( 'manage_woocommerce' ) && str_ends_with( strtolower( $filename ), '.svg' ) ) {
			$data['ext']  = 'svg';
			$data['type'] = 'image/svg+xml';
		}
		return $data;
	}

	/**
	 * Sanitise SVGs before WordPress stores them; refuse unusable ones.
	 *
	 * @param array<string, mixed> $file Upload ($_FILES entry).
	 * @return array<string, mixed>
	 */
	public function sanitizeSvgUpload( array $file ): array {
		if ( ! str_ends_with( strtolower( (string) ( $file['name'] ?? '' ) ), '.svg' ) ) {
			return $file;
		}
		$path  = (string) ( $file['tmp_name'] ?? '' );
		$clean = is_readable( $path ) ? $this->svg->sanitize( (string) file_get_contents( $path ) ) : null; // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- upload in progress.
		if ( null === $clean ) {
			$file['error'] = __( 'This SVG could not be made safe and was not uploaded.', 'blumoon-product-studio' );
			return $file;
		}
		file_put_contents( $path, $clean ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- replacing the temp file with its sanitised version.
		return $file;
	}

	/**
	 * Remember an SVG's drawing size (WordPress records none).
	 *
	 * @param int $attachmentId Attachment id.
	 */
	public function storeSvgSize( int $attachmentId ): void {
		if ( 'image/svg+xml' !== get_post_mime_type( $attachmentId ) ) {
			return;
		}
		$path = get_attached_file( $attachmentId );
		if ( false !== $path && is_readable( $path ) ) {
			update_post_meta( $attachmentId, self::META_SIZE, $this->svg->size( (string) file_get_contents( $path ) ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- local media file.
		}
	}

	/**
	 * Clipart for the editor.
	 *
	 * @param string $search   Search text.
	 * @param int    $category Term id, 0 for all.
	 * @param int    $page     Page number.
	 * @param int    $perPage  Items per page.
	 * @return array{items: list<array<string, mixed>>, total: int, pages: int}
	 */
	public function clipart( string $search, int $category, int $page, int $perPage ): array {
		$args = array(
			'post_type'      => 'attachment',
			'post_status'    => 'inherit',
			'post_mime_type' => array( 'image/svg+xml', 'image/png', 'image/webp' ),
			'posts_per_page' => $perPage,
			'paged'          => $page,
			'orderby'        => 'title',
			'order'          => 'ASC',
			// phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query -- the library is small and filtered by an indexed meta key.
			'meta_query'     => array(
				array(
					'key'   => self::META_TYPE,
					'value' => 'clipart',
				),
			),
		);
		if ( '' !== $search ) {
			$args['s'] = $search;
		}
		if ( $category > 0 ) {
			// phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query
			$args['tax_query'] = array(
				array(
					'taxonomy' => self::TAXONOMY,
					'terms'    => $category,
				),
			);
		}
		$query = new WP_Query( $args );
		$items = array();
		foreach ( $query->posts as $post ) {
			if ( $post instanceof WP_Post ) {
				$items[] = $this->present( $post );
			}
		}
		return array(
			'items' => $items,
			'total' => (int) $query->found_posts,
			'pages' => (int) $query->max_num_pages,
		);
	}

	/**
	 * Clipart categories.
	 *
	 * @return list<array{id: int, name: string, count: int}>
	 */
	public function categories(): array {
		$terms = get_terms(
			array(
				'taxonomy'   => self::TAXONOMY,
				'hide_empty' => true,
			)
		);
		$out   = array();
		foreach ( is_array( $terms ) ? $terms : array() as $term ) {
			if ( $term instanceof \WP_Term ) {
				$out[] = array(
					'id'    => $term->term_id,
					'name'  => $term->name,
					'count' => $term->count,
				);
			}
		}
		return $out;
	}

	/**
	 * Editor-facing shape of a clipart attachment.
	 *
	 * @param WP_Post $post Attachment.
	 * @return array<string, mixed>
	 */
	private function present( WP_Post $post ): array {
		$mime = (string) $post->post_mime_type;
		$url  = (string) wp_get_attachment_url( $post->ID );
		if ( 'image/svg+xml' === $mime ) {
			$size  = get_post_meta( $post->ID, self::META_SIZE, true );
			$size  = is_array( $size ) && 2 === count( $size ) ? array_map( 'intval', $size ) : array( 1000, 1000 );
			$thumb = $url;
		} else {
			$meta  = wp_get_attachment_metadata( $post->ID );
			$size  = array( (int) ( $meta['width'] ?? 1000 ), (int) ( $meta['height'] ?? 1000 ) );
			$src   = wp_get_attachment_image_src( $post->ID, 'medium' );
			$thumb = false === $src ? $url : $src[0];
		}
		return array(
			'id'     => $post->ID,
			'title'  => get_the_title( $post ),
			'mime'   => $mime,
			'url'    => $url,
			'thumb'  => $thumb,
			'width'  => $size[0],
			'height' => $size[1],
		);
	}
}
