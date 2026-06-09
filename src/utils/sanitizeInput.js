//* src/utils/sanitizeInput.js

import { JSDOM } from "jsdom";
import DOMPurify from "dompurify";

const window = new JSDOM("").window;
const purify = DOMPurify(window);

/**
 * Reduces untrusted free text to a safe value before it is persisted or rendered.
 * This is a defense-in-depth measure to prevent XSS attacks.
 *
 * @param {unknown} input - untrusted text to be sanitized
 * @returns {string} the sanitized value
 */
const sanitizeInput = (input) => {
	if (typeof input !== "string") return "";

	// Trim because stripping tags can leave edge whitespace ("<b> Al </b>" -> " Al ").
	return purify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
};

export default sanitizeInput;
