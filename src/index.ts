import { initDB } from './db/init';
import { insertKey, getKey, getKeyCount, findKey } from './repository';
import handleRequestError from './handleRequestError';
import { handleBody, handleOptions, processHeaders, processUrl } from './utils';
import { RETRY_COUNT } from './comfig';

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const optionsResponse = handleOptions(request);
		if (optionsResponse) {
			return optionsResponse;
		}
		// 数据库初始化
		initDB(env);

		const route = new URL(request.url).pathname;
		if (route === '/keycount') {
			const keyCount = await getKeyCount();
			return new Response(JSON.stringify({ keyCount, message: 'success' }), {
				status: 200,
				headers: {
					'Content-Type': 'application/json',
				},
			});
		}

		const headers = processHeaders(request);

		let isNewKey = true;
		const headersKey = request.headers.get('X-goog-api-key');
		const queryKey = new URL(request.url).searchParams.get('key');
		let key: string | null = headersKey || queryKey;
		if (key !== null) {
			const hasKey = await findKey(key);
			if (hasKey) {
				isNewKey = false;
				if (headersKey) {
					key = await getKey();
					headers.set('X-goog-api-key', key);
				}
			}
		}

		const url = processUrl(request);

		// 处理 body
		const getBody = handleBody(request.body);

		const method = request.method;

		// 重试次数
		for (let i = 1; i <= RETRY_COUNT; i++) {
			try {
				const geminiRes = await fetch(url.toString(), {
					method,
					headers,
					body: method === 'GET' ? undefined : getBody(),
				});

				if (!geminiRes.ok) throw geminiRes;
				// 成功响应
				if (key) {
					console.log(`成功响应（尝试 ${i}/${RETRY_COUNT}），使用的key: ${key}`);
					if (isNewKey) await insertKey(key);
				}
				return geminiRes;
			} catch (errorResponse) {
				if (!(errorResponse instanceof Response)) return new Response('', { status: 500 });
				if (isNewKey) return errorResponse;

				// 处理错误
				// 状态码官方文档：https://ai.google.dev/gemini-api/docs/troubleshooting?hl=zh-cn
				const status = errorResponse.status;

				const result = await handleRequestError[status](errorResponse, headers, i);
				if (result) return result;
				// 重试结束，直接返回错误
				if (i === RETRY_COUNT) return errorResponse;
			}
		}
		// 不会执行到这里，解决类型检查错误
		return new Response('', { status: 500 });
	},
} satisfies ExportedHandler<{ KV: KVNamespace; DB: D1Database }>;
