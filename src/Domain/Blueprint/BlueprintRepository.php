<?php
/**
 * Blueprints: Template-mode product definitions.
 *
 * @package Blumoon\ProductStudio
 */

declare(strict_types=1);

namespace Blumoon\ProductStudio\Domain\Blueprint;

use Blumoon\ProductStudio\Domain\InvalidData;
use Blumoon\ProductStudio\Domain\Schema\SchemaValidator;

/**
 * Stores blueprints as the bps_blueprint post type, with the definition as
 * validated JSON in post meta.
 */
final class BlueprintRepository {

	public const POST_TYPE = 'bps_blueprint';
	public const META      = '_bps_blueprint';

	/**
	 * Constructor.
	 *
	 * @param SchemaValidator $validator Schema validator.
	 */
	public function __construct( private readonly SchemaValidator $validator ) {}

	/**
	 * Register the post type. Hooked to init.
	 */
	public static function registerPostType(): void {
		register_post_type(
			self::POST_TYPE,
			array(
				'labels'          => array(
					'name'          => __( 'Blueprints', 'blumoon-product-studio' ),
					'singular_name' => __( 'Blueprint', 'blumoon-product-studio' ),
				),
				'public'          => false,
				'show_ui'         => false,
				'show_in_rest'    => false,
				'supports'        => array( 'title' ),
				'capability_type' => 'product',
				'map_meta_cap'    => true,
			)
		);
	}

	/**
	 * A blueprint's definition as an array, or null when missing or invalid.
	 *
	 * @param int $id Post id.
	 * @return array<string, mixed>|null
	 */
	public function get( int $id ): ?array {
		$post = get_post( $id );
		if ( ! $post || self::POST_TYPE !== $post->post_type || 'publish' !== $post->post_status ) {
			return null;
		}
		$json = (string) get_post_meta( $id, self::META, true );
		if ( '' === $json || array() !== $this->validator->validateJson( SchemaValidator::BLUEPRINT, $json ) ) {
			return null;
		}
		$data = json_decode( $json, true );
		return is_array( $data ) ? $data : null;
	}

	/**
	 * Create or update a blueprint.
	 *
	 * @param string   $title Title shown in admin.
	 * @param string   $json  Blueprint JSON (schema blueprint.v1).
	 * @param int|null $id    Existing post id to update.
	 * @return int Post id.
	 * @throws InvalidData When the JSON doesn't match the schema.
	 * @throws \RuntimeException When the post can't be saved.
	 */
	public function save( string $title, string $json, ?int $id = null ): int {
		$problems = $this->validator->validateJson( SchemaValidator::BLUEPRINT, $json );
		if ( array() !== $problems ) {
			throw new InvalidData( 'Blueprint', $problems );
		}
		$postId = wp_insert_post(
			array(
				'ID'          => $id ?? 0,
				'post_type'   => self::POST_TYPE,
				'post_status' => 'publish',
				'post_title'  => $title,
			),
			true
		);
		if ( is_wp_error( $postId ) ) {
			throw new \RuntimeException( $postId->get_error_message() );
		}
		update_post_meta( $postId, self::META, wp_slash( $json ) );
		return $postId;
	}

	/**
	 * All published blueprints as id => title.
	 *
	 * @return array<int, string>
	 */
	public function titles(): array {
		$out = array();
		foreach ( get_posts(
			array(
				'post_type'      => self::POST_TYPE,
				'post_status'    => 'publish',
				'posts_per_page' => 100, // phpcs:ignore WordPress.WP.PostsPerPage.posts_per_page_posts_per_page -- a store has a handful of blueprints.
				'orderby'        => 'title',
				'order'          => 'ASC',
			)
		) as $post ) {
			$out[ $post->ID ] = $post->post_title;
		}
		return $out;
	}
}
