import QRCode from 'qrcode';
import type { QrElement, QrPayload } from '@bps/editor-core';

/** Escape special characters in Wi-Fi QR fields (\ ; , : "). */
const wifiEscape = (value: string): string => value.replace(/([\\;,:"])/g, '\\$1');

/** vCard 3.0 text value escaping. */
const vcardEscape = (value: string): string => value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([;,])/g, '\\$1');

/** The text a QR payload encodes, in the formats phone cameras recognise. */
export function qrText(payload: QrPayload): string {
	switch (payload.kind) {
		case 'url':
			return payload.url;
		case 'text':
			return payload.text;
		case 'email':
			return `mailto:${payload.to}${payload.subject ? `?subject=${encodeURIComponent(payload.subject)}` : ''}`;
		case 'phone':
			return `tel:${payload.number.replace(/[^\d+]/g, '')}`;
		case 'wifi':
			return `WIFI:T:${payload.security};S:${wifiEscape(payload.ssid)};P:${payload.security === 'nopass' ? '' : wifiEscape(payload.password)};;`;
		case 'vcard': {
			const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${vcardEscape(payload.name)}`];
			if (payload.org) lines.push(`ORG:${vcardEscape(payload.org)}`);
			if (payload.phone) lines.push(`TEL:${vcardEscape(payload.phone)}`);
			if (payload.email) lines.push(`EMAIL:${vcardEscape(payload.email)}`);
			if (payload.url) lines.push(`URL:${vcardEscape(payload.url)}`);
			lines.push('END:VCARD');
			return lines.join('\n');
		}
	}
}

export interface QrMatrix {
	/** Modules per side, including the quiet zone. */
	size: number;
	/** Path of the dark modules in module units (one unit = one module). */
	d: string;
}

/**
 * Vector QR code: dark modules merged into horizontal runs, offset by the
 * quiet zone. Scale the result to the element box.
 */
export function qrMatrix(el: Pick<QrElement, 'payload' | 'ecc' | 'quietZone'>): QrMatrix {
	const qr = QRCode.create(qrText(el.payload), { errorCorrectionLevel: el.ecc });
	const { size, data } = qr.modules;
	const q = el.quietZone;
	const parts: string[] = [];
	for (let row = 0; row < size; row++) {
		let col = 0;
		while (col < size) {
			if (!data[row * size + col]) {
				col++;
				continue;
			}
			const start = col;
			while (col < size && data[row * size + col]) {
				col++;
			}
			parts.push(`M${start + q} ${row + q}h${col - start}v1h${start - col}z`);
		}
	}
	return { size: size + 2 * q, d: parts.join('') };
}
