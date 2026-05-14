//* src/routes/admin/user.routes.js

/**
 * Admin user routes
 * @module routes/admin/user
 */

import { Router } from "express";

import {
	listUsersHandler,
	getUserByIdHandler,
} from "../../controllers/admin/user.controller.js";
import validateId from "../../middlewares/validateId.middleware.js";

const adminUserRouter = Router();

// Validate ID parameters
adminUserRouter.param("id", validateId);

/**
 * List users (paginated, filterable by q/role/status/includeDeleted)
 * @route GET /api/admin/users
 */
adminUserRouter.get("/", listUsersHandler);

/**
 * Get a single user's detail with storage / session aggregates
 * @route GET /api/admin/users/:id
 */
adminUserRouter.get("/:id", getUserByIdHandler);

export default adminUserRouter;
