// Transferts-specific adapter: maps TransfertRead (backend shape) to the
// generic DocumentPrintData the print engine expects. Mirrors
// commande-print-adapter.ts's shape — the print engine never imports from
// here. Always on the AN-NOUR GROUP letterhead: a transfert is an internal,
// cross-boutique administrative document, exactly like every commande
// logistics document.

import type { TransfertRead } from "@/lib/types";
import type { DocumentPrintData, PrintOrganization, PrintCustomer } from "@/lib/print-engine";

const DIRECTION_GENERALE: PrintOrganization = {
  name: "AN-NOUR — Direction Générale",
  logo: "/logoGroup.jpeg",
  brand: "group",
};

const INTERNAL_DISCLAIMER = "Document interne de mouvement de stock — sans valeur fiscale.";

export function transfertToBonDocument(
  transfert: TransfertRead,
  opts: { productName?: (id: number) => string } = {},
): DocumentPrintData {
  const organization: PrintOrganization = transfert.boutique_source_id
    ? {
        name: transfert.boutique_source_name ?? "Boutique",
        brand: "boutique",
        logo: "/logoBoutique.jpeg",
      }
    : DIRECTION_GENERALE;

  const customer: PrintCustomer = {
    name: transfert.boutique_destination_name ?? "Boutique principale",
  };

  const lines = transfert.lignes.map((l) => ({
    name: opts.productName?.(l.produit_id) ?? `Produit #${l.produit_id}`,
    quantity: l.quantite_envoyee,
    unitPrice: 0,
    lineTotal: 0,
  }));

  return {
    type: "transfert_bon",
    reference: transfert.numero,
    date: transfert.expedie_at ?? transfert.created_at,
    createdAt: transfert.expedie_at ?? transfert.created_at,
    organization,
    customer,
    lines,
    totals: { subtotal: 0, total: 0 },
    payments: [],
    amountPaid: 0,
    amountDue: 0,
    notes: transfert.motif
      ? `${INTERNAL_DISCLAIMER} Motif : ${transfert.motif}`
      : INTERNAL_DISCLAIMER,
    qrContent: transfert.numero,
  };
}
