// Reactive runtime store for POS sales — mutates mock products' stock in place
// and prepends recorded sales so history/reports reflect the new transaction.
import { useSyncExternalStore } from "react";
import { products, sales as seedSales, type Sale } from "./mock-data";

export type SaleLine = {
  productId: string;
  name: string;
  qty: number;
  price: number;
};

export type DiscountKind = "percent" | "amount";

export type SaleStatus = Sale["status"] | "voided";

export type SaleDetailed = Omit<Sale, "status"> & {
  status: SaleStatus;
  lines?: SaleLine[];
  subtotal?: number;
  discount?: number;
  discountKind?: DiscountKind;
  discountValue?: number;
  tax?: number;
  taxRate?: number;
  tendered?: number;
  change?: number;
  voidedAt?: string;
};

let store: SaleDetailed[] = [...seedSales];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function subscribeSales(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getSales(): SaleDetailed[] {
  return store;
}

export function getSale(id: string): SaleDetailed | undefined {
  return store.find((s) => s.id === id);
}

let counter = 1;
const newRef = () => {
  counter += 1;
  return `RC-${(100_000 + Math.floor(Math.random() * 899_999)).toString()}`;
};

export type RecordSaleInput = {
  lines: SaleLine[];
  payment: Sale["payment"];
  subtotal: number;
  discount: number;
  discountKind: DiscountKind;
  discountValue: number;
  tax: number;
  taxRate: number;
  total: number;
  tendered?: number;
  change?: number;
  store?: string;
  cashier?: string;
  customer?: string;
};

export function recordSale(input: RecordSaleInput): SaleDetailed {
  // decrement stock in place
  for (const l of input.lines) {
    const p = products.find((x) => x.id === l.productId);
    if (p) p.stock = Math.max(0, p.stock - l.qty);
  }
  const sale: SaleDetailed = {
    id: `sa_new_${Date.now()}_${counter}`,
    reference: newRef(),
    store: input.store ?? "Akwa Flagship",
    cashier: input.cashier ?? "Awa",
    customer: input.customer ?? "__walkin__",
    total: input.total,
    payment: input.payment,
    status: "completed",
    createdAt: new Date().toISOString(),
    lines: input.lines,
    subtotal: input.subtotal,
    discount: input.discount,
    discountKind: input.discountKind,
    discountValue: input.discountValue,
    tax: input.tax,
    taxRate: input.taxRate,
    tendered: input.tendered,
    change: input.change,
  };
  store = [sale, ...store];
  emit();
  return sale;
}

export function voidSale(id: string): SaleDetailed | undefined {
  const idx = store.findIndex((s) => s.id === id);
  if (idx === -1) return undefined;
  const s = store[idx];
  if (s.status === "voided" || s.status === "refunded") return s;
  // Restore stock for known lines
  if (s.lines && s.lines.length) {
    for (const l of s.lines) {
      const p = products.find((x) => x.id === l.productId);
      if (p) p.stock = p.stock + l.qty;
    }
  }
  const updated: SaleDetailed = { ...s, status: "voided", voidedAt: new Date().toISOString() };
  store = [...store.slice(0, idx), updated, ...store.slice(idx + 1)];
  emit();
  return updated;
}

export function useSalesStore(): SaleDetailed[] {
  return useSyncExternalStore(subscribeSales, getSales, getSales);
}
