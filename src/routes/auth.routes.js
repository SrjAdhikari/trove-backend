//* src/routes/auth.routes.js

/**
 * Authentication Routes
 * @module routes/auth
 */

import { Router } from "express";
import {
	loginUser,
	logoutUser,
	registerUser,
} from "../controllers/auth.controller.js";

const authRouter = Router();

/**
 * Register a new user
 * @route POST /api/auth/register
 */
authRouter.post("/register", registerUser);

/**
 * Login a user
 * @route POST /api/auth/login
 */
authRouter.post("/login", loginUser);

/**
 * Logout a user
 * @route POST /api/auth/logout
 */
authRouter.post("/logout", logoutUser);

export default authRouter;
