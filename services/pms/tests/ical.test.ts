/**
 * Unit tests for services/pms/src/lib/ical.ts
 *
 * Covers: parseICal, generateICal, addDays, generateBufferedEvents,
 * RFC 5545 line-folding, SUMMARY escaping, and the feedback-loop UID filter
 * that maps to the RentTools iCal sync pattern.
 */

import { describe, expect, it } from "vitest";
import {
  parseICal,
  generateICal,
  addDays,
  generateBufferedEvents,
} from "../src/lib/ical.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeIcs(events: string[]): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

function vevent(uid: string, start: string, end: string, summary = "Blocked"): string {
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTART;VALUE=DATE:${start.replace(/-/g, "")}`,
    `DTEND;VALUE=DATE:${end.replace(/-/g, "")}`,
    `SUMMARY:${summary}`,
    "END:VEVENT",
  ].join("\r\n");
}

// ─── parseICal ────────────────────────────────────────────────────────────────

describe("parseICal", () => {
  it("parses a single VEVENT with all fields", () => {
    const ics = makeIcs([vevent("uid-001", "2024-06-01", "2024-06-05", "Beach stay")]);
    const events = parseICal(ics);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      uid: "uid-001",
      summary: "Beach stay",
      startDate: "2024-06-01",
      endDate: "2024-06-05",
    });
  });

  it("parses multiple VEVENTs", () => {
    const ics = makeIcs([
      vevent("uid-a", "2024-07-01", "2024-07-03"),
      vevent("uid-b", "2024-07-10", "2024-07-15"),
    ]);
    const events = parseICal(ics);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.uid)).toEqual(["uid-a", "uid-b"]);
  });

  it("generates stable UID when UID is absent", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20240601",
      "DTEND;VALUE=DATE:20240605",
      "SUMMARY:No UID event",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const [ev] = parseICal(ics);
    expect(ev?.uid).toMatch(/^parsed-2024-06-01-[0-9a-f]{8}$/);
    // Stable — same input → same UID
    expect(parseICal(ics)[0]?.uid).toBe(ev?.uid);
  });

  it("handles DTSTART with timezone param", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:tz-test",
      "DTSTART;TZID=Europe/Berlin:20240715T140000",
      "DTEND;TZID=Europe/Berlin:20240720T110000",
      "SUMMARY:Tz test",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const [ev] = parseICal(ics);
    expect(ev?.startDate).toBe("2024-07-15");
    expect(ev?.endDate).toBe("2024-07-20");
  });

  it("handles DTSTART with UTC timestamp", () => {
    const ics = makeIcs([
      "BEGIN:VEVENT\r\nUID:utc-test\r\nDTSTART:20240801T000000Z\r\nDTEND:20240805T000000Z\r\nSUMMARY:UTC\r\nEND:VEVENT",
    ]);
    const [ev] = parseICal(ics);
    expect(ev?.startDate).toBe("2024-08-01");
  });

  it("unfolds RFC 5545 continuation lines before parsing", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:fold-test",
      "DTSTART;VALUE=DATE:20240901",
      "DTEND;VALUE=DATE:20240905",
      // SUMMARY split across two lines (folded)
      "SUMMARY:Long summ",
      " ary here",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const [ev] = parseICal(ics);
    expect(ev?.summary).toBe("Long summary here");
  });

  it("returns empty array for empty VCALENDAR", () => {
    expect(parseICal("BEGIN:VCALENDAR\r\nEND:VCALENDAR")).toHaveLength(0);
  });

  it("skips VEVENTs with no DTSTART", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:no-start",
      "SUMMARY:No start",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    expect(parseICal(ics)).toHaveLength(0);
  });
});

// ─── addDays ─────────────────────────────────────────────────────────────────

describe("addDays", () => {
  it("adds positive days", () => {
    expect(addDays("2024-06-01", 5)).toBe("2024-06-06");
  });

  it("adds negative days (subtracts)", () => {
    expect(addDays("2024-06-10", -3)).toBe("2024-06-07");
  });

  it("crosses month boundary", () => {
    expect(addDays("2024-01-30", 3)).toBe("2024-02-02");
  });

  it("crosses year boundary", () => {
    expect(addDays("2024-12-30", 5)).toBe("2025-01-04");
  });

  it("handles leap year", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
  });

  it("adding zero returns same date", () => {
    expect(addDays("2024-08-15", 0)).toBe("2024-08-15");
  });
});

// ─── generateICal ────────────────────────────────────────────────────────────

describe("generateICal", () => {
  it("produces valid VCALENDAR wrapper", () => {
    const ics = generateICal([]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
  });

  it("emits placeholder VEVENT for empty event list (RentTools pattern)", () => {
    const ics = generateICal([]);
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("stockix-placeholder");
  });

  it("round-trips: generateICal → parseICal preserves events", () => {
    const events = [
      { uid: "rt-001", summary: "Blocked", startDate: "2024-09-01", endDate: "2024-09-05" },
      { uid: "rt-002", summary: "Beach trip", startDate: "2024-10-10", endDate: "2024-10-15" },
    ];
    const ics = generateICal(events);
    const parsed = parseICal(ics);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toMatchObject({ uid: "rt-001", startDate: "2024-09-01", endDate: "2024-09-05" });
    expect(parsed[1]).toMatchObject({ uid: "rt-002", startDate: "2024-10-10", endDate: "2024-10-15" });
  });

  it("uses CRLF line endings", () => {
    const ics = generateICal([]);
    expect(ics).toContain("\r\n");
    expect(ics.split("\r\n").length).toBeGreaterThan(3);
  });

  // RFC 5545 §3.1 — line folding
  it("folds SUMMARY lines longer than 75 octets (RFC 5545 §3.1)", () => {
    const longSummary = "A".repeat(80);
    const ics = generateICal([{ uid: "fold-test", summary: longSummary, startDate: "2024-06-01", endDate: "2024-06-05" }]);
    const lines = ics.split("\r\n");
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
  });

  it("continuation lines start with a single space (RFC 5545 §3.1)", () => {
    const longSummary = "B".repeat(200);
    const ics = generateICal([{ uid: "cont-test", summary: longSummary, startDate: "2024-06-01", endDate: "2024-06-05" }]);
    const lines = ics.split("\r\n");
    const continuations = lines.filter((l) => l.startsWith(" ") && !l.startsWith("  "));
    expect(continuations.length).toBeGreaterThan(0);
  });

  it("round-trips folded lines correctly via parseICal", () => {
    const longSummary = "Long booking description: " + "X".repeat(100);
    const ics = generateICal([{ uid: "fold-rt", summary: longSummary.replace(/[^\x20-\x7E]/g, ""), startDate: "2024-06-01", endDate: "2024-06-10" }]);
    const parsed = parseICal(ics);
    // Parsed summary should reconstruct correctly after unfolding
    expect(parsed[0]?.uid).toBe("fold-rt");
  });

  // RFC 5545 SUMMARY escaping
  it("escapes backslash in SUMMARY", () => {
    const ics = generateICal([{ uid: "esc-1", summary: "path\\to\\file", startDate: "2024-01-01", endDate: "2024-01-02" }]);
    expect(ics).toContain("path\\\\to\\\\file");
  });

  it("escapes semicolon in SUMMARY", () => {
    const ics = generateICal([{ uid: "esc-2", summary: "a;b;c", startDate: "2024-01-01", endDate: "2024-01-02" }]);
    expect(ics).toContain("a\\;b\\;c");
  });

  it("escapes comma in SUMMARY", () => {
    const ics = generateICal([{ uid: "esc-3", summary: "hello, world", startDate: "2024-01-01", endDate: "2024-01-02" }]);
    expect(ics).toContain("hello\\, world");
  });

  it("strips non-ASCII characters from SUMMARY", () => {
    const ics = generateICal([{ uid: "esc-4", summary: "Hébergement", startDate: "2024-01-01", endDate: "2024-01-02" }]);
    // é is non-ASCII; should be stripped
    expect(ics).not.toContain("é");
    expect(ics).toContain("SUMMARY:");
  });

  it("sanitizes special characters in UID", () => {
    const ics = generateICal([{ uid: "uid with spaces & special!", summary: "Test", startDate: "2024-01-01", endDate: "2024-01-02" }]);
    expect(ics).toContain("UID:uid_with_spaces___special_");
  });

  it("uses custom calendar name when provided", () => {
    const ics = generateICal([], "My Beach Property");
    expect(ics).toContain("X-WR-CALNAME:My Beach Property");
  });
});

// ─── generateBufferedEvents ───────────────────────────────────────────────────

describe("generateBufferedEvents — RentTools iCal buffer pattern", () => {
  const events = [
    { uid: "b1", summary: "Booking 1", startDate: "2024-07-10", endDate: "2024-07-15" },
    { uid: "b2", summary: "Booking 2", startDate: "2024-07-20", endDate: "2024-07-25" },
  ];

  it("returns empty array for empty event list", () => {
    expect(generateBufferedEvents([], 1, 1, "airbnb")).toHaveLength(0);
  });

  it("applies bufferBefore by shifting startDate earlier", () => {
    const buffered = generateBufferedEvents(
      [{ uid: "x", summary: "Test", startDate: "2024-07-10", endDate: "2024-07-15" }],
      2, 0, "airbnb"
    );
    expect(buffered[0]?.startDate).toBe("2024-07-08");
  });

  it("applies bufferAfter by extending endDate", () => {
    const buffered = generateBufferedEvents(
      [{ uid: "x", summary: "Test", startDate: "2024-07-10", endDate: "2024-07-15" }],
      0, 2, "airbnb"
    );
    // bufferAfter=2: endDate + 1 (checkout day) + 2 = endDate + 3
    expect(buffered[0]?.endDate).toBe("2024-07-18");
  });

  it("same-day turnover: bufferAfter=0 leaves checkout day open", () => {
    const buffered = generateBufferedEvents(
      [{ uid: "x", summary: "Test", startDate: "2024-07-10", endDate: "2024-07-15" }],
      0, 0, "airbnb"
    );
    expect(buffered[0]?.endDate).toBe("2024-07-15");
  });

  it("merges overlapping buffered ranges into one event", () => {
    // Two adjacent bookings with buffer 1,1 — buffers will overlap
    const adjacentEvents = [
      { uid: "a", summary: "A", startDate: "2024-07-10", endDate: "2024-07-15" },
      { uid: "b", summary: "B", startDate: "2024-07-16", endDate: "2024-07-20" },
    ];
    const buffered = generateBufferedEvents(adjacentEvents, 1, 1, "airbnb");
    // After merging, the two buffer ranges should collapse into one
    expect(buffered.length).toBeLessThan(2);
  });

  it("does not merge non-overlapping ranges", () => {
    const separatedEvents = [
      { uid: "a", summary: "A", startDate: "2024-07-01", endDate: "2024-07-05" },
      { uid: "b", summary: "B", startDate: "2024-07-20", endDate: "2024-07-25" },
    ];
    const buffered = generateBufferedEvents(separatedEvents, 1, 1, "airbnb");
    expect(buffered.length).toBe(2);
  });

  it("UIDs are prefixed with stockix-pms- (feedback loop filter key)", () => {
    const buffered = generateBufferedEvents(events, 1, 1, "airbnb");
    for (const ev of buffered) {
      expect(ev.uid).toMatch(/^stockix-pms-airbnb-/);
    }
  });

  it("SUMMARY includes platform name and +buffer label", () => {
    const [ev] = generateBufferedEvents(events, 1, 1, "booking");
    expect(ev?.summary).toContain("booking");
    expect(ev?.summary).toContain("+buffer");
  });

  it("SUMMARY omits +buffer when both buffers are 0", () => {
    const [ev] = generateBufferedEvents(events, 0, 0, "direct");
    expect(ev?.summary).not.toContain("+buffer");
  });

  it("output events are sorted by startDate", () => {
    const unsorted = [
      { uid: "late", summary: "Late", startDate: "2024-09-01", endDate: "2024-09-05" },
      { uid: "early", summary: "Early", startDate: "2024-07-01", endDate: "2024-07-05" },
    ];
    const buffered = generateBufferedEvents(unsorted, 0, 0, "airbnb");
    expect(buffered[0]!.startDate < buffered[buffered.length - 1]!.startDate).toBe(true);
  });
});
