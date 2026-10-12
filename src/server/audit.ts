import { db, type DbOrTx } from "@/db";
import { auditLog } from "@/db/schema";

export async function audit(
  actorId: string | null,
  action: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown> = {},
  tx: DbOrTx = db,
) {
  await tx.insert(auditLog).values({ actorId, action, targetType, targetId, details });
}
