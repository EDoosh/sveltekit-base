/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/ban-ts-comment */
import { describe, it, expect } from 'vitest';
import { createI18n, type I18n } from './lib';
import { get, writable } from 'svelte/store';

type I18nKeys = {
	Empty: void;
	TranslationNotFound: [{ key: string }];
	Campfire: void;
	auth: {
		Login: void;
	};
	channel: {
		MessagePlaceholder: [{ channel: string }];
	};
};

const testlang: I18n<I18nKeys> = {
	Empty: '',
	TranslationNotFound: "TNF for '{key}'",
	Campfire: 'campfire',
	auth: {
		Login: 'Login'
	},
	channel: {
		MessagePlaceholder: 'Message {channel}'
	}
};

describe('i18n tests', () => {
	const languages = {
		en: testlang
	} as const;
	const language = writable<keyof typeof languages>('en');
	const proxy = get(createI18n<I18nKeys, typeof languages>(language, languages));

	it('allows valid root-level string accesses', () => {
		expect(String(proxy.Empty)).toBe('');
		expect(String(proxy.Campfire)).toBe('campfire');
	});

	it('allows toString', () => {
		expect(proxy.Empty.toString()).toBe('');
		expect(proxy.Campfire.toString()).toBe('campfire');
	});

	it('allows valid root-level function accesses', () => {
		expect(proxy.Empty()).toBe('');
		expect(proxy.Campfire()).toBe('campfire');
	});

	it('allows valid nested string accesses', () => {
		expect(String(proxy.auth.Login)).toBe('Login');
	});
	it('allows valid nested function accesses', () => {
		expect(proxy.auth.Login()).toBe('Login');
	});

	it('allows valid nested string with args accesses', () => {
		expect(String(proxy.channel.MessagePlaceholder)).toBe('Message {channel}');
	});
	it('allows valid nested function with args accesses', () => {
		expect(proxy.channel.MessagePlaceholder({ channel: '#hi' })).toBe('Message #hi');
	});

	it('allows invalid root-level string', () => {
		// @ts-ignore
		expect(String(proxy.thisDoesntExist)).toBe("TNF for 'thisDoesntExist?'");
	});
	it('allows invalid root-level function with args accesses', () => {
		// @ts-ignore
		expect(proxy.thisDoesntExist({ channel: '#hi' })).toBe("TNF for 'thisDoesntExist?'");
	});

	it('allows invalid nested string with args accesses', () => {
		// @ts-ignore
		expect(String(proxy.channel.thisDoesntExist)).toBe("TNF for 'channel.thisDoesntExist?'");
	});
	it('allows invalid nested function with args accesses', () => {
		// @ts-ignore
		expect(proxy.channel.thisDoesntExist({ channel: '#hi' })).toBe(
			"TNF for 'channel.thisDoesntExist?'"
		);
	});

	it('allows multi-invalid nested string', () => {
		// @ts-ignore
		expect(String(proxy.channel.thisDoesntExist.neitherDoesThis)).toBe(
			"TNF for 'channel.thisDoesntExist?.neitherDoesThis'"
		);
	});
	it('allows multi-invalid nested function with args accesses', () => {
		// @ts-ignore
		expect(proxy.channel.thisDoesntExist.neitherDoesThis({ channel: '#hi' })).toBe(
			"TNF for 'channel.thisDoesntExist?.neitherDoesThis'"
		);
	});

	it('allows nesting past valid string', () => {
		// @ts-ignore
		expect(String(proxy.channel.MessagePlaceholder.thisDoesntExist)).toBe(
			"TNF for 'channel.MessagePlaceholder!.thisDoesntExist'"
		);
	});
	it('allows nesting past valid string with args accesses', () => {
		// @ts-ignore
		expect(proxy.channel.MessagePlaceholder.thisDoesntExist({ channel: '#hi' })).toBe(
			"TNF for 'channel.MessagePlaceholder!.thisDoesntExist'"
		);
	});

	it('allows multi-nesting past valid string', () => {
		// @ts-ignore
		expect(String(proxy.channel.MessagePlaceholder.thisDoesntExist.neitherDoesThis)).toBe(
			"TNF for 'channel.MessagePlaceholder!.thisDoesntExist.neitherDoesThis'"
		);
	});
	it('allows multi-nesting past valid string with args accesses', () => {
		expect(
			// @ts-ignore
			proxy.channel.MessagePlaceholder.thisDoesntExist.neitherDoesThis({ channel: '#hi' })
		).toBe("TNF for 'channel.MessagePlaceholder!.thisDoesntExist.neitherDoesThis'");
	});

	it('allows for .get access on root level', () => {
		expect(proxy._get('auth.Login')).toBe('Login');
		expect(proxy._get(['channel.MessagePlaceholder', { channel: '#hi' }])).toBe('Message #hi');
	});
	it("has a .get that doesn't allow invalid accesses", () => {
		// @ts-ignore
		expect(proxy._get('this.doesntwork')).toBe("TNF for 'this?.doesntwork'");
		// @ts-ignore
		expect(proxy._get(['this.doesntwork', { channel: '#hi' }])).toBe("TNF for 'this?.doesntwork'");
		// @ts-ignore
		expect(proxy._get(['channel.MessagePlaceholder', { this: '#hi' }])).toBe('Message {channel}');
		// @ts-ignore
		expect(proxy._get('channel.MessagePlaceholder')).toBe('Message {channel}');
		// @ts-ignore
		expect(proxy._get('auth.Login.this.is.a.string')).toBe(
			"TNF for 'auth.Login!.this.is.a.string'"
		);
	});
});
