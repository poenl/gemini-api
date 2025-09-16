import { RETRY_COUNT } from './comfig';
import { getKey, updateKeytoNotAlive } from './repository';

interface HandleRequestError {
	[key: number | string]: (
		errorResponse: Response,
		headers: Headers,
		currentRetryCount: number
	) => Promise<Response | void>;
}

async function getMessage(response: Response): Promise<string | undefined> {
	const cloneResponse = response.clone();
	const contentType = cloneResponse.headers.get('content-type');
	if (!contentType?.includes('application/json') && !contentType?.includes('text/event-stream'))
		return;
	const body = await cloneResponse.json<{ error: { message: string } }>();
	return body.error.message;
}

const handleRequestError: HandleRequestError = {
	429: async (errorResponse, headers, currentRetryCount) => {
		let key = headers.get('X-goog-api-key');
		console.warn(`频率过高（尝试 ${currentRetryCount}/${RETRY_COUNT}），使用的key: ${key}`);
		key = await getKey();
		headers.set('X-goog-api-key', key);
	},

	403: async (errorResponse, headers, currentRetryCount) => {
		let key = headers.get('X-goog-api-key');
		const message = await getMessage(errorResponse);
		if (!message?.includes('has been suspended')) return errorResponse;
		console.warn(`权限错误（尝试 ${currentRetryCount}/${RETRY_COUNT}），使用的key: ${key}`);
		[key] = await Promise.all([getKey(), updateKeytoNotAlive(key!)]);
		headers.set('X-goog-api-key', key);
	},

	503: async (errorResponse, headers, currentRetryCount) => {
		let key = headers.get('X-goog-api-key');
		const message = await getMessage(errorResponse);
		if (!message?.includes('The model is overloaded')) return errorResponse;
		console.warn(`模型繁忙（尝试 ${currentRetryCount}/${RETRY_COUNT}），使用的key: ${key}`);
	},

	400: async (errorResponse, headers, currentRetryCount) => {
		let key = headers.get('X-goog-api-key');
		const message = await getMessage(errorResponse);
		// 地区限制
		if (message?.includes('location is not supported')) {
			console.warn(`地区限制（尝试 ${currentRetryCount}/${RETRY_COUNT}），使用的key: ${key}`);
			return errorResponse;
		}
		// API key expired key过期
		if (message?.includes('API key expired')) {
			console.warn(`key失效（尝试 ${currentRetryCount}/${RETRY_COUNT}），使用的key: ${key}`);
			[key] = await Promise.all([getKey(), updateKeytoNotAlive(key!)]);
			headers.set('X-goog-api-key', key);
		}
		// API key not valid key无效
		if (message?.includes('API key not valid')) {
			console.warn(`key无效（尝试 ${currentRetryCount}/${RETRY_COUNT}），使用的key: ${key}`);
			[key] = await Promise.all([getKey(), updateKeytoNotAlive(key!)]);
			headers.set('X-goog-api-key', key);
		}
		// API Key not found key不存在
		if (message?.includes('API Key not found')) {
			console.warn(`key不存在（尝试 ${currentRetryCount}/${RETRY_COUNT}），使用的key: ${key}`);
			[key] = await Promise.all([getKey(), updateKeytoNotAlive(key!)]);
			headers.set('X-goog-api-key', key);
		}
	},
	// 其他错误
	default: async (errorResponse, headers, currentRetryCount) => {
		const message = await getMessage(errorResponse);
		if (message) console.error(`错误响应（尝试 ${currentRetryCount}/${RETRY_COUNT}）`, message);
		return errorResponse;
	},
};

export default new Proxy(handleRequestError, {
	get: (target, prop) => {
		if (Object.keys(handleRequestError).includes(prop as string)) {
			return Reflect.get(target, prop);
		} else {
			return Reflect.get(target, 'default');
		}
	},
});
