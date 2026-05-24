const POS_LOCATION_SCOPE_KEY = "pos-location-scope";

/** Fired on `window` after local branch scope changes (same-tab; use for query invalidation). */
export const POS_LOCATION_SCOPE_CHANGED_EVENT = "pos:location-scope-changed";

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;

export function getPosLocationScopeId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(POS_LOCATION_SCOPE_KEY);
    if (!v) return null;
    if (v === "all") return "all";
    return OBJECT_ID_RE.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function setPosLocationScopeId(id: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (!id) localStorage.removeItem(POS_LOCATION_SCOPE_KEY);
    else localStorage.setItem(POS_LOCATION_SCOPE_KEY, id);
    window.dispatchEvent(new CustomEvent(POS_LOCATION_SCOPE_CHANGED_EVENT, { detail: { id } }));
  } catch {
    /* ignore */
  }
}

/** `_id` from populated `user.location` or legacy string id. */
export function locationIdFromUserLocation(location: unknown): string | null {
  if (!location) return null;
  if (typeof location === "string" && OBJECT_ID_RE.test(location)) return location;
  if (typeof location === "object" && location !== null && "_id" in location) {
    const id = (location as { _id?: unknown })._id;
    if (typeof id === "string" && OBJECT_ID_RE.test(id)) return id;
  }
  return null;
}

/** `_id`s from populated `user.locations` array (or legacy string entries). */
export function locationIdsFromUserLocations(locations: unknown): string[] {
  if (!Array.isArray(locations)) return [];
  const ids = locations
    .map((entry) => {
      if (typeof entry === "string" && OBJECT_ID_RE.test(entry)) return entry;
      if (entry && typeof entry === "object" && "_id" in entry) {
        const id = (entry as { _id?: unknown })._id;
        if (typeof id === "string" && OBJECT_ID_RE.test(id)) return id;
      }
      return null;
    })
    .filter((value): value is string => Boolean(value));
  return [...new Set(ids)];
}
