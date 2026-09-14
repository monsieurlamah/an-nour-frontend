// Shared constants for the print engine's renderers (DOM preview/print —
// A4Template/ThermalTemplate — and the PDF generator in pdf.ts). Label and
// footer text used to be duplicated in each renderer; centralizing them here
// means the printed page, the browser print, and the downloaded PDF can never
// drift from one another.

export const TYPE_LABEL: Record<string, string> = {
  sale_receipt: "REÇU DE VENTE",
  invoice: "FACTURE",
  purchase_order: "BON DE COMMANDE",
  delivery_note: "BON DE LIVRAISON",
  // The sales-side devis (cahier des charges §9.1) is a *facture proforma*,
  // not a "devis" — same wording as the réappro proforma so the two print
  // identically.
  quote: "FACTURE PROFORMA",
  credit_note: "AVOIR",
  payment_receipt: "REÇU DE PAIEMENT",
  // The boutique's réapprovisionnement request IS its bon de commande to la
  // Direction Générale (the group's single internal fournisseur) — labelled
  // accordingly on the printed/PDF document, even though the API/route code
  // keeps calling it a "demande" internally.
  commande_demande: "BON DE COMMANDE",
  commande_proforma: "FACTURE PROFORMA",
  commande_facture: "FACTURE",
  commande_bon_livraison: "BON DE LIVRAISON",
  transfert_bon: "BON DE TRANSFERT",
  releve_compte: "RELEVÉ DE COMPTE",
};

/** Title-case variant of TYPE_LABEL, for the A4 boutique design whose title
 * is a serif italic "Facture" rather than an all-caps block. An A4 print of a
 * sale is its *facture* (the thermal ticket is the reçu). */
export const TYPE_TITLE: Record<string, string> = {
  sale_receipt: "Facture",
  invoice: "Facture",
  purchase_order: "Bon de commande",
  delivery_note: "Bon de livraison",
  quote: "Facture proforma",
  credit_note: "Avoir",
  payment_receipt: "Reçu de paiement",
  commande_demande: "Bon de commande",
  commande_proforma: "Facture proforma",
  commande_facture: "Facture",
  commande_bon_livraison: "Bon de livraison",
  transfert_bon: "Bon de transfert",
  releve_compte: "Relevé de compte",
};

/** True for the internal réappro documents (bon de commande / facture
 * proforma / facture / bon de livraison) — no real payment is ever recorded
 * against them (it's a stock transfer inside the same company, not a sale),
 * so every renderer hides the Paiements/Reste (créance) block for them. */
export function isCommandeDocument(type: string): boolean {
  return type.startsWith("commande_");
}

/** A delivery note is about what's being handed over, not money — shared by
 * every renderer to hide pricing/totals/payments. */
export function isDeliveryNoteType(type: string): boolean {
  return type === "delivery_note" || type === "commande_bon_livraison" || type === "transfert_bon";
}

/** Documents that are business paperwork (facture / proforma / bon de
 * commande / bon de livraison) open in A4 by default — only the POS ticket
 * (sale_receipt) defaults to the thermal printer. */
export function isA4ByDefault(type: string): boolean {
  return type !== "sale_receipt";
}

// Fixed footer identity block, printed at the bottom of EVERY A4 document
// (facture, facture proforma, bon de commande, bon de livraison) regardless
// of which entity issued it. Line 1 = agency, line 2 = phones, line 3 = the
// activities strip — laid out exactly like the printed letterhead.
export const DOCUMENT_FOOTER_LINES: readonly string[] = [
  "Agence Carrefour Dare-es-Salam, Commune de Ratoma",
  "Tel : (+224) 620 16 16 42 / 661 89 89 60",
  "Carrelage - Sanitaire - Plomberie - Robinetterie - Electroménager - Electricité - " +
    "Porte - Cuisine - Placo - Contre-plaqué - Aménagement intérieur - Matériaux de construction",
];

/** Same block as one "\n"-separated string, for the thermal renderers that
 * lay every footer line out on its own. */
export const COMMANDE_DOCUMENT_FOOTER = DOCUMENT_FOOTER_LINES.join("\n");

/** Google Fonts used by the two A4 designs (Barlow Condensed for the GROUP
 * title/labels, Fraunces for the Immobilier & Déco title/labels, Inter for
 * body text). Loaded once in the app shell and again inside the isolated
 * print iframe, which has its own document. */
export const PRINT_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700" +
  "&family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,500;1,9..144,600;1,9..144,700" +
  "&family=Inter:wght@400;500;600;700;800&display=swap";
