//* src/routes/user.routes.js

/**
 * User routes
 * @module routes/user
 */

import { Router } from "express";
import {
	updateProfileHandler,
	uploadProfilePictureHandler,
	getProfilePictureHandler,
} from "../controllers/user.controller.js";

import authenticate from "../middlewares/auth.middleware.js";
import { validateBody } from "../middlewares/validate.middleware.js";
import {
	uploadLimiter,
	publicReadLimiter,
	mutationLimiter,
} from "../middlewares/rateLimit.middleware.js";
import { updateProfileSchema } from "../validators/user.validator.js";

const userRouter = Router();

/**
 * Get a profile picture by ID. PUBLIC — before `authenticate` so the SPA's
 * <img> loads it without a cookie (cross-origin but same-site).
 * @route GET /api/users/profile-picture/:id
 */
userRouter.get(
	"/profile-picture/:id",
	publicReadLimiter,
	getProfilePictureHandler,
);

// All routes below require authentication
userRouter.use(authenticate);

/**
 * Update the authenticated user's profile (name)
 * @route PATCH /api/users/profile
 */
userRouter.patch(
	"/profile",
	mutationLimiter,
	validateBody(updateProfileSchema),
	updateProfileHandler,
);

/**
 * Upload / replace the authenticated user's profile picture
 * @route POST /api/users/profile-picture
 */
userRouter.post("/profile-picture", uploadLimiter, uploadProfilePictureHandler);

export default userRouter;
