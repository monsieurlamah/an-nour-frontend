// Créances-specific adapter: builds the "relevé de compte client" printable
// document (cahier des charges §8.2 — "Relevé de compte client
// imprimable/exportable sur une période donnée") from the client's créances
// already loaded on the /app/debts page — no extra fetch needed. Reuses the
// generic print engine's "lines" as one row per créance (not per payment):
// montant initial, ce qui reste dû, et le statut, la donnée que le
// propriétaire/gérant veut voir d'un coup d'œil sur un relevé.

import type { CreanceRead } from "@/lib/types";
import type { DocumentPrintData, PrintOrganization, PrintCustomer } from "@/lib/print-engine";

const STATUT_LABEL: Record<string, string> = {
  active: "En cours",
  partiellement_payee: "Partiellement payée",
  en_retard: "En retard",
  soldee: "Soldée",
  annulee: "Annulée",
};

export function creancesToReleveDocument(
  creances: CreanceRead[],
  opts: { clientName: string; clientPhone?: string | null; storeName?: string | null },
): DocumentPrintData {
  const organization: PrintOrganization = {
    name: opts.storeName ?? "AN-NOUR",
    brand: "boutique",
    logo: "/logoBoutique.jpeg",
  };
  const customer: PrintCustomer = { name: opts.clientName, phone: opts.clientPhone ?? undefined };

  const lines = creances.map((c) => ({
    name: `Créance #${c.id} — ${STATUT_LABEL[c.statut] ?? c.statut}${
      c.date_echeance ? ` (échéance ${new Date(c.date_echeance).toLocaleDateString("fr-FR")})` : ""
    }`,
    quantity: 1,
    unitPrice: Number(c.montant_initial),
    lineTotal: Number(c.montant_restant),
  }));

  const totalInitial = creances.reduce((a, c) => a + Number(c.montant_initial), 0);
  const totalRestant = creances.reduce((a, c) => a + Number(c.montant_restant), 0);

  return {
    type: "releve_compte",
    reference: `RELEVE-${opts.clientName.replace(/\s+/g, "-").toUpperCase()}`,
    date: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    organization,
    customer,
    lines,
    totals: { subtotal: totalInitial, total: totalRestant },
    payments: [],
    amountPaid: totalInitial - totalRestant,
    amountDue: totalRestant,
    notes: "Relevé de compte — montant initial par créance en « P.U. », solde dû en « Total ».",
  };
}
