/** Resend REST API — returns `id` matching webhook `data.email_id`. */
export async function sendViaResendApi(opts: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  idempotencyKey?: string;
  apiKey: string;
}): Promise<{ id: string } | { error: string }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.apiKey}`,
    "Content-Type": "application/json",
  };
  if (opts.idempotencyKey) {
    headers["Idempotency-Key"] = opts.idempotencyKey;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers,
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      ...(opts.text !== undefined ? { text: opts.text } : {}),
    }),
  });

  const body = await res.text();
  let json: { id?: string; message?: string; name?: string };
  try {
    json = JSON.parse(body) as typeof json;
  } catch {
    return {
      error: `Resend API invalid JSON (${res.status}): ${body.slice(0, 200)}`,
    };
  }

  if (!res.ok || !json.id) {
    const detail = json.message ?? json.name ?? body.slice(0, 200);
    return { error: `Resend API error (${res.status}): ${detail}` };
  }

  return { id: json.id };
}
