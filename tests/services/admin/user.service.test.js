import { describe, it, expect } from "vitest";
import User from "../../../src/models/user.model.js";
import Session from "../../../src/models/session.model.js";
import File from "../../../src/models/file.model.js";
import Directory from "../../../src/models/directory.model.js";

import {
	changeUserRole,
	suspendUser,
	unsuspendUser,
	forceLogoutUser,
	softDeleteUser,
	hardDeleteUser,
	restoreUser,
} from "../../../src/services/admin/user.service.js";

import { ROLES } from "../../../src/constants/roles.js";

import {
	createTestUser,
	createTestSession,
	createTestDirectory,
	createTestFile,
} from "../../factories.js";

describe("admin/user.service — changeUserRole", () => {
	it("promotes a user to admin", async () => {
		const caller = await createTestUser({ role: ROLES.SUPERADMIN });
		const target = await createTestUser({ role: ROLES.USER });

		const result = await changeUserRole(caller, target._id, ROLES.ADMIN);

		expect(result.role).toBe(ROLES.ADMIN);
		expect(result.status).toBe("active");

		const reread = await User.findById(target._id).lean();
		expect(reread.role).toBe(ROLES.ADMIN);
	});

	it("rejects an invalid role string", async () => {
		const caller = await createTestUser({ role: ROLES.SUPERADMIN });
		const target = await createTestUser();

		await expect(
			changeUserRole(caller, target._id, "not-a-role"),
		).rejects.toMatchObject({ statusCode: 400, code: "INVALID_INPUT" });
	});

	it("rejects self-demote", async () => {
		const caller = await createTestUser({ role: ROLES.SUPERADMIN });

		await expect(
			changeUserRole(caller, caller._id, ROLES.ADMIN),
		).rejects.toMatchObject({ statusCode: 403, code: "CANNOT_ACT_ON_SELF" });
	});

	it("rejects changing role of a soft-deleted user", async () => {
		const caller = await createTestUser({ role: ROLES.SUPERADMIN });
		const target = await createTestUser({ deletedAt: new Date() });

		await expect(
			changeUserRole(caller, target._id, ROLES.ADMIN),
		).rejects.toMatchObject({ statusCode: 400, code: "INVALID_INPUT" });
	});

	it("is idempotent when the role is unchanged", async () => {
		const caller = await createTestUser({ role: ROLES.SUPERADMIN });
		const target = await createTestUser({ role: ROLES.ADMIN });

		const result = await changeUserRole(caller, target._id, ROLES.ADMIN);

		expect(result.role).toBe(ROLES.ADMIN);
	});
});

describe("admin/user.service — suspendUser", () => {
	it("sets suspendedAt and revokes all sessions", async () => {
		const caller = await createTestUser({ role: ROLES.SUPERADMIN });
		const target = await createTestUser({ role: ROLES.USER });
		await createTestSession(target._id);
		await createTestSession(target._id);

		const result = await suspendUser(caller, target._id);

		expect(result.suspendedAt).toBeInstanceOf(Date);
		expect(String(result.suspendedBy)).toBe(String(caller._id));
		expect(result.status).toBe("suspended");
		expect(await Session.countDocuments({ userId: target._id })).toBe(0);
	});

	it("rejects suspending self", async () => {
		const caller = await createTestUser({ role: ROLES.ADMIN });

		await expect(suspendUser(caller, caller._id)).rejects.toMatchObject({
			statusCode: 403,
			code: "CANNOT_ACT_ON_SELF",
		});
	});

	it("rejects suspending a peer (admin → admin)", async () => {
		const caller = await createTestUser({ role: ROLES.ADMIN });
		const target = await createTestUser({ role: ROLES.ADMIN });

		await expect(suspendUser(caller, target._id)).rejects.toMatchObject({
			statusCode: 403,
			code: "CANNOT_ACT_ON_PEER",
		});
	});

	it("rejects suspending a higher-rank user (admin → superadmin)", async () => {
		const caller = await createTestUser({ role: ROLES.ADMIN });
		const target = await createTestUser({ role: ROLES.SUPERADMIN });

		await expect(suspendUser(caller, target._id)).rejects.toMatchObject({
			code: "CANNOT_ACT_ON_PEER",
		});
	});

	it("rejects suspending a deleted user", async () => {
		const caller = await createTestUser({ role: ROLES.SUPERADMIN });
		const target = await createTestUser({ deletedAt: new Date() });

		await expect(suspendUser(caller, target._id)).rejects.toMatchObject({
			code: "INVALID_INPUT",
		});
	});

	it("rejects suspending an already-suspended user", async () => {
		const caller = await createTestUser({ role: ROLES.SUPERADMIN });
		const target = await createTestUser({ suspendedAt: new Date() });

		await expect(suspendUser(caller, target._id)).rejects.toMatchObject({
			code: "INVALID_INPUT",
		});
	});
});

