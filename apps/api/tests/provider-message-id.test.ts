import { describe, expect, it } from "vitest";

import {
  normalizeProviderMessageId,
  providerMessageIdCandidates,
} from "../src/mail/provider-message-id.js";

describe("providerMessageIdCandidates", () => {
  it("normalizes SMTP angle-bracket ids", () => {
    expect(normalizeProviderMessageId("<abc@send.stockix.cloud>")).toBe(
      "abc@send.stockix.cloud",
    );
  });

  it("dedupes webhook email_id and message_id variants", () => {
    expect(
      providerMessageIdCandidates(
        "c2532767-fff3-4b30-8f85-32cb2aa6271b",
        "<c2532767-fff3-4b30-8f85-32cb2aa6271b@send.stockix.cloud>",
      ),
    ).toEqual([
      "c2532767-fff3-4b30-8f85-32cb2aa6271b",
      "<c2532767-fff3-4b30-8f85-32cb2aa6271b@send.stockix.cloud>",
      "c2532767-fff3-4b30-8f85-32cb2aa6271b@send.stockix.cloud",
    ]);
  });
});
