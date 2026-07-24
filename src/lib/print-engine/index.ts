// Public API of the Business Flow Suite print engine.
// Import from here — never from internal sub-modules directly.

export type {
  DocumentPrintData,
  DocumentLine,
  DocumentPayment,
  DocumentTotals,
  PrintConfig,
  PageFormat,
  DocumentType,
  PrintOrganization,
  PrintCustomer,
} from "./types";

export { DEFAULT_PRINT_CONFIG } from "./types";
export { PrintPreviewDialog } from "./PrintPreviewDialog";
export { generatePdfBlob, downloadPdf } from "./pdf";
export { printHtml } from "./print";
export { generateQRDataURL } from "./qr";
export { fmtMoney, fmtDate, fmtTime, fmtDateTime } from "./formatters";
