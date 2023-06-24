module.exports = {
	useTabs: true,
	singleQuote: true,
	trailingComma: 'none',
	printWidth: 100,
	plugins: [
		require('prettier-plugin-svelte'),
		// require('prettier-plugin-organize-imports'),
		require('prettier-plugin-tailwindcss')
	],
	pluginSearchDirs: false,
	htmlWhitespaceSensitivity: 'ignore'
	// "overrides": [{ "files": "*.svelte", "options": { "parser": "svelte" } }]
};
