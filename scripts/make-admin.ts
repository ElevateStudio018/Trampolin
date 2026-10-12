/** Usage: npm run make-admin -- someone@example.com [reviewer|admin] */
import { eq } from "drizzle-orm";
import { closeDb, db } from "../src/db";
import { users } from "../src/db/schema";

const [email, role = "admin"] = process.argv.slice(2);
if (!email || !["reviewer", "admin"].includes(role)) {
  console.error("Usage: npm run make-admin -- <email> [reviewer|admin]");
  process.exit(1);
}
const res = await db.update(users).set({ role: role as "admin" }).where(eq(users.email, email)).returning({ id: users.id });
console.log(res.length ? `${email} is now ${role}.` : `No user with email ${email}.`);
await closeDb();
