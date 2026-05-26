import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendOwnerInviteEmailMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ status: "sent", messageId: "msg-1" }),
);
const logAuditMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const queueAddMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../src/mail/send.js", () => ({
  sendOwnerInviteEmail: sendOwnerInviteEmailMock,
}));

vi.mock("../src/audit.js", () => ({
  logAudit: logAuditMock,
}));

vi.mock("bullmq", () => ({
  Queue: class MockQueue {
    add = queueAddMock;
  },
  Worker: class MockWorker {
    on = vi.fn();
  },
}));

import {
  OWNER_INVITE_MAIL_JOB_OPTIONS,
  auditOwnerInviteMailFailed,
  enqueueOwnerInviteMail,
  ownerInviteMailJobId,
  runOwnerInviteMailJob,
} from "../src/jobs/owner-invite-mail-queue.js";
import {
  deliverOwnerInviteEmailInline,
} from "../src/services/invites/owner-invite-delivery.js";

const sampleJob = {
  ownerId: "11111111-1111-1111-1111-111111111111",
  to: "invitee@example.com",
  name: "Invitee",
  role: "read_only",
  inviteUrl: "http://localhost:3000/accept-invite?token=abc123456789",
  actorId: "22222222-2222-2222-2222-222222222222",
  source: "invite" as const,
};

describe("owner invite mail queue", () => {
  const originalRedis = process.env.CONTROL_PLANE_REDIS_URL;

  beforeEach(() => {
    sendOwnerInviteEmailMock.mockClear();
    logAuditMock.mockClear();
    queueAddMock.mockClear();
    sendOwnerInviteEmailMock.mockResolvedValue({ status: "sent", messageId: "msg-1" });
  });

  afterEach(() => {
    if (originalRedis === undefined) {
      delete process.env.CONTROL_PLANE_REDIS_URL;
    } else {
      process.env.CONTROL_PLANE_REDIS_URL = originalRedis;
    }
    vi.resetModules();
  });

  it("ownerInviteMailJobId uses owner id and invite url suffix", () => {
    expect(ownerInviteMailJobId(sampleJob.ownerId, sampleJob.inviteUrl)).toBe(
      `owner-invite:${sampleJob.ownerId}:abc123456789`,
    );
  });

  it("enqueueOwnerInviteMail adds job with retry options when Redis is set", async () => {
    process.env.CONTROL_PLANE_REDIS_URL = "redis://localhost:6379/0";
    vi.resetModules();
    const mod = await import("../src/jobs/owner-invite-mail-queue.js");

    const mode = await mod.enqueueOwnerInviteMail(sampleJob);
    expect(mode).toBe("queued");
    expect(queueAddMock).toHaveBeenCalledOnce();
    expect(queueAddMock).toHaveBeenCalledWith(
      "send",
      sampleJob,
      expect.objectContaining({
        jobId: mod.ownerInviteMailJobId(sampleJob.ownerId, sampleJob.inviteUrl),
        attempts: OWNER_INVITE_MAIL_JOB_OPTIONS.attempts,
        backoff: OWNER_INVITE_MAIL_JOB_OPTIONS.backoff,
      }),
    );
  });

  it("runOwnerInviteMailJob returns sent on success", async () => {
    const result = await runOwnerInviteMailJob(sampleJob);
    expect(result).toEqual({ sent: true });
    expect(sendOwnerInviteEmailMock).toHaveBeenCalledOnce();
  });

  it("runOwnerInviteMailJob returns failure reason when send fails", async () => {
    sendOwnerInviteEmailMock.mockResolvedValue({ status: "failed", error: "smtp down" });
    const result = await runOwnerInviteMailJob(sampleJob);
    expect(result).toEqual({ sent: false, reason: "smtp down" });
  });

  it("auditOwnerInviteMailFailed logs invite.email_failed with actorId", async () => {
    await auditOwnerInviteMailFailed(null as never, sampleJob, "smtp down");
    expect(logAuditMock).toHaveBeenCalledWith(null, {
      actorId: sampleJob.actorId,
      action: "invite.email_failed",
      targetOwnerId: sampleJob.ownerId,
      metadata: {
        email: sampleJob.to,
        reason: "smtp down",
        source: "invite",
      },
    });
  });

  it("deliverOwnerInviteEmailInline retries once after 2s on failure", async () => {
    vi.useFakeTimers();
    sendOwnerInviteEmailMock
      .mockResolvedValueOnce({ status: "failed", error: "timeout" })
      .mockResolvedValueOnce({ status: "sent", messageId: "msg-2" });

    const promise = deliverOwnerInviteEmailInline({
      ...sampleJob,
      source: "resend",
    });
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(sendOwnerInviteEmailMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ mode: "inline", emailSent: true });
    vi.useRealTimers();
  });

  it("deliverOwnerInviteEmailInline exposes inviteUrl when both attempts fail", async () => {
    vi.useFakeTimers();
    sendOwnerInviteEmailMock.mockResolvedValue({ status: "failed", error: "timeout" });

    const promise = deliverOwnerInviteEmailInline({
      ...sampleJob,
      source: "invite",
    });
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result).toMatchObject({
      mode: "inline",
      emailSent: false,
      inviteUrl: sampleJob.inviteUrl,
    });
    vi.useRealTimers();
  });
});