describe("admin/user.service — unsuspendUser", () => {
	it("clears suspendedAt and suspendedBy", async () => {
		const caller = await createTestUser({ role: ROLES.SUPERADMIN });
		const target = await createTestUser({
			suspendedAt: new Date(),
			suspendedBy: caller._id,
		});

		const result = await unsuspendUser(caller, target._id);

		expect(result.suspendedAt).toBeNull();
		expect(result.suspendedBy).toBeNull();
		expect(result.status).toBe("active");
	});

	it("rejects unsuspending a deleted user", async () => {
		const caller = await createTestUser({ role: ROLES.SUPERADMIN });
		const target = await createTestUser({
			suspendedAt: new Date(),
			deletedAt: new Date(),
		});

		await expect(unsuspendUser(caller, target._id)).rejects.toMatchObject({
			code: "INVALID_INPUT",
		});
	});

	it("rejects unsuspending an active (non-suspended) user", async () => {
		const caller = await createTestUser({ role: ROLES.SUPERADMIN });
		const target = await createTestUser();

		await expect(unsuspendUser(caller, target._id)).rejects.toMatchObject({
			code: "INVALID_INPUT",
		});
	});

	it("rejects when caller does not outrank target", async () => {
		const caller = await createTestUser({ role: ROLES.ADMIN });
		const target = await createTestUser({
			role: ROLES.ADMIN,
			suspendedAt: new Date(),
		});

		await expect(unsuspendUser(caller, target._id)).rejects.toMatchObject({
			code: "CANNOT_ACT_ON_PEER",
		});
	});
});

describe("admin/user.service — forceLogoutUser", () => {
	it("revokes all sessions for the target and returns the count", async () => {
		const caller = await createTestUser({ role: ROLES.SUPERADMIN });
		const target = await createTestUser();
		await createTestSession(target._id);
		await createTestSession(target._id);
		await createTestSession(target._id);

		const result = await forceLogoutUser(caller, target._id);

		expect(result).toEqual({ sessionsRevoked: 3 });
		expect(await Session.countDocuments({ userId: target._id })).toBe(0);
	});

	it("allows force-logout of self", async () => {
		const caller = await createTestUser({ role: ROLES.ADMIN });
		await createTestSession(caller._id);

		const result = await forceLogoutUser(caller, caller._id);

		expect(result.sessionsRevoked).toBe(1);
	});

	it("rejects peer force-logout (admin → admin) when not self", async () => {
		const caller = await createTestUser({ role: ROLES.ADMIN });
		const target = await createTestUser({ role: ROLES.ADMIN });

		await expect(
			forceLogoutUser(caller, target._id),
		).rejects.toMatchObject({ code: "CANNOT_ACT_ON_PEER" });
	});

	it("rejects force-logout of a deleted user", async () => {
		const caller = await createTestUser({ role: ROLES.SUPERADMIN });
		const target = await createTestUser({ deletedAt: new Date() });

		await expect(
			forceLogoutUser(caller, target._id),
		).rejects.toMatchObject({ code: "INVALID_INPUT" });
	});
});

describe("admin/user.service — softDeleteUser", () => {
	it("sets deletedAt and revokes all sessions", async () => {
		const caller = await createTestUser({ role: ROLES.SUPERADMIN });
		const target = await createTestUser();
		await createTestSession(target._id);
		await createTestSession(target._id);

		const result = await softDeleteUser(caller, target._id);

		expect(result.deletedAt).toBeInstanceOf(Date);
		expect(result.status).toBe("deleted");
		expect(await Session.countDocuments({ userId: target._id })).toBe(0);
	});

	it("rejects soft-deleting self", async () => {
		const caller = await createTestUser({ role: ROLES.SUPERADMIN });

		await expect(softDeleteUser(caller, caller._id)).rejects.toMatchObject({
			code: "CANNOT_ACT_ON_SELF",
		});
	});

	it("rejects soft-deleting an already-deleted user", async () => {
		const caller = await createTestUser({ role: ROLES.SUPERADMIN });
		const target = await createTestUser({ deletedAt: new Date() });

		await expect(
			softDeleteUser(caller, target._id),
		).rejects.toMatchObject({ code: "INVALID_INPUT" });
	});

	it("rejects soft-deleting a peer (admin → admin)", async () => {
		const caller = await createTestUser({ role: ROLES.ADMIN });
		const target = await createTestUser({ role: ROLES.ADMIN });

		await expect(
			softDeleteUser(caller, target._id),
		).rejects.toMatchObject({ code: "CANNOT_ACT_ON_PEER" });
	});

});

