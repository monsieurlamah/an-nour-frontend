// POS-specific adapter: maps VenteRead (backend shape) to the generic
// DocumentPrintData the print engine expects. The print engine never
// imports from this file — it only knows DocumentPrintData.

import type { VenteRead, StoreRead, ClientRead } from "@/lib/types";
import type { DocumentPrintData, PrintOrganization, PrintCustomer } from "@/lib/print-engine";
import { PAYMENT_METHOD_LABEL } from "@/lib/payment-engine";
import type { CartLine } from "@/lib/pos-cart";
import { lineGrossAmount, lineNetAmount, type CartTotals } from "@/lib/pos-cart";

/** The payment method labels stored in the reference field as the first
 * token (set by toApiPayments when the UI mode differs from the backend mode). */
function resolveMethodLabel(mode: string, reference?: string | null): string {
  // Orange Money and MTN fold into mobile_money on the backend.
  // If the reference starts with "MTN" we can infer the sub-type.
  if (mode === "mobile_money") {
    if (reference?.toUpperCase().startsWith("MTN")) return PAYMENT_METHOD_LABEL["mtn_money"];
    if (reference?.toUpperCase().startsWith("OM") || reference?.toUpperCase().startsWith("ORANGE"))
      return PAYMENT_METHOD_LABEL["orange_money"];
    return "Mobile Money";
  }
  const map: Record<string, string> = {
    especes: "Espèces",
    carte: "Carte Bancaire",
    virement: "Virement Bancaire",
    cheque: "Chèque",
  };
  return map[mode] ?? mode;
}

export function saleToDocument(
  vente: VenteRead,
  opts: {
    store?: StoreRead | null;
    vendeurName?: string;
    clientName?: string | null;
    productName?: (id: number) => string;
    footerMessage?: string;
  } = {},
): DocumentPrintData {
  const organization: PrintOrganization = {
    name: opts.store?.name ?? "AN-NOUR",
    address: opts.store?.address ?? undefined,
    phone: undefined, // StoreRead has no phone field today
    nif: undefined, // not in StoreRead today; ready when added
    // Sale receipts are issued by the boutique itself, never the group.
    logo: "/logoBoutique.jpeg",
  };

  const customer: PrintCustomer | undefined = vente.client_id
    ? { name: opts.clientName ?? `Client #${vente.client_id}` }
    : undefined;

  const lines = (vente.lignes ?? []).map((l) => ({
    name: opts.productName?.(l.produit_id) ?? `Produit #${l.produit_id}`,
    quantity: l.quantite,
    unitPrice: Number(l.prix_unitaire),
    lineDiscount: l.remise ? Number(l.remise) : 0,
    lineTotal: Number(l.total_ligne),
  }));

  const payments = (vente.paiements ?? []).map((p) => ({
    method: resolveMethodLabel(p.mode, p.reference ?? null),
    amount: Number(p.montant),
    reference: p.reference ?? undefined,
  }));

  return {
    type: "sale_receipt",
    reference: `VENTE-${vente.id}`,
    date: vente.created_at,
    createdAt: vente.created_at,
    organization,
    issuer: opts.vendeurName ? { name: opts.vendeurName, role: "Caissier" } : undefined,
    customer,
    lines,
    totals: {
      subtotal: lines.reduce((a, l) => a + l.unitPrice * l.quantity, 0),
      lineDiscounts: lines.reduce((a, l) => a + (l.lineDiscount ?? 0), 0),
      globalDiscount: vente.remise ? Number(vente.remise) : 0,
      total: Number(vente.montant_total),
    },
    payments,
    amountPaid: Number(vente.montant_paye ?? 0),
    amountDue: Number(vente.montant_restant ?? 0),
    qrContent: `VENTE-${vente.id}`,
    footerOverride: opts.footerMessage,
    deliveryNotice: vente.livraison_statut === "non_livre" ? "NON LIVRÉ — EN ATTENTE DE LIVRAISON" : undefined,
  };
}

/** The bon de livraison for a sale — generated the moment the goods actually
 * leave the boutique (immediately if rung up "livre", or later via
 * confirm-livraison for one rung up "non_livre"). Reuses the generic
 * "delivery_note" document type (never used by commandes — that module has
 * its own "commande_bon_livraison"). */
export function saleToDeliveryNoteDocument(
  vente: VenteRead,
  opts: {
    store?: StoreRead | null;
    clientName?: string | null;
    productName?: (id: number) => string;
  } = {},
): DocumentPrintData {
  const organization: PrintOrganization = {
    name: opts.store?.name ?? "AN-NOUR",
    address: opts.store?.address ?? undefined,
    logo: "/logoBoutique.jpeg",
  };

  const customer: PrintCustomer | undefined = vente.client_id
    ? { name: opts.clientName ?? `Client #${vente.client_id}` }
    : undefined;

  const lines = (vente.lignes ?? []).map((l) => ({
    name: opts.productName?.(l.produit_id) ?? `Produit #${l.produit_id}`,
    quantity: l.quantite,
    unitPrice: 0,
    lineTotal: 0,
  }));

  const dateRef = vente.livree_at ?? vente.created_at;

  return {
    type: "delivery_note",
    reference: vente.numero_bon_livraison ?? `BL-${vente.id}`,
    date: dateRef,
    createdAt: dateRef,
    organization,
    customer,
    lines,
    totals: { subtotal: 0, total: 0 },
    payments: [],
    amountPaid: 0,
    amountDue: 0,
    qrContent: vente.numero_bon_livraison ?? undefined,
    footerOverride: "Bon de livraison — à conserver.",
  };
}

/** A pre-sale "facture" built straight from the live cart — no Vente exists
 * yet at this point in the flow (product selection → facture → encaissement).
 * Purely a client-side preview/print; nothing here is persisted. */
export function cartToInvoiceDocument(
  lines: CartLine[],
  totals: CartTotals,
  opts: {
    store?: StoreRead | null;
    vendeurName?: string;
    client?: ClientRead | null;
  } = {},
): DocumentPrintData {
  const organization: PrintOrganization = {
    name: opts.store?.name ?? "AN-NOUR",
    address: opts.store?.address ?? undefined,
    logo: "/logoBoutique.jpeg",
  };

  const customer: PrintCustomer | undefined = opts.client
    ? { name: `${opts.client.name}${opts.client.prenom ? ` ${opts.client.prenom}` : ""}`, phone: opts.client.phone ?? undefined }
    : undefined;

  const documentLines = lines.map((line) => ({
    name: line.name,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    lineDiscount: lineGrossAmount(line) - lineNetAmount(line),
    lineTotal: lineNetAmount(line),
  }));

  const now = new Date().toISOString();

  return {
    type: "invoice",
    reference: `FACT-${Date.now()}`,
    date: now,
    createdAt: now,
    organization,
    issuer: opts.vendeurName ? { name: opts.vendeurName, role: "Caissier" } : undefined,
    customer,
    lines: documentLines,
    totals: {
      subtotal: totals.subtotal,
      lineDiscounts: totals.lineDiscounts,
      globalDiscount: totals.globalDiscount,
      taxBase: totals.taxableBase,
      tax: totals.tax,
      total: totals.total,
    },
    payments: [],
    amountPaid: 0,
    amountDue: totals.total,
    footerOverride: "Facture — en attente d'encaissement.",
  };
}
