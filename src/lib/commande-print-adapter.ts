// Commandes-specific adapter: maps CommandeRead (backend shape) to the
// generic DocumentPrintData the print engine expects. Mirrors
// pos-print-adapter.ts's shape — the print engine never imports from here.

import type { CommandeRead, CommandeLigneRead, StoreRead } from "@/lib/types";
import type { DocumentPrintData, PrintOrganization, PrintCustomer } from "@/lib/print-engine";

function ligneName(ligne: CommandeLigneRead, productName?: (id: number) => string): string {
  if (ligne.produit_id != null) return productName?.(ligne.produit_id) ?? `Produit #${ligne.produit_id}`;
  return ligne.nom_libre ?? "Produit non catalogué";
}

/** The initial demande PDF, generated when a boutique submits its
 * réapprovisionnement request — issued BY the boutique, addressed to HQ. */
export function commandeToDemandeDocument(
  commande: CommandeRead,
  opts: {
    store?: StoreRead | null;
    issuerName?: string;
    productName?: (id: number) => string;
  } = {},
): DocumentPrintData {
  const organization: PrintOrganization = {
    name: opts.store?.name ?? "Boutique",
    address: opts.store?.address ?? undefined,
    // A demande is authored BY the boutique, addressed to HQ — boutique logo,
    // same convention as sale receipts (see pos-print-adapter.ts).
    logo: "/logoBoutique.jpeg",
  };

  const lines = commande.lignes.map((l) => ({
    name: ligneName(l, opts.productName),
    quantity: l.quantite_demandee,
    unitPrice: Number(l.prix_unitaire),
    lineTotal: Number(l.total_ligne),
  }));

  const subtotal = lines.reduce((a, l) => a + l.lineTotal, 0);

  return {
    type: "commande_demande",
    reference: commande.numero ?? `DEM-${commande.id}`,
    date: commande.created_at,
    createdAt: commande.created_at,
    organization,
    issuer: opts.issuerName ? { name: opts.issuerName, role: "Gérant boutique" } : undefined,
    lines,
    totals: { subtotal, total: subtotal },
    payments: [],
    amountPaid: 0,
    amountDue: 0,
    notes: "Demande d'approvisionnement interne — à valider par la Direction Générale (Siège).",
    qrContent: commande.numero ?? undefined,
    footerOverride: "Document interne de réapprovisionnement — sans valeur fiscale.",
  };
}

/** The facture proforma HQ generates once it has validated (fully or
 * partially) a demande — issued BY HQ, addressed to the requesting boutique. */
export function commandeToProformaDocument(
  commande: CommandeRead,
  opts: {
    destinationStore?: StoreRead | null;
    issuerName?: string;
    productName?: (id: number) => string;
  } = {},
): DocumentPrintData {
  const organization: PrintOrganization = {
    name: "AN-NOUR — Direction Générale",
    // A proforma is authored BY HQ, addressed to the boutique — group logo.
    logo: "/logoGroup.jpeg",
  };

  const customer: PrintCustomer | undefined = opts.destinationStore
    ? { name: opts.destinationStore.name, address: opts.destinationStore.address ?? undefined }
    : undefined;

  const lines = commande.lignes.map((l) => ({
    name: ligneName(l, opts.productName),
    quantity: l.quantite_validee,
    unitPrice: Number(l.prix_unitaire),
    lineTotal: Number(l.total_ligne),
  }));

  const dateRef = commande.validated_at ?? commande.created_at;

  return {
    type: "commande_proforma",
    reference: commande.numero_proforma ?? `PRO-${commande.id}`,
    date: dateRef,
    createdAt: dateRef,
    organization,
    issuer: opts.issuerName ? { name: opts.issuerName, role: "Direction Générale" } : undefined,
    customer,
    lines,
    totals: {
      subtotal: Number(commande.montant_ht),
      taxRate: Number(commande.tva_taux),
      tax: Number(commande.montant_tva),
      total: Number(commande.montant_ttc),
    },
    payments: [],
    amountPaid: 0,
    amountDue: Number(commande.montant_ttc),
    notes: "Facture proforma interne — réapprovisionnement boutique.",
    qrContent: commande.numero_proforma ?? undefined,
    footerOverride: "Document interne de réapprovisionnement — sans valeur fiscale.",
  };
}

