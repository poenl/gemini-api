import { DrizzleD1Database } from 'drizzle-orm/d1';
import { drizzle } from 'drizzle-orm/d1';

export let DB: DrizzleD1Database<Record<string, never>> & {
	$client: D1Database;
};
export let KV: KVNamespace;
export const initDB = (env: { KV: KVNamespace; DB: D1Database }) => {
	KV = env.KV;
	DB = drizzle(env.DB);
	return DB;
};
