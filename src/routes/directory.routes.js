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
import validateId from "../middlewares/validateId.middleware.js";

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
directoryRouter.get("{/:id}", getDirectoryHandler);

/**
 * Create a new directory
 * @route POST /api/directories/{:parentDirId}
 */
directoryRouter.post("{/:parentDirId}", createDirectoryHandler);

/**
 * Update (Rename) a directory
 * @route PATCH /api/directories/{:id}
 */
directoryRouter.patch("/:id", updateDirectoryHandler);

/**
 * Delete a directory and all its children
 * @route DELETE /api/directories/{:id}
 */
directoryRouter.delete("/:id", deleteDirectoryHandler);

export default directoryRouter;
