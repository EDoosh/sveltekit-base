import { error } from '@sveltejs/kit';

export type ApiResponse<T, E extends [string, unknown][] = [[string, never]]> =
	| ApiSuccess<T>
	| ApiError<E>;
export interface ApiSuccess<T> {
	error: false;
	data: T;
}
export type ApiError<E extends (string | [string, unknown])[]> = {
	error: true;
} & {
	[K in keyof E]: E[K] extends string
		? { code: E[K]; data: never }
		: { code: E[K][0]; data: E[K][1] };
}[number];

export type ErrorMap<E extends Record<string, unknown>> = E;

export const HttpCode100 = {
	Continue: 100,
	SwitchingProtocols: 101,
	Processing: 102,
	EarlyHints: 103
} as const;
export const HttpCode200 = {
	OK: 200,
	Created: 201,
	Accepted: 202,
	NonAuthoritativeInformation: 203,
	NoContent: 204,
	ResetContent: 205,
	PartialContent: 206,
	MultiStatus: 207,
	AlreadyReported: 208,
	IMUsed: 226
} as const;
export const HttpCode300 = {
	MultipleChoices: 300,
	MovedPermanently: 301,
	Found: 302,
	SeeOther: 303,
	NotModified: 304,
	UseProxy: 305,
	TemporaryRedirect: 307,
	PermanentRedirect: 308
} as const;
export const HttpCode400 = {
	BadRequest: 400,
	Unauthorized: 401,
	PaymentRequired: 402,
	Forbidden: 403,
	NotFound: 404,
	MethodNotAllowed: 405,
	NotAcceptable: 406,
	ProxyAuthenticationRequired: 407,
	RequestTimeout: 408,
	Conflict: 409,
	Gone: 410,
	LengthRequired: 411,
	PreconditionFailed: 412,
	PayloadTooLarge: 413,
	URITooLong: 414,
	UnsupportedMediaType: 415,
	RangeNotSatisfiable: 416,
	ExpectationFailed: 417,
	ImATeapot: 418,
	MisdirectedRequest: 421,
	UnprocessableEntity: 422,
	Locked: 423,
	FailedDependency: 424,
	UpgradeRequired: 426,
	PreconditionRequired: 428,
	TooManyRequests: 429,
	RequestHeaderFieldsTooLarge: 431,
	UnavailableForLegalReasons: 451
} as const;
export const HttpCode500 = {
	InternalServerError: 500,
	NotImplemented: 501,
	BadGateway: 502,
	ServiceUnavailable: 503,
	GatewayTimeout: 504,
	HTTPVersionNotSupported: 505,
	VariantAlsoNegotiates: 506,
	InsufficientStorage: 507,
	LoopDetected: 508,
	NotExtended: 510,
	NetworkAuthenticationRequired: 511
} as const;

export const HttpCode = {
	...HttpCode100,
	...HttpCode200,
	...HttpCode300,
	...HttpCode400,
	...HttpCode500
} as const;

export type Error =
	| (typeof HttpCode400)[keyof typeof HttpCode400]
	| (typeof HttpCode500)[keyof typeof HttpCode500];

/** Returns a JSON error with a custom error code.
 *
 *  An error code should be a short, PascalCase string that describes the error.
 */
export function err(code: string): never;
/** Returns a JSON error with a custom error code and some data associated with
 *  the error.
 *
 *  An error code should be a short, PascalCase string that describes the error.
 */
export function err(code: string, data: unknown): never;
/** Returns a JSON error with the given HTTP status code and a custom error code.
 *
 *  The HTTP status code should be a valid status code in the 400 or 500 range.
 *
 *  An error code should be a short, PascalCase string that describes the error.
 */
export function err(httpCode: Error, code: string): never;
/** Returns a JSON error with the given HTTP status code, a custom error code
 *  and some data associated with the error.
 *
 *  The HTTP status code should be a valid status code in the 400 or 500 range.
 *
 *  An error code should be a short, PascalCase string that describes the error.
 */
export function err(httpCode: Error, code: string, data: unknown): never;
export function err(code_httpCode: string | Error, data_code?: unknown | string, data?: unknown) {
	if (typeof code_httpCode === 'string') return err(HttpCode.BadRequest, code_httpCode, data_code);

	throw error(code_httpCode, {
		error: true,
		code: data_code,
		data
	} as unknown as string);
}

const NONE = Symbol('no value');
/** Return a basic 200 OK success from an endpoint. */
export function ok(): Response;
/** Return a 200 OK success from an endpoint with some data attached. */
export function ok<T>(data: T extends undefined ? never : T): Response;
/** Return a JSON success with an HTTP status code and some data attached. */
export function ok(httpCode: (typeof HttpCode)[keyof typeof HttpCode], data: unknown): Response;
export function ok(
	data_httpCode: unknown | (typeof HttpCode)[keyof typeof HttpCode] = HttpCode.OK,
	data: unknown = NONE
) {
	// neither data nor httpcode provided.
	if (data_httpCode === undefined) return ok(HttpCode.OK, undefined);
	// data provided, but no httpcode.
	if (data === NONE || typeof data_httpCode !== 'number') return ok(HttpCode.OK, data_httpCode);

	// data and httpcode provided
	return new Response(
		JSON.stringify({
			error: false,
			data
		}),
		{
			status: data_httpCode,
			headers: {
				'Content-Type': 'application/json'
			}
		}
	);
}
