//* src/routes/admin/user.routes.js

/**
 * Admin user routes
 * @module routes/admin/user
 */

import { Router } from "express";
import {
	listUsersHandler,
	getUserByIdHandler,
	changeUserRoleHandler,
	suspendUserHandler,
	unsuspendUserHandler,
	forceLogoutUserHandler,
	softDeleteUserHandler,
	hardDeleteUserHandler,
	restoreUserHandler,
} from "../../controllers/admin/user.controller.js";
import { validateId } from "../../middlewares/validate.middleware.js";
import { requireSuperadmin } from "../../middlewares/authorize.middleware.js";

const adminUserRouter = Router();

// Validate ID parameters
adminUserRouter.param("id", validateId);

/**
 * List all users
 * @route GET /api/admin/users
 */
adminUserRouter.get("/", listUsersHandler);

/**
 * Get a single user's details
 * @route GET /api/admin/users/:id
 */
adminUserRouter.get("/:id", getUserByIdHandler);

/**
 * Change a user's role, only superadmins can do this
 * @route PATCH /api/admin/users/:id/role
 */
adminUserRouter.patch("/:id/role", requireSuperadmin(), changeUserRoleHandler);

/**
 * Suspend a user (revokes all active sessions)
 * @route PATCH /api/admin/users/:id/suspend
 */
adminUserRouter.patch("/:id/suspend", requireSuperadmin(), suspendUserHandler);

/**
 * Lift a user's suspension
 * @route PATCH /api/admin/users/:id/unsuspend
 */
adminUserRouter.patch(
	"/:id/unsuspend",
	requireSuperadmin(),
	unsuspendUserHandler,
);

/**
 * Force logout a user (revokes all active sessions)
 * @route POST /api/admin/users/:id/logout
 */
adminUserRouter.post("/:id/logout", forceLogoutUserHandler);

/**
 * Soft-delete a user
 * @route DELETE /api/admin/users/:id/soft-delete
 */
adminUserRouter.delete(
	"/:id/soft-delete",
	requireSuperadmin(),
	softDeleteUserHandler,
);

/**
 * Hard-delete a user and all their data
 * @route DELETE /api/admin/users/:id/hard-delete
 */
adminUserRouter.delete(
	"/:id/hard-delete",
	requireSuperadmin(),
	hardDeleteUserHandler,
);

/**
 * Restore a soft-deleted user
 * @route POST /api/admin/users/:id/restore
 */
adminUserRouter.post("/:id/restore", requireSuperadmin(), restoreUserHandler);

export default adminUserRouter;
