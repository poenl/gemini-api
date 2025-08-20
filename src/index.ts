import { initDB } from './db/init';
import { insertKey, deleteKey, getKey, getKeyCount } from './repository';

const RETRY_COUNT = 5;
const GEMINI_API_HOSTNAME = 'generativelanguage.googleapis.com';

// 处理预检请求
function handleOptions(request: Request): Response | null {
	if (request.method === 'OPTIONS') {
		return new Response(null, {
			status: 204,
			headers: {
				'Access-Control-Allow-Origin': '*',
			},
		});
	}
	return null;
}

// 处理 URL
function processUrl(request: Request): URL {
	const url = new URL(request.url);
	url.hostname = GEMINI_API_HOSTNAME;
	url.port = '';
	url.protocol = 'https:';
	return url;
}

// 处理 headers
function processHeaders(request: Request): Headers {
	const headers = new Headers(request.headers);
	headers.delete('cf');
	headers.set('host', GEMINI_API_HOSTNAME);
	return headers;
}

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

		const newHeaders = processHeaders(request);

		let key;
		const headersKey = request.headers.get('X-goog-api-key');
		if (headersKey !== null) {
			key = await insertKey(headersKey);
			newHeaders.set('X-goog-api-key', key);
		}

		const url = processUrl(request);

		// 处理 body
		let teedRequestBody: [ReadableStream, ReadableStream] | undefined;
		if (request.body) {
			teedRequestBody = request.body.tee();
		}

		// 重试次数
		for (let i = 1; i <= RETRY_COUNT; i++) {
			try {
				const currentBody = teedRequestBody ? (i !== RETRY_COUNT ? teedRequestBody[0] : teedRequestBody[1]) : undefined;
				if (teedRequestBody && i < RETRY_COUNT) {
					teedRequestBody = teedRequestBody[1].tee();
				}

				const geminiRes = await fetch(url.toString(), {
					method: request.method,
					headers: newHeaders,
					body: currentBody,
				});
				if (!geminiRes.ok) throw geminiRes;
				console.log(`成功响应 (尝试 ${i}/${RETRY_COUNT})，使用的key: ${key}`);
				return geminiRes;
			} catch (error) {
				const res = error as Response;
				// 处理错误
				// 状态码官方文档：https://ai.google.dev/gemini-api/docs/troubleshooting?hl=zh-cn
				const status = res.status;

				if (status !== 400) return res;
				if (headersKey === key) {
					if (key) await deleteKey(key);
					return res;
				}
				const resClone = res.clone();
				const body = await resClone.json<{ error: { message: string } }>();

				if (body.error.message.includes('location is not supported')) {
					console.warn(`地区限制，使用的key: ${key}`);
					return res;
				}
				console.warn(`key 失效，(尝试 ${i}/${RETRY_COUNT})，使用的key: ${key}`);
				[key] = await Promise.all([getKey(), deleteKey(key!)]);
				newHeaders.set('X-goog-api-key', key);

				// 重试结束，直接返回错误
				if (i === RETRY_COUNT) return res;
			}
		}
		// 不会执行到这里，解决类型检查错误
		return new Response('', { status: 500 });
	},
} satisfies ExportedHandler<{ KV: KVNamespace; DB: D1Database }>;
