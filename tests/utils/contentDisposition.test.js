import { describe, it, expect } from "vitest";

import buildContentDisposition from "../../src/utils/contentDisposition.js";

describe("buildContentDisposition", () => {
	it("builds attachment and inline headers for an ASCII name", () => {
		expect(buildContentDisposition("attachment", "report.pdf")).toBe(
			`attachment; filename="report.pdf"; filename*=UTF-8''report.pdf`,
		);
		expect(buildContentDisposition("inline", "photo.png")).toBe(
			`inline; filename="photo.png"; filename*=UTF-8''photo.png`,
		);
	});

	it("percent-encodes a non-ASCII name and keeps the fallback printable", () => {
		const header = buildContentDisposition("attachment", "सूचना.pdf");
		expect(header).toContain("filename*=UTF-8''");
		expect(header).toContain("%E0%A4%B8");
		expect(header).toMatch(/filename="[\x20-\x7e]*"/);
	});

	it("percent-encodes characters that are not RFC 5987 attr-char", () => {
		const header = buildContentDisposition("attachment", "it's (a) *test*!.pdf");
		const extended = header.split("filename*=UTF-8''")[1];
		expect(extended).not.toMatch(/['()*!]/);
	});

	it("strips quotes, backslashes, CR and LF from the ASCII fallback", () => {
		expect(buildContentDisposition("attachment", 'evil".pdf')).toContain(
			`filename="evil.pdf"`,
		);
		const injected = buildContentDisposition("attachment", "a\r\nX-Injected: yes.pdf");
		expect(injected).not.toContain("\r");
		expect(injected).not.toContain("\n");
	});

	it("falls back to a generic name when nothing printable survives", () => {
		expect(buildContentDisposition("attachment", "…")).toContain(`filename="download"`);
		expect(buildContentDisposition("attachment", "")).toContain(`filename="download"`);
	});

	it("omits the filename parameters for a bare disposition", () => {
		expect(buildContentDisposition("inline")).toBe("inline");
	});
});
