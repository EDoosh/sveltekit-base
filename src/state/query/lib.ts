/* eslint-disable @typescript-eslint/ban-ts-comment */
/** Queries are annoyingly complex things to get right.
 *
 *  - State handling: What happens when the data is loading or errors?
 *  - Caching: How do we cache the data? How long do we cache for?
 *  - Stale data: How long until data becomes stale (needs to be auto-refetched)
 *  - Refetching: How do we refetch data? Do we do it on mount? If the data is
 *      refetching do we show the old data or a loading?
 *  - Dependencies: How do we mark some data as dependent on other data?
 *  - Invalidation: E.g., we make a transaction and now the txn list and
 *      assets need to update. Do we clear the cache too and show loading?
 *      Do we immediately refetch the data or only if it's needed?
 *  - Storage: Do we need to store the data on-device somewhere?
 *
 *  The following implementation is partially inspired by Tanstack Query.
 *
 *  # Example
 *
 *  ```svelte
 *  <script lang="ts">
 *      import { useWallet, invalidateAndRefetch, invalidate, refetch, updateData, markStale } from '$/state';
 *
 *      let wallet = useWallet();
 *
 *      function onSpend() {
 *          // Mark the query stale and clear the cache. Immediately refetches the data.
 *          // Useful for something like clearing the wallet, where showing inaccurate
 *          // data is worse than showing a loading, and we always want available
 *          // wherever possible (thus the immediate refetch)
 *          invalidateAndRefetch('wallet');
 *
 *          // Mark the query stale and clear the cache.
 *          // Useful for something like a reports table, where showing inaccurate
 *          // data is worse than showing a loading, and isn't used much (the user
 *          // will be fine seeing a loading screen)
 *          invalidate('reports');
 *
 *          // Mark the query stale but keep the cache. Immediately refetches the data.
 *          // Useful for something like user info, where showing inaccurate data is
 *          // fine, but we want some data always available and so immediately refetch
 *          refetch('userInfo');
 *
 * 			// You can pair `refetch` with `updateData` to get an optimistic update.
 *          // An optimistic update makes an assumption to what the data will be.
 *  		// This is useful when you want to update the UI immediately, but also
 *  		// want to keep in-sync with the server in case something goes wrong
 *  		// with the request or your assumption was wrong.
 *  		updateData(['userInfo'], mutableUserInfo);
 *  		await updateUserInfo(accessToken, mutableUserInfo);
 *  		refetch(['userInfo']);
 *
 *          // Mark the query stale but keep the cache. Will refetch if in use.
 *          // Useful for something like a transactions list, where showing
 *          // old data is fine, but obviously we want to update it ASAP
 *          // if the user is looking at it and we don't want a loading symbol.
 *          markStale('transactions');
 *      }
 *
 *      let walletData;
 *      $: {
 *          if ($wallet.status === 'ok') {
 *              walletData = $wallet.data;
 *          } else if ($wallet.status === 'loading') {
 *              walletData = undefined;
 *          } else if ($wallet.status === 'error') {
 *              walletData = undefined;
 *              if ($wallet.error[0] === 'Server') {
 *                  console.warn('Server error');
 *              } else if ($wallet.error[0] === 'Network') {
 *                  console.warn('Network error');
 *              } else if ($wallet.error[0] === 'NoAssets') {
 *                  console.warn('No assets');
 *              } else {
 *                  console.warn('Unknown error');
 *              }
 *          }
 *      }
 *  </script>
 *
 *  {#if $wallet.status === 'loading'}
 *      <div>Loading...</div>
 *  {:else if $wallet.status === 'error'}
 *      {#if $wallet.error[0] === 'Server'}
 *          <div>Server error</div>
 *      {:else if $wallet.error[0] === 'Network'}
 *          <div>Network error</div>
 *      {:else if $wallet.error[0] === 'NoAssets'}
 *          <div>No assets</div>
 *      {:else}
 *          <div>Unknown error</div>
 *      {/if}
 *  {:else if $wallet.status === 'ok'}
 *      {#each $wallet.data as asset}
 *          <div>{asset.name}</div>
 *      {/each}
 *  {/if}
 *  ```
 */
const _HOVER_ME_TO_SEE_DOCUMENTATION = null;

import {
	get,
	writable,
	type Readable,
	type Unsubscriber,
	type Writable,
	readable,
	derived
} from 'svelte/store';
import deepEqual from 'fast-deep-equal';
import { browser } from '$app/environment';

export type QueryError = [string, unknown] | [string] | [string, QueryError];

/** The simplest form of the `Queries` type. */
export type QueriesType = Record<
	string | number,
	{
		subkeys?: (string | number)[];
		ok: unknown;
		err: QueryError;
	}
>;
// type _IfThisFailsThenQueriesIsWrong<
// 	_T extends QueriesType = Queries
// > = unknown;

