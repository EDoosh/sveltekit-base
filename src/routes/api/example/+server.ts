import type { RequestHandler } from "./$types";
import { ok, err, type ErrorMap } from "..";
import z from "zod";

export type Errors = ErrorMap<{
	"JSON:ParseError": never;
	"JSON:ValidationError": z.ZodError<{
		text: string;
	}>;
}>;

const POST_BODY = z.object({
	text: z.string().min(1).max(60)
});
export const POST = (async ({ request }) => {
	let json: unknown;
	try {
		json = await request.json();
	} catch (e) {
		err("JSON:ParseError");
	}

	const parseResult = POST_BODY.safeParse(json);
	if (!parseResult.success) {
		err("JSON:ValidationError", parseResult.error);
	}

	let text = parseResult.data.text;
	// Turn the text into leet speak
	text = text
		.replace(/a/gi, "4")
		.replace(/e/gi, "3")
		.replace(/o/gi, "0")
		.replace(/s/gi, "5")
		.replace(/t/gi, "7");

	return ok(text);
}) satisfies RequestHandler;
