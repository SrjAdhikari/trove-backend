//* src/routes/directory.routes.js

/**
 * Directory Routes
 * @module routes/directory
 */

import { Router } from "express";
import {
	createDirectory,
	deleteDirectory,
	getDirectoryById,
	updateDirectory,
} from "../controllers/directory.controller.js";

const directoryRouter = Router();

/**
 * Get directory contents by id
 * @route GET /api/directories/{:id}
 */
directoryRouter.get("{/:id}", getDirectoryById);

/**
 * Create a new directory
 * @route POST /api/directories/{:parentDirId}
 */
directoryRouter.post("{/:parentDirId}", createDirectory);

/**
 * Update (Rename) a directory
 * @route PATCH /api/directories/{:id}
 */
directoryRouter.patch("/:id", updateDirectory);

/**
 * Delete a directory and all its children
 * @route DELETE /api/directories/{:id}
 */
directoryRouter.delete("/:id", deleteDirectory);

export default directoryRouter;
