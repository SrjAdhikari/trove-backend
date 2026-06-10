import { describe, it, expect } from "vitest";

import { NEW_DEVICE_ALERT_EMAIL_TEMPLATE } from "../../../src/templates/emails/index.js";

const render = (deviceInfo) =>
	NEW_DEVICE_ALERT_EMAIL_TEMPLATE("Bob", {
		deviceInfo,
		signedInAt: new Date("2026-06-10T07:00:00Z"),
	});

// Markers that never appear in the static template — finding any of them in
// the output means an injected payload survived sanitization.
const DANGER = ["<script>", "<svg", "<iframe", "onerror", "onload", "onclick", "alert("];

describe("newDeviceAlert sanitizes device metadata (parsed from the client User-Agent)", () => {
	it("neutralizes active-content payloads injected through every device field", () => {
		const html = render({
			browser: '<img src=x onerror="alert(1)">',
			deviceOS: '<script>alert("xss")</script>',
			deviceType: "<svg/onload=alert(2)>",
			ipAddress: "</td><td onclick=alert(3)>pwn",
		});

		for (const marker of DANGER) {
			expect(html).not.toContain(marker);
		}
	});

	it("strips obfuscated, mixed-case, and protocol-based variants", () => {
		const html = render({
			browser: "<ScRiPt>alert(4)</ScRiPt>",
			deviceOS: '<a href="javascript:alert(5)">x</a>',
			deviceType: "<iframe src=//evil.example></iframe>",
			ipAddress: "<body onload=alert(6)>",
		});

		expect(html.toLowerCase()).not.toContain("<script");
		expect(html).not.toContain("javascript:");
		expect(html).not.toContain("<iframe");
		expect(html).not.toContain("alert(");
	});

	it("does not break the table structure when a field tries to inject markup", () => {
		// A crafted value attempting to close the cell and open a new one must
		// not add real <td> elements — the tags are stripped, text survives.
		const html = render({
			browser: "Chrome",
			deviceOS: "Linux",
			deviceType: "desktop",
			ipAddress: "</td></tr><tr><td>injected",
		});

		expect(html).toContain("injected"); // text preserved
		expect(html).not.toContain("</td></tr><tr><td>injected"); // raw markup gone
	});

	it("renders empty for missing device fields instead of leaking 'undefined' / 'null'", () => {
		const html = render({
			browser: undefined,
			deviceOS: null,
			deviceType: undefined,
			ipAddress: null,
		});

		expect(typeof html).toBe("string");
		expect(html).not.toContain("undefined");
		expect(html).not.toContain("null");
	});

	it("preserves a legitimate ampersand in a device string", () => {
		const html = render({
			browser: "Safari & WebKit",
			deviceOS: "macOS",
			deviceType: "desktop",
			ipAddress: "203.0.113.7",
		});

		expect(html).toContain("Safari & WebKit on macOS");
	});

	it("renders normal device metadata and the recipient name unchanged", () => {
		const html = render({
			browser: "Chrome 120",
			deviceOS: "Windows 10",
			deviceType: "desktop",
			ipAddress: "203.0.113.7",
		});

		expect(html).toContain("Chrome 120 on Windows 10");
		expect(html).toContain("desktop");
		expect(html).toContain("203.0.113.7");
		expect(html).toContain("Hi Bob,");
	});
});
