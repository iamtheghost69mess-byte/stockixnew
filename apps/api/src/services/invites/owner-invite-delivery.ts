import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import { isMailConfigured } from "@repo/config";

import {
  enqueueOwnerInviteMail,
  isOwnerInviteMailQueueEnabled,
  runOwnerInviteMailJob,
  type OwnerInviteMailJob,
} from "../../jobs/owner-invite-mail-queue.js";
import { sendOwnerInviteEmail } from "../../mail/send.js";
import { mailSendSucceeded } from "../../mail/mailer.js";

export type OwnerInviteDeliveryPayload = Omit<OwnerInviteMailJob, "source"> & {
  source: "invite" | "resend";
};

export type OwnerInviteDeliveryResult =
  | { mode: "queued"; mailConfigured: boolean }
  | {
      mode: "inline";
      emailSent: boolean;
      mailConfigured: boolean;
    };

async function deliverOwnerInviteInline(
  payload: OwnerInviteDeliveryPayload,
): Promise<Extract<OwnerInviteDeliveryResult, { mode: "inline" }>> {
  const mailConfigured = isMailConfigured();
  let mailResult = await sendOwnerInviteEmail({
    to: payload.to,
    name: payload.name,
    role: payload.role,
    inviteUrl: payload.inviteUrl,
    ownerId: payload.ownerId,
  });
  if (!mailSendSucceeded(mailResult)) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    mailResult = await sendOwnerInviteEmail({
      to: payload.to,
      name: payload.name,
      role: payload.role,
      inviteUrl: payload.inviteUrl,
      ownerId: payload.ownerId,
    });
  }
  const emailSent = mailSendSucceeded(mailResult);
  return {
    mode: "inline",
    emailSent,
    mailConfigured,
  };
}

export async function deliverOwnerInviteEmail(
  _db: PostgresJsDatabase<typeof schema>,
  payload: OwnerInviteDeliveryPayload,
): Promise<OwnerInviteDeliveryResult> {
  const mailConfigured = isMailConfigured();

  if (isOwnerInviteMailQueueEnabled() && mailConfigured) {
    await enqueueOwnerInviteMail(payload);
    return { mode: "queued", mailConfigured: true };
  }

  return deliverOwnerInviteInline(payload);
}

/** Inline send used when queue is disabled (tests / direct invocation). */
export async function deliverOwnerInviteEmailInline(
  payload: OwnerInviteDeliveryPayload,
): Promise<Extract<OwnerInviteDeliveryResult, { mode: "inline" }>> {
  return deliverOwnerInviteInline(payload);
}

/** Process one queued job inline (tests). */
export { runOwnerInviteMailJob };
