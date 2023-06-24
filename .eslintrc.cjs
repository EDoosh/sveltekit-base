module.exports = {
	root: true,
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/recommended',
		'plugin:@typescript-eslint/recommended-requiring-type-checking',
		'plugin:svelte/recommended',
		'prettier'
	],
	parser: '@typescript-eslint/parser',
	plugins: ['@typescript-eslint'],
	parserOptions: {
		sourceType: 'module',
		ecmaVersion: 2020,
		extraFileExtensions: ['.svelte'],
		project: './tsconfig.eslint.json'
	},
	env: {
		browser: true,
		es2017: true,
		node: true
	},
	overrides: [
		{
			files: ['*.svelte'],
			parser: 'svelte-eslint-parser',
			parserOptions: {
				parser: '@typescript-eslint/parser'
			}
		}
	],
	rules: {
		quotes: [
			'error',
			'single',
			{
				avoidEscape: true
			}
		],
		indent: 'off',
		'comma-dangle': ['error', 'never'],
		'linebreak-style': ['error', 'unix'],
		semi: ['error', 'always'],
		'no-unused-vars': 'off',
		'@typescript-eslint/no-unused-vars': [
			'error',
			{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
		],
		// enforce boolean conditions
		'@typescript-eslint/strict-boolean-expressions': [
			'error',
			{
				allowString: false,
				allowNumber: false,
				allowNullableObject: false,
				allowNullableBoolean: false,
				allowNullableString: false,
				allowNullableNumber: false,
				allowNullableEnum: false,
				allowAny: false
			}
		],
		'@typescript-eslint/member-delimiter-style': 'warn',
		'@typescript-eslint/no-inferrable-types': [
			'warn',
			{
				ignoreParameters: true,
				ignoreProperties: true
			}
		]
	}
};
