// Shared constants for the print engine's three independent renderers (DOM
// preview/print — A4Template/ThermalTemplate — and the programmatic jsPDF
// generator in pdf.ts). Both label and footer text used to be duplicated in
// each renderer; centralizing them here means the printed page, the browser
// print, and the downloaded PDF can never drift from one another.

export const TYPE_LABEL: Record<string, string> = {
  sale_receipt: "REÇU DE VENTE",
  invoice: "FACTURE",
  purchase_order: "BON DE COMMANDE",
  delivery_note: "BON DE LIVRAISON",
  quote: "DEVIS",
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
  return type === "delivery_note" || type === "commande_bon_livraison";
}

// Fixed footer identity block, printed on every commande document (bon de
// commande / facture proforma / facture / bon de livraison) regardless of
// the destination boutique — one string, "\n"-separated so each renderer can
// lay every line out on its own (DOM: split + <div>; jsPDF: split + text()).
export const COMMANDE_DOCUMENT_FOOTER = [
  "Agence Carrefour Dare-es-Salam, Commune de Ratoma",
  "Tel : (+224) 620 16 16 42 / 661 89 89 60",
  "Carrelage - Sanitaire - Plomberie - Robinetterie - Electroménager - Electricité - " +
    "Porte - Cuisine - Placo - Contre-plaqué - Aménagement intérieur - Matériaux de construction",
].join("\n");
