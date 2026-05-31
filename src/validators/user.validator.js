//* src/validators/user.validator.js

import { z } from "zod";

const name = z
	.string()
	.trim()
	.nonempty("Name is required")
	.min(3, "Name must be between 3 and 50 characters")
	.max(50, "Name must be between 3 and 50 characters");

const updateProfileSchema = z.object({ name });

export { updateProfileSchema };
