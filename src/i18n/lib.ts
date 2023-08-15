/** A Svelte internationalisation library.
 *
 *  Define new translation keys in `I18nKeys` and define their translations
 *  in the `i18n/lang` folder. If it's not obvious, provide a description of
 *  where they are found in the app.
 *
 *  # Example
 *
 *  ```ts
 *  // i18n/index.ts
 *  import { writable } from 'svelte/store';
 *  import * as lib from './lib';
 *  import { en } from 'i18n/lang/en';
 *  import { es } from 'i18n/lang/es';
 *  import { fr } from 'i18n/lang/fr';
 *
 *  export type I18nKeys = {
 *  	TranslationNotFound: [{ key: string }];
 * 		CompanyName: void;
 *  	auth: {
 *  		Login: void;
 *  		Register: void;
 *  		Username: [{ displayName: string; discriminator: number }];
 * 		};
 *  };
 *
 *  export type I18n = lib.I18n<I18nKeys>;
 *  const LANGUAGES = {
 *  	en,
 *  	es,
 * 		fr
 *  } as const;
 *  export type Language = keyof typeof LANGUAGES;
 *  export const language = writable<Language>('en');
 *
 *  export const i18n = lib.createI18n<I18nKeys, typeof LANGUAGES>(language, LANGUAGES);
 *
 *  // i18n/lang/en.ts
 *  import type { I18n } from '../';
 *  export const en: I18n = {
 *  	TranslationNotFound: "Translation not found for {key}",
 *  	CompanyName: "My Company",
 *  	auth: {
 *  		Login: "Login",
 * 			Register: "Register",
 *   		Username: "@{displayName}#{discriminator}"
 *  	}
 *  };
 *
 *  // components/login.svelte
 *  <script lang="ts">
 *  	import { i18n } from '../';
 *  </script>
 *
 *  <h4>{$i18n.CompanyName}</h4>
 *  <h1>{$i18n.auth.Login}</h1>
 *  <h2>{$i18n.auth.Username({ displayName: "dooshii", discriminator: 9599 })}</h2>
 *
 *  <!-- Assuming your language is English, it will look like this
 * 		<h4>My Company</h4>
 *  	<h1>Login</h1>
 *  	<h2>@dooshii#9599</h2>
 *  If you updated the language to something else, it would update immediately.
 *  -->
 *  ```
 */

import type { Readable } from "svelte/store";

type Get<Keys extends I18nKeyFormat> = {
	_get: (key: I18nKey<Keys>) => string;
};

export function createI18n<
	const Keys extends I18nKeyFormat,
	const Langs extends Record<string, I18n<Keys>>
>(
	activeLanguage: Readable<keyof Langs>,
	languages: Langs
): Readable<NestedFn<Keys> & Get<Keys>> {
	return {
		subscribe: (run, invalidate) =>
			activeLanguage.subscribe((lang) => {
				run(proxyGen(languages[lang], [], languages[lang]));
				// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
			}, invalidate as any)
	};
}

export type I18nKeyFormat = I18nKeyFormatRecursive & {
	/** The translation key was not found. This is required for every language.
	 *
	 *  - A key like `a.b?.c` or `a.b?` means that `b` was not found in the `a` group.
	 *  - A key like `a.b!.c` means that `b` was a string and thus can not have any children.
	 *  - A key like `a.b#` means that `b` was found in the `a` group, but it was a group and not a string.
	 */
	TranslationNotFound: [{ key: string }];
};
type I18nKeyFormatRecursive = {
	[key: string]: I18nKeyFormatRecursive | [Record<string, unknown>] | void;
};

export type I18n<Keys extends I18nKeyFormat> = NestedStringyKeys<Keys>;
type NestedStringyKeys<T extends Record<string, unknown>> = {
	[K in keyof T]: T[K] extends Record<string, unknown>
		? NestedStringyKeys<T[K]>
		: string;
};
export type NestedFn<T extends Record<string, unknown>> = {
	[K in keyof T]: T[K] extends Record<string, unknown>
		? NestedFn<T[K]>
		: T[K] extends [Record<string, unknown>]
		? (data: T[K][0]) => string
		: string & (() => string);
};

