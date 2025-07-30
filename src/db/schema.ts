import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const keyTable = sqliteTable('keys', {
	id: int().primaryKey({ autoIncrement: true }),
	key: text().notNull().unique(),
	alive: int({ mode: 'boolean' }).notNull().default(true),
});

export const keyCursorTable = sqliteTable('key_cursor', {
	keyId: int().primaryKey().unique().default(0),
});