/** All the query keys to their sub-keys. */
export type QuerySubkeys<Q extends QueriesType> = {
	[K in keyof Q]: Q[K] extends {
		subkeys: infer Keys extends (string | number)[];
	}
		? Keys
		: [];
};

export type QueryKeys<Q extends QueriesType> = {
	[K in keyof QuerySubkeys<Q>]: [K, ...QuerySubkeys<Q>[K]];
};
/** All the query keys with their sub-keys in an array. Basically how you'd use
 *  it in a `useQuery` call.
 */
export type QueryKeyArr<Q extends QueriesType> = QueryKeys<Q>[keyof QuerySubkeys<Q>];

export type QueryResult<Q extends QueriesType, Key extends keyof Q> =
	| QueryResultIdle
	| QueryResultLoading
	| QueryResultErr<Q, Key>
	| QueryResultOk<Q, Key>;
type QueryResultIdle = {
	/** The query is not fetching and does not intend to. This is
	 *  usually because a dependency is not loaded in yet.
	 *
	 *  For maintainers, this is because `Query.stoppedBy.size > 0`.
	 */
	status: 'idle';
};
type QueryResultLoading = {
	status: 'loading';
};
type QueryResultErr<Q extends QueriesType, Key extends keyof Q> = {
	status: 'err';
	/** The query is still in the `refetch` phase and this was a result
	 *  of `FetchResult`'s `returnError` being `true`. If this is set,
	 *  you can think of the status as being simultaneously `loading`
	 *  and `err`.
	 */
	isRefetching: boolean;
	err: Q[Key]['err'];
};
type QueryResultOk<Q extends QueriesType, Key extends keyof Q> = {
	status: 'ok';
	data: Q[Key]['ok'];
};

type WQueryMap<Q extends QueriesType> = Writable<QueryMap<Q>>;
type QueryMap<
	Q extends QueriesType,
	T extends QueriesType = Q,
	K extends keyof Q | never = never
> = {
	[Key in keyof T]?: T[Key] extends {
		subkeys: [infer NewKey extends string | number, ...infer Keys extends (string | number)[]];
		ok: infer Success;
		err: infer Error extends QueryError;
	}
		? QueryMap<
				Q,
				{
					[Key in NewKey]: {
						subkeys: Keys;
						ok: Success;
						err: Error;
					};
				},
				K extends never ? (Key extends keyof Q ? Key : never) : K
		  >
		: T[Key] extends {
				ok: infer _Success;
				err: infer _Error extends QueryError;
		  }
		? Writable<QueryMapItem<Q, K extends never ? (Key extends keyof Q ? Key : never) : K>>
		: never;
};
type QueryMapItem<Q extends QueriesType, Key extends keyof Q> = {
	/** The latest query result. */
	current: Readable<QueryResult<Q, Key>>;
	/** If a query is stale, it means it is outdated and should be re-fetched.
	 *
	 *  It is different to the cache. The cache is a copy of the data when it
	 *  was last valid and is typically used while the data is being refetched.
	 */
	stale: {
		/** When this query turns stale. `false` means the query is never
		 *  marked stale.
		 *
		 *  Set to `false` if `isStale` is `true`.
		 */
		turnsStaleAt: Date | false;
		/** How long after a fetch before this query become stale again.
		 *  `false` means the query is never marked stale.
		 *
		 *  Set to `false` if `isStale` is `true`.
		 */
		duration: number | false;
		/** Whether the query is currently stale. */
		isStale: boolean;
		/** The timeout to mark as stale. */
		timeout: NodeJS.Timeout | undefined;
	};
	/** Cached data is stored until it expires. The expiry time is usually
	 *  longer than the stale time. Cached data is always a successful response
	 *  from the server. The cache is typically used if the query is stale and is
	 *  being refetched, or if the query returns an error and some data
	 *  still needs to be present.
	 *
	 *  Never assume cached data is up-to-date. If you need up-to-date info,
	 *  use the `current` field.
	 */
	cache: {
		/** When this query expires. `false` means the cache never expires.
		 *
		 *  Set to `false` if `hasCached` is `false`.
		 */
		expiresAt: Date | false;
		/** How long after setting the cache before it expires. `false` means
		 *  the cache never expires.
		 *
		 *  Set to `false` if `hasCached` is `false`.
		 */
		duration: number | false;
		/** The timeout to clear the cache. */
		timeout: NodeJS.Timeout | undefined;
		/** Whether the query has cached data. */
		hasCached: boolean;
		/** The cached data.
		 *
		 *  This actually stores the last successful request and is not cleared
		 *  when the "cache is cleared". When we clear the cache we just set
		 *  `hasCached` to `false` and expect things to react to that.
		 */
		data: ['none'] | ['some', Q[Key]['ok']];
	};
	/** The Query instance. */
	class: Query<Q, Key>;
};

type FetchResult<Q extends QueriesType, Key extends keyof Q> =
	| FetchResultRetry<Q[Key]['err']>
	| FetchResultErr<Q[Key]['err']>
	| FetchResultOk<Q[Key]['ok']>;
