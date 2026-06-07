import { describe, it, expect } from "vitest";

import {
	clientKey,
	rateLimitExceededHandler,
} from "../../src/middlewares/rateLimit.middleware.js";
import AppError from "../../src/errors/AppError.js";
import httpStatus from "../../src/constants/httpStatus.js";
import appErrorCode from "../../src/constants/appErrorCode.js";

describe("clientKey", () => {
	it("keys by user id for authenticated requests (per-account, not per-IP)", () => {
		const req = {
			user: { _id: "507f1f77bcf86cd799439011" },
			headers: { "cf-connecting-ip": "203.0.113.5" },
			ip: "127.0.0.1",
		};
		expect(clientKey(req)).toBe("507f1f77bcf86cd799439011");
	});

	it("uses Cloudflare's real client IP when the CF-Connecting-IP header is present", () => {
		const req = {
			headers: { "cf-connecting-ip": "203.0.113.5" },
			ip: "172.16.0.1", // the Cloudflare edge IP Express sees — must NOT be used
		};
		expect(clientKey(req)).toBe("203.0.113.5");
	});

	it("falls back to req.ip when the CF-Connecting-IP header is absent (local/dev)", () => {
		const req = { headers: {}, ip: "127.0.0.1" };
		expect(clientKey(req)).toBe("127.0.0.1");
	});

	it("normalizes IPv6 to its subnet so a user can't bypass limits by rotating within their range", () => {
		const req = {
			headers: { "cf-connecting-ip": "2001:db8:85a3:8d3:1319:8a2e:370:7348" },
			ip: "127.0.0.1",
		};
		expect(clientKey(req)).toBe("2001:db8:85a3:800::/56");
	});
});

describe("rateLimitExceededHandler", () => {
	it("forwards a 429 AppError carrying the RATE_LIMITED code", () => {
		let captured;
		const next = (err) => {
			captured = err;
		};

		rateLimitExceededHandler({}, {}, next);

		expect(captured).toBeInstanceOf(AppError);
		expect(captured.statusCode).toBe(httpStatus.TOO_MANY_REQUESTS);
		expect(captured.code).toBe(appErrorCode.RATE_LIMITED);
	});
});
