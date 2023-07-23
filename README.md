# SvelteKit base

This is a base template for [SvelteKit](https://kit.svelte.dev) projects.
It includes:

- [Typescript](https://www.typescriptlang.org)
- [TailwindCSS](https://tailwindcss.com)
- Code formatting with [Prettier](https://prettier.io) and [ESLint](https://eslint.org) (+ [TS](https://typescript-eslint.io/))
- Testing with [Vitest](https://vitest.dev/) for unit tests and [Playwright](https://playwright.dev/) for e2e tests
- [Internationalization](./src/i18n/lib.ts)
- A TanStack-inspired [query library](./src/state/query/lib.ts)

# Usage

Clone the repo and install the dependencies

```bash
git clone https://github.com/EDoosh/sveltekit-base.git my-new-app
cd my-new-app
yarn install
```

Edit the `package.json` file to change the name and description of your app.
Then, replace this README with something a little more helpful!

If anything is confusing or doesn't work, please open an issue.
Additionally, since a lot of this is code ported over from other projects, there may be some leftover code, in which case also please open an issue.
Some of this code is a little unstable or untested.

# Todo

- An example app with a few pages and components
- Possibly add Prisma to the stack
