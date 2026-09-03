//* src/utils/mimeType.js

import { Transform } from "node:stream";

// Minimum bytes needed to decide every supported type.
const MIN_HEADER_BYTES = 16;

/**
 * Detects a supported raster image type from a buffer's leading bytes.
 *
 * @param {Buffer} buf - Bytes from the start of the file/stream.
 * @returns {{ mime: string, ext: string } | null} The type, or null if unsupported.
 */
const detectImageType = (buf) => {
	if (
		buf.length >= 3 &&
		buf[0] === 0xff &&
		buf[1] === 0xd8 &&
		buf[2] === 0xff
	) {
		return { mime: "image/jpeg", ext: "jpg" };
	}

	if (
		buf.length >= 8 &&
		buf[0] === 0x89 &&
		buf[1] === 0x50 &&
		buf[2] === 0x4e &&
		buf[3] === 0x47 &&
		buf[4] === 0x0d &&
		buf[5] === 0x0a &&
		buf[6] === 0x1a &&
		buf[7] === 0x0a
	) {
		return { mime: "image/png", ext: "png" };
	}

	if (
		buf.length >= 16 &&
		buf.toString("ascii", 0, 4) === "RIFF" &&
		buf.toString("ascii", 8, 12) === "WEBP" &&
		["VP8 ", "VP8L", "VP8X"].includes(buf.toString("ascii", 12, 16))
	) {
		return { mime: "image/webp", ext: "webp" };
	}

	return null;
};

/**
 * Stream transform that validates the leading bytes are a supported image,
 * then passes data through unchanged. Aborts the pipeline on an unsupported
 * type. Mirrors the { stream, state } shape of `createByteCounter`.
 */
const createImageTypeValidator = () => {
	const state = { detected: null, rejected: false };
	let head = Buffer.alloc(0);

	// Runs once, as soon as we have enough bytes (or the stream ends).
	const validate = (cb) => {
		state.detected = detectImageType(head);
		if (!state.detected) {
			state.rejected = true;
			return cb(new Error("unsupported image type"));
		}

		// release the buffered head; later chunks pass straight through
		cb(null, head);
	};

	const stream = new Transform({
		transform(chunk, _enc, cb) {
			// already validated → pass through
			if (state.detected) return cb(null, chunk);
			head = Buffer.concat([head, chunk]);

			// not enough bytes yet → keep buffering
			if (head.length < MIN_HEADER_BYTES) return cb();
			validate(cb);
		},
		flush(cb) {
			// stream ended before we got enough bytes → validate what we have
			if (state.detected) return cb();
			validate(cb);
		},
	});

	return { stream, state };
};

const DEFAULT_MIME = "application/octet-stream";

// Null-prototype so `.constructor` cannot resolve to the Object function.
// No markup types: objects are served from an R2 origin, `.xml` included.
const EXTENSION_MIME_MAP = Object.freeze(
	Object.assign(Object.create(null), {
		pdf: "application/pdf",
		txt: "text/plain; charset=utf-8",
		md: "text/plain; charset=utf-8",
		csv: "text/csv; charset=utf-8",
		json: "application/json",
		zip: "application/zip",
		doc: "application/msword",
		docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		xls: "application/vnd.ms-excel",
		xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		ppt: "application/vnd.ms-powerpoint",
		pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		gif: "image/gif",
		webp: "image/webp",
		avif: "image/avif",
		mp4: "video/mp4",
		webm: "video/webm",
		mov: "video/quicktime",
		mp3: "audio/mpeg",
		wav: "audio/wav",
		ogg: "audio/ogg",
	}),
);

// Allowlist, not blocklist — a presigned GET cannot set `nosniff`.
const INLINE_SAFE_TYPES = Object.freeze(
	new Set([
		"application/pdf",
		"text/plain; charset=utf-8",
		"text/csv; charset=utf-8",
		"image/png",
		"image/jpeg",
		"image/gif",
		"image/webp",
		"image/avif",
		"video/mp4",
		"video/webm",
		"video/quicktime",
		"audio/mpeg",
		"audio/wav",
		"audio/ogg",
	]),
);

/**
 * Resolves a stored Content-Type from a file extension.
 *
 * @param {string} [extension] - Extension with or without the leading dot.
 * @returns {string} The mapped type, or `application/octet-stream`.
 */
const mimeFromExtension = (extension) => {
	if (typeof extension !== "string") return DEFAULT_MIME;
	const mime = EXTENSION_MIME_MAP[extension.replace(/^\./, "").toLowerCase()];

	return typeof mime === "string" ? mime : DEFAULT_MIME;
};

/** Whether this type may be served with `inline` disposition. */
const isInlineSafe = (contentType) => INLINE_SAFE_TYPES.has(contentType);

export {
	MIN_HEADER_BYTES,
	DEFAULT_MIME,
	detectImageType,
	createImageTypeValidator,
	mimeFromExtension,
	isInlineSafe,
};
