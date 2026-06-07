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
import { validateBody } from "../middlewares/validate.middleware.js";
import {
	authLimiter,
	oauthLimiter,
} from "../middlewares/rateLimit.middleware.js";

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
	authLimiter,
	validateBody(registerSchema),
	registerHandler,
);

/**
 * Verify OTP and create user account
 * @route POST /api/auth/register/verify-otp
 */
authRouter.post(
	"/register/verify-otp",
	authLimiter,
	validateBody(verifyOtpSchema),
	verifyOTPHandler,
);

/**
 * Resend registration OTP
 * @route POST /api/auth/register/resend-otp
 */
authRouter.post(
	"/register/resend-otp",
	authLimiter,
	validateBody(resendOtpSchema),
	resendOTPHandler,
);

/**
 * Send password reset OTP to user's email
 * @route POST /api/auth/forgot-password
 */
authRouter.post(
	"/forgot-password",
	authLimiter,
	validateBody(forgotPasswordSchema),
	forgotPasswordHandler,
);

/**
 * Reset password using OTP
 * @route POST /api/auth/reset-password
 */
authRouter.post(
	"/reset-password",
	authLimiter,
	validateBody(resetPasswordSchema),
	resetPasswordHandler,
);

/**
 * Login a user
 * @route POST /api/auth/login
 */
authRouter.post("/login", authLimiter, validateBody(loginSchema), loginHandler);

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
	oauthLimiter,
	validateBody(googleOAuthSchema),
	googleOAuthHandler,
);

/**
 * Github OAuth login
 * @route POST /api/auth/github
 */
authRouter.post(
	"/github",
	oauthLimiter,
	validateBody(githubOAuthSchema),
	githubOAuthHandler,
);

/**
 * Get current user profile
 * @route GET /api/auth/me
 */
authRouter.get("/me", authenticate, getCurrentUserHandler);

export default authRouter;
