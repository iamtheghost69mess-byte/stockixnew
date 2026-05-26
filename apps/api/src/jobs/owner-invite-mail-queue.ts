import { Queue, Worker } from "bullmq";
import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@repo/db/schema";
import { owners } from "@repo/db/schema";
import { z } from "zod";
import { infraConfig } from "@repo/config";

import { logLine } from "../lib/logger.js";
import { logAudit } from "../audit.js";
import { sendOwnerInviteEmail } from "../mail/send.js";
import { mailSendSucceeded } from "../mail/mailer.js";

const QUEUE_NAME = "owner-invite-mail";

export type OwnerInviteMailJob = {
  ownerId: string;
  to: string;
  name: string;
  role: string;
  inviteUrl: string;
  actorId?: string | null;
  source: "invite" | "resend";
};

export const OWNER_INVITE_MAIL_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: "exponential" as const,
    delay: 5000,
  },
};

let queue: Queue<OwnerInviteMailJob> | null = null;

function redisConnection() {
  const url = infraConfig.controlPlaneRedisUrl?.trim();
  if (!url) return null;
  return { url };
}

export function ownerInviteMailJobId(ownerId: string, inviteUrl: string): string {
  return `owner-invite:${ownerId}:${inviteUrl.slice(-12)}`;
}

export function isOwnerInviteMailQueueEnabled(): boolean {
  return Boolean(redisConnection());
}

export function getOwnerInviteMailQueue(): Queue<OwnerInviteMailJob> | null {
  const conn = redisConnection();
  if (!conn) return null;
  if (!queue) {
    queue = new Queue<OwnerInviteMailJob>(QUEUE_NAME, {
      connection: conn,
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: 200,
        ...OWNER_INVITE_MAIL_JOB_OPTIONS,
      },
    });
  }
  return queue;
}

export async function enqueueOwnerInviteMail(
  data: OwnerInviteMailJob,
): Promise<"queued" | "inline"> {
  const q = getOwnerInviteMailQueue();
  const jobId = ownerInviteMailJobId(data.ownerId, data.inviteUrl);
  if (q) {
    await q.add("send", data, { jobId, ...OWNER_INVITE_MAIL_JOB_OPTIONS });
    return "queued";
  }
  return "inline";
}

export async function runOwnerInviteMailJob(
  data: OwnerInviteMailJob,
): Promise<{ sent: boolean; reason?: string }> {
  let mailResult = await sendOwnerInviteEmail({
    to: data.to,
    name: data.name,
    role: data.role,
    inviteUrl: data.inviteUrl,
    ownerId: data.ownerId,
  });
  if (!mailSendSucceeded(mailResult)) {
    const reason =
      mailResult.status === "failed" ? mailResult.error : String(mailResult.status);
    return { sent: false, reason };
  }
  return { sent: true };
}

const actorIdSchema = z.string().uuid();

async function resolveInviteMailAuditActorId(
  db: PostgresJsDatabase<typeof schema>,
  data: OwnerInviteMailJob,
): Promise<string | null> {
  const fromJob = data.actorId?.trim();
  if (fromJob && actorIdSchema.safeParse(fromJob).success) return fromJob;

  const [row] = await db
    .select({ invitedById: owners.invitedById })
    .from(owners)
    .where(eq(owners.id, data.ownerId))
    .limit(1);
  const inviter = row?.invitedById?.trim();
  if (inviter && actorIdSchema.safeParse(inviter).success) return inviter;
  return null;
}

export async function auditOwnerInviteMailFailed(
  db: PostgresJsDatabase<typeof schema>,
  data: OwnerInviteMailJob,
  reason: string,
): Promise<void> {
  const actorId = await resolveInviteMailAuditActorId(db, data);
  if (!actorId) {
    console.error(
      "[owner-invite-mail] invite.email_failed audit skipped: no valid actorId",
      data.ownerId,
    );
    return;
  }
  await logAudit(db, {
    actorId,
    action: "invite.email_failed",
    targetOwnerId: data.ownerId,
    metadata: { email: data.to, reason, source: data.source },
  });
}

export function startOwnerInviteMailWorker(
  db: PostgresJsDatabase<typeof schema>,
  log: (message: string) => void = logLine,
): Worker<OwnerInviteMailJob> | null {
  const conn = redisConnection();
  if (!conn) return null;

  const worker = new Worker<OwnerInviteMailJob>(
    QUEUE_NAME,
    async (job) => {
      const result = await runOwnerInviteMailJob(job.data);
      if (!result.sent) {
        throw new Error(result.reason ?? "invite_mail_send_failed");
      }
      log(
        `[owner_invite_mail_sent] ownerId=${job.data.ownerId} source=${job.data.source}`,
      );
    },
    { connection: conn, concurrency: 2 },
  );

  worker.on("failed", (job, err) => {
    if (!job) return;
    const maxAttempts = job.opts.attempts ?? OWNER_INVITE_MAIL_JOB_OPTIONS.attempts;
    if (job.attemptsMade < maxAttempts) return;

    const reason = err instanceof Error ? err.message : String(err);
    void auditOwnerInviteMailFailed(db, job.data, reason).catch((auditErr) => {
      console.error(
        "[owner-invite-mail] audit failed:",
        auditErr instanceof Error ? auditErr.message : auditErr,
      );
    });
  });

  return worker;
}
