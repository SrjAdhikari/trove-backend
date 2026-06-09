import { describe, it, expect } from "vitest";

import {
	registerSchema,
	loginSchema,
	verifyOtpSchema,
	resendOtpSchema,
	forgotPasswordSchema,
	resetPasswordSchema,
	googleOAuthSchema,
	githubOAuthSchema,
} from "../../src/validators/auth.validator.js";

describe("registerSchema", () => {
	const valid = {
		name: "Jane Doe",
		email: "jane@example.com",
		password: "Secret123!",
	};

	it("accepts a valid registration payload", () => {
		expect(registerSchema.safeParse(valid).success).toBe(true);
	});

	it("normalizes email to trimmed lowercase", () => {
		const result = registerSchema.safeParse({
			...valid,
			email: "  Jane@Example.COM ",
		});
		expect(result.data.email).toBe("jane@example.com");
	});

	it("trims surrounding whitespace from name", () => {
		const result = registerSchema.safeParse({ ...valid, name: "  Jane Doe  " });
		expect(result.data.name).toBe("Jane Doe");
	});

	it("trims surrounding whitespace from password", () => {
		const result = registerSchema.safeParse({
			...valid,
			password: "  Secret123!  ",
		});
		expect(result.data.password).toBe("Secret123!");
	});

	it("rejects a name shorter than 3 characters", () => {
		expect(registerSchema.safeParse({ ...valid, name: "Jo" }).success).toBe(
			false,
		);
	});

	it("rejects a password shorter than 8 characters", () => {
		expect(
			registerSchema.safeParse({ ...valid, password: "Sh0rt!" }).success,
		).toBe(false);
	});

	it("rejects a password without a lowercase letter", () => {
		expect(
			registerSchema.safeParse({ ...valid, password: "SECRET123!" }).success,
		).toBe(false);
	});

	it("rejects a password without an uppercase letter", () => {
		expect(
			registerSchema.safeParse({ ...valid, password: "secret123!" }).success,
		).toBe(false);
	});

	it("rejects a password without a number", () => {
		expect(
			registerSchema.safeParse({ ...valid, password: "Secretpass!" }).success,
		).toBe(false);
	});

	it("rejects a password without a special character", () => {
		expect(
			registerSchema.safeParse({ ...valid, password: "Secret1234" }).success,
		).toBe(false);
	});

	it("rejects a malformed email address", () => {
		expect(
			registerSchema.safeParse({ ...valid, email: "not-an-email" }).success,
		).toBe(false);
	});

	it("rejects a non-string name (object injection)", () => {
		expect(
			registerSchema.safeParse({ ...valid, name: { $ne: "" } }).success,
		).toBe(false);
	});

	it("strips embedded HTML from name, keeping the visible text", () => {
		const result = registerSchema.safeParse({
			...valid,
			name: "Alice<script>alert(1)</script>",
		});
		expect(result.success).toBe(true);
		expect(result.data.name).toBe("Alice");
	});

	it("rejects a name that is entirely HTML (sanitizes to empty)", () => {
		expect(
			registerSchema.safeParse({
				...valid,
				name: "<script>alert(1)</script>",
			}).success,
		).toBe(false);
	});

	it("rejects a name whose visible text is under 3 chars after stripping tag spaces", () => {
		expect(
			registerSchema.safeParse({ ...valid, name: "<b> Al </b>" }).success,
		).toBe(false);
	});

	it("never sanitizes the password, even with angle brackets", () => {
		const result = registerSchema.safeParse({
			...valid,
			password: "P@ss<w>ord1",
		});
		expect(result.success).toBe(true);
		expect(result.data.password).toBe("P@ss<w>ord1");
	});
});

