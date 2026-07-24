// Generic document data model for the Business Flow Suite print engine.
// Every document type (sale receipt, invoice, PO, delivery note, etc.) maps
// to this shape before it reaches any renderer. No POS-specific fields here.

export type DocumentType =
  | "sale_receipt"
  | "invoice"
  | "purchase_order"
  | "delivery_note"
  | "quote"
  | "credit_note"
  | "payment_receipt"
  | "commande_demande"
  | "commande_proforma"
  | "commande_facture"
  | "commande_bon_livraison";

export type PageFormat = "thermal-58" | "thermal-80" | "a4";

export interface PrintConfig {
  format?: PageFormat;
  currency?: string;
  locale?: string;
  footerMessage?: string;
  showLogo?: boolean;
}

export const DEFAULT_PRINT_CONFIG: PrintConfig = {
  format: "thermal-80",
  currency: "GNF",
  locale: "fr-GN",
  footerMessage: "Merci pour votre achat !",
  showLogo: true,
};

// ── Organization (boutique / company) ────────────────────────────────────────

export interface PrintOrganization {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  nif?: string;
  logo?: string; // URL or data URI
}

// ── Customer ─────────────────────────────────────────────────────────────────

export interface PrintCustomer {
  name: string;
  code?: string;
  phone?: string;
  address?: string;
  email?: string;
}

// ── Document lines (products / services) ────────────────────────────────────

export interface DocumentLine {
  name: string;
  quantity: number;
  unitPrice: number;
  lineDiscount?: number; // absolute GNF amount already deducted
  lineTotal: number;
}

// ── Payments ─────────────────────────────────────────────────────────────────

export interface DocumentPayment {
  method: string; // human-readable label: "Espèces", "Orange Money", …
  amount: number;
  reference?: string;
  change?: number; // cash change only, never stored
}

// ── Totals block ─────────────────────────────────────────────────────────────

export interface DocumentTotals {
  subtotal: number;
  lineDiscounts?: number;
  globalDiscount?: number;
  taxBase?: number;
  taxRate?: number;
  tax?: number;
  total: number;
}

// ── The central generic document ─────────────────────────────────────────────

export interface DocumentPrintData {
  type: DocumentType;
  reference: string;
  date: string;       // ISO string
  createdAt: string;  // ISO string

  organization: PrintOrganization;
  issuer?: { name: string; role?: string };
  customer?: PrintCustomer;

  lines: DocumentLine[];
  totals: DocumentTotals;

  payments: DocumentPayment[];
  amountPaid: number;
  amountDue: number;  // remaining credit (0 when fully paid)

  notes?: string;
  qrContent?: string; // reference, or a future public verification URL
  footerOverride?: string;
  /** Short, prominent banner rendered near the top of the document (e.g.
   * "NON LIVRÉ — à livrer") — used for a sale rung up as non_livre. */
  deliveryNotice?: string;

  // Additive, optional — only present on commande logistics documents (bon
  // de livraison). Never touches any existing document's rendering: the
  // A4Template only adds the extra block when this is set.
  logistics?: {
    transporteur?: string;
    livreurNom?: string;
    dateExpedition?: string; // ISO string
    dateLivraison?: string; // ISO string
    numeroBonPreparation?: string;
  };
}
