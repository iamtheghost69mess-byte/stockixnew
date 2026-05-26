/** iCal (.ics) parser and generator — no external dependencies. */

export interface ICalEvent {
  uid: string;
  summary: string;
  /** YYYY-MM-DD inclusive start */
  startDate: string;
  /** YYYY-MM-DD exclusive end (iCal convention) */
  endDate: string;
}

function stableUid(startDate: string, endDate: string, summary: string): string {
  let h = 0x811c9dc5;
  for (const ch of `${startDate}|${endDate}|${summary}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `parsed-${startDate}-${h.toString(16).padStart(8, "0")}`;
}

/** Parse an iCal (.ics) string into a list of events. */
export function parseICal(icalText: string): ICalEvent[] {
  const events: ICalEvent[] = [];
  const blocks = icalText.split("BEGIN:VEVENT");

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i]!.split("END:VEVENT")[0];
    if (!block) continue;

    // Unfold lines (iCal spec: lines starting with space/tab are continuations)
    const unfolded = block.replace(/\r?\n[ \t]/g, "");
    const lines = unfolded.split(/\r?\n/);

    let uid = "";
    let summary = "";
    let startDate = "";
    let endDate = "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("UID:")) uid = trimmed.substring(4).trim();
      else if (trimmed.startsWith("SUMMARY:")) summary = trimmed.substring(8).trim();
      else if (trimmed.startsWith("DTSTART")) startDate = extractDate(trimmed);
      else if (trimmed.startsWith("DTEND")) endDate = extractDate(trimmed);
    }

    if (startDate) {
      if (!endDate) endDate = startDate;
      if (!uid) uid = stableUid(startDate, endDate, summary);
      events.push({ uid, summary, startDate, endDate });
    }
  }

  return events;
}

/**
 * Extract a YYYY-MM-DD date from an iCal date line.
 * Handles: DTSTART;VALUE=DATE:20240115
 *          DTSTART:20240115T140000Z
 *          DTSTART;TZID=Europe/Berlin:20240115T140000
 */
function extractDate(line: string): string {
  const colonIdx = line.indexOf(":");
  if (colonIdx === -1) return "";
  const value = line.substring(colonIdx + 1).trim();
  const raw = value.replace(/[^0-9]/g, "").substring(0, 8);
  if (raw.length < 8) return "";
  return `${raw.substring(0, 4)}-${raw.substring(4, 6)}-${raw.substring(6, 8)}`;
}

/** Add days to a YYYY-MM-DD date string, noon-UTC to avoid DST drift. */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().substring(0, 10);
}

/** Generate an iCal (.ics) string from a list of events. */
export function generateICal(
  events: ICalEvent[],
  calendarName = "Stockix PMS",
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Stockix PMS//CalendarSync//EN",
    `X-WR-CALNAME:${calendarName}`,
    "METHOD:PUBLISH",
  ];

  // Some platforms reject an empty VCALENDAR; emit a far-past placeholder.
  const eventsToEmit: ICalEvent[] =
    events.length > 0
      ? events
      : [{ uid: "stockix-placeholder", summary: "Stockix PMS placeholder", startDate: "1970-01-01", endDate: "1970-01-02" }];

  for (const event of eventsToEmit) {
    const dtstart = event.startDate.replace(/-/g, "");
    const dtend = event.endDate.replace(/-/g, "");
    const uid = event.uid.replace(/[^a-zA-Z0-9@._-]/g, "_");
    const escapedSummary = event.summary
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n")
      .replace(/[^\x20-\x7E]/g, "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTART;VALUE=DATE:${dtstart}`,
      `DTEND;VALUE=DATE:${dtend}`,
      `SUMMARY:${escapedSummary}`,
      `DTSTAMP:${formatNowUTC()}`,
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n");
}

/** RFC 5545 §3.1: fold lines longer than 75 octets with CRLF + single space. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [line.slice(0, 75)];
  let i = 75;
  while (i < line.length) {
    chunks.push(line.slice(i, i + 74));
    i += 74;
  }
  return chunks.join("\r\n ");
}

function formatNowUTC(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

/**
 * Build blocked events with buffer days around source bookings.
 * Used to create the outbound iCal feed to push back to OTA platforms.
 */
export function generateBufferedEvents(
  events: ICalEvent[],
  bufferBefore: number,
  bufferAfter: number,
  sourcePlatform: string,
): ICalEvent[] {
  if (events.length === 0) return [];

  const buffered = events.map((event) => ({
    start: addDays(event.startDate, -bufferBefore),
    // bufferAfter === 0 means same-day turnover — leave checkout day open
    end: bufferAfter > 0 ? addDays(event.endDate, 1 + bufferAfter) : event.endDate,
  }));

  buffered.sort((a, b) => a.start.localeCompare(b.start));

  // Merge overlapping / adjacent ranges so buffers don't double up
  const merged: { start: string; end: string }[] = [];
  for (const b of buffered) {
    const last = merged[merged.length - 1];
    if (last && b.start <= last.end) {
      if (b.end > last.end) last.end = b.end;
    } else {
      merged.push({ ...b });
    }
  }

  const label = `Blocked (${sourcePlatform}${bufferBefore || bufferAfter ? " +buffer" : ""})`;
  return merged.map((m, i) => ({
    uid: `stockix-pms-${sourcePlatform}-${m.start}-${m.end}-${i}`,
    summary: label,
    startDate: m.start,
    endDate: m.end,
  }));
}

/** Generate buffer-only blocks (cleaning days) without the booking spans themselves. */
export function generateBufferOnlyEvents(
  events: ICalEvent[],
  bufferBefore: number,
  bufferAfter: number,
  label = "Blocked (cleaning)",
): ICalEvent[] {
  if (events.length === 0) return [];
  const result: ICalEvent[] = [];

  for (const event of events) {
    if (bufferBefore > 0) {
      result.push({
        uid: `stockix-buffer-before-${event.startDate}-${event.uid}`,
        summary: label,
        startDate: addDays(event.startDate, -bufferBefore),
        endDate: event.startDate,
      });
    }
    if (bufferAfter > 0) {
      result.push({
        uid: `stockix-buffer-after-${event.endDate}-${event.uid}`,
        summary: label,
        startDate: addDays(event.endDate, 1),
        endDate: addDays(event.endDate, 1 + bufferAfter),
      });
    }
  }

  return result;
}
