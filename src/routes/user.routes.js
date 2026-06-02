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
import { updateProfileSchema } from "../validators/user.validator.js";

const userRouter = Router();

/**
 * Get a profile picture by ID. PUBLIC — registered BEFORE
 * `authenticate` so an <img> can load it cross-origin without a cookie.
 * @route GET /api/users/profile-picture/:id
 */
userRouter.get("/profile-picture/:id", getProfilePictureHandler);

// All routes below require authentication
userRouter.use(authenticate);

/**
 * Update the authenticated user's profile (name)
 * @route PATCH /api/users/profile
 */
userRouter.patch(
	"/profile",
	validateBody(updateProfileSchema),
	updateProfileHandler,
);

/**
 * Upload / replace the authenticated user's profile picture
 * @route POST /api/users/profile-picture
 */
userRouter.post("/profile-picture", uploadProfilePictureHandler);

export default userRouter;
