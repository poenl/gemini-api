import { eq, gt, and } from 'drizzle-orm';
import { DB, KV } from './db/init';
import { keyTable } from './db/schema';

export const getKey = async () => {
	const cursor = await KV.get('cursor_key_id');
	if (!cursor) throw new Error('cursor is null');
	let [keyData] = await DB.selectDistinct()
		.from(keyTable)
		.where(and(gt(keyTable.id, +cursor), eq(keyTable.alive, true)));

	// 如果轮询到最后一个 key，则重头开始
	if (!keyData) {
		[keyData] = await DB.selectDistinct().from(keyTable);
	}
	await KV.put('cursor_key_id', keyData.id.toString());
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
