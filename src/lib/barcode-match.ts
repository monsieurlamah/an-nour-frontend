// Shared barcode/SKU matching logic — used by both the HID scanner (instant,
// one-at-a-time) and the camera scanner (batch, multi-product) input paths,
// so "what counts as a match" never drifts between the two.

export interface ScannableProduct {
  id: number;
  barcode: string | null;
  sku: string | null;
}

export type ScanMatch<T> =
  | { kind: "found"; product: T }
  | { kind: "not_found" }
  | { kind: "ambiguous" };

/**
 * Resolves a raw scanned/typed code to a product:
 *  1. Exact match on barcode or SKU (case-insensitive).
 *  2. Otherwise, a partial (substring) match — only accepted if it's unique.
 */
export function matchScan<T extends ScannableProduct>(products: T[], rawCode: string): ScanMatch<T> {
  const needle = rawCode.trim().toLowerCase();
  if (!needle) return { kind: "not_found" };

  const exact = products.find(
    (p) => (p.barcode ?? "").toLowerCase() === needle || (p.sku ?? "").toLowerCase() === needle,
  );
  if (exact) return { kind: "found", product: exact };

  const partials = products.filter(
    (p) => (p.barcode ?? "").toLowerCase().includes(needle) || (p.sku ?? "").toLowerCase().includes(needle),
  );
  if (partials.length === 1) return { kind: "found", product: partials[0] };
  if (partials.length > 1) return { kind: "ambiguous" };
  return { kind: "not_found" };
}
