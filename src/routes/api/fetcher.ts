export type IntoErrEnum<T extends Record<string, unknown>> = {
	[C in keyof T]: T[C] extends never ? ['err', C] : ['err', C, T[C]];
}[keyof T];

export type FetchStatus<Ok, Err extends Record<string, unknown>> =
	| ['idle']
	| ['loading']
	| FetcherResponse<Ok, Err>;

export type FetcherResponse<Ok, Err extends Record<string, unknown>> =
	| (Ok extends never ? ['ok'] : ['ok', Ok])
	| ['err', 'FETCH:NetworkError' | 'FETCH:NotJson' | 'FETCH:UnexpectedType' | 'FETCH:NoErrorCode']
	| IntoErrEnum<Err>;

export async function fetcher<Ok, Err extends Record<string, unknown>>(
	name: string,
	fetch: () => Promise<Response>
): Promise<FetcherResponse<Ok, Err>> {
	let response: Response;
	try {
		response = await fetch();
	} catch (e) {
		console.warn('FETCH:NetworkError', e);
		return ['err', 'FETCH:NetworkError'];
	}

	const text = await response.text();
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch (e) {
		console.warn(`Could not parse server response from \`${name}\`:\nResponse\n    ${text}`);
		return ['err', 'FETCH:NotJson'];
	}

	if (
		typeof json !== 'object' ||
		json === null ||
		!('error' in json) ||
		typeof json.error !== 'boolean'
	) {
		return ['err', 'FETCH:UnexpectedType'];
	}

	if (json.error) {
		if (!('code' in json) || typeof json.code !== 'string') {
			return ['err', 'FETCH:NoErrorCode'];
		}

		if ('data' in json) {
			return ['err', json.code, json.data] as IntoErrEnum<Err>;
		}
		return ['err', json.code] as IntoErrEnum<Err>;
	} else {
		if ('data' in json) {
			return ['ok', json.data] as FetcherResponse<Ok, Err>;
		}
		return ['ok'] as FetcherResponse<Ok, Err>;
	}
}
