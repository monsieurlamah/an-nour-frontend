// Global, app-wide currency setting. SSR-safe: default = GNF on server and client.
// Hydrated from localStorage after mount to avoid hydration mismatches.
// Components that need to re-render on change use the useCurrency() hook.

import { useEffect, useState } from "react";

export const CURRENCY_KEY = "retailux.currency";
export const DEFAULT_CURRENCY = "GNF";

export const SUPPORTED_CURRENCIES: { code: string; label: string }[] = [
  { code: "GNF", label: "GNF · Franc guinéen" },
  { code: "XAF", label: "XAF · Franc CFA (BEAC)" },
  { code: "XOF", label: "XOF · Franc CFA (UEMOA)" },
  { code: "EUR", label: "EUR · Euro" },
  { code: "USD", label: "USD · Dollar US" },
  { code: "MAD", label: "MAD · Dirham marocain" },
  { code: "NGN", label: "NGN · Naira" },
];

let _currency = DEFAULT_CURRENCY;
const subs = new Set<() => void>();

export function getCurrency(): string {
  return _currency;
}

export function setCurrency(code: string) {
  if (!code || code === _currency) return;
  _currency = code;
  if (typeof window !== "undefined") {
    try { localStorage.setItem(CURRENCY_KEY, code); } catch {}
  }
  subs.forEach((fn) => fn());
}

export function hydrateCurrencyFromStorage() {
  if (typeof window === "undefined") return;
  try {
    const stored = localStorage.getItem(CURRENCY_KEY);
    if (stored && stored !== _currency) setCurrency(stored);
  } catch {}
}

export function useCurrency() {
  const [, setN] = useState(0);
  useEffect(() => {
    const fn = () => setN((n) => n + 1);
    subs.add(fn);
    return () => { subs.delete(fn); };
  }, []);
  return { currency: _currency, setCurrency };
}
