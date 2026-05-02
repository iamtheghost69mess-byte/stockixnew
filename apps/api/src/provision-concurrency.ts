/**
 * Limits concurrent tenant provisions so Docker/host resources are not overwhelmed.
 * Single-threaded Node — compare-and-increment is atomic between awaits.
 */

let active = 0;

export function tryBeginProvision(maxConcurrent: number): boolean {
  if (active >= maxConcurrent) return false;
  active += 1;
  return true;
}

export function endProvision(): void {
  active = Math.max(0, active - 1);
}

export function activeProvisionCount(): number {
  return active;
}
