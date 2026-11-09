// Shared image-upload validation (extracted Session 29 from api/uploads, Session 26) so the
// account-gated upload route and the anonymous /fuw one apply exactly the same content checks.
// Two upload routes that validated bytes differently would be two different security policies.
import { error } from '@sveltejs/kit';

/** A recipe photo, not a media library. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif'
} as const;
export type AllowedImageType = keyof typeof ALLOWED_IMAGE_TYPES;

/** Magic-number sniff: a `Content-Type` is the uploader's claim, the bytes are the fact. */
function bytesMatchType(bytes: Uint8Array, type: AllowedImageType): boolean {
	const startsWith = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
	switch (type) {
		case 'image/jpeg':
			return startsWith(0xff, 0xd8, 0xff);
		case 'image/png':
			return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
		case 'image/gif':
			return startsWith(0x47, 0x49, 0x46, 0x38);
		case 'image/webp':
			// RIFF....WEBP — the size field in between is what makes this two checks, not one.
			return startsWith(0x52, 0x49, 0x46, 0x46) && [0x57, 0x45, 0x42, 0x50].every((b, i) => bytes[8 + i] === b);
	}
}

export interface ValidatedImage {
	buffer: ArrayBuffer;
	type: AllowedImageType;
	ext: string;
}

/** Reads the multipart `file` field and throws a SvelteKit HTTP error (400/413/415) for anything
 *  that isn't a genuine, allowlisted image under the size cap. */
export async function readValidatedImage(request: Request): Promise<ValidatedImage> {
	const form = await request.formData().catch(() => null);
	const file = form?.get('file');
	if (!(file instanceof File)) error(400, 'Expected a multipart form with a "file" field');

	const declared = file.type as AllowedImageType;
	if (!(declared in ALLOWED_IMAGE_TYPES)) {
		error(415, `Unsupported image type "${file.type}" (allowed: ${Object.keys(ALLOWED_IMAGE_TYPES).join(', ')})`);
	}
	if (file.size === 0) error(400, 'The file is empty');
	if (file.size > MAX_IMAGE_BYTES) {
		error(413, `File is ${Math.round(file.size / 1024)} KB; the limit is ${MAX_IMAGE_BYTES / 1024 / 1024} MB`);
	}

	const buffer = await file.arrayBuffer();
	// Re-check the real byte length, not just the File's own reported size.
	if (buffer.byteLength > MAX_IMAGE_BYTES) error(413, 'File exceeds the size limit');
	if (!bytesMatchType(new Uint8Array(buffer.slice(0, 16)), declared)) {
		error(415, 'File contents do not match the declared image type');
	}
	return { buffer, type: declared, ext: ALLOWED_IMAGE_TYPES[declared] };
}
