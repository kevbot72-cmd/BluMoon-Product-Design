const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Random element id: a letter prefix plus 10 base-36 characters (~51 bits). */
export function newId(prefix = 'e'): string {
	const bytes = crypto.getRandomValues(new Uint8Array(10));
	let id = prefix;
	for (const byte of bytes) {
		id += ALPHABET.charAt(byte % ALPHABET.length);
	}
	return id;
}
