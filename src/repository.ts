import { eq, gt, and } from 'drizzle-orm';
import { DB } from './db/init';
import { cursorTable, keyTable } from './db/schema';

export const getKey = async () => {
	const [{ cursor }] = await DB.select().from(cursorTable).where(eq(cursorTable.id, 1));
	if (!cursor) throw new Error('cursor is null');
	let [keyData] = await DB.selectDistinct()
		.from(keyTable)
		.where(and(gt(keyTable.id, cursor), eq(keyTable.alive, true)));

	// 如果轮询到最后一个 key，则重头开始
	if (!keyData) {
		[keyData] = await DB.selectDistinct().from(keyTable);
	}
	await DB.update(cursorTable).set({ cursor: keyData.id });
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
	return DB.$count(keyTable);
};
