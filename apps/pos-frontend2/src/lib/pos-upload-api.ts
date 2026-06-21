import { type PosApiJson, posApiFetch } from "@/lib/pos-api-fetch";

export type UploadResult = {
  url: string;
  filename?: string;
  mimetype?: string;
  size?: number;
};

/**
 * Standard utility to upload images to the internal POS API.
 * Uses the unified 'pos_access_token' and correct API origin.
 */
export async function posUploadImage(file: File): Promise<PosApiJson<UploadResult>> {
  const formData = new FormData();
  formData.append("image", file);

  // We use posApiFetch directly because posApiJson enforces JSON body
  const res = await posApiFetch("/api/upload", {
    method: "POST",
    // Browser automatically sets Content-Type to multipart/form-data with boundary when using FormData
    body: formData,
  });

  const payload = (await res.json()) as PosApiJson<UploadResult>;
  if (!res.ok) {
    throw new Error(payload.message || `Upload failed (${res.status})`);
  }
  return payload;
}
