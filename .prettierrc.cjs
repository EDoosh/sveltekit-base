module.exports = {
	useTabs: true,
	singleQuote: false,
	trailingComma: "none",
	printWidth: 80,
	plugins: [
		"prettier-plugin-svelte",
		// require('prettier-plugin-organize-imports'),
		"prettier-plugin-tailwindcss"
	],
	htmlWhitespaceSensitivity: "ignore"
	// "overrides": [{ "files": "*.svelte", "options": { "parser": "svelte" } }]
};
