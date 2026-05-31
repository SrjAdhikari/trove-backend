//* src/routes/user.routes.js

/**
 * User routes
 * @module routes/user
 */

import { Router } from "express";
import { updateProfileHandler } from "../controllers/user.controller.js";

import authenticate from "../middlewares/auth.middleware.js";
import { validateBody } from "../middlewares/validate.middleware.js";
import { updateProfileSchema } from "../validators/user.validator.js";

const userRouter = Router();

// All user routes require authentication
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

export default userRouter;