type FetchResultRetry<Err> = [
	'retry',
	{
		err: Err;
		/** In the event you want to retry the call, but also want to show an
		 *  error (e.g., the user has no internet connection), set this to `true`.
		 *  The query state will be `['err', err]` instead of `['loading']`,
		 *  and also call `onRetry`.
		 *
		 *  If the first query fails and this is `true`, then the next refetch
		 *  fails with this to `false`, the query state will be `['loading']`.
		 */
		returnError: boolean;
	}
];
type FetchResultErr<Err> = ['err', Err];
type FetchResultOk<Ok> = ['ok', Ok];

export type RetryOrError<Err> = FetchResultRetry<Err> | FetchResultErr<Err>;

const QUERY_INIT = Symbol('QUERY_INIT');

type QueryDependency<Q extends QueriesType> =
	| QueryDepdendencyQuery<Q, keyof Q>
	| QueryDependencySubscription<unknown>;
type QueryDepdendencyQuery<Q extends QueriesType, Key extends keyof Q> = {
	/** The query key to depend on.
	 *
	 *  An important thing to note is that, if the dependency does not exist yet,
	 *  the query will be stopped until it is.
	 */
	key: QueryKeys<Q>[Key];
	/** Determines what happens when the dependency becomes stale.
	 *
	 *  - `nothing`: Nothing happens when this dependency becomes stale.
	 *  - `becomeStale`: This query becomes stale as well.
	 *  - `staleAndClear`: This query becomes stale and the cache is cleared.
	 */
	onStale?: () => 'nothing' | 'becomeStale' | 'staleAndClear';
	/** When the dependency query changes, this function is called to check if
	 *  this query is still valid, or should re-run.
	 *
	 *  - `nothing`: The query is still valid and should not re-run.
	 *  - `refetch`: The query is no longer valid and should refetch.
	 *  	Does not clear cache.
	 *  - `clearCacheAndRefetch`: The query is no longer valid and should
	 *  	refetch. Clears cache.
	 *  - `stop`: Stops the query. Clears the cache. Forbids refetching
	 * 		until this function returns something else. Useful for
	 * 		something like an auth store when a user logs out and you
	 * 		don't want to fetch data while the store is `undefined`.
	 */
	onChange: (
		last: QueryResult<Q, Key> | typeof QUERY_INIT,
		current: QueryResult<Q, Key>
	) => 'nothing' | 'refetch' | 'clearCacheAndRefetch' | 'stop';
};
type QueryDependencySubscription<T> = {
	/** The subscription to rely on. */
	subscription: Readable<T>;
	/** When the subscription changes, this function is called to check if
	 *  the query is still valid, or should re-run.
	 *
	 *  - `nothing`: The query is still valid and should not re-run.
	 *  	If the query is stopped, it will be re-started.
	 *  - `refetch`: The query is no longer valid and should refetch.
	 *  	Does not clear cache.
	 *  - `clearCacheAndRefetch`: The query is no longer valid and should
	 *  	refetch. Clears cache.
	 *  - `stop`: Stops the query. Clears the cache. Forbids refetching
	 * 		until this function returns something else. Useful for
	 * 		something like an auth store when a user logs out and you
	 * 		don't want to fetch data while the store is `undefined`.
	 */
	onChange: (
		last: T | typeof QUERY_INIT,
		current: T
	) => 'nothing' | 'refetch' | 'clearCacheAndRefetch' | 'stop';
};

type UseQueryOptions<Q extends QueriesType, Key extends keyof Q> = {
	/** The query keys that this query depends on.
	 *
	 *  If a dependency is not yet loaded in, the fetch will not be called.
	 */
	dependencies: QueryDependency<Q>[];

	/** Called to determine how long to wait before the fetch is re-attempted.
	 *
	 *  `count` is the number of times the fetch has been attempted since the
	 *  last successful call. Includes the most recent attempt
	 *  (i.e., `count` is 1 the first time `onRetry` is called).
	 *
	 *  Return `false` to stop retrying and return the error. Return a number to
	 *  wait that many milliseconds before retrying.
	 */
	onRetry: (count: number, err: Q[Key]['err']) => false | number;

	/** A stale query is one that should be fetched as soon as possible. */
	stale: {
		/** Whether to force the data to be stale when subscribed to if
		 *  nothing else is subscribed to it.
		 *
		 *  For example, the query is not set to go stale for another minute,
		 *  but is currently not subscribed by anything. If this is true, the
		 *  query will immediately become stale and refetch the moment it is
		 *  subscribed to by something.
		 */
		onSubscribeIfUnused: boolean;
		/** Called to determine how long until the query is stale.
		 *  Returns the number of milliseconds to wait before going stale, or
		 *  `false` if it should never go stale.
		 *
		 *  Returning `false` lasts until the query is successfully re-fetched.
		 *  This could be from a manual re-fetch or something like
		 *  `options.stale.onSubscribeIfUnused`.
		 *
		 *  Does not run if in the `retry` phase.
		 */
		duration: (last: QueryResult<Q, Key>) => number | false;
		/** Whether to refetch if the query is unused (i.e., nothing is
		 *  currently subscribed to the query).
		 *
		 *  With this false, the query will stay in a stale state until
		 */
		refetchIfUnused: boolean;
	};

	/** The cache stores successful fetches for a certain duration of time
	 *  after the query has been fetched. It is used while the query is
	 *  refetching and while it's stale.
	 */
	cache: {
		/** Called to determine how long to cache the data for. Returns the
		 *  number of milliseconds to wait before clearing the cache.
		 *  If this is `false`, the cache is never cleared.
		 */
		duration: (last: Q[Key]['ok']) => number | false;
	};
};

