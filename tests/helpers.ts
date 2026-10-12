import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { profiles, users } from "@/db/schema";
import type { Actor, Role } from "@/server/actor";
import { registerUser } from "@/server/auth/service";

/** Creates a real user through the registration path and returns an Actor for service calls. */
export async function makeUser(role: Role = "member", password = "correct horse battery"): Promise<NonNullable<Actor> & { email: string; password: string }> {
  const suffix = randomBytes(4).toString("hex");
  const email = `user_${suffix}@example.test`;
  const handle = `u_${suffix}`;
  const { id } = await registerUser({ email, password, handle, displayName: `User ${suffix}` });
  if (role !== "member") await db.update(users).set({ role }).where(eq(users.id, id));
  const [p] = await db.select().from(profiles).where(eq(profiles.userId, id));
  return { id, role, handle: p!.handle, displayName: p!.displayName, email, password };
}
