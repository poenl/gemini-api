import { eq, and } from 'drizzle-orm';
import { DB } from './db/init';
import { keyTable } from './db/schema';

export const getKey = async (): Promise<string> => {
	let [keyData] = await DB.select()
		.from(keyTable)
		.where(eq(keyTable.alive, true))
		.orderBy(keyTable.lastUsed)
		.limit(1);

	const [newKeyData] = await DB.update(keyTable)
		.set({ lastUsed: Date.now() })
		.where(and(eq(keyTable.id, keyData.id), eq(keyTable.lastUsed, keyData.lastUsed)))
		.returning();

	if (!newKeyData) {
		await new Promise((resolve) => setTimeout(resolve, Math.random() * 100)); // 防止惊群
		return getKey();
	}

	return keyData.key;
};

// 插入新的 key
export const insertKey = (key: string) => DB.insert(keyTable).values({ key });

export const findKey = async (key: string): Promise<string | undefined> => {
	const [result] = await DB.select().from(keyTable).where(eq(keyTable.key, key));
	if (result && !result.alive) {
		await deleteKey(key);
		return undefined;
	}
	return result?.key;
};

export const updateKeytoNotAlive = (key: string) =>
	DB.update(keyTable).set({ alive: false }).where(eq(keyTable.key, key));

const deleteKey = (key: string) => DB.delete(keyTable).where(eq(keyTable.key, key));

export const getKeyCount = async () => DB.$count(keyTable, eq(keyTable.alive, true));
