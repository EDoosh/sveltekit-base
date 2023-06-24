import { writable } from 'svelte/store';
import { en } from '$/i18n/lang/en';
import { browser } from '$app/environment';
import * as lib from './lib';

/** The translation keys for the app.
 *
 *  Groups start with a lowercase, and are used to group related translations
 *  together (e.g. the auth group contains all translations related to
 *  authentication and account).
 *
 *  Keys are PascalCase, and are the actual translations. They should be
 *  relatively descriptive, and if it's not obvious, provide a description of
 *  where it is found in the app.
 *
 *  If a translation key has no parameters, type it as `[Name]: void`.
 *  Otherwise, type it as `[Name]: [{ param1: string, param2: number, ... }]`.
 *  The `[]` are important to differentiate it from a group.
 */
export type I18nKeys = {
	/** An empty string. Leave blank. */
	Empty: void;
	/** The translation key attempting to be translated could not be found.
	 *
	 *  `{key}` - The translation key that couldn't be found.
	 */
	TranslationNotFound: [{ key: string }];
};

export type I18n = lib.I18n<I18nKeys>;
export type I18nKey = lib.I18nKey<I18nKeys>;

const LANGUAGES = {
	en
} as const;
export type Language = keyof typeof LANGUAGES;
export const language = writable<Language>('en');

if (browser) {
	window.addEventListener('keydown', (event) => {
		if (event.altKey && event.key === 'l') {
			language.update((val) => {
				const keys = Object.keys(LANGUAGES) as Language[];
				const idx = keys.indexOf(val);
				const next = keys[(idx + 1) % keys.length];
				return next;
			});
		}
	});
}

export const i18n = lib.createI18n<I18nKeys, typeof LANGUAGES>(language, LANGUAGES);
