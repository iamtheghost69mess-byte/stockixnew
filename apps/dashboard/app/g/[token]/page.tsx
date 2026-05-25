"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2Icon, LoaderIcon } from "lucide-react";

type FieldDef = {
  id: string;
  type: string;
  label: string;
  required: boolean;
};

type FormData = {
  alreadySubmitted: boolean;
  submittedAt: string | null;
  templateName: string;
  fields: FieldDef[];
  guestName: string;
  checkIn: string | null;
  checkOut: string | null;
};

type Status = "loading" | "not_found" | "already_submitted" | "ready" | "submitting" | "submitted" | "error";

function Field({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: string;
  onChange: (val: string) => void;
}) {
  const base =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50";

  if (field.type === "textarea") {
    return (
      <textarea
        id={field.id}
        className={`${base} min-h-[80px] resize-y`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
      />
    );
  }

  if (field.type === "checkbox") {
    return (
      <div className="flex items-center gap-2">
        <input
          id={field.id}
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          checked={value === "true"}
          onChange={(e) => onChange(e.target.checked ? "true" : "false")}
          required={field.required}
        />
        <span className="text-sm text-gray-600">{field.required ? "Required" : "Optional"}</span>
      </div>
    );
  }

  const typeMap: Record<string, string> = {
    email: "email",
    phone: "tel",
    date: "date",
  };

  return (
    <input
      id={field.id}
      type={typeMap[field.type] ?? "text"}
      className={base}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={field.required}
    />
  );
}

export default function GuestFormPage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<Status>("loading");
  const [formData, setFormData] = useState<FormData | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errorMsg, setErrorMsg] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`/api/pms-public/${token}`);
        if (res.status === 404) { setStatus("not_found"); return; }
        if (!res.ok) { setStatus("error"); return; }
        const data = (await res.json()) as FormData;
        setFormData(data);
        const init: Record<string, string> = {};
        for (const f of data.fields) {
          init[f.id] = f.type === "checkbox" ? "false" : "";
        }
        setAnswers(init);
        setStatus(data.alreadySubmitted ? "already_submitted" : "ready");
      } catch {
        setStatus("error");
      }
    })();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData) return;
    setStatus("submitting");
    setErrorMsg("");

    try {
      const res = await fetch(`/api/pms-public/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setErrorMsg(body.error ?? "Submission failed. Please try again.");
        setStatus("ready");
        return;
      }
      setStatus("submitted");
    } catch {
      setErrorMsg("Network error. Please check your connection and try again.");
      setStatus("ready");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="mx-auto max-w-lg">
        {/* Header */}
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">
            Pre-arrival form
          </p>
        </div>

        {status === "loading" && (
          <div className="flex items-center justify-center gap-2 py-20 text-gray-500">
            <LoaderIcon className="h-5 w-5 animate-spin" />
            <span>Loading your form…</span>
          </div>
        )}

        {status === "not_found" && (
          <div className="rounded-xl border bg-white p-8 text-center shadow-sm">
            <p className="text-lg font-semibold text-gray-800">Form not found</p>
            <p className="mt-2 text-sm text-gray-500">
              This link may be invalid or expired. Please contact the property.
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="rounded-xl border bg-white p-8 text-center shadow-sm">
            <p className="text-lg font-semibold text-red-600">Something went wrong</p>
            <p className="mt-2 text-sm text-gray-500">
              Unable to load the form. Please try again or contact the property directly.
            </p>
          </div>
        )}

        {(status === "already_submitted" || status === "submitted") && formData && (
          <div className="rounded-xl border bg-white p-8 text-center shadow-sm">
            <CheckCircle2Icon className="mx-auto h-12 w-12 text-green-500" />
            <p className="mt-4 text-lg font-semibold text-gray-800">
              {status === "submitted" ? "Thank you!" : "Already submitted"}
            </p>
            {formData.guestName && (
              <p className="mt-1 text-sm text-gray-600">Hi {formData.guestName},</p>
            )}
            <p className="mt-2 text-sm text-gray-500">
              {status === "submitted"
                ? "Your pre-arrival information has been received. We look forward to welcoming you."
                : "You have already completed this form. No further action is needed."}
            </p>
            {formData.checkIn && (
              <p className="mt-4 text-sm font-medium text-gray-700">
                Check-in: {formData.checkIn}
                {formData.checkOut ? ` → ${formData.checkOut}` : ""}
              </p>
            )}
          </div>
        )}

        {(status === "ready" || status === "submitting") && formData && (
          <div className="rounded-xl border bg-white shadow-sm">
            <div className="border-b px-6 py-5">
              <h1 className="text-lg font-semibold text-gray-900">{formData.templateName}</h1>
              {formData.guestName && (
                <p className="mt-0.5 text-sm text-gray-500">Hi {formData.guestName}</p>
              )}
              {formData.checkIn && (
                <p className="mt-1 text-xs text-gray-400">
                  {formData.checkIn}
                  {formData.checkOut ? ` → ${formData.checkOut}` : ""}
                </p>
              )}
            </div>

            <form ref={formRef} onSubmit={(e) => void handleSubmit(e)} className="divide-y">
              {formData.fields.map((field) => (
                <div key={field.id} className="px-6 py-4 space-y-1.5">
                  <label htmlFor={field.id} className="block text-sm font-medium text-gray-700">
                    {field.label || field.id}
                    {field.required && <span className="ml-1 text-red-500">*</span>}
                  </label>
                  <Field
                    field={field}
                    value={answers[field.id] ?? ""}
                    onChange={(val) => setAnswers((prev) => ({ ...prev, [field.id]: val }))}
                  />
                </div>
              ))}

              {errorMsg && (
                <div className="px-6 py-3">
                  <p className="text-sm text-red-600">{errorMsg}</p>
                </div>
              )}

              <div className="px-6 py-4">
                <button
                  type="submit"
                  disabled={status === "submitting"}
                  className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {status === "submitting" ? "Submitting…" : "Submit"}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
