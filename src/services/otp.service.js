//* src/services/otp.service.js

import crypto from "crypto";
import sendEmail from "../utils/sendEmail.js";
import { OTP_EMAIL_TEMPLATE } from "../utils/emailTemplates.js";
import { TEN_MINUTES_MS } from "../utils/date.js";

/**
 * Generates a cryptic 6-digit OTP alongside a SHA-256 hashed version
 * @returns {{ plainOTP: string, hashedOTP: string }}
 */
const generateOTP = () => {
	const plainOTP = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
	const hashedOTP = crypto.createHash("sha256").update(plainOTP).digest("hex");

	return { plainOTP, hashedOTP };
};

/**
 * Prevents timing attacks while securely verifying a user-provided OTP
 * against the database's SHA-256 hashed OTP.
 *
 * @param {string} inputOTP - The raw OTP to verify
 * @param {string} storedHash - The hashed OTP retrieved from MongoDB
 * @returns {boolean} True if the OTP is perfectly valid
 */
const isValidOTP = (inputOTP, storedHash) => {
	const inputHash = crypto
		.createHash("sha256")
		.update(String(inputOTP))
		.digest();
	const stored = Buffer.from(storedHash, "hex");

	if (inputHash.length !== stored.length) return false;
	return crypto.timingSafeEqual(inputHash, stored);
};

// Function to send OTP to user's email
const sendOTP = async (name, email, otp) => {
	await sendEmail(email, "Verify your email", OTP_EMAIL_TEMPLATE(name, otp));
};

// Function to check if OTP has expired
const isOTPExpired = (otpExpiresAt) => {
	if (!otpExpiresAt) return true;
	return otpExpiresAt.getTime() < Date.now();
};

// Function to check if OTP cooldown is active
const isOTPCooldownActive = (otpExpiresAt, cooldownMs) => {
	if (!otpExpiresAt) return false;
	const otpCreatedAt = otpExpiresAt.getTime() - TEN_MINUTES_MS;
	return Date.now() - otpCreatedAt < cooldownMs;
};

export { generateOTP, isValidOTP, sendOTP, isOTPExpired, isOTPCooldownActive };
