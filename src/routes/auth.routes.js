//* src/routes/auth.routes.js

/**
 * Authentication Routes
 * @module routes/auth
 */

import { Router } from "express";
import {
	registerHandler,
	verifyOTPHandler,
	resendOTPHandler,
	forgotPasswordHandler,
	resetPasswordHandler,
	loginHandler,
	logoutHandler,
	logoutAllHandler,
	googleOAuthHandler,
	githubOAuthHandler,
	getCurrentUserHandler,
} from "../controllers/auth.controller.js";

import authenticate from "../middlewares/auth.middleware.js";
import validateRequestBody from "../middlewares/validate.middleware.js";

import {
	registerSchema,
	loginSchema,
	verifyOtpSchema,
	resendOtpSchema,
	forgotPasswordSchema,
	resetPasswordSchema,
	googleOAuthSchema,
	githubOAuthSchema,
} from "../validators/auth.validator.js";

const authRouter = Router();

/**
 * Register a new user — sends OTP to email
 * @route POST /api/auth/register
 */
authRouter.post(
	"/register",
	validateRequestBody(registerSchema),
	registerHandler,
);

/**
 * Verify OTP and create user account
 * @route POST /api/auth/register/verify-otp
 */
authRouter.post(
	"/register/verify-otp",
	validateRequestBody(verifyOtpSchema),
	verifyOTPHandler,
);

/**
 * Resend registration OTP
 * @route POST /api/auth/register/resend-otp
 */
authRouter.post(
	"/register/resend-otp",
	validateRequestBody(resendOtpSchema),
	resendOTPHandler,
);

/**
 * Send password reset OTP to user's email
 * @route POST /api/auth/forgot-password
 */
authRouter.post(
	"/forgot-password",
	validateRequestBody(forgotPasswordSchema),
	forgotPasswordHandler,
);

/**
 * Reset password using OTP
 * @route POST /api/auth/reset-password
 */
authRouter.post(
	"/reset-password",
	validateRequestBody(resetPasswordSchema),
	resetPasswordHandler,
);

/**
 * Login a user
 * @route POST /api/auth/login
 */
authRouter.post("/login", validateRequestBody(loginSchema), loginHandler);

/**
 * Logout a user
 * @route POST /api/auth/logout
 */
authRouter.post("/logout", authenticate, logoutHandler);

/**
 * Logout a user from all devices
 * @route POST /api/auth/logout-all
 */
authRouter.post("/logout-all", authenticate, logoutAllHandler);

/**
 * Google OAuth login
 * @route POST /api/auth/google
 */
authRouter.post(
	"/google",
	validateRequestBody(googleOAuthSchema),
	googleOAuthHandler,
);

/**
 * Github OAuth login
 * @route POST /api/auth/github
 */
authRouter.post(
	"/github",
	validateRequestBody(githubOAuthSchema),
	githubOAuthHandler,
);

/**
 * Get current user profile
 * @route GET /api/auth/me
 */
authRouter.get("/me", authenticate, getCurrentUserHandler);

export default authRouter;
