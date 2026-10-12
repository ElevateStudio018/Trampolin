import "server-only";
import { unstable_rethrow } from "next/navigation";
import { AppError, ValidationError, publicMessage } from "@/lib/errors";
import type { ActionState } from "@/lib/action-state";

/** Wraps a server-action body: maps domain errors to form state, never leaks internals. */
export async function runAction(formData: FormData | null, fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (err) {
    unstable_rethrow(err);
    const values = formData ? Object.fromEntries([...formData.entries()].filter(([k, v]) => typeof v === "string" && !k.startsWith("$") && !/password/i.test(k)) as [string, string][]) : undefined;
    if (err instanceof ValidationError) return { ok: false, message: err.message, fieldErrors: err.fieldErrors, values };
    if (err instanceof AppError) return { ok: false, message: err.message, values };
    console.error("[action] unexpected error", err);
    return { ok: false, message: publicMessage(err), values };
  }
}

export function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}
