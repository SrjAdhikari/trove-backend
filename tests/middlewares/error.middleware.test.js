import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import globalErrorHandler from "../../src/middlewares/error.middleware.js";
import AppError from "../../src/errors/AppError.js";
import appErrorCode from "../../src/constants/appErrorCode.js";

const mockRes = () => {
	const res = {};
	res.status = vi.fn((code) => {
		res.statusCode = code;
		return res;
	});
	res.json = vi.fn((body) => {
		res.body = body;
		return res;
	});
	return res;
};

const run = (err) => {
	const res = mockRes();
	globalErrorHandler(err, {}, res, vi.fn());
	return res;
};

describe("globalErrorHandler", () => {
	let errorSpy;

	beforeEach(() => {
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		errorSpy.mockRestore();
	});

	it("maps Mongoose CastError to 400 / INVALID_ID", () => {
		const res = run({ name: "CastError", path: "id", value: "abc" });

		expect(res.statusCode).toBe(400);
		expect(res.body.status).toBe("fail");
		expect(res.body.error.code).toBe(appErrorCode.INVALID_ID);
		expect(res.body.error.message).toBe("Invalid id: abc");
	});

	it("maps Mongoose ValidationError to 422 / VALIDATION_ERROR with joined messages", () => {
		const res = run({
			name: "ValidationError",
			errors: { name: { message: "name required" }, age: { message: "age bad" } },
		});

		expect(res.statusCode).toBe(422);
		expect(res.body.error.code).toBe(appErrorCode.VALIDATION_ERROR);
		expect(res.body.error.message).toBe("name required, age bad");
	});

	it("maps MongoDB E11000 duplicate key to 409 / DUPLICATE_FIELD", () => {
		const res = run({ code: 11000, keyValue: { email: "a@b.com" } });

		expect(res.statusCode).toBe(409);
		expect(res.body.error.code).toBe(appErrorCode.DUPLICATE_FIELD);
		expect(res.body.error.message).toBe("email already exists");
	});

	it("maps MongoDB document-validation failure (code 121) to 400 / VALIDATION_ERROR", () => {
		const res = run({ code: 121, message: "doc failed validation" });

		expect(res.statusCode).toBe(400);
		expect(res.body.error.code).toBe(appErrorCode.VALIDATION_ERROR);
		expect(res.body.error.message).toBe("doc failed validation");
	});

	it("passes an AppError through with its own status, code, and message", () => {
		const res = run(new AppError("nope", 403, "ACCOUNT_SUSPENDED"));

		expect(res.statusCode).toBe(403);
		expect(res.body.status).toBe("fail");
		expect(res.body.error.code).toBe("ACCOUNT_SUSPENDED");
		expect(res.body.error.message).toBe("nope");
	});

	it("masks an unexpected error as 500 / INTERNAL_ERROR and logs it", () => {
		const res = run(new Error("raw internal detail"));

		expect(res.statusCode).toBe(500);
		expect(res.body.status).toBe("error");
		expect(res.body.error.code).toBe(appErrorCode.INTERNAL_ERROR);
		expect(res.body.error.message).toBe("Something went wrong");
		expect(errorSpy).toHaveBeenCalled();
	});
});
