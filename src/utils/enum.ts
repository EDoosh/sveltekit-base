/** A nestable Rust-like enum. See `IntoEnum<T>` for a nicer way to
 *  construct this type.
 */
export type Enum = [string, unknown] | [string] | [string, Enum];
/** Converts a type like
 *  ```
 *  const Errors = {
 *    Fetch: {
 *      Network: never;
 *      NotJson: ErrorData<string>;
 *    };
 *    Server: {
 *      EndpointNotFound: never;
 *    };
 *  }
 *  ```
 *  into
 *  ```
 *  ["Fetch", ["Network"] | ["NotJson", string]] | ["Server", ["EndpointNotFound"]]
 *  ```
 *
 *  This end result is similar to how Rust enums work, and I personally believe
 *  it's a good way of doing error handling. It allows for error 'categories'
 *  (e.g. fetch errors are grouped) in a way TypeScript can understand.
 */
export type IntoEnum<T extends Record<string, unknown>> = {
	[K in keyof T]: T[K] extends never
		? [K]
		: T[K] extends EnumData<infer V>
		? [K, V]
		: T[K] extends Record<string, unknown>
		? [K, IntoEnum<T[K]>]
		: never;
}[keyof T];
/** If an enum requires a type as additional data (e.g., a string),
 *  wrap it in this so `IntoEnum<T>` can handle it correctly.
 */
export type EnumData<T> = {
	ThisIsSomeObscureKeyThatNoErrorCodeWillEverUseOrElseItWillEndTheWorld: T;
};
