//* src/validators/directory.validator.js

import { z } from "zod";

const MAX_NAME_LENGTH = 255;
const DEFAULT_DIR_NAME = "New Folder";

// Strip control characters and path dividers, then trim and bound length.
const sanitizeDirName = (value) =>
	value
		.replace(/[\r\n\t\\/]/g, "")
		.trim()
		.slice(0, MAX_NAME_LENGTH);

// Create accepts an optional name: missing or non-string falls back to the
// default folder name (matches the historically lenient create behavior).
const createDirectorySchema = z.object({
	name: z
		.string()
		.transform((value) => sanitizeDirName(value) || DEFAULT_DIR_NAME)
		.catch(DEFAULT_DIR_NAME),
});

// Rename requires a real name: missing, non-string, or empty-after-sanitizing
// is rejected (matches the controller's previous INVALID_INPUT throw).
const renameDirectorySchema = z.object({
	newDirName: z
		.string("Valid directory name is required")
		.transform(sanitizeDirName)
		.refine((value) => value.length > 0, "Valid directory name is required"),
});

export { createDirectorySchema, renameDirectorySchema };
