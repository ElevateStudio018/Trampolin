import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

export type Role = "member" | "reviewer" | "admin";

/** The authenticated principal passed into every service call; null = anonymous visitor. */
export type Actor = { id: string; role: Role; handle: string; displayName: string } | null;

const RANK: Record<Role, number> = { member: 0, reviewer: 1, admin: 2 };

export function hasRole(actor: Actor, role: Role): boolean {
  return actor !== null && RANK[actor.role] >= RANK[role];
}

export function assertSignedIn(actor: Actor): asserts actor is NonNullable<Actor> {
  if (!actor) throw new UnauthorizedError();
}

export function assertRole(actor: Actor, role: Role): asserts actor is NonNullable<Actor> {
  assertSignedIn(actor);
  if (!hasRole(actor, role)) throw new ForbiddenError();
}