type RecursivePartial<T> = {
	[K in keyof T]?: T[K] extends Record<string, unknown> ? RecursivePartial<T[K]> : T[K];
};
type RecursiveExcludeUndefined<T extends object> = {
	[K in keyof T]: T[K] extends object
		? RecursiveExcludeUndefined<T[K]>
		: T[K] extends undefined
		? never
		: T[K];
};
function recursiveRemoveUndefined<T extends object>(
	obj: RecursivePartial<T>
): RecursiveExcludeUndefined<T> {
	for (const key in obj) {
		if (obj[key] === undefined) {
			delete obj[key];
		} else if (typeof obj[key] === 'object') {
			// @ts-ignore
			obj[key] = recursiveRemoveUndefined(obj[key]);
		}
	}
	return obj as RecursiveExcludeUndefined<T>;
}

export type CreateQueryMapResponse<Q extends QueriesType> = {
	queryMap: WQueryMap<Q>;

	/** Retrieves a query from its key if it's already in the `queryMap`, or
	 *  creates a new query and inserts it into the `queryMap`.
	 *
	 *  To just get a query without creating it if it doesn't exist, use
	 *  `getQuery` instead.
	 */
	useQuery<Key extends keyof Q>(
		key: QueryKeys<Q>[Key],
		fetch: () => Promise<FetchResult<Q, Key>>,
		options?: RecursivePartial<UseQueryOptions<Q, Key>>
	): Readable<QueryResult<Q, Key>>;

	/** Returns a query by its key if it's already been created. */
	getQuery<Key extends keyof Q>(key: QueryKeys<Q>[Key]): Writable<QueryMapItem<Q, Key>> | undefined;

	/** Mark the query stale and clear the cache. Immediately refetches the data,
	 *  even if not in use.
	 *
	 *  Useful for something like clearing the wallet, where showing inaccurate
	 *  data is worse than showing a loading, and we always want available
	 *  wherever possible (thus the immediate refetch)
	 */
	invalidateAndRefetch<Key extends keyof Q>(key: QueryKeys<Q>[Key]): void;

	/** Mark the query stale and clear the cache. Will refetch according to the
	 *  `stale` rules in the query options.
	 *
	 *  Useful for something like a reports table, where showing inaccurate data is
	 *  worse than showing a loading, and isn't used much (the user will be fine
	 *  seeing a loading screen)
	 */
	invalidate<Key extends keyof Q>(key: QueryKeys<Q>[Key]): void;

	/** Mark the query stale but keep the cache. Immediately refetches the data,
	 *  even if not in use.
	 *
	 *  Useful for something like user info, where showing inaccurate data is fine,
	 *  but we want some data always available and so immediately refetch.
	 */
	refetch<Key extends keyof Q>(key: QueryKeys<Q>[Key]): void;

	/** Mark the query stale but keep the cache. Will refetch according to the
	 *  `stale` rules in the query options.
	 *
	 *  Useful for something like a transactions list, where showing old data is
	 *  fine, but obviously we want to update it ASAP if the user is looking at it
	 *  and we don't want a loading symbol.
	 */
	markStale<Key extends keyof Q>(key: QueryKeys<Q>[Key]): void;

	/** Update the `data` and `cache` of a query with your own data.
	 *
	 *  Very useful for optimistic updates. Optimistic updates make an assumption
	 *  to what the data will be before the server has responded. This is useful
	 *  when you want to update the UI immediately, but also want to keep in-sync
	 *  with the server in case something goes wrong with the request or your
	 *  assumption was wrong.
	 *
	 *  # Example
	 *  ```ts
	 *  const userInfo = useUserInfo();
	 *  let mutableUserInfo = get(userInfo);
	 *
	 *  updateData(['userInfo'], mutableUserInfo);
	 *  await updateUserInfo(accessToken, mutableUserInfo);
	 *  refetch(['userInfo']);
	 *  ```
	 */
	updateData<Key extends keyof Q>(key: QueryKeys<Q>[Key], data: Q[Key]['ok']): void;
};

