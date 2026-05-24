/**
 * BullMQ worker process — run: `node workers/platformWorker.js`
 * Requires REDIS_URL and optional RESEND_API_KEY for email jobs.
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const connectDB = require("../config/database");
const config = require("../config/config");
const { createWorker, QUEUE_NAMES } = require("../services/jobQueue");
const WebhookOutbox = require("../models/webhookOutboxModel");
const WebhookEndpoint = require("../models/webhookEndpointModel");
const { signBodyHmacSha256 } = require("../utils/webhookSign");
const ProductEvent = require("../models/productEventModel");
const ProductEventDailyRollup = require("../models/productEventDailyRollupModel");
const OrgInvitation = require("../models/orgInvitationModel");
const Organization = require("../models/organizationModel");
const { OrgAccessCache } = require("../services/orgAccessCache");
const {
  logAccessStateTransitionIfChanged,
} = require("../services/accessStateAuditService");
const { logWorkerSkipDueToBlockedOrg } = require("../services/organizationAccessService");

const { bootstrapOrganization } = require("../services/orgBootstrapService");

async function canProcessOrganization(organizationId) {
  if (!organizationId) return { allowed: true, accessState: null };
  const org = await Organization.findById(String(organizationId))
    .select("licenseStartDate licenseEndDate licenseStartsAt licenseEndsAt timezone")
    .lean();
  if (!org) return { allowed: false, accessState: null };
  const accessState = await OrgAccessCache.getCachedAccessState(organizationId, {
    licenseStartDate: org.licenseStartDate ?? org.licenseStartsAt ?? null,
    licenseEndDate: org.licenseEndDate ?? org.licenseEndsAt ?? null,
    timezone: org.timezone ?? null,
  });
  await logAccessStateTransitionIfChanged(organizationId, accessState, {
    actorType: "system",
  });
  return { allowed: accessState.blocked === false, accessState };
}

async function handleEmail(job) {
  if (job.name === "send_resend") {
    if (!config.resendApiKey) {
      console.warn("RESEND_API_KEY not set; skipping email job");
      return;
    }
    const { Resend } = require("resend");
    const resend = new Resend(config.resendApiKey);
    await resend.emails.send({
      from: config.resendFromEmail,
      to: job.data.to,
      subject: job.data.subject || "Notification",
      html: job.data.html || "<p></p>",
    });
    return;
  }
  if (job.name === "org_invitation") {
    if (!config.resendApiKey) {
      console.warn("RESEND_API_KEY not set; skipping invitation email");
      return;
    }
    const invitationId = job.data?.invitationId;
    const tokenPlain = job.data?.tokenPlain;
    if (!invitationId || !tokenPlain) {
      console.warn("org_invitation job missing invitationId or tokenPlain");
      return;
    }
    const inv = await OrgInvitation.findById(invitationId).lean();
    if (!inv) {
      console.warn("org_invitation: invitation not found", invitationId);
      return;
    }
    const { allowed, accessState } = await canProcessOrganization(inv.organization);
    if (!allowed) {
      if (accessState) {
        await logWorkerSkipDueToBlockedOrg(inv.organization, accessState, {
          workerName: "platformWorker:org_invitation",
        });
      }
      return;
    }
    const base = config.tenantAppOrigin.replace(/\/$/, "");
    const acceptUrl = `${base}/accept-invite?invitationId=${encodeURIComponent(
      String(invitationId)
    )}&token=${encodeURIComponent(tokenPlain)}`;
    const { Resend } = require("resend");
    const resend = new Resend(config.resendApiKey);
    await resend.emails.send({
      from: config.resendFromEmail,
      to: inv.email,
      subject: "You are invited to join the team",
      html: `<p>You have been invited to the organization.</p><p><a href="${acceptUrl}">Accept invitation</a></p><p>If the link does not work, open your app and use Accept invite with invitation id and token from your administrator.</p>`,
    });
    return;
  }
  if (job.name === "org_suspension_warning") {
    console.info("suspension warning stub", job.data?.organizationId);
  }
}

async function handleWebhooksOut(job) {
  if (job.name !== "deliver") return;
  const row = await WebhookOutbox.findById(job.data.outboxId);
  if (!row) return;
  const { allowed, accessState } = await canProcessOrganization(row.organization);
  if (!allowed) {
    if (accessState) {
      await logWorkerSkipDueToBlockedOrg(row.organization, accessState, {
        workerName: "platformWorker:webhooks_out",
      });
    }
    row.status = "failed";
    row.lastError = "organization blocked by access state";
    await row.save();
    return;
  }
  const ep = await WebhookEndpoint.findById(row.endpoint).select(
    "+signingSecretCurrent +signingSecretPrevious"
  );
  if (!ep) {
    row.status = "failed";
    row.lastError = "endpoint missing";
    await row.save();
    return;
  }
  if (ep.disabled) {
    row.status = "failed";
    row.lastError = "endpoint revoked";
    await row.save();
    return;
  }
  const raw = JSON.stringify(row.payload);
  const sig = signBodyHmacSha256(ep.signingSecretCurrent, raw);
  const res = await fetch(ep.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Signature": sig,
      "X-Event-Type": row.eventType,
    },
    body: raw,
  });
  if (!res.ok) {
    row.attemptCount = (row.attemptCount || 0) + 1;
    row.lastError = `HTTP ${res.status}`;
    row.status = row.attemptCount >= 8 ? "failed" : "pending";
    row.nextAttemptAt = new Date(Date.now() + 60_000 * row.attemptCount);
    await row.save();
    throw new Error(row.lastError);
  }
  row.status = "delivered";
  await row.save();
}

async function handleProvisioning(job) {
  if (job.name !== "org_bootstrap") return;
  const organizationId = job.data?.organizationId;
  const { allowed, accessState } = await canProcessOrganization(organizationId);
  if (!allowed) {
    if (accessState) {
      await logWorkerSkipDueToBlockedOrg(organizationId, accessState, {
        workerName: "platformWorker:provisioning",
      });
    }
    return;
  }
  const result = await bootstrapOrganization({
    organizationId,
    ownerEmail: job.data?.ownerEmail,
    ownerName: job.data?.ownerName,
    adminPin: job.data?.adminPin,
  });
  if (result?.ok) {
    console.log(`[provisioning] org_bootstrap completed organizationId=${organizationId}`);
  } else {
    console.warn(
      `[provisioning] org_bootstrap failed organizationId=${organizationId} reason=${result?.reason || "unknown"}`
    );
  }
}

async function handleAnalyticsRollups(job) {
  if (job.name !== "rollup_daily") return;
  const dayUtc = job.data?.dayUtc || new Date().toISOString().slice(0, 10);
  const start = new Date(`${dayUtc}T00:00:00.000Z`);
  const end = new Date(`${dayUtc}T23:59:59.999Z`);
  const agg = await ProductEvent.aggregate([
    { $match: { createdAt: { $gte: start, $lte: end } } },
    {
      $group: {
        _id: { org: "$organization", et: "$eventType" },
        c: { $sum: 1 },
      },
    },
  ]);
  for (const row of agg) {
    if (!row._id?.org) continue;
    const et = String(row._id.et || "unknown").replace(/[^a-z0-9._-]/gi, "_");
    const inc = { [`countsByType.${et}`]: row.c };
    await ProductEventDailyRollup.findOneAndUpdate(
      { organization: row._id.org, dayUtc },
      { $inc: inc },
      { upsert: true }
    );
  }
}

function noop(_job) {
  /* exports / compliance / fraud stubs */
}

async function main() {
  if (!config.redisUrl) {
    console.error("REDIS_URL is required for workers.");
    process.exit(1);
  }
  await connectDB();
  OrgAccessCache.startOrgAccessCacheReconciliationJob();
  const workers = [];
  const reg = (name, fn) => {
    const w = createWorker(name, fn);
    if (w) workers.push(w);
  };
  reg("email", handleEmail);
  reg("webhooks_out", handleWebhooksOut);
  reg("provisioning", handleProvisioning);
  reg("exports", noop);
  reg("compliance", noop);
  reg("analytics_rollups", handleAnalyticsRollups);
  reg("fraud_review", noop);

  if (!workers.length) {
    console.error("No workers started (bullmq/redis unavailable).");
    process.exit(1);
  }

  const shutdown = async () => {
    await Promise.all(workers.map((w) => w.close()));
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  console.log(`Workers listening: ${QUEUE_NAMES.join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
