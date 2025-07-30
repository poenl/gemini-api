import { eq, sql } from 'drizzle-orm';
import { DB } from './db/init';
import { keyCursorTable, keyTable } from './db/schema';

export const getKey = async () => {
	const [{ keyId }] = await DB.selectDistinct().from(keyCursorTable);
	let [keyData] = await DB.selectDistinct()
		.from(keyTable)
		.where(sql`${keyTable.id} > ${keyId}`);

	// 如果轮询到最后一个 key，则重头开始
	if (!keyData) {
		[keyData] = await DB.selectDistinct().from(keyTable);
	}
	await DB.update(keyCursorTable).set({ keyId: keyData.id });
	return keyData.key;
};

// 插入新的 key
export const insertKey = async (key: string | '') => {
	if (!key) return key;

	const [keyData] = await DB.insert(keyTable).values({ key }).onConflictDoNothing().returning();
	// 如果是新的 key，则返回新的 key 使用并校验
	if (keyData) return keyData.key;

	return getKey();
};

export const deleteKey = async (key: string) => {
	await DB.delete(keyTable).where(eq(keyTable.key, key));
};