export function createQueryMap<Q extends QueriesType>(): CreateQueryMapResponse<Q> {
	const queryMap: WQueryMap<Q> = writable({});

	return {
		queryMap,
		useQuery(this: void, key, fetch, options = {}) {
			return useQuery(queryMap, key, fetch, options);
		},
		getQuery(this: void, key) {
			return getQuery(queryMap, key);
		},
		invalidateAndRefetch(this: void, key) {
			return invalidateAndRefetch(queryMap, key);
		},
		invalidate(this: void, key) {
			return invalidate(queryMap, key);
		},
		refetch(this: void, key) {
			return refetch(queryMap, key);
		},
		markStale(this: void, key) {
			return markStale(queryMap, key);
		},
		updateData(this: void, key, data) {
			return updateData(queryMap, key, data);
		}
	};
}

/** See `[CreateQueryMapResponse.useQuery]` for documentation. */
export function useQuery<Q extends QueriesType, Key extends keyof Q>(
	queryMap: WQueryMap<Q>,
	key: QueryKeys<Q>[Key],
	fetch: () => Promise<FetchResult<Q, Key>>,
	options?: RecursivePartial<UseQueryOptions<Q, Key>>
): Readable<QueryResult<Q, Key>> {
	const existingQuery = getQuery(queryMap, key);
	if (existingQuery !== undefined) {
		return get(existingQuery).current;
	}

	// Otherwise, create the query
	const query = new Query(queryMap, key, fetch, options).query;

	// And add it to the query map
	queryMap.update((queryMap) => {
		let item = queryMap;
		for (const subKey of key.slice(0, -1)) {
			// @ts-ignore
			item = item[subKey];
		}
		// @ts-ignore
		item[key[key.length - 1]] = query;
		return queryMap;
	});

	return get(query).current;
}

/** See `[CreateQueryMapResponse.getQuery]` for documentation. */
export function getQuery<Q extends QueriesType, Key extends keyof Q>(
	queryMap: WQueryMap<Q>,
	key: QueryKeys<Q>[Key]
): Writable<QueryMapItem<Q, Key>> | undefined {
	// Try find the query key in the query map
	let qmItem = get(queryMap);
	// Sorry for the ts-ignores, but this is safe **assuming key is valid**
	for (const subKey of key) {
		// @ts-ignore
		if (qmItem[subKey] === undefined) {
			// @ts-ignore
			qmItem[subKey] = {};
		}
		// @ts-ignore
		qmItem = qmItem[subKey];
	}

	// If the query is in the query map, return it
	if (!('subscribe' in qmItem)) return undefined;

	const item = qmItem as unknown as Writable<QueryMapItem<Q, Key>>;
	if ('current' in get(item)) {
		return item;
	}
	// Query does not exist
	return undefined;
}

class Query<Q extends QueriesType, Key extends keyof Q> {
	key: QueryKeys<Q>[Key];
	/** A request to fetch the data from the server. */
	fetch: () => Promise<FetchResult<Q, Key>>;
	/** The query is currently fetching. */
	isFetching: boolean = false;
	/** Query options. Cannot be mutated after creation. */
	options: UseQueryOptions<Q, Key> = {
		dependencies: [],
		onRetry(count: number): number | false {
			// By default, retry 2 more times immediately
			return count > 3 ? false : 0;
		},
		stale: {
			onSubscribeIfUnused: false,
			// By default, queries never go stale
			duration: () => false,
			refetchIfUnused: false
		},
		cache: {
			// By default, query caches never expire
			duration: () => false
		}
	};
	/** The query map this query belongs to. */
	queryMap: WQueryMap<Q>;

	/** Indexes of the dependencies stopping the query from running. */
	stoppedBy: Set<number> = new Set();
	/** The unsubscribe functions on dependencies. For cleanup. */
	dependencyUnsubscribers: Readable<Unsubscriber>[] = [];

	/** The query data itself. */
	query: Writable<QueryMapItem<Q, Key>>;
	/** Whether `query.current` is currently in use */
	dataInUse: Writable<boolean>;
	/** The latest result from the server.
	 *
	 *  This is different to `query.data` as this can also store errors and
	 *  doesn't use the cache.
	 */
	current: Writable<QueryResult<Q, Key>>;

