import { index, int, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const keyTable = sqliteTable(
	'keys',
	{
		id: int().primaryKey({ autoIncrement: true }),
		key: text().notNull().unique(),
		alive: int({ mode: 'boolean' }).notNull().default(true),
		lastUsed: int().notNull().default(0),
	},
	(table) => [index('alive_lastUsed_index').on(table.alive, table.lastUsed)]
);