describe("admin/user.service — hardDeleteUser", () => {
	it("wipes user + files + directories + sessions and returns the tally", async () => {
		const caller = await createTestUser({ role: ROLES.SUPERADMIN });
		const target = await createTestUser({ role: ROLES.USER });
		const dir = await createTestDirectory(target._id);
		await createTestFile(target._id, dir._id, { size: 200 });
		await createTestFile(target._id, dir._id, { size: 300 });
		await createTestSession(target._id);
		await createTestSession(target._id);

		const tally = await hardDeleteUser(caller, target._id);

		expect(tally).toEqual({
			filesDeleted: 2,
			directoriesDeleted: 1,
			bytesFreed: 500,
		});
		expect(await User.findById(target._id)).toBeNull();
		expect(await File.countDocuments({ userId: target._id })).toBe(0);
		expect(await Directory.countDocuments({ userId: target._id })).toBe(0);
		expect(await Session.countDocuments({ userId: target._id })).toBe(0);
	});

	it("rejects hard-deleting self", async () => {
		const caller = await createTestUser({ role: ROLES.SUPERADMIN });

		await expect(
			hardDeleteUser(caller, caller._id),
		).rejects.toMatchObject({ code: "CANNOT_ACT_ON_SELF" });
	});

	it("rejects hard-deleting a peer", async () => {
		const caller = await createTestUser({ role: ROLES.ADMIN });
		const target = await createTestUser({ role: ROLES.ADMIN });

		await expect(
			hardDeleteUser(caller, target._id),
		).rejects.toMatchObject({ code: "CANNOT_ACT_ON_PEER" });
	});

	it("returns zero tallies for a user with no files/directories/sessions", async () => {
		const caller = await createTestUser({ role: ROLES.SUPERADMIN });
		const target = await createTestUser({ role: ROLES.USER });

		const tally = await hardDeleteUser(caller, target._id);

		expect(tally).toEqual({
			filesDeleted: 0,
			directoriesDeleted: 0,
			bytesFreed: 0,
		});
		expect(await User.findById(target._id)).toBeNull();
	});
});

describe("admin/user.service — restoreUser", () => {
	it("clears deletedAt and preserves suspendedAt", async () => {
		const caller = await createTestUser({ role: ROLES.SUPERADMIN });
		const suspendedAt = new Date("2026-04-01T00:00:00Z");
		const target = await createTestUser({
			deletedAt: new Date(),
			suspendedAt,
		});

		const result = await restoreUser(caller, target._id);

		expect(result.deletedAt).toBeNull();
		expect(result.suspendedAt).toEqual(suspendedAt);
		expect(result.status).toBe("suspended");
	});

	it("returns active status when the user wasn't suspended", async () => {
		const caller = await createTestUser({ role: ROLES.SUPERADMIN });
		const target = await createTestUser({ deletedAt: new Date() });

		const result = await restoreUser(caller, target._id);

		expect(result.deletedAt).toBeNull();
		expect(result.suspendedAt).toBeNull();
		expect(result.status).toBe("active");
	});

	it("rejects restoring an active (non-deleted) user", async () => {
		const caller = await createTestUser({ role: ROLES.SUPERADMIN });
		const target = await createTestUser();

		await expect(restoreUser(caller, target._id)).rejects.toMatchObject({
			statusCode: 400,
			code: "INVALID_INPUT",
		});
	});

	it("rejects restore when caller does not outrank target", async () => {
		const caller = await createTestUser({ role: ROLES.ADMIN });
		const target = await createTestUser({
			role: ROLES.ADMIN,
			deletedAt: new Date(),
		});

		await expect(restoreUser(caller, target._id)).rejects.toMatchObject({
			code: "CANNOT_ACT_ON_PEER",
		});
	});

	it("does not restore sessions automatically", async () => {
		const caller = await createTestUser({ role: ROLES.SUPERADMIN });
		const target = await createTestUser({ deletedAt: new Date() });

		await restoreUser(caller, target._id);

		expect(await Session.countDocuments({ userId: target._id })).toBe(0);
	});
});
