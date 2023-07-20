<script lang="ts">
	import type { Errors } from "./api/example/+server";
	import { fetcher, type FetchStatus } from "./api/fetcher";

	let result: FetchStatus<string, Errors> = ['idle'];
	let text = '';
	
	async function getLeetSpeak() {
		result = ['loading'];
		result = await fetcher<string, Errors>('example', () => fetch('/api/example', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				text
			})
		}));
	}
	$: {
		text;
		result = ['idle'];
	}
</script>

<div class="grid h-screen w-screen place-items-center bg-gray-950">
	<div class="flex max-w-2xl flex-col items-center rounded-xl bg-gray-900 px-12 py-8 shadow-lg">
		<h1 class="mb-8 text-6xl font-bold text-gray-200">Hello world!</h1>
		<p class="text-center text-xl text-gray-300">
			This is the <span class="font-bold text-orange-400">SvelteKit</span>
			<span class="text-slate-400">+</span>
			<span class="font-bold text-blue-300">TypeScript</span>
			<span class="text-slate-400">+</span>
			<span class="font-bold text-sky-400">TailwindCSS</span>
			<span class="text-slate-400">+</span>
			<span class="font-bold text-violet-400">Vitest</span>
			<span class="text-slate-400">+</span>
			<span class="font-bold text-lime-400">Playwright</span>
			<span class="text-slate-400">+</span>
			<span class="font-bold text-indigo-400">ESLint (TS)</span>
			<span class="text-slate-400">+</span>
			<span class="font-bold text-rose-400">Prettier</span>
			stack.
		</p>
		<p class="mt-2 self-end text-sm text-slate-500">Have fun coming up with a name for that one.</p>
		<p class="mt-6 text-center text-xl text-gray-300">It supports...</p>
		<ul class="mt-2 list-disc text-lg text-gray-300">
			<li>Internationalisation</li>
			<li class="ml-4">Moderately-robust API's</li>
			<li class="ml-8 line-through">Receiving content from those endpoints in a safe way</li>
			<li class="ml-12">...and anything else you may need.</li>
		</ul>

		<div class="flex flex-row gap-8 mt-8">
			<input type="text" class="grow px-4 py-2 rounded-md bg-gray-800 text-gray-300 focus:outline-none active:outline-none focus:ring-2 focus:ring-blue-300" bind:value={text} />
			
			<button class="px-8 py-2 rounded-md bg-gray-800 text-gray-300 hover:bg-gray-600 transition-colors duration-75 focus:outline-none active:outline-none focus:ring-2 focus:ring-blue-300" on:click={getLeetSpeak}>
				Leet-ify!
			</button>
		</div>

		
		{#if result[0] === 'loading'}
			<p class="mt-8 text-center text-gray-300">Loading...</p>
		{:else if result[0] === 'ok'}
			<p class="mt-8 text-center text-gray-300">Result: {result[1]}</p>
		{:else if result[0] === 'err'}
			<p class="mt-8 text-center text-gray-300">Error: {result[1]}{result[2] ? " | " + JSON.stringify(result[2]) : ""}</p>
		{/if}
	</div>
</div>