/** The final facture, generated automatically once the boutique's gérant
 * validates the proforma — issued BY HQ, addressed to the boutique. Same
 * shape/amounts as the proforma, just a different reference/title —
 * accessible to both the Boss and the gérant at any time, like every other
 * document on the demande. */
export function commandeToFactureDocument(
  commande: CommandeRead,
  opts: {
    destinationStore?: StoreRead | null;
    issuerName?: string;
    productName?: (id: number) => string;
  } = {},
): DocumentPrintData {
  const organization: PrintOrganization = {
    name: "AN-NOUR — Direction Générale",
    logo: "/logoGroup.jpeg",
  };

  const customer: PrintCustomer | undefined = opts.destinationStore
    ? { name: opts.destinationStore.name, address: opts.destinationStore.address ?? undefined }
    : undefined;

  const lines = commande.lignes.map((l) => ({
    name: ligneName(l, opts.productName),
    quantity: l.quantite_validee,
    unitPrice: Number(l.prix_unitaire),
    lineTotal: Number(l.total_ligne),
  }));

  const dateRef = commande.validated_at ?? commande.created_at;

  return {
    type: "commande_facture",
    reference: commande.numero_facture ?? `FAC-${commande.id}`,
    date: dateRef,
    createdAt: dateRef,
    organization,
    issuer: opts.issuerName ? { name: opts.issuerName, role: "Direction Générale" } : undefined,
    customer,
    lines,
    totals: {
      subtotal: Number(commande.montant_ht),
      taxRate: Number(commande.tva_taux),
      tax: Number(commande.montant_tva),
      total: Number(commande.montant_ttc),
    },
    payments: [],
    amountPaid: 0,
    amountDue: Number(commande.montant_ttc),
    notes: "Facture interne — réapprovisionnement boutique.",
    qrContent: commande.numero_facture ?? undefined,
    footerOverride: "Document interne de réapprovisionnement — sans valeur fiscale.",
  };
}

/** The bon de livraison, generated the moment HQ ships the goods (see
 * CommandeService.ship, which sets numero_bon_livraison) — travels with the
 * shipment, addressed to the boutique. Accessible to both the Boss and the
 * gérant from that moment on, like every other document on the demande.
 * Shows quantite_livree (what was actually shipped), not quantite_validee —
 * the two only differ if the Boss validated less than requested. */
export function commandeToBonLivraisonDocument(
  commande: CommandeRead,
  opts: {
    destinationStore?: StoreRead | null;
    productName?: (id: number) => string;
  } = {},
): DocumentPrintData {
  const livraison = commande.livraison;
  const organization: PrintOrganization = {
    name: "AN-NOUR — Direction Générale",
    logo: "/logoGroup.jpeg",
  };

  const customer: PrintCustomer | undefined = opts.destinationStore
    ? { name: opts.destinationStore.name, address: opts.destinationStore.address ?? undefined }
    : undefined;

  const lines = commande.lignes.map((l) => ({
    name: ligneName(l, opts.productName),
    quantity: l.quantite_livree,
    unitPrice: 0,
    lineTotal: 0,
  }));

  const dateRef = livraison?.date_expedition ?? commande.created_at;

  return {
    type: "commande_bon_livraison",
    reference: livraison?.numero_bon_livraison ?? `BL-${commande.id}`,
    date: dateRef,
    createdAt: dateRef,
    organization,
    customer,
    lines,
    totals: { subtotal: 0, total: 0 },
    payments: [],
    amountPaid: 0,
    amountDue: 0,
    qrContent: livraison?.qr_content ?? livraison?.numero_bon_livraison ?? undefined,
    footerOverride: "Document interne de réapprovisionnement — sans valeur fiscale.",
    logistics: livraison
      ? {
          transporteur: livraison.transporteur ?? undefined,
          livreurNom: livraison.livreur_nom ?? undefined,
          dateExpedition: livraison.date_expedition ?? undefined,
          dateLivraison: livraison.date_livraison ?? undefined,
          numeroBonPreparation: livraison.numero_bon_preparation ?? undefined,
        }
      : undefined,
  };
}
