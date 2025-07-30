import { initDB } from './db/init';
import { insertKey, deleteKey, getKey } from './key';

export default {
	async fetch(request, env, ctx): Promise<Response> {
		// 处理预检请求
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: {
					'Access-Control-Allow-Origin': '*',
				},
			});
		}
		// 数据库初始化
		initDB(env.DB);

		const headersKey = request.headers.get('X-goog-api-key');
		let key;

		const newHeaders = new Headers(request.headers);
		newHeaders.delete('cf');
		if (headersKey !== null) {
			key = await insertKey(headersKey);
			newHeaders.set('X-goog-api-key', key);
		}

		const url = new URL(request.url);
		url.hostname = 'generativelanguage.googleapis.com';
		url.port = '';
		url.protocol = 'https:';

		const getGeminiRes = () => {
			return fetch(url.toString(), {
				method: request.method,
				headers: newHeaders,
				body: request.body,
			});
		};

		// 重试次数
		const retryCount = 5;
		for (let i = 0; i < retryCount; i++) {
			try {
				const geminiRes = await getGeminiRes();
				if (!geminiRes.ok) throw geminiRes;
				console.log('success, key:', key);
				return geminiRes;
			} catch (error) {
				const res = error as Response;
				// 处理错误
				switch (res.status) {
					case 404:
						// key 为空
						return res;
					case 403:
						// 没有携带key
						return res;
					case 400:
						// 新key无效，直接返回错误
						if (headersKey === key) {
							if (key) await deleteKey(key);
							return res;
						}

						console.log('key error, key:', key);
						[key] = await Promise.all([getKey(), deleteKey(key!)]);
				}

				// 重试结束，直接返回错误
				if (i === retryCount - 1) return res;
			}
		}
		// 不会执行到这里，解决类型检查错误
		return new Response('Unexpected retry failure', { status: 500 });
	},
} satisfies ExportedHandler<Env>;
