// POS-specific adapter: maps VenteRead (backend shape) to the generic
// DocumentPrintData the print engine expects. The print engine never
// imports from this file — it only knows DocumentPrintData.

import type { VenteRead, StoreRead } from "@/lib/types";
import type { DocumentPrintData, PrintOrganization, PrintCustomer } from "@/lib/print-engine";
import { PAYMENT_METHOD_LABEL } from "@/lib/payment-engine";

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
    // Sale receipts are issued by the boutique itself, never the group —
    // boutique logo + the Immobilier & Déco letterhead on A4.
    logo: "/logoBoutique.jpeg",
    brand: "boutique",
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

  // The official facture number exists from the moment the sale is
  // finalised (direct sale or proforma → facture); it is the document's
  // reference everywhere, the internal VENTE-id only a fallback.
  const reference = vente.numero_facture ?? `VENTE-${vente.id}`;

  const payments = (vente.paiements ?? []).map((p) => ({
    method: resolveMethodLabel(p.mode, p.reference ?? null),
    amount: Number(p.montant),
    reference: p.reference ?? undefined,
  }));

  return {
    type: "sale_receipt",
    reference,
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
    qrContent: reference,
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
    brand: "boutique",
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
    notes: vente.numero_facture
      ? `Livraison relative à la facture ${vente.numero_facture}. Bon de livraison à conserver.`
      : "Bon de livraison à conserver.",
  };
}

/** The devis (cahier des charges §9.1) — built from a real, persisted Vente
 * (statut "proforma"/"proforma_expiree"/"proforma_rejetee"), never from the
 * live cart: unlike the old client-side-only preview this replaces, a
 * proforma must be a numbered, trackable record from the moment it exists —
 * VenteService.create_proforma is called *before* this is ever rendered. */
export function saleToProformaDocument(
  vente: VenteRead,
  opts: {
    store?: StoreRead | null;
    vendeurName?: string;
    clientName?: string | null;
    productName?: (id: number) => string;
  } = {},
): DocumentPrintData {
  const organization: PrintOrganization = {
    name: opts.store?.name ?? "AN-NOUR",
    address: opts.store?.address ?? undefined,
    logo: "/logoBoutique.jpeg",
    brand: "boutique",
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

  return {
    type: "quote",
    reference: vente.numero_proforma ?? `PRO-${vente.id}`,
    date: vente.created_at,
    createdAt: vente.created_at,
    organization,
    issuer: opts.vendeurName ? { name: opts.vendeurName, role: "Vendeur" } : undefined,
    customer,
    lines,
    totals: {
      subtotal: lines.reduce((a, l) => a + l.unitPrice * l.quantity, 0),
      lineDiscounts: lines.reduce((a, l) => a + (l.lineDiscount ?? 0), 0),
      globalDiscount: vente.remise ? Number(vente.remise) : 0,
      total: Number(vente.montant_total),
    },
    payments: [],
    amountPaid: 0,
    amountDue: Number(vente.montant_total),
    qrContent: vente.numero_proforma ?? undefined,
    validUntil: vente.proforma_valide_jusquau ?? undefined,
    notes:
      vente.statut === "proforma_rejetee"
        ? "Proforma refusée par le client."
        : vente.statut === "proforma_expiree"
        ? "Proforma expirée — sans impact sur le stock."
        : "Facture proforma — sans impact sur le stock tant qu'elle n'est pas transformée en facture définitive.",
  };
}
