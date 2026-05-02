/**
 * Declares built-in setting keys grouped by domain (used by Option validation and Metable metadata).
 * Upstream BigCapital historically kept this out of git via a broad `data` ignore; Docker builds need it on disk.
 *
 * Extend with real groups/keys as needed; migrations that only touch schema run fine with a minimal object.
 */
const options: Record<
  string,
  Array<{ key: string; config?: boolean; type?: string }>
> = {};

export default options;