describe("loginSchema", () => {
	const valid = { email: "jane@example.com", password: "secret123" };

	it("accepts valid credentials", () => {
		expect(loginSchema.safeParse(valid).success).toBe(true);
	});

	it("normalizes email to trimmed lowercase", () => {
		const result = loginSchema.safeParse({ ...valid, email: " Jane@X.COM " });
		expect(result.data.email).toBe("jane@x.com");
	});

	it("accepts a short password (no length policy leak on login)", () => {
		expect(loginSchema.safeParse({ ...valid, password: "x" }).success).toBe(
			true,
		);
	});

	it("trims surrounding whitespace from password (symmetry with register)", () => {
		const result = loginSchema.safeParse({
			...valid,
			password: "  secret123  ",
		});
		expect(result.data.password).toBe("secret123");
	});

	it("rejects an empty password", () => {
		expect(loginSchema.safeParse({ ...valid, password: "" }).success).toBe(
			false,
		);
	});

	it("rejects a non-string password (object injection)", () => {
		expect(
			loginSchema.safeParse({ ...valid, password: { $ne: "" } }).success,
		).toBe(false);
	});
});

describe("verifyOtpSchema", () => {
	const valid = { email: "jane@example.com", otp: "012345" };

	it("accepts a 6-digit otp", () => {
		expect(verifyOtpSchema.safeParse(valid).success).toBe(true);
	});

	it("rejects an otp that is not 6 digits", () => {
		expect(verifyOtpSchema.safeParse({ ...valid, otp: "1234" }).success).toBe(
			false,
		);
	});

	it("rejects a non-numeric otp", () => {
		expect(verifyOtpSchema.safeParse({ ...valid, otp: "abcdef" }).success).toBe(
			false,
		);
	});
});

describe("resendOtpSchema", () => {
	it("accepts a valid email", () => {
		expect(
			resendOtpSchema.safeParse({ email: "jane@example.com" }).success,
		).toBe(true);
	});

	it("rejects a missing email", () => {
		expect(resendOtpSchema.safeParse({}).success).toBe(false);
	});
});

describe("forgotPasswordSchema", () => {
	it("accepts a valid email", () => {
		expect(
			forgotPasswordSchema.safeParse({ email: "jane@example.com" }).success,
		).toBe(true);
	});

	it("rejects a malformed email", () => {
		expect(forgotPasswordSchema.safeParse({ email: "nope" }).success).toBe(
			false,
		);
	});
});

describe("resetPasswordSchema", () => {
	const valid = {
		email: "jane@example.com",
		otp: "012345",
		newPassword: "Secret123!",
	};

	it("accepts a valid reset payload", () => {
		expect(resetPasswordSchema.safeParse(valid).success).toBe(true);
	});

	it("rejects a new password shorter than 8 characters", () => {
		expect(
			resetPasswordSchema.safeParse({ ...valid, newPassword: "Sh0rt!" })
				.success,
		).toBe(false);
	});

	it("applies the same composition rule to newPassword (missing special char)", () => {
		expect(
			resetPasswordSchema.safeParse({ ...valid, newPassword: "Secret1234" })
				.success,
		).toBe(false);
	});

	it("rejects a malformed otp", () => {
		expect(
			resetPasswordSchema.safeParse({ ...valid, otp: "12" }).success,
		).toBe(false);
	});
});

describe("googleOAuthSchema", () => {
	it("accepts a non-empty idToken string", () => {
		expect(googleOAuthSchema.safeParse({ idToken: "abc.def.ghi" }).success).toBe(
			true,
		);
	});

	it("rejects an empty idToken", () => {
		expect(googleOAuthSchema.safeParse({ idToken: "" }).success).toBe(false);
	});

	it("rejects a whitespace-only idToken", () => {
		expect(googleOAuthSchema.safeParse({ idToken: "   " }).success).toBe(false);
	});

	it("rejects a non-string idToken (object injection)", () => {
		expect(
			googleOAuthSchema.safeParse({ idToken: { $ne: "" } }).success,
		).toBe(false);
	});
});

describe("githubOAuthSchema", () => {
	it("accepts a non-empty code string", () => {
		expect(githubOAuthSchema.safeParse({ code: "abc123" }).success).toBe(true);
	});

	it("rejects an empty code", () => {
		expect(githubOAuthSchema.safeParse({ code: "" }).success).toBe(false);
	});

	it("rejects a whitespace-only code", () => {
		expect(githubOAuthSchema.safeParse({ code: "   " }).success).toBe(false);
	});

	it("rejects a non-string code (object injection)", () => {
		expect(githubOAuthSchema.safeParse({ code: { $ne: "" } }).success).toBe(
			false,
		);
	});
});
