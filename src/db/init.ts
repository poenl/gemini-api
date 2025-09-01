import { DrizzleD1Database } from 'drizzle-orm/d1';
import { drizzle } from 'drizzle-orm/d1';

export interface Env {
	DB: D1Database;
}
export let DB: DrizzleD1Database;
export const initDB = (env: Env) => {
	DB = drizzle(env.DB);
};
