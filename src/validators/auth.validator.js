//* src/validators/auth.validator.js

import { z } from "zod";
import sanitizeInput from "../utils/sanitizeInput.js";

const name = z
	.string()
	.trim()
	.transform(sanitizeInput)
	.refine(
		(value) => value.length >= 3 && value.length <= 50,
		"Name is required and must be between 3 and 50 characters",
	);

const email = z
	.string()
	.trim()
	.toLowerCase()
	.pipe(z.email("Please enter a valid email address"));

const password = z
	.string()
	.trim()
	.min(8, "Password must be at least 8 characters")
	.regex(/[a-z]/, "Password must contain at least one lowercase letter")
	.regex(/[A-Z]/, "Password must contain at least one uppercase letter")
	.regex(/[0-9]/, "Password must contain at least one number")
	.regex(
		/[^A-Za-z0-9]/,
		"Password must contain at least one special character",
	);

const otp = z
	.string()
	.trim()
	.regex(/^\d{6}$/, "OTP must be a 6-digit code");

const registerSchema = z.object({
	name,
	email,
	password,
});

const loginSchema = z.object({
	email,
	password: z.string().trim().nonempty("Password is required"),
});

const verifyOtpSchema = z.object({
	email,
	otp,
});

const resendOtpSchema = z.object({
	email,
});

const forgotPasswordSchema = z.object({
	email,
});

const resetPasswordSchema = z.object({
	email,
	otp,
	newPassword: password,
});

const changePasswordSchema = z.object({
	currentPassword: z.string().trim().nonempty("Current password is required"),
	newPassword: password,
});

const googleOAuthSchema = z.object({
	idToken: z.string().trim().nonempty("ID token is required"),
});

const githubOAuthSchema = z.object({
	code: z.string().trim().nonempty("Authorization code is required"),
});

export {
	registerSchema,
	loginSchema,
	verifyOtpSchema,
	resendOtpSchema,
	forgotPasswordSchema,
	resetPasswordSchema,
	changePasswordSchema,
	googleOAuthSchema,
	githubOAuthSchema,
};
