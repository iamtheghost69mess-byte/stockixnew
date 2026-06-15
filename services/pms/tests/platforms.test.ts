/**
 * Unit tests for services/pms/src/lib/platforms.ts
 *
 * Verifies the RentTools RT-17.1 OTA platform preset registry is correctly
 * ported: all platforms present, colors valid, buffer defaults sensible,
 * fallback behavior on unknown slugs.
 */

import { describe, expect, it } from "vitest";
import {
  PLATFORM_PRESETS,
  getPlatformPreset,
  FALLBACK_COLOR,
} from "../src/lib/platforms.js";

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

// ─── Registry completeness ────────────────────────────────────────────────────

describe("PLATFORM_PRESETS — RentTools RT-17.1 registry", () => {
  const slugs = PLATFORM_PRESETS.map((p) => p.slug);

  // The six OTAs that Stockix channel creation supports
  it("includes all core OTA platforms", () => {
    for (const slug of ["airbnb", "booking", "vrbo", "expedia", "direct", "other"]) {
      expect(slugs).toContain(slug);
    }
  });

  // Extended platforms ported from RentTools
  it("includes extended RentTools platforms", () => {
    for (const slug of ["hostaway", "lodgify", "hospitable", "smoobu", "houfy", "plumguide", "whimstay"]) {
      expect(slugs).toContain(slug);
    }
  });

  it("has exactly 13 platform entries", () => {
    expect(PLATFORM_PRESETS).toHaveLength(13);
  });

  it("every platform has a valid hex color", () => {
    for (const preset of PLATFORM_PRESETS) {
      expect(preset.color).toMatch(HEX_COLOR);
    }
  });

  it("every platform has a non-empty displayName", () => {
    for (const preset of PLATFORM_PRESETS) {
      expect(preset.displayName.length).toBeGreaterThan(0);
    }
  });

  it("every platform has non-negative buffer values", () => {
    for (const preset of PLATFORM_PRESETS) {
      expect(preset.defaultBufferBefore).toBeGreaterThanOrEqual(0);
      expect(preset.defaultBufferAfter).toBeGreaterThanOrEqual(0);
    }
  });

  it("direct booking has zero buffers (same-day turnover)", () => {
    const direct = PLATFORM_PRESETS.find((p) => p.slug === "direct");
    expect(direct?.defaultBufferBefore).toBe(0);
    expect(direct?.defaultBufferAfter).toBe(0);
  });

  it("no duplicate slugs", () => {
    expect(new Set(slugs).size).toBe(PLATFORM_PRESETS.length);
  });
});

// ─── getPlatformPreset ────────────────────────────────────────────────────────

describe("getPlatformPreset", () => {
  it("returns correct preset for known slug 'airbnb'", () => {
    const p = getPlatformPreset("airbnb");
    expect(p.slug).toBe("airbnb");
    expect(p.displayName).toBe("Airbnb");
    expect(p.color).toBe("#FF385C");
  });

  it("returns correct preset for known slug 'booking'", () => {
    const p = getPlatformPreset("booking");
    expect(p.displayName).toBe("Booking.com");
    expect(p.color).toBe("#003580");
  });

  it("returns fallback preset for unknown slug", () => {
    const p = getPlatformPreset("unknown-ota-xyz");
    expect(p.slug).toBe("unknown-ota-xyz");
    expect(p.color).toBe(FALLBACK_COLOR);
    expect(p.defaultBufferBefore).toBe(1);
    expect(p.defaultBufferAfter).toBe(1);
  });

  it("fallback displayName equals the slug", () => {
    const slug = "my-new-platform";
    expect(getPlatformPreset(slug).displayName).toBe(slug);
  });

  it("FALLBACK_COLOR is valid hex", () => {
    expect(FALLBACK_COLOR).toMatch(HEX_COLOR);
  });

  it("is case-sensitive (no match for 'Airbnb')", () => {
    const p = getPlatformPreset("Airbnb");
    expect(p.color).toBe(FALLBACK_COLOR);
  });
});
