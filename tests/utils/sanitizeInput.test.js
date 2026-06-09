import { describe, it, expect } from "vitest";

import sanitizeInput from "../../src/utils/sanitizeInput.js";

describe("sanitizeInput", () => {
	it("returns ordinary text unchanged", () => {
		expect(sanitizeInput("Alice Cooper")).toBe("Alice Cooper");
	});

	it("keeps the visible text but drops formatting tags", () => {
		expect(sanitizeInput("Hello <b>World</b>")).toBe("Hello World");
	});

	it("removes a <script> tag and its contents entirely", () => {
		const out = sanitizeInput('<script>alert("xss")</script>');
		expect(out).not.toMatch(/<script/i);
		expect(out).not.toContain("alert");
	});

	it("removes an event-handler / image XSS vector", () => {
		const out = sanitizeInput('<img src=x onerror="alert(1)">');
		expect(out).not.toMatch(/onerror/i);
		expect(out).not.toMatch(/<img/i);
	});

	// Locks the chosen policy (R3.1): a bare "&" round-trips literally, while
	// the structural delimiters "<" and ">" are entity-encoded as a byproduct.
	it("preserves a bare '&' but entity-encodes structural < and >", () => {
		expect(sanitizeInput("Tom & Jerry")).toBe("Tom & Jerry");
		expect(sanitizeInput("a < b > c")).toBe("a &lt; b &gt; c");
	});

	// Non-string input (R3.2 / A4): the OAuth path calls this without a Zod
	// string guard, so the function must be total — no "[object Object]".
	it("returns an empty string for non-string input", () => {
		expect(sanitizeInput({})).toBe("");
		expect(sanitizeInput(null)).toBe("");
		expect(sanitizeInput(undefined)).toBe("");
	});
});
