import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { ConflictError, ValidationError } from "@/lib/errors";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { actorFromToken, authenticate, createSession, hashToken, registerUser, revokeSession } from "@/server/auth/service";
import { makeUser } from "./helpers";

describe("passwords", () => {
  it("hashes with a random salt and verifies", async () => {
    const a = await hashPassword("s3cret-password");
    const b = await hashPassword("s3cret-password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("s3cret-password", a)).toBe(true);
    expect(await verifyPassword("wrong", a)).toBe(false);
    expect(await verifyPassword("anything", "!disabled")).toBe(false);
  });
});

describe("registration and sessions", () => {
  it("validates input", async () => {
    await expect(registerUser({ email: "not-an-email", password: "short", handle: "x", displayName: "" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects duplicate emails and handles", async () => {
    const u = await makeUser();
    await expect(registerUser({ email: u.email.toUpperCase(), password: "another long password", handle: "fresh_handle_1", displayName: "X" })).rejects.toBeInstanceOf(ConflictError);
    await expect(registerUser({ email: "fresh@example.test", password: "another long password", handle: u.handle, displayName: "X" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("authenticates only with the right password", async () => {
    const u = await makeUser();
    expect(await authenticate(u.email, u.password)).toEqual({ id: u.id });
    expect(await authenticate(u.email, "wrong password!")).toBeNull();
    expect(await authenticate("nobody@example.test", u.password)).toBeNull();
  });

  it("stores only a hash of the session token and resolves the actor", async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id);
    const [row] = await db.select().from(sessions).where(eq(sessions.id, hashToken(token)));
    expect(row).toBeDefined();
    expect(await db.select().from(sessions).where(eq(sessions.id, token))).toHaveLength(0);
    expect((await actorFromToken(token))?.id).toBe(u.id);
    await revokeSession(token);
    expect(await actorFromToken(token)).toBeNull();
  });

  it("blocks suspended users", async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id);
    await db.update(users).set({ suspendedAt: new Date() }).where(eq(users.id, u.id));
    expect(await actorFromToken(token)).toBeNull();
    expect(await authenticate(u.email, u.password)).toBeNull();
  });

  it("the seed curator account cannot sign in", async () => {
    expect(await authenticate("curator@system.invalid", "anything at all")).toBeNull();
  });
});

describe("password change", () => {
  it("requires the current password, signs out other sessions and accepts the new password", async () => {
    const { changePassword } = await import("@/server/me/profile");
    const u = await makeUser();
    const { token } = await createSession(u.id);
    await expect(changePassword(u, "wrong current", "a brand new password")).rejects.toBeInstanceOf(ValidationError);
    await expect(changePassword(u, u.password, "short")).rejects.toBeInstanceOf(ValidationError);
    await expect(changePassword(u, u.password, u.password)).rejects.toBeInstanceOf(ValidationError);
    await changePassword(u, u.password, "a brand new password");
    expect(await actorFromToken(token)).toBeNull();
    expect(await authenticate(u.email, u.password)).toBeNull();
    expect(await authenticate(u.email, "a brand new password")).toEqual({ id: u.id });
  });
});
