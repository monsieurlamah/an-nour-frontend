// Centralized POS cart engine — pure, framework-free calculation logic.
//
// Every amount shown anywhere in the POS (line rows, cart footer, future
// receipt/checkout) must be derived from these functions. No component
// should re-implement subtotal/discount/tax math locally — that's exactly
// the "calculs dispersés" this module exists to avoid.
//
// Phase POS-2 scope: 100% local cart state. Nothing here calls an API —
// callers (app.pos.tsx) own the React state; this module only computes.

export type DiscountKind = "percent" | "amount";

export type Discount = {
  kind: DiscountKind;
  value: number; // percent (0–100) or a fixed currency amount, always >= 0
};

export const NO_DISCOUNT: Discount = { kind: "percent", value: 0 };

/** Clamp a discount to sane bounds: never negative, percent capped at 100. */
export function clampDiscount(d: Discount): Discount {
  const value = Number.isFinite(d.value) ? Math.max(0, d.value) : 0;
  return d.kind === "percent" ? { kind: "percent", value: Math.min(100, value) } : { kind: "amount", value };
}

/** Discount amount for a given base, never negative, never exceeding the base. */
export function discountAmount(base: number, raw: Discount): number {
  const safeBase = Math.max(0, base);
  const d = clampDiscount(raw);
  const amount = d.kind === "percent" ? safeBase * (d.value / 100) : d.value;
  return Math.min(safeBase, Math.max(0, amount));
}

export type CartLine = {
  productId: number;
  name: string;
  /** Frozen at the moment the line was created — independent from the live
   * catalog price from then on. Read-only today; this is what makes a
   * future "edit price" feature possible without re-deriving from the
   * catalog on every render. */
  unitPrice: number;
  quantity: number;
  discount: Discount;
};

/** Gross amount for a line: quantity × unit price, before its discount. */
export function lineGrossAmount(line: Pick<CartLine, "unitPrice" | "quantity">): number {
  return Math.max(0, line.unitPrice) * Math.max(0, Math.floor(line.quantity));
}

/** Net amount for a line: gross minus its own line-level discount. */
export function lineNetAmount(line: CartLine): number {
  const gross = lineGrossAmount(line);
  return gross - discountAmount(gross, line.discount);
}

export type TaxConfig = {
  /** Architecture is always present; applying it is opt-in. Defaults to
   * disabled for Phase POS-2 — no sale/payment is computed with tax until a
   * later phase turns this on deliberately. */
  enabled: boolean;
  rate: number; // percent
};

export const DEFAULT_TAX: TaxConfig = { enabled: false, rate: 19.25 };

export type CartTotals = {
  subtotal: number; // sum of gross line amounts, before any discount
  lineDiscounts: number; // sum of every line's own discount
  globalDiscount: number; // applied on (subtotal - lineDiscounts)
  taxableBase: number; // what tax (if enabled) is computed on
  tax: number;
  total: number;
  itemCount: number;
};

/** The single source of truth for every total the POS displays. */
export function computeCartTotals(
  lines: CartLine[],
  globalDiscount: Discount,
  tax: TaxConfig = DEFAULT_TAX,
): CartTotals {
  const subtotal = lines.reduce((acc, l) => acc + lineGrossAmount(l), 0);
  const lineDiscounts = lines.reduce((acc, l) => acc + discountAmount(lineGrossAmount(l), l.discount), 0);
  const afterLineDiscounts = Math.max(0, subtotal - lineDiscounts);
  const globalDiscountAmount = discountAmount(afterLineDiscounts, globalDiscount);
  const taxableBase = Math.max(0, afterLineDiscounts - globalDiscountAmount);
  const tax_ = tax.enabled ? taxableBase * (Math.max(0, tax.rate) / 100) : 0;
  const total = taxableBase + tax_;
  const itemCount = lines.reduce((acc, l) => acc + Math.max(0, Math.floor(l.quantity)), 0);

  return {
    subtotal: Math.round(subtotal),
    lineDiscounts: Math.round(lineDiscounts),
    globalDiscount: Math.round(globalDiscountAmount),
    taxableBase: Math.round(taxableBase),
    tax: Math.round(tax_),
    total: Math.round(total),
    itemCount,
  };
}

/** Quantity is always a positive integer, never above the available stock. */
export function clampQuantity(qty: number, maxStock: number): number {
  if (!Number.isFinite(qty)) return 0;
  const floored = Math.floor(qty);
  const safeMax = Number.isFinite(maxStock) ? Math.max(0, maxStock) : 0;
  return Math.max(0, Math.min(safeMax, floored));
}
