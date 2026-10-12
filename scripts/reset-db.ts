import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, closeDb } from "../src/db";
import { env } from "../src/lib/env";

if (env().NODE_ENV === "production") throw new Error("Refusing to reset a production database.");
await db.execute(sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`);
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Database reset and migrated.");
await closeDb();
