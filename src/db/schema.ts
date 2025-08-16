import { index, int, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const keyTable = sqliteTable(
	'keys',
	{
		id: int().primaryKey({ autoIncrement: true }),
		key: text().notNull().unique(),
		alive: int({ mode: 'boolean' }).notNull().default(true),
	},
	(table) => [index('key_index').on(table.id, table.key, table.alive)]
);

export const cursorTable = sqliteTable('cursor', {
	id: int().primaryKey({ autoIncrement: true }),
	cursor: int().unique().default(0),
});