/** A single key for the I18n object. Use dot-notation to access keys.
 *  If arguments are needed for something, the value is a tuple.
 *
 *  For example, to access the `ServerError` key in the `errors` group,
 *  it would simply be `"errors.ServerError"`. To access the `UncaughtError` key
 *  in the `errors` group, it would be `["errors.UncaughtError", { "error": "myError" }]`.
 */
export type I18nKey<Keys extends I18nKeyFormat> = DotNotationObject<Keys>;
type DotNotationObject<
	T extends Record<string, unknown>,
	Prefix extends string = ""
> = {
	[K in keyof T]-?: K extends string
		? T[K] extends Record<string, unknown>
			? DotNotationObject<T[K], `${Prefix}${K}.`>
			: T[K] extends [Record<string, unknown>]
			? [`${Prefix}${K}`, T[K][0]]
			: `${Prefix}${K}`
		: never;
}[keyof T];

type RecursiveRecordString = {
	[K in string]: RecursiveRecordString | string;
};
type RecursiveRecordFn =
	| ((args: Record<string, unknown>) => string)
	| {
			[K in string]: RecursiveRecordFn;
	  };
export function proxyGen<Keys extends I18nKeyFormat>(
	lang: I18n<Keys>,
	path: string[],
	content: RecursiveRecordString
): NestedFn<Keys> & Get<Keys> {
	const proxy = new Proxy(content, {
		get: (target, prop): RecursiveRecordFn => {
			// I apologize for the eslint rules here, but it's safe.
			// This is the key problem with using proxies.
			if (path.length === 0 && prop === "_get") {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-return
				return ((key: I18nKey<Keys>) => {
					let k = key as string;
					if (Array.isArray(key)) {
						k = key[0] as string;
					}

					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					let currentProxy: Record<string, any> = proxy;
					for (const p of k.split(".")) {
						// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
						currentProxy = currentProxy[p];
					}
					// eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
					return (currentProxy as any)(Array.isArray(key) ? key[1] : {});
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
				}) as any;
			}

			const currentPath = [...path, String(prop)];
			const notFound = () =>
				(lang.TranslationNotFound as string).replace(
					/\{key\}/g,
					currentPath.join(".") + "#"
				);
			if (!(prop in target)) {
				return proxyNotFound(lang, currentPath);
			}

			// We just asserted it exists.
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const val = target[prop as string]!;
			if (typeof val === "object") {
				return Object.assign(
					proxyGen(lang, currentPath, val),
					{
						toString: notFound
					},
					() => notFound()
				);
			}
			return proxyFound(lang, currentPath, val);
		}
	}) as unknown as NestedFn<Keys> & Get<Keys>;
	return proxy;
}

function proxyNotFound<Keys extends I18nKeyFormat>(
	lang: I18n<Keys>,
	foundPath: string[],
	extraPath: string[] = []
): (args?: Record<string, unknown>) => string {
	const notFound = (lang.TranslationNotFound as string).replace(
		/\{key\}/g,
		foundPath.join(".") +
			"?" +
			(extraPath.length > 0 ? "." + extraPath.join(".") : "")
	);

	return new Proxy(
		Object.assign(() => notFound, {}),
		{
			get: (_target, prop) => {
				if (prop === Symbol.toPrimitive || prop === "toString") {
					return () => notFound;
				}
				return proxyNotFound(lang, foundPath, [...extraPath, String(prop)]);
			}
		}
	);
}

function proxyFound<Keys extends I18nKeyFormat>(
	lang: I18n<Keys>,
	foundPath: string[],
	val: string,
	extraPath: string[] = []
): (args?: Record<string, unknown>) => string {
	const notFound = (lang.TranslationNotFound as string).replace(
		/\{key\}/g,
		foundPath.join(".") +
			"!" +
			(extraPath.length > 0 ? "." + extraPath.join(".") : "")
	);

	const str = extraPath.length === 0 ? val : notFound;
	const fn = (args: Record<string, unknown> = {}) => {
		if (extraPath.length !== 0) return notFound;

		for (const [key, value] of Object.entries(args)) {
			val = val.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
		}
		return val;
	};

	return new Proxy(Object.assign(fn, {}), {
		get: (_target, prop) => {
			if (prop === Symbol.toPrimitive || prop === "toString") {
				return () => str;
			}
			return proxyFound(lang, foundPath, val, [...extraPath, String(prop)]);
		}
	});
}
