import { describe, it, expect } from "vitest";

import {
	detectImageType,
	mimeFromExtension,
	isInlineSafe,
} from "../../src/utils/mimeType.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP"), Buffer.from("VP8 ")]);
const WEBP_NO_CHUNK = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP")]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const GIF = Buffer.from("GIF89a-and-more-bytes");

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

describe("mimeFromExtension", () => {
	it("maps common document and media extensions", () => {
		expect(mimeFromExtension(".pdf")).toBe("application/pdf");
		expect(mimeFromExtension(".txt")).toBe("text/plain; charset=utf-8");
		expect(mimeFromExtension(".png")).toBe("image/png");
		expect(mimeFromExtension(".jpeg")).toBe("image/jpeg");
		expect(mimeFromExtension(".mp4")).toBe("video/mp4");
	});

	it("is case insensitive and tolerates a missing dot", () => {
		expect(mimeFromExtension(".PDF")).toBe("application/pdf");
		expect(mimeFromExtension("pdf")).toBe("application/pdf");
	});

	it("falls back to octet-stream for unknown or absent extensions", () => {
		expect(mimeFromExtension(".unknownext")).toBe("application/octet-stream");
		expect(mimeFromExtension("")).toBe("application/octet-stream");
		expect(mimeFromExtension(".")).toBe("application/octet-stream");
		expect(mimeFromExtension(undefined)).toBe("application/octet-stream");
		expect(mimeFromExtension(null)).toBe("application/octet-stream");
		expect(mimeFromExtension(42)).toBe("application/octet-stream");
	});

	it("does not resolve through Object.prototype", () => {
		// A frozen object literal still resolves `.constructor` through its prototype.
		expect(mimeFromExtension(".constructor")).toBe("application/octet-stream");
		expect(mimeFromExtension(".tostring")).toBe("application/octet-stream");
		expect(mimeFromExtension(".valueof")).toBe("application/octet-stream");
	});

	it("never maps a markup type the browser could render", () => {
		for (const ext of [
			".html", ".htm", ".svg", ".svgz", ".xhtml", ".xht",
			".xml", ".xsl", ".xslt", ".mhtml",
		]) {
			expect(mimeFromExtension(ext)).toBe("application/octet-stream");
		}
	});
});

describe("isInlineSafe", () => {
	it("allows types a browser renders without executing script", () => {
		expect(isInlineSafe("application/pdf")).toBe(true);
		expect(isInlineSafe("image/png")).toBe(true);
		expect(isInlineSafe("video/mp4")).toBe(true);
		expect(isInlineSafe("audio/mpeg")).toBe(true);
		expect(isInlineSafe("text/plain; charset=utf-8")).toBe(true);
	});

	it("refuses anything else, including unknown types", () => {
		expect(isInlineSafe("application/octet-stream")).toBe(false);
		expect(isInlineSafe("text/html")).toBe(false);
		expect(isInlineSafe("image/svg+xml")).toBe(false);
		expect(isInlineSafe("application/xml")).toBe(false);
		expect(isInlineSafe(undefined)).toBe(false);
		expect(isInlineSafe("")).toBe(false);
	});
});
