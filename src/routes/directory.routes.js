//* src/routes/directory.routes.js

/**
 * Directory Routes
 * @module routes/directory
 */

import { Router } from "express";
import {
	getDirectoryHandler,
	createDirectoryHandler,
	updateDirectoryHandler,
	deleteDirectoryHandler,
} from "../controllers/directory.controller.js";
import authenticate from "../middlewares/auth.middleware.js";
import { validateBody, validateId } from "../middlewares/validate.middleware.js";
import {
	readLimiter,
	mutationLimiter,
	destructiveLimiter,
} from "../middlewares/rateLimit.middleware.js";
import {
	createDirectorySchema,
	renameDirectorySchema,
} from "../validators/directory.validator.js";

const directoryRouter = Router();

// All directory routes require authentication
directoryRouter.use(authenticate);

// Validate ID parameters
["id", "parentDirId"].forEach((param) => {
	directoryRouter.param(param, validateId);
});

/**
 * Get directory contents by id
 * @route GET /api/directories/{:id}
 */
directoryRouter.get("{/:id}", readLimiter, getDirectoryHandler);

/**
 * Create a new directory
 * @route POST /api/directories/{:parentDirId}
 */
directoryRouter.post(
	"{/:parentDirId}",
	mutationLimiter,
	validateBody(createDirectorySchema),
	createDirectoryHandler,
);

/**
 * Update (Rename) a directory
 * @route PATCH /api/directories/{:id}
 */
directoryRouter.patch(
	"/:id",
	mutationLimiter,
	validateBody(renameDirectorySchema),
	updateDirectoryHandler,
);

/**
 * Delete a directory and all its children
 * @route DELETE /api/directories/{:id}
 */
directoryRouter.delete("/:id", destructiveLimiter, deleteDirectoryHandler);

export default directoryRouter;
