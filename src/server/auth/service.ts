import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { profiles, sessions, users } from "@/db/schema";
import { ConflictError, ValidationError } from "@/lib/errors";
import type { Actor } from "@/server/actor";
import { hashPassword, verifyPassword } from "./password";

export const SESSION_TTL_DAYS = 30;

export const signUpSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  password: z.string().min(10, "Use at least 10 characters").max(200),
  handle: z
    .string()
    .trim()
    .min(3, "At least 3 characters")
    .max(24, "At most 24 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers and underscores only"),
  displayName: z.string().trim().min(1, "Required").max(60),
});

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Required").max(200),
});

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function registerUser(input: z.input<typeof signUpSchema>) {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Please fix the highlighted fields", z.flattenError(parsed.error).fieldErrors);
  const { email, password, handle, displayName } = parsed.data;
  const passwordHash = await hashPassword(password);
  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({ email, passwordHash }).returning({ id: users.id });
      await tx.insert(profiles).values({ userId: user!.id, handle, displayName });
      return user!;
    });
  } catch (err) {
    const code = (err as { cause?: { code?: string }; code?: string }).cause?.code ?? (err as { code?: string }).code;
    const constraint = String((err as { cause?: { constraint?: string } }).cause?.constraint ?? "");
    if (code === "23505") {
      if (constraint.includes("handle")) throw new ValidationError("That handle is taken", { handle: ["That handle is taken"] });
      throw new ConflictError("An account with that email already exists");
    }
    throw err;
  }
}

// Constant work for unknown emails so response time does not reveal which emails exist.
const DUMMY_HASH = hashPassword("not-a-real-password-placeholder");

export async function authenticate(email: string, password: string): Promise<{ id: string } | null> {
  const parsed = signInSchema.safeParse({ email, password });
  if (!parsed.success) return null;
  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash, suspendedAt: users.suspendedAt })
    .from(users)
    .where(eq(users.email, parsed.data.email));
  if (!user) {
    await verifyPassword(parsed.data.password, await DUMMY_HASH);
    return null;
  }
  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok || user.suspendedAt) return null;
  return { id: user.id };
}

/** Creates a session and returns the raw token for the cookie. Only the hash is persisted. */
export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400_000);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  if (Math.random() < 0.05) await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  return { token, expiresAt };
}

export async function actorFromToken(token: string | undefined): Promise<Actor> {
  if (!token || token.length > 128) return null;
  const [row] = await db
    .select({
      id: users.id,
      role: users.role,
      suspendedAt: users.suspendedAt,
      handle: profiles.handle,
      displayName: profiles.displayName,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())));
  if (!row || row.suspendedAt) return null;
  return { id: row.id, role: row.role, handle: row.handle, displayName: row.displayName };
}

export async function revokeSession(token: string) {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export async function revokeAllSessions(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
