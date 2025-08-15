import { eq, sql } from 'drizzle-orm';
import { DB } from './db/init';
import { cursorTable, keyTable } from './db/schema';

export const getKey = async () => {
	const [{ cursor }] = await DB.selectDistinct().from(cursorTable).where(eq(cursorTable.id, 1));
	let [keyData] = await DB.selectDistinct()
		.from(keyTable)
		.where(sql`${keyTable.id} > ${cursor}`);

	// 如果轮询到最后一个 key，则重头开始
	if (!keyData) {
		[keyData] = await DB.selectDistinct().from(keyTable);
	}
	await DB.update(cursorTable).set({ cursor: keyData.id });
	return keyData.key;
};

// 插入新的 key
export const insertKey = async (key: string | '') => {
	if (!key) return key;
	const [hasKey] = await DB.select().from(keyTable).where(eq(keyTable.key, key));
	if (hasKey) return getKey();
	// 如果是新的 key，则返回新的 key 使用并校验
	const [keyData] = await DB.insert(keyTable).values({ key }).returning();
	return keyData.key;
};

export const deleteKey = async (key: string) => {
	await DB.delete(keyTable).where(eq(keyTable.key, key));
};

export const getKeyCount = async () => {
	const count = await DB.$count(keyTable);
	// console.log('🚀 ~ getKeyCount ~ DB.$count(keyTable):', DB.$count(keyTable));
	return count;
};
