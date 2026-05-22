import { pmsFetch } from "@/lib/pms-client";

export default async function GuestsPage() {
  const res = await pmsFetch("/api/guests");
  const data = res.ok ? await res.json() : { error: await res.text() };
  return (
    <section>
      <h1>Guests</h1>
      <pre style={{ background: "#f5f5f5", padding: 12, overflow: "auto" }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </section>
  );
}