	constructor(
		queryMap: WQueryMap<Q>,
		key: QueryKeys<Q>[Key],
		fetch: () => Promise<FetchResult<Q, Key>>,
		options: RecursivePartial<UseQueryOptions<Q, Key>> = {}
	) {
		trace(key, 'Creating query');
		this.queryMap = queryMap;
		this.key = key;
		this.fetch = fetch;
		this.options = {
			...this.options,
			...recursiveRemoveUndefined(options)
		} as UseQueryOptions<Q, Key>;

		this.dataInUse = writable(false);
		this.query = writable({
			current: writable(),
			stale: {
				turnsStaleAt: false,
				duration: false,
				timeout: undefined,
				isStale: true
			},
			cache: {
				expiresAt: false,
				duration: false,
				timeout: undefined,
				hasCached: false,
				data: ['none']
			},
			class: this
		});

		this.current = writable<QueryResult<Q, Key>>({ status: 'idle' });

		const currentWithCaching_: Readable<QueryResult<Q, Key>> = derived(
			[this.current, this.query],
			([current, query]) => {
				// idle => idle
				// !stale && cached && (ok || err) => current
				// !stale && cached && loading => cached
				// stale && cached => cached
				// stale && !cached => loading
				// !stale & !cached => ??? => loading
				if (current.status === 'idle') {
					return current;
				}

				if (!query.stale.isStale) {
					if (current.status === 'loading' && query.cache.data[0] === 'some') {
						return {
							status: 'ok',
							data: query.cache.data[1]
						} satisfies QueryResult<Q, Key>;
					}

					return current;
				}

				if (query.cache.hasCached && query.cache.data[0] === 'some') {
					return {
						status: 'ok',
						data: query.cache.data[1]
					} satisfies QueryResult<Q, Key>;
				}

				return {
					status: 'loading'
				} satisfies QueryResult<Q, Key>;
			},
			{ status: 'loading' }
		);

		let subscribers = 0;
		const currentWithCaching: Readable<QueryResult<Q, Key>> = {
			subscribe: (run, invalidate) => {
				subscribers++;
				this.trace('New subscriber');
				if (subscribers === 1) {
					this.trace('First subscriber');
					this.dataInUse.set(true);

					if (this.options.stale.onSubscribeIfUnused) {
						this.trace('First subscriber, stale on subscribe');
						this.markStale();
					} else if (get(this.query).stale.isStale) {
						this.trace('First subscriber, currently stale');
						this.refetch();
					}
				}

				const unsubscribe = currentWithCaching_.subscribe(run, invalidate);
				return () => {
					unsubscribe();
					subscribers--;
					this.trace('Removed subscriber');
					if (subscribers === 0) {
						this.trace('Last subscriber');
						this.dataInUse.set(false);
					}
				};
			}
		};

		this.query.update((q) => {
			q.current = currentWithCaching;
			return q;
		});

		this.subscribeToDependencies();
		void this.fetcher();
	}

	async fetcher() {
		if (!browser) {
			return;
		}

		if (!get(this.query).stale.isStale) {
			this.trace('Fetcher called but not stale');
			return;
		}

		if (this.isFetching) {
			this.trace('Fetcher called while already fetching');
			return;
		}

		this.trace('Fetching');
		this.isFetching = true;
		this.current.set({ status: 'loading' });
		let count = 0;
		// eslint-disable-next-line no-constant-condition
		while (true) {
			if (this.stoppedBy.size > 0) {
				this.trace('Stopped by', this.stoppedBy);
				this.current.set({ status: 'idle' });
				this.isFetching = false;
				return;
			}

			const result = await this.fetch();
			this.trace('Fetch result:', result);

			if (result[0] === 'retry') {
				count++;

				const { err, returnError } = result[1];
				const waitDuration = this.options.onRetry(count, err);

				if (waitDuration === false) {
					this.trace('Retry wait duration false, returning error');
					this.current.set({ status: 'err', isRefetching: false, err });
					break;
				}

				if (returnError) {
					// Lets assume in cache we have successful data from the
					// last fetch. Now this one comes along and overwrites
					// the `current` field on the query, and our UI shows an
					// error before re-fetching. Now suppose on the refetch
					// it returns `returnError: false`. `this.current` is now
					// `loading`, but since there's cached data the
					// `current` field on the query is gonna be the old cached
					// data. We've just gone back in time!
					// Clear the cache so this doesn't happen.
					this.trace('Retry returning error');
					this.clearCache();
					this.current.set({ status: 'err', isRefetching: true, err });
				} else {
					this.trace('Retry requested a loading');
					this.current.set({ status: 'loading' });
				}
				this.trace('Retry waiting for', waitDuration, 'ms');
				await new Promise((res) => setTimeout(res, waitDuration));
				this.trace('Retrying...');
			} else if (result[0] === 'err') {
				this.current.set({ status: 'err', isRefetching: false, err: result[1] });
				break;
			} else {
				this.current.set({ status: 'ok', data: result[1] });
				break;
			}
		}

		const current = get(this.current);
		if (current.status === 'idle' || current.status === 'loading') {
			this.trace('`this.current` in fetcher is idle or loading');
			throw new Error("`this.current` after `Query.fetcher` shouldn't be idle or loading");
		}

		// Update the cache if we have a successful response
		if (current.status === 'ok') {
			this.setData(current.data);
		} else {
			// Clear the cache if we have an error
			this.clearCache();
		}
		this.isFetching = false;
		this.trace('Fetcher finished');
	}

