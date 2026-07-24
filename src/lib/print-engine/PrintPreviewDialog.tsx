// The unified print/download dialog for the Business Flow Suite.
// Accepts a DocumentPrintData and a PrintConfig, renders a preview of the
// selected format, and exposes Print + Download PDF + Close actions.
// NOT specific to the POS — any module can use this component directly.

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Printer, Download, X as CloseIcon, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import type { DocumentPrintData, PrintConfig, PageFormat } from "./types";
import { DEFAULT_PRINT_CONFIG } from "./types";
import { ThermalTemplate } from "./templates/ThermalTemplate";
import { A4Template } from "./templates/A4Template";
import { generateQRDataURL } from "./qr";
import { printHtml } from "./print";
import { downloadPdf } from "./pdf";

const FORMAT_LABELS: Record<PageFormat, string> = {
  "thermal-58": "Ticket 58 mm",
  "thermal-80": "Ticket 80 mm",
  a4: "Facture A4",
};

// Label shown next to the success checkmark when `showSuccess` is set —
// keyed by document type so the banner never says "Vente enregistrée" for
// a non-sale document (e.g. a commande demande/proforma).
const SUCCESS_LABEL: Partial<Record<DocumentPrintData["type"], string>> = {
  sale_receipt: "Vente enregistrée",
  invoice: "Facture générée",
  commande_demande: "Demande soumise",
  commande_proforma: "Facture proforma générée",
  commande_facture: "Facture générée",
  commande_bon_livraison: "Commande expédiée",
};

export function PrintPreviewDialog({
  document: doc,
  config: configProp,
  open,
  onClose,
  showSuccess,
}: {
  document: DocumentPrintData | null;
  config?: Partial<PrintConfig>;
  open: boolean;
  onClose: () => void;
  /** Shows a success banner (label from SUCCESS_LABEL, keyed by document type). */
  showSuccess?: boolean;
}) {
  const config: PrintConfig = { ...DEFAULT_PRINT_CONFIG, ...configProp };
  const [format, setFormat] = useState<PageFormat>(config.format ?? "thermal-80");
  const [qrDataUrl, setQrDataUrl] = useState<string | undefined>(undefined);
  const [pdfLoading, setPdfLoading] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // Reset to default format each time a new document is presented —
  // so a user switching to A4 for one receipt doesn't carry that choice
  // over to the next one unexpectedly.
  useEffect(() => {
    if (doc) setFormat(config.format ?? "thermal-80");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.reference]);

  // Generate QR once per document
  useEffect(() => {
    if (!doc?.qrContent) { setQrDataUrl(undefined); return; }
    generateQRDataURL(doc.qrContent).then(setQrDataUrl).catch(() => setQrDataUrl(undefined));
  }, [doc?.qrContent]);

  if (!doc) return null;

  const activeConfig: PrintConfig = { ...config, format };

  // ── Print ──────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    if (!previewRef.current) return;
    const html = previewRef.current.innerHTML;
    printHtml(html, format);
  };

  // ── PDF download ───────────────────────────────────────────────────────────
  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    try {
      await downloadPdf(doc, activeConfig, `${doc.reference}.pdf`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de la génération du PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pdfLoading && !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="flex-none border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-3">
            {showSuccess && (
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-success/15 text-success">
                <Check className="h-4 w-4" strokeWidth={3} />
              </div>
            )}
            <span>
              {showSuccess ? SUCCESS_LABEL[doc.type] ?? "Opération enregistrée" : "Aperçu impression"}
            </span>
            <div className="ml-auto">
              <Select value={format} onValueChange={(v) => setFormat(v as PageFormat)}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(FORMAT_LABELS) as [PageFormat, string][]).map(([v, l]) => (
                    <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Preview area */}
        <ScrollArea className="flex-1 bg-slate-100 px-6 py-6">
          <div className="flex justify-center">
            <div
              ref={previewRef}
              className="shadow-md"
              style={{
                background: "#fff",
                width: format === "a4" ? "210mm" : format === "thermal-58" ? "58mm" : "80mm",
                minWidth: format === "a4" ? "600px" : undefined,
                transformOrigin: "top center",
                // Scale down A4 preview to fit the modal
                ...(format === "a4"
                  ? { transform: "scale(0.6)", transformOrigin: "top center", marginBottom: "-200px" }
                  : {}),
              }}
            >
              {format === "a4" ? (
                <A4Template data={doc} config={activeConfig} qrDataUrl={qrDataUrl} />
              ) : (
                <ThermalTemplate data={doc} config={activeConfig} qrDataUrl={qrDataUrl} />
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="flex-none gap-2 border-t px-6 py-4 sm:justify-between">
          <Button variant="outline" onClick={onClose} disabled={pdfLoading}>
            <CloseIcon className="mr-1.5 h-4 w-4" /> Fermer
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePrint} disabled={pdfLoading}>
              <Printer className="mr-1.5 h-4 w-4" /> Imprimer
            </Button>
            <Button onClick={handleDownloadPdf} disabled={pdfLoading} className="shadow-glow">
              {pdfLoading ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-4 w-4" />
              )}
              Télécharger PDF
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
