/**
 * OTA platform preset registry (RentTools RT-17.1 pattern).
 * Single source of truth for slugs / display names / colours / default buffers.
 * Used by channels UI, calendar grid colour coding, and property audit.
 */

export interface PlatformPreset {
  slug: string;
  displayName: string;
  /** CSS hex colour for the calendar grid. */
  color: string;
  defaultBufferBefore: number;
  defaultBufferAfter: number;
}

export const FALLBACK_COLOR = "#6B7280";

function p(
  slug: string,
  displayName: string,
  color: string,
  buf: [number, number] = [1, 1],
): PlatformPreset {
  return { slug, displayName, color, defaultBufferBefore: buf[0], defaultBufferAfter: buf[1] };
}

export const PLATFORM_PRESETS: readonly PlatformPreset[] = [
  p("airbnb", "Airbnb", "#FF385C"),
  p("booking", "Booking.com", "#003580"),
  p("vrbo", "Vrbo", "#245ABC"),
  p("expedia", "Expedia", "#FFC72C"),
  p("hostaway", "Hostaway", "#2E5BFF"),
  p("lodgify", "Lodgify", "#00B5AD"),
  p("hospitable", "Hospitable", "#1B5E20"),
  p("smoobu", "Smoobu", "#4A148C"),
  p("houfy", "Houfy", "#D84315"),
  p("plumguide", "Plum Guide", "#2E1065"),
  p("whimstay", "Whimstay", "#FF7043"),
  p("direct", "Direct", FALLBACK_COLOR, [0, 0]),
  p("other", "Other", FALLBACK_COLOR),
];

const bySlug = new Map(PLATFORM_PRESETS.map((p) => [p.slug, p]));

export function getPlatformPreset(slug: string): PlatformPreset {
  return bySlug.get(slug) ?? { slug, displayName: slug, color: FALLBACK_COLOR, defaultBufferBefore: 1, defaultBufferAfter: 1 };
}
