import { GEMINI_API_HOSTNAME, RETRY_COUNT } from './comfig';

// 处理预检请求
export function handleOptions(request: Request): Response | null {
	const method = request.method;
	const headers = request.headers;
	const requestMethod = headers.get('Access-Control-Request-Method');
	const requestHeaders = headers.get('Access-Control-Request-Headers');
	if (method === 'OPTIONS') {
		return new Response(null, {
			status: 204,
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': requestMethod ?? '',
				'Access-Control-Allow-Headers': requestHeaders ?? '',
				'Access-Control-Max-Age': '31536000',
			},
		});
	}
	return null;
}

// 处理 URL
export function processUrl(request: Request): URL {
	const url = new URL(request.url);
	url.hostname = GEMINI_API_HOSTNAME;
	url.port = '';
	url.protocol = 'https:';
	return url;
}

// 处理 headers
export function processHeaders(request: Request): Headers {
	const headers = new Headers(request.headers);
	headers.delete('cf');
	headers.set('host', GEMINI_API_HOSTNAME);
	return headers;
}

export function handleBody(
	body: ReadableStream | null
): (() => ReadableStream) | (() => undefined) {
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
