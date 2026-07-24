// Pure aggregation logic for a multi-product camera scanning session.
// Kept framework-free and dependency-free so the "scan twice = qty 2, but
// don't recount a code the camera is still lingering on" rule is a single,
// easily-reasoned-about place — not buried inside the video/decoder plumbing.

export interface ScannedEntry {
  code: string;
  qty: number;
  /** ms epoch of the most recent detection of this exact code. */
  lastSeenAt: number;
}

/** A barcode continuously re-decoded from the same still-in-frame item within
 * this window is the *same physical scan*, not a new one. Comfortably longer
 * than the decoder's own frame interval, short enough that pulling the item
 * away and back (a deliberate second unit) reliably exceeds it. */
export const RESCAN_COOLDOWN_MS = 1500;

/**
 * Records one camera detection of `code` at time `now`.
 *  - New code → appended with qty 1.
 *  - Same code seen again within RESCAN_COOLDOWN_MS → still the same item in
 *    frame; only the timestamp refreshes, qty is untouched.
 *  - Same code seen again after the cooldown → a deliberate rescan (a second
 *    unit of that product); qty increments.
 */
export function recordScan(list: ScannedEntry[], code: string, now: number): ScannedEntry[] {
  const idx = list.findIndex((e) => e.code === code);
  if (idx === -1) return [...list, { code, qty: 1, lastSeenAt: now }];

  const entry = list[idx];
  const next = [...list];
  next[idx] =
    now - entry.lastSeenAt < RESCAN_COOLDOWN_MS
      ? { ...entry, lastSeenAt: now }
      : { ...entry, qty: entry.qty + 1, lastSeenAt: now };
  return next;
}

/** Unconditionally increments `code` by one — for explicit, discrete user
 * actions (manual code entry) where the rescan cooldown must never apply:
 * every click is a deliberate "add one more", not a lingering camera frame. */
export function bumpScan(list: ScannedEntry[], code: string, now: number): ScannedEntry[] {
  const idx = list.findIndex((e) => e.code === code);
  if (idx === -1) return [...list, { code, qty: 1, lastSeenAt: now }];
  const next = [...list];
  next[idx] = { ...next[idx], qty: next[idx].qty + 1, lastSeenAt: now };
  return next;
}

export function removeScan(list: ScannedEntry[], code: string): ScannedEntry[] {
  return list.filter((e) => e.code !== code);
}

export function setScanQty(list: ScannedEntry[], code: string, qty: number): ScannedEntry[] {
  if (!Number.isFinite(qty) || qty <= 0) return removeScan(list, code);
  return list.map((e) => (e.code === code ? { ...e, qty: Math.floor(qty) } : e));
}

export function totalScanQty(list: ScannedEntry[]): number {
  return list.reduce((acc, e) => acc + e.qty, 0);
}
