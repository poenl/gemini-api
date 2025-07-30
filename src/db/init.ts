import { DrizzleD1Database } from 'drizzle-orm/d1';
import { drizzle } from 'drizzle-orm/d1';

export let DB: DrizzleD1Database<Record<string, never>> & {
	$client: D1Database;
};

export const initDB = (db: D1Database) => {
	DB = drizzle(db);
	return DB;
};
