import { initDB } from './db/init';
import { insertKey, updateKeytoNotAlive, getKey, getKeyCount, findKey } from './repository';

const RETRY_COUNT = 5;
const GEMINI_API_HOSTNAME = 'generativelanguage.googleapis.com';

// 处理预检请求
function handleOptions(method: string): Response | null {
	if (method === 'OPTIONS') {
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

function handleBody(body: ReadableStream | null): (() => ReadableStream) | (() => undefined) {
	if (!body) return () => undefined;
	let count = 0;
	return function () {
		if (count >= RETRY_COUNT) return body!;
		count++;
		const teedRequestBody = body!.tee();
		body = teedRequestBody[1];
		return teedRequestBody[0];
	};
}

async function getMessage(response: Response): Promise<string | undefined> {
	const cloneResponse = response.clone();
	const contentType = cloneResponse.headers.get('content-type');
	if (!contentType?.includes('application/json') && !contentType?.includes('text/event-stream'))
		return;
	const body = await cloneResponse.json<{ error: { message: string } }>();
	return body.error.message;
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const method = request.method;
		const optionsResponse = handleOptions(method);
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
		let getBody = handleBody(request.body);

		// 重试次数
		for (let i = 1; i <= RETRY_COUNT; i++) {
			try {
				const body = getBody();

				const geminiRes = await fetch(url.toString(), {
					method,
					headers,
					body: method === 'GET' ? undefined : body,
				});

				if (!geminiRes.ok) throw geminiRes;
				// 成功响应
				if (key) {
					console.log(`成功响应 (尝试 ${i}/${RETRY_COUNT})，使用的key: ${key}`);
					if (isNewKey) await insertKey(key);
				}
				return geminiRes;
			} catch (errorResponse) {
				if (!(errorResponse instanceof Response))
					return new Response('', {
						status: 500,
					});
				if (isNewKey) return errorResponse;

				// 处理错误
				// 状态码官方文档：https://ai.google.dev/gemini-api/docs/troubleshooting?hl=zh-cn
				const status = errorResponse.status;

				if (status === 429) {
					console.warn(`频率过高，(尝试 ${i}/${RETRY_COUNT})，使用的key: ${key}`);
					if (i === RETRY_COUNT) return errorResponse;
					key = await getKey();
					headers.set('X-goog-api-key', key);
					continue;
				}

				if (status === 403) {
					const message = await getMessage(errorResponse);
					if (!message?.includes('has been suspended')) return errorResponse;
					console.warn(`权限错误 (尝试 ${i}/${RETRY_COUNT})，使用的key: ${key}`);
					if (i === RETRY_COUNT) return errorResponse;
					[key] = await Promise.all([getKey(), updateKeytoNotAlive(key!)]);
					headers.set('X-goog-api-key', key);
					continue;
				}

				if (status === 503) {
					const message = await getMessage(errorResponse);
					if (!message?.includes('The model is overloaded')) return errorResponse;
					console.warn(`模型繁忙 (尝试 ${i}/${RETRY_COUNT})，使用的key: ${key}`);
					if (i === RETRY_COUNT) return errorResponse;
					continue;
				}

				if (status !== 400) {
					const message = await getMessage(errorResponse);
					if (message) console.error(`错误响应 (尝试 ${i}/${RETRY_COUNT})`, message);
					return errorResponse;
				}

				// status 400 携带的 key 错误
				const message = await getMessage(errorResponse);

				if (message?.includes('location is not supported')) {
					console.warn(`地区限制，(尝试 ${i}/${RETRY_COUNT})，使用的key: ${key}`);
					return errorResponse;
				}

				// API key expired key过期
				if (message?.includes('API key expired')) {
					console.warn(`key失效，(尝试 ${i}/${RETRY_COUNT})，使用的key: ${key}`);
					[key] = await Promise.all([getKey(), updateKeytoNotAlive(key!)]);
					headers.set('X-goog-api-key', key);
				}
				// API key not valid key无效
				if (message?.includes('API key not valid')) {
					console.warn(`key无效，(尝试 ${i}/${RETRY_COUNT})，使用的key: ${key}`);
					[key] = await Promise.all([getKey(), updateKeytoNotAlive(key!)]);
					headers.set('X-goog-api-key', key);
				}
				// API Key not found key不存在
				if (message?.includes('API Key not found')) {
					console.warn(`key不存在，(尝试 ${i}/${RETRY_COUNT})，使用的key: ${key}`);
					[key] = await Promise.all([getKey(), updateKeytoNotAlive(key!)]);
					headers.set('X-goog-api-key', key);
				}

				// 重试结束，直接返回错误
				if (i === RETRY_COUNT) return errorResponse;
			}
		}
		// 不会执行到这里，解决类型检查错误
		return new Response('', { status: 500 });
	},
} satisfies ExportedHandler<{ KV: KVNamespace; DB: D1Database }>;
