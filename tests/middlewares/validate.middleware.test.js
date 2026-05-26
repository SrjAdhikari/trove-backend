import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

import validate from "../../src/middlewares/validate.middleware.js";
import AppError from "../../src/errors/AppError.js";

const schema = z.object({
	email: z.string().trim().toLowerCase().pipe(z.email()),
	otp: z.string().regex(/^\d{6}$/),
});

const run = (body) => {
	const req = { body };
	const next = vi.fn();
	const invoke = () => validate(schema)(req, {}, next);
	return { req, next, invoke };
};

describe("validate middleware", () => {
	it("calls next and assigns normalized data back to req.body when valid", () => {
		const { req, next, invoke } = run({
			email: " Jane@Example.COM ",
			otp: "012345",
		});

		invoke();

		expect(next).toHaveBeenCalledOnce();
		expect(req.body.email).toBe("jane@example.com");
	});

	it("throws AppError with 400 / VALIDATION_ERROR when invalid", () => {
		const { invoke } = run({ email: "nope", otp: "12" });

		expect(invoke).toThrow(AppError);
		try {
			invoke();
		} catch (err) {
			expect(err.statusCode).toBe(400);
			expect(err.code).toBe("VALIDATION_ERROR");
			expect(typeof err.message).toBe("string");
			expect(err.message.length).toBeGreaterThan(0);
		}
	});

	it("does not call next when invalid", () => {
		const { next, invoke } = run({ email: "nope", otp: "12" });

		expect(invoke).toThrow();
		expect(next).not.toHaveBeenCalled();
	});

	it("treats an undefined body (Express 5) as an empty object and rejects", () => {
		const { invoke } = run(undefined);
		expect(invoke).toThrow(AppError);
	});

	it("strips keys not declared in the schema from req.body", () => {
		const { req, invoke } = run({
			email: "jane@example.com",
			otp: "012345",
			role: "admin",
		});

		invoke();

		expect(req.body).toEqual({ email: "jane@example.com", otp: "012345" });
		expect(req.body.role).toBeUndefined();
	});

	it("rejects a non-object body (string / array) with a clean AppError, no crash", () => {
		expect(run("hello").invoke).toThrow(AppError);
		expect(run([]).invoke).toThrow(AppError);
	});
});