	/** Mark the query stale and clear the cache. Will refetch according to the
	 *  `stale` rules in the query options, unless `forceRefetch` is true in
	 *  which case it will refetch immediately.
	 *
	 *  See `[invalidate]` or `[invalidateAndRefetch]` for more info.
	 */
	clearCache(forceRefetch: boolean = false) {
		this.trace('Clearing cache, forceRefetch:', forceRefetch);
		this.query.update((clearCacheQuery) => {
			clearTimeout(clearCacheQuery.cache.timeout);
			clearCacheQuery.cache.timeout = undefined;
			clearCacheQuery.cache.hasCached = false;
			clearCacheQuery.cache.duration = false;
			clearCacheQuery.cache.expiresAt = false;

			return clearCacheQuery;
		});

		this.markStale(forceRefetch);
	}

	/** Update the `data` and `cache` of a query with your own data.
	 *
	 *  See `[updateData]` for more info.
	 */
	setData(data: Q[Key]['ok']) {
		this.trace('setData called with', data);
		this.current.set({ status: 'ok', data });

		this.resetStaleTimer({ status: 'ok', data });
		this.query.update((updateCacheQuery) => {
			updateCacheQuery.cache.data = ['some', data];
			updateCacheQuery.cache.hasCached = true;

			clearTimeout(updateCacheQuery.cache.timeout);

			const duration = this.options.cache.duration(data);
			this.trace('setData duration of', duration);
			updateCacheQuery.cache.duration = duration;
			if (duration === false) {
				updateCacheQuery.cache.expiresAt = false;
				// Never clear so never have to unset the timeout!
				updateCacheQuery.cache.timeout = undefined;
			} else {
				updateCacheQuery.cache.expiresAt = new Date(Date.now() + duration);
				const timeout = setTimeout(() => this.clearCache(), duration);
				updateCacheQuery.cache.timeout = timeout;
			}

			return updateCacheQuery;
		});
	}

	resetStaleTimer(current: QueryResultErr<Q, Key> | QueryResultOk<Q, Key>) {
		this.trace('Resetting stale timer with data', current);
		this.query.update((updateStaleQuery) => {
			clearTimeout(updateStaleQuery.stale.timeout);

			const duration = this.options.stale.duration(current);
			updateStaleQuery.stale.duration = duration;
			this.trace('Resetting stale timer with duration', duration);
			if (duration === false) {
				updateStaleQuery.stale.turnsStaleAt = false;
				updateStaleQuery.stale.timeout = undefined;
			} else {
				updateStaleQuery.stale.turnsStaleAt = new Date(Date.now() + duration);
				const timeout = setTimeout(() => this.markStale(), duration);
				updateStaleQuery.stale.timeout = timeout;
			}

			return updateStaleQuery;
		});
	}

	/** Mark the query stale but keep the cache. Will refetch according to the
	 *  `stale` rules in the query options, unless `forceRefetch` is true in
	 *  which case it will refetch immediately.
	 *
	 *  See `[markStale]` or `[refetch]` for more info.
	 */
	markStale(forceRefetch: boolean = false) {
		this.trace('Marking stale, forceRefetch', forceRefetch);
		this.query.update((markStaleQuery) => {
			clearTimeout(markStaleQuery.stale.timeout);
			markStaleQuery.stale.timeout = undefined;
			markStaleQuery.stale.isStale = true;
			markStaleQuery.stale.duration = false;
			markStaleQuery.stale.turnsStaleAt = false;

			return markStaleQuery;
		});

		const dataInUse = get(this.dataInUse);
		const refetchIfUnused = this.options.stale.refetchIfUnused;
		this.trace('Is refetching after marking stale? ', { forceRefetch, dataInUse, refetchIfUnused });
		if (forceRefetch || dataInUse || refetchIfUnused) {
			void this.fetcher();
		}
	}

	/** Subscribe to the dependencies listed in `options` and store their
	 *  unsubscribers in `Query.dependencyUnsubscibers`.
	 *
	 *  Also registers events onto them, detecting changes and reacting on
	 *  this query accordingly.
	 */
	private subscribeToDependencies() {
		this.trace('Subscribing to dependencies');
		this.dependencyUnsubscribers = this.options.dependencies.map((dependency, i) => {
			if ('subscription' in dependency) {
				return this.addDependencySubscription(dependency, i);
			} else {
				return this.addDependencyQuery(dependency, i);
			}
		});
	}

	private addDependencySubscription<T>(dependency: QueryDependencySubscription<T>, i: number) {
		let last: Parameters<QueryDependencySubscription<T>['onChange']>[0] = QUERY_INIT;

		return readable(
			dependency.subscription.subscribe((current) => {
				if (deepEqual(last, current)) {
					return;
				}

				const result = dependency.onChange(last, current);
				this.trace('Dependency', i, 'onChange with', last, current, 'returned', result);
				if (result === 'nothing') {
					this.stoppedBy.delete(i);
				} else if (result === 'refetch') {
					this.stoppedBy.delete(i);
					this.refetch();
				} else if (result === 'clearCacheAndRefetch') {
					this.stoppedBy.delete(i);
					this.invalidateAndRefetch();
				} else if (result === 'stop') {
					this.stoppedBy.add(i);
					this.invalidateAndRefetch();
				}

				last = current;
			})
		);
	}

