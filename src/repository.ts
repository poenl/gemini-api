import { eq, and } from 'drizzle-orm';
import { DB } from './db/init';
import { keyTable } from './db/schema';

export const getKey = async (): Promise<string> => {
	let [keyData] = await DB.selectDistinct()
		.from(keyTable)
		.where(eq(keyTable.alive, true))
		.orderBy(keyTable.lastUsed)
		.limit(1);

	const [newKeyData] = await DB.update(keyTable)
		.set({ lastUsed: Date.now() })
		.where(and(eq(keyTable.id, keyData.id), eq(keyTable.lastUsed, keyData.lastUsed)))
		.returning();

	if (!newKeyData) {
		return getKey();
	}

	return keyData.key;
};

// 插入新的 key
export const insertKey = (key: string) => DB.insert(keyTable).values({ key });

export const findKey = async (key: string): Promise<string | undefined> => {
	const [result] = await DB.select()
		.from(keyTable)
		.where(and(eq(keyTable.key, key), eq(keyTable.alive, true)));
	return result?.key;
};

export const deleteKey = (key: string) => {
	return DB.update(keyTable).set({ alive: false }).where(eq(keyTable.key, key));
};

export const getKeyCount = async () => {
	return DB.$count(keyTable, eq(keyTable.alive, true));
};
