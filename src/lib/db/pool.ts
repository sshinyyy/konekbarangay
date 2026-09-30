import "server-only";

import { Pool } from "pg";
import { getDatabaseUrl } from "@/lib/config/env";

const globalForPostgres = globalThis as typeof globalThis & {
  postgresPool?: Pool;
};

export function getDatabasePool() {
  if (!globalForPostgres.postgresPool) {
    globalForPostgres.postgresPool = new Pool({
      connectionString: getDatabaseUrl(),
      max: process.env.VERCEL === "1" ? 1 : 5,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    });
  }

  return globalForPostgres.postgresPool;
}