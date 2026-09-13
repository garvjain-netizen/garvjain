/** Applies db/schema.sql. Idempotent — safe to re-run. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pool } from "../src/lib/db";
import { env } from "../src/lib/env";

async function main() {
  const sql = await readFile(join(process.cwd(), "db", "schema.sql"), "utf8");
  const target = env.databaseUrl.replace(/:\/\/[^@]*@/, "://***@");
  console.log(`Applying schema to ${target}`);
  await pool.query(sql);
  console.log("Schema applied.");
  await pool.end();
}

main().catch(async (error) => {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  await pool.end().catch(() => {});
  process.exit(1);
});
