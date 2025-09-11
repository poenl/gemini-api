import { initDB } from './db/init';
import { insertKey, deleteKey, getKey, getKeyCount, findKey } from './repository';

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
					newHeaders.set('X-goog-api-key', key);
				}
			}
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
				// 成功响应
				console.log(`成功响应 (尝试 ${i}/${RETRY_COUNT})，使用的key: ${key}`);
				if (isNewKey) await insertKey(key!);
				return geminiRes;
			} catch (error) {
				const errorResponse = error as Response;
				if (isNewKey) return errorResponse;
				// 处理错误
				// 状态码官方文档：https://ai.google.dev/gemini-api/docs/troubleshooting?hl=zh-cn
				const status = errorResponse.status;

				if (status === 429) {
					console.warn(`请求频率过高，使用的key: ${key}`);
					if (i === RETRY_COUNT) return errorResponse;
					key = await getKey();
					newHeaders.set('X-goog-api-key', key);
					continue;
				}

				if (status === 403) {
					const body = await errorResponse.json<{ error: { message: string } }>();
					const message = body.error.message;
					if (!message.includes('has been suspended')) return errorResponse;
					console.warn(`配额不足 (尝试 ${i}/${RETRY_COUNT})，使用的key: ${key}`);
					if (i === RETRY_COUNT) return errorResponse;
					key = await getKey();
					newHeaders.set('X-goog-api-key', key);
					continue;
				}

				if (status !== 400) {
					if (!errorResponse.headers.get('content-type')?.includes('application/json')) return errorResponse;
					const body = await errorResponse.json<{ error: { message: string } }>();
					const message = body.error.message;
					console.error(`错误响应 (尝试 ${i}/${RETRY_COUNT})`, message);
					return errorResponse;
				}

				// status 400 携带的 key 错误
				const cloneResponse = errorResponse.clone();
				const body = await cloneResponse.json<{ error: { message: string } }>();
				const message = body.error.message;

				if (message.includes('location is not supported')) {
					console.warn(`地区限制，使用的key: ${key}`);
					return errorResponse;
				}

				// API key expired key过期
				if (message.includes('API key expired')) {
					console.warn(`key失效，(尝试 ${i}/${RETRY_COUNT})，使用的key: ${key}`);
					[key] = await Promise.all([getKey(), deleteKey(key!)]);
					newHeaders.set('X-goog-api-key', key);
				}

				// 重试结束，直接返回错误
				if (i === RETRY_COUNT) return errorResponse;
			}
		}
		// 不会执行到这里，解决类型检查错误
		return new Response('', { status: 500 });
	},
} satisfies ExportedHandler<{ KV: KVNamespace; DB: D1Database }>;
