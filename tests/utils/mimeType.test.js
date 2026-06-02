import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { detectImageType, createImageTypeValidator } from "../../src/utils/mimeType.js";

// Each fixture is >= 12 bytes so the validator can decide on the first chunk.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP"), Buffer.from("VP8 ")]);
const WEBP_NO_CHUNK = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP")]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const GIF = Buffer.from("GIF89a-and-more-bytes");

const runValidator = async (buf) => {
	const { stream, state } = createImageTypeValidator();
	const chunks = [];
	try {
		await pipeline(Readable.from(buf), stream, async (source) => {
			for await (const c of source) chunks.push(c);
		});
		return { ok: true, out: Buffer.concat(chunks), state };
	} catch (err) {
		return { ok: false, err, state };
	}
};

describe("detectImageType", () => {
	it("recognises PNG, JPEG, and WEBP", () => {
		expect(detectImageType(PNG)).toEqual({ mime: "image/png", ext: "png" });
		expect(detectImageType(JPEG)).toEqual({ mime: "image/jpeg", ext: "jpg" });
		expect(detectImageType(WEBP)).toEqual({ mime: "image/webp", ext: "webp" });
	});

	it("rejects SVG, GIF, garbage, and a WEBP prefix with no VP8 chunk as null", () => {
		expect(detectImageType(SVG)).toBeNull();
		expect(detectImageType(GIF)).toBeNull();
		expect(detectImageType(Buffer.from([0x00, 0x01]))).toBeNull();
		expect(detectImageType(WEBP_NO_CHUNK)).toBeNull();
	});
});

describe("createImageTypeValidator", () => {
	it("passes a valid PNG through unchanged and records the type", async () => {
		const { ok, out, state } = await runValidator(PNG);
		expect(ok).toBe(true);
		expect(out.equals(PNG)).toBe(true);
		expect(state.detected).toEqual({ mime: "image/png", ext: "png" });
		expect(state.rejected).toBe(false);
	});

	it("errors the stream and flags rejected for an unsupported type", async () => {
		const { ok, state } = await runValidator(SVG);
		expect(ok).toBe(false);
		expect(state.rejected).toBe(true);
	});
});
