import { Pool, types, type PoolClient, type QueryResultRow } from "pg";
import { env } from "./env";

// A Postgres DATE is a civil date with no timezone. node-pg parses it into a
// JS Date at *local* midnight, so `1995-09-13` read on a UTC server and
// formatted in Asia/Kolkata comes back as the 12th. Birthdays are exactly the
// thing that breaks, so keep DATE as the 'YYYY-MM-DD' string it already is.
types.setTypeParser(types.builtins.DATE, (value: string) => value);

// Next.js dev server reloads modules on edit; without this the pool is
// recreated on every reload until Postgres runs out of connections.
const globalForPool = globalThis as unknown as { __waPool?: Pool };

export const pool: Pool =
  globalForPool.__waPool ??
  new Pool({
    connectionString: env.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") globalForPool.__waPool = pool;

export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Runs `fn` inside a transaction, rolling back if it throws. */
export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
