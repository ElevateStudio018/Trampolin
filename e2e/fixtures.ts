/** Creates fixed staff accounts for end-to-end tests. Run against the e2e database only. */
import { eq } from "drizzle-orm";
import { closeDb, db } from "../src/db";
import { users } from "../src/db/schema";
import { registerUser } from "../src/server/auth/service";

export const STAFF = {
  admin: { email: "admin@e2e.test", password: "admin password 123", handle: "e2e_admin", displayName: "E2E Admin" },
  reviewer: { email: "reviewer@e2e.test", password: "reviewer password 123", handle: "e2e_reviewer", displayName: "E2E Reviewer" },
} as const;

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!process.env.DATABASE_URL?.includes("e2e")) throw new Error("Refusing to create fixtures outside the e2e database");
  for (const [role, u] of Object.entries(STAFF)) {
    const { id } = await registerUser(u);
    await db.update(users).set({ role: role as "admin" }).where(eq(users.id, id));
  }
  console.log("E2E staff accounts created.");
  await closeDb();
}
