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
export const insertKey = async (key: string) => {
	if (!key) return key;
	const [hasKey] = await DB.select().from(keyTable).where(eq(keyTable.key, key));
	if (hasKey) {
		if (hasKey.alive) return getKey();
		else {
			await DB.update(keyTable).set({ alive: true }).where(eq(keyTable.key, key));
			return key;
		}
	}
	// 如果是新的 key，则返回新的 key 使用并校验
	const [keyData] = await DB.insert(keyTable).values({ key }).returning();
	return keyData.key;
};

export const deleteKey = (key: string) => {
	return DB.update(keyTable).set({ alive: false }).where(eq(keyTable.key, key));
};

export const getKeyCount = async () => {
	return DB.$count(keyTable, eq(keyTable.alive, true));
};
