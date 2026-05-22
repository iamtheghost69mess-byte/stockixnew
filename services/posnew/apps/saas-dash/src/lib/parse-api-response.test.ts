import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseApiResponse } from "@/lib/parse-api-response";

describe("parseApiResponse", () => {
	const schema = z.object({ ok: z.boolean() });

	it("returns parsed data when valid", () => {
		expect(parseApiResponse(schema, { ok: true }, "test")).toEqual({
			ok: true,
		});
	});

	it("throws PlatformHttpError-like object when invalid", () => {
		try {
			parseApiResponse(schema, { ok: "nope" }, "widget");
			expect.fail("expected throw");
		} catch (e) {
			expect(e).toMatchObject({
				status: 502,
				message: expect.stringMatching(/widget/i),
			});
		}
	});
});
