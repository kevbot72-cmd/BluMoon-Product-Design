import type { FontFamily } from '@bps/editor-canvas';
import interRegular2 from '@fontsource/inter/files/inter-latin-400-normal.woff2?url';
import interRegular from '@fontsource/inter/files/inter-latin-400-normal.woff?url';
import interBold2 from '@fontsource/inter/files/inter-latin-700-normal.woff2?url';
import interBold from '@fontsource/inter/files/inter-latin-700-normal.woff?url';
import playfair2 from '@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff2?url';
import playfair from '@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff?url';
import playfairBold2 from '@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff2?url';
import playfairBold from '@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff?url';
import bebas2 from '@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2?url';
import bebas from '@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff?url';
import pacifico2 from '@fontsource/pacifico/files/pacifico-latin-400-normal.woff2?url';
import pacifico from '@fontsource/pacifico/files/pacifico-latin-400-normal.woff?url';
import slab2 from '@fontsource/roboto-slab/files/roboto-slab-latin-400-normal.woff2?url';
import slab from '@fontsource/roboto-slab/files/roboto-slab-latin-400-normal.woff?url';
import slabBold2 from '@fontsource/roboto-slab/files/roboto-slab-latin-700-normal.woff2?url';
import slabBold from '@fontsource/roboto-slab/files/roboto-slab-latin-700-normal.woff?url';
import caveat2 from '@fontsource/caveat/files/caveat-latin-400-normal.woff2?url';
import caveat from '@fontsource/caveat/files/caveat-latin-400-normal.woff?url';
import caveatBold2 from '@fontsource/caveat/files/caveat-latin-700-normal.woff2?url';
import caveatBold from '@fontsource/caveat/files/caveat-latin-700-normal.woff?url';

/**
 * Fonts bundled with the plugin (SIL OFL 1.1 / Apache-2.0, Latin subset),
 * self-hosted so no shopper request goes to a third party. The admin font
 * manager adds store fonts in Phase 3.
 */
export const BUNDLED_FONTS: FontFamily[] = [
	{
		family: 'Inter',
		category: 'sans',
		variants: [
			{ weight: 400, style: 'normal', woff2: interRegular2, woff: interRegular },
			{ weight: 700, style: 'normal', woff2: interBold2, woff: interBold },
		],
	},
	{
		family: 'Playfair Display',
		category: 'serif',
		variants: [
			{ weight: 400, style: 'normal', woff2: playfair2, woff: playfair },
			{ weight: 700, style: 'normal', woff2: playfairBold2, woff: playfairBold },
		],
	},
	{
		family: 'Roboto Slab',
		category: 'serif',
		variants: [
			{ weight: 400, style: 'normal', woff2: slab2, woff: slab },
			{ weight: 700, style: 'normal', woff2: slabBold2, woff: slabBold },
		],
	},
	{ family: 'Bebas Neue', category: 'display', variants: [{ weight: 400, style: 'normal', woff2: bebas2, woff: bebas }] },
	{ family: 'Pacifico', category: 'script', variants: [{ weight: 400, style: 'normal', woff2: pacifico2, woff: pacifico }] },
	{
		family: 'Caveat',
		category: 'handwriting',
		variants: [
			{ weight: 400, style: 'normal', woff2: caveat2, woff: caveat },
			{ weight: 700, style: 'normal', woff2: caveatBold2, woff: caveatBold },
		],
	},
];
