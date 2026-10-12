import { sql, type SQL } from "drizzle-orm";

/** Binds a JS string array as a Postgres text[] parameter (drizzle would otherwise expand it to a tuple). */
export function textArray(values: readonly string[]): SQL {
  if (values.length === 0) return sql`'{}'::text[]`;
  return sql`array[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`;
}

export function uuidArray(values: readonly string[]): SQL {
  if (values.length === 0) return sql`'{}'::uuid[]`;
  return sql`array[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::uuid[]`;
}