	private addDependencyQuery<K extends keyof Q>(
		dependency: QueryDepdendencyQuery<Q, K>,
		i: number
	) {
		let last: QueryResult<Q, K> | typeof QUERY_INIT = QUERY_INIT;
		let lastWasStale = false;

		const unsub = writable<Unsubscriber>();
		// We want to wait for the dependency to exist if it doesn't already.
		// This means we want to unsubscribe from either the query map or the
		// dependency query when the unsubscribe runs.
		void new Promise<Writable<QueryMapItem<Q, K>>>((res) => {
			this.stoppedBy.add(i);
			unsub.set(
				this.queryMap.subscribe(() => {
					const depQuery = getQuery(this.queryMap, dependency.key);
					if (depQuery === undefined) return;
					res(depQuery);
				})
			);
		}).then((depQuery) => {
			unsub.set(
				depQuery.subscribe((query) => {
					const current = get(query.current);

					if (query.stale.isStale && !lastWasStale) {
						const result = dependency.onStale?.();
						if (result === 'becomeStale') {
							this.markStale();
						} else if (result === 'staleAndClear') {
							this.clearCache();
						}
					}

					lastWasStale = query.stale.isStale;

					if (deepEqual(last, current)) {
						return;
					}

					// @ts-ignore
					const result = dependency.onChange(last, current);
					if (result === 'nothing') {
						this.stoppedBy.delete(i);
					} else if (result === 'refetch') {
						this.stoppedBy.delete(i);
						this.refetch();
					} else if (result === 'clearCacheAndRefetch') {
						this.stoppedBy.delete(i);
						this.invalidateAndRefetch();
					} else if (result === 'stop') {
						this.stoppedBy.add(i);
						this.invalidateAndRefetch();
					}

					last = current;
				})
			);
		});

		return unsub;
	}

	/** Mark the query stale and clear the cache. Immediately refetches the data,
	 *  even if not in use.
	 *
	 *  See `[invalidateAndRefetch]` for more info.
	 */
	invalidateAndRefetch() {
		this.clearCache(true);
	}

	/** Mark the query stale but keep the cache. Immediately refetches the data,
	 *  even if not in use.
	 *
	 *  See `[refetch]` for more info.
	 */
	refetch() {
		this.markStale(true);
	}

	trace(...args: unknown[]) {
		trace(this.key, ...args);
	}
}

/** See `[CreateQueryMapResponse.invalidateAndRefetch]` for documentation. */
export function invalidateAndRefetch<Q extends QueriesType, Key extends keyof Q>(
	queryMap: WQueryMap<Q>,
	key: QueryKeys<Q>[Key]
) {
	const query = getQuery(queryMap, key);
	if (query === undefined) return;
	get(query).class.invalidateAndRefetch();
}

/** See `[CreateQueryMapResponse.invalidate]` for documentation. */
export function invalidate<Q extends QueriesType, Key extends keyof Q>(
	queryMap: WQueryMap<Q>,
	key: QueryKeys<Q>[Key]
) {
	const query = getQuery(queryMap, key);
	if (query === undefined) return;
	get(query).class.clearCache();
}

/** See `[CreateQueryMapResponse.refetch]` for documentation. */
export function refetch<Q extends QueriesType, Key extends keyof Q>(
	queryMap: WQueryMap<Q>,
	key: QueryKeys<Q>[Key]
) {
	const query = getQuery(queryMap, key);
	if (query === undefined) return;
	get(query).class.refetch();
}

/** See `[CreateQueryMapResponse.markStale]` for documentation. */
export function markStale<Q extends QueriesType, Key extends keyof Q>(
	queryMap: WQueryMap<Q>,
	key: QueryKeys<Q>[Key]
) {
	const query = getQuery(queryMap, key);
	if (query === undefined) return;
	get(query).class.markStale();
}

/** See `[CreateQueryMapResponse.updateData]` for documentation. */
export function updateData<Q extends QueriesType, Key extends keyof Q>(
	queryMap: WQueryMap<Q>,
	key: QueryKeys<Q>[Key],
	data: Q[Key]['ok']
) {
	const query = getQuery(queryMap, key);
	if (query === undefined) return;
	get(query).class.setData(data);
}

/** Log information to the console. */
export function trace<Q extends QueriesType, Key extends keyof Q>(
	keys: QueryKeys<Q>[Key],
	...args: unknown[]
) {
	console.log(`%c${keys.join('::')}%c `, 'color: #596064', 'color: white', ...args);
}

export type Invariant = ['Invariant', string];
/** A little helper function to declare something cannot happen. */
export function invariant(message: string): ['err', Invariant] {
	return ['err', ['Invariant', message]];
}
