// Generic payment engine — pure, framework-free logic for building a list of
// payments against any due amount (sale, créance, acompte, achat fournisseur,
// dépense...). Mirrors the spirit of pos-cart.ts: this module never talks to
// an API and never recomputes what the backend already computed — it only
// shapes what the *frontend* needs before a payload reaches the real engine
// (VenteService.create(), and later CreanceService, PurchaseService, ...).
//
// The backend's PaiementMode enum (app/database/enums.py) only knows 5
// values: especes, mobile_money, carte, virement, cheque. Orange Money and
// MTN Mobile Money are both real-world *carriers* of the same backend mode
// (mobile_money) — the carrier distinction lives in the reference/note text,
// never in a backend field that doesn't exist. Adding it as a real backend
// enum value would be a backend change outside this module's scope.

import type { PaiementMode } from "./types";

export type PaymentMethod =
  | "especes"
  | "orange_money"
  | "mtn_money"
  | "carte"
  | "virement"
  | "cheque";

export interface PaymentMethodConfig {
  id: PaymentMethod;
  label: string;
  /** The real backend PaiementMode this UI method is sent as. */
  apiMode: PaiementMode;
  /** Only cash payments can be over-tendered and return change. */
  supportsChange: boolean;
  referenceLabel: string;
  referencePlaceholder: string;
}

export const PAYMENT_METHOD_CONFIG: PaymentMethodConfig[] = [
  {
    id: "especes",
    label: "Espèces",
    apiMode: "especes",
    supportsChange: true,
    referenceLabel: "Référence",
    referencePlaceholder: "Référence (optionnel)",
  },
  {
    id: "orange_money",
    label: "Orange Money",
    apiMode: "mobile_money",
    supportsChange: false,
    referenceLabel: "N° de transaction",
    referencePlaceholder: "TXN-...",
  },
  {
    id: "mtn_money",
    label: "MTN Mobile Money",
    apiMode: "mobile_money",
    supportsChange: false,
    referenceLabel: "N° de transaction",
    referencePlaceholder: "MTN-...",
  },
  {
    id: "carte",
    label: "Carte Bancaire",
    apiMode: "carte",
    supportsChange: false,
    referenceLabel: "N° d'autorisation",
    referencePlaceholder: "AUTH-...",
  },
  {
    id: "virement",
    label: "Virement Bancaire",
    apiMode: "virement",
    supportsChange: false,
    referenceLabel: "Référence de virement",
    referencePlaceholder: "VIR-...",
  },
  {
    id: "cheque",
    label: "Chèque",
    apiMode: "cheque",
    supportsChange: false,
    referenceLabel: "N° de chèque",
    referencePlaceholder: "CHQ-...",
  },
];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = Object.fromEntries(
  PAYMENT_METHOD_CONFIG.map((c) => [c.id, c.label]),
) as Record<PaymentMethod, string>;

export function getMethodConfig(method: PaymentMethod): PaymentMethodConfig {
  const config = PAYMENT_METHOD_CONFIG.find((c) => c.id === method);
  if (!config) throw new Error(`Unknown payment method: ${method}`);
  return config;
}

/** One line in a frontend payment draft — not yet sent to any backend. */
export interface PaymentLine {
  id: string;
  method: PaymentMethod;
  /** Amount actually applied to the due amount — what the backend will see. */
  montant: number;
  /** Cash only — what the client physically handed over (>= montant). */
  tendered?: number;
  reference?: string;
  note?: string;
}

/** Change due to the client — cash only, never stored, purely informational. */
export function computeChange(line: Pick<PaymentLine, "method" | "montant" | "tendered">): number {
  if (!getMethodConfig(line.method).supportsChange) return 0;
  if (!line.tendered || line.tendered <= line.montant) return 0;
  return line.tendered - line.montant;
}

export function sumPaid(lines: PaymentLine[]): number {
  return lines.reduce((acc, l) => acc + l.montant, 0);
}

export function computeRemaining(total: number, lines: PaymentLine[]): number {
  return Math.max(0, total - sumPaid(lines));
}

/** The generic shape every backend payment-accepting engine expects today
 * (VenteCreate.paiements). Reused as-is for créances/achats/dépenses once
 * those modules grow their own `*PaiementCreate` schemas. */
export interface ApiPaymentPayload {
  mode: PaiementMode;
  montant: number;
  reference?: string;
}

/** Carrier/comment text never has a backend field of its own — it's folded
 * into `reference` so nothing is silently dropped before persistence. */
export function toApiPayments(lines: PaymentLine[]): ApiPaymentPayload[] {
  return lines.map((l) => ({
    mode: getMethodConfig(l.method).apiMode,
    montant: l.montant,
    reference: [l.reference?.trim(), l.note?.trim()].filter(Boolean).join(" · ") || undefined,
  }));
}
