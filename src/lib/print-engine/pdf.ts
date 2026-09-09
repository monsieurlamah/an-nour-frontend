// Programmatic PDF generation using jsPDF (already in the project).
// Draws each element with jsPDF primitives — produces real vector text,
// not a screenshot. Each page format has its own draw function.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { DocumentPrintData, PrintConfig } from "./types";
import { fmtMoney, fmtDateTime, truncate } from "./formatters";
import { generateQRDataURL } from "./qr";
import { loadImageForPdf } from "./image";
import { TYPE_LABEL, isCommandeDocument, isDeliveryNoteType } from "./constants";

const FONT = "helvetica";
const MONO = "courier";

// ── Thermal (58 mm and 80 mm) ─────────────────────────────────────────────────

async function drawThermal(doc: jsPDF, data: DocumentPrintData, cfg: PrintConfig): Promise<void> {
  const mmWidth = cfg.format === "thermal-58" ? 58 : 80;
  const margin = 3;
  const contentW = mmWidth - margin * 2;
  const currency = cfg.currency ?? "GNF";
  const locale = cfg.locale ?? "fr-GN";
  let y = margin + 2;

  const lineH = 4;
  const titleH = 5.5;

  const center = (text: string, size: number, bold = false) => {
    doc.setFontSize(size);
    doc.setFont(FONT, bold ? "bold" : "normal");
    const tw = (doc.getStringUnitWidth(text) * size) / doc.internal.scaleFactor;
    doc.text(text, margin + (contentW - tw) / 2, y);
    y += lineH;
  };

  const left = (text: string, size = 7) => {
    doc.setFontSize(size);
    doc.setFont(FONT, "normal");
    doc.text(text, margin, y);
    y += lineH;
  };

  const row = (label: string, value: string, size = 7, bold = false) => {
    doc.setFontSize(size);
    doc.setFont(FONT, bold ? "bold" : "normal");
    doc.text(truncate(label, 28), margin, y);
    const vw = (doc.getStringUnitWidth(value) * size) / doc.internal.scaleFactor;
    doc.text(value, margin + contentW - vw, y);
    y += lineH;
  };

  const sep = (char = "-") => {
    doc.setFontSize(7);
    doc.setFont(MONO, "normal");
    const lineCount = Math.floor(contentW / 1.8);
    doc.text(char.repeat(lineCount), margin, y);
    y += lineH - 1;
  };

  // Logo
  if (cfg.showLogo && data.organization.logo) {
    try {
      const logo = await loadImageForPdf(data.organization.logo);
      if (logo) {
        doc.addImage(logo.dataUrl, logo.format, margin + contentW / 4, y, contentW / 2, contentW / 2);
        y += contentW / 2 + 2;
      }
    } catch { /* skip broken logo */ }
  }

  // Header
  center(data.organization.name, 11, true);
  if (data.organization.address) { doc.setFontSize(7); center(data.organization.address, 7); }
  if (data.organization.phone) { center(data.organization.phone, 7); }
  if (data.organization.nif) { center(`NIF: ${data.organization.nif}`, 7); }

  const isDeliveryNote = isDeliveryNoteType(data.type);

  sep("=");
  center(TYPE_LABEL[data.type] ?? "DOCUMENT", 9, true);
  sep("=");

  if (data.deliveryNotice) {
    center(data.deliveryNotice, 8, true);
    sep();
  }

  left(`Réf: ${data.reference}`);
  left(`Date: ${fmtDateTime(data.createdAt, locale)}`);
  if (data.issuer) left(`Caissier: ${data.issuer.name}`);
  if (data.customer) left(`Client: ${data.customer.name}`);
  if (data.notes) left(data.notes, 6);

  sep();

  // Products header
  doc.setFontSize(7);
  doc.setFont(MONO, "bold");
  const nameW = Math.round(contentW * 0.45);
  const qtyW = Math.round(contentW * 0.1);
  const priceW = Math.round(contentW * 0.22);
  const totalW = Math.round(contentW * 0.23);
  doc.text("Article", margin, y);
  doc.text("Qté", margin + nameW, y);
  if (!isDeliveryNote) {
    doc.text("P.U.", margin + nameW + qtyW, y);
    doc.text("Total", margin + nameW + qtyW + priceW, y);
  }
  y += lineH;
  sep();

  // Products
  doc.setFont(MONO, "normal");
  for (const line of data.lines) {
    const name = truncate(line.name, 20);
    const qty = String(line.quantity);
    doc.text(name, margin, y);
    doc.text(qty, margin + nameW, y);
    if (!isDeliveryNote) {
      const pu = fmtMoney(line.unitPrice, currency, locale).replace(/\s/g, "").replace(currency, "");
      const total = fmtMoney(line.lineTotal, currency, locale).replace(/\s/g, "").replace(currency, "");
      doc.text(pu, margin + nameW + qtyW, y);
      doc.text(total, margin + nameW + qtyW + priceW, y);
    }
    y += lineH - 0.5;
    if (!isDeliveryNote && line.lineDiscount && line.lineDiscount > 0) {
      doc.setFontSize(6);
      doc.text(`  Remise: -${fmtMoney(line.lineDiscount, currency, locale)}`, margin, y);
      y += lineH - 1;
      doc.setFontSize(7);
    }
  }

  sep();

  if (!isDeliveryNote) {
    // Totals
    const t = data.totals;
    if (t.lineDiscounts && t.lineDiscounts > 0) row("Remise lignes", `-${fmtMoney(t.lineDiscounts, currency, locale)}`);
    if (t.globalDiscount && t.globalDiscount > 0) row("Remise globale", `-${fmtMoney(t.globalDiscount, currency, locale)}`);
    if (t.tax && t.tax > 0) row(`Taxe (${t.taxRate}%)`, fmtMoney(t.tax, currency, locale));
    row("TOTAL", fmtMoney(t.total, currency, locale), 8, true);

    sep("=");

    // Payments — omitted for internal commande documents (bon de commande /
    // proforma / facture): no real payment is ever recorded against them.
    if (!isCommandeDocument(data.type)) {
      for (const p of data.payments) {
        row(p.method, fmtMoney(p.amount, currency, locale));
        if (p.reference) left(`  Réf: ${p.reference}`, 6);
        if (p.change && p.change > 0) row("Monnaie rendue", fmtMoney(p.change, currency, locale));
      }
      row("PAYÉ", fmtMoney(data.amountPaid, currency, locale), 8, true);
      if (data.amountDue > 0) {
        row("RESTE (créance)", fmtMoney(data.amountDue, currency, locale), 8, true);
      }

      sep("=");
    }
  }

  // QR Code
  if (data.qrContent) {
    try {
      const qrUrl = await generateQRDataURL(data.qrContent);
      const qrSize = contentW * 0.4;
      doc.addImage(qrUrl, "PNG", margin + (contentW - qrSize) / 2, y, qrSize, qrSize);
      y += qrSize + 2;
    } catch { /* skip if QR fails */ }
  }

  // Footer — first line bold (identity), the rest smaller (contact/activities).
  const footerLines = (data.footerOverride ?? cfg.footerMessage ?? "Merci pour votre achat !")
    .split("\n")
    .filter(Boolean);
  footerLines.forEach((line, i) => center(line, i === 0 ? 8 : 6, i === 0));
  y += 2;
}

// ── A4 invoice ───────────────────────────────────────────────────────────────

async function drawA4(doc: jsPDF, data: DocumentPrintData, cfg: PrintConfig): Promise<void> {
  const currency = cfg.currency ?? "GNF";
  const locale = cfg.locale ?? "fr-GN";
  const pW = 210; // mm
  const margin = 15;
  const contentW = pW - margin * 2;
  let y = margin;

  // Header stripe
  doc.setFillColor(30, 41, 59); // dark slate
  doc.rect(0, 0, pW, 35, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont(FONT, "bold");
  doc.text(data.organization.name, margin, 15);
  doc.setFontSize(9);
  doc.setFont(FONT, "normal");
  let orgY = 22;
  if (data.organization.address) { doc.text(data.organization.address, margin, orgY); orgY += 5; }
  if (data.organization.phone) doc.text(`Tél: ${data.organization.phone}`, margin, orgY);
  if (data.organization.nif) doc.text(`NIF: ${data.organization.nif}`, pW / 2, 22);

  // Logo (top right)
  if (cfg.showLogo && data.organization.logo) {
    try {
      const logo = await loadImageForPdf(data.organization.logo);
      if (logo) doc.addImage(logo.dataUrl, logo.format, pW - margin - 25, 5, 22, 22);
    } catch { /* skip */ }
  }

  doc.setTextColor(0, 0, 0);
  y = 45;

  if (data.deliveryNotice) {
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(253, 230, 138);
    doc.rect(margin, y - 6, contentW, 10, "FD");
    doc.setFontSize(10);
    doc.setFont(FONT, "bold");
    doc.setTextColor(146, 64, 14);
    doc.text(data.deliveryNotice, pW / 2, y, { align: "center" });
    doc.setTextColor(0, 0, 0);
    y += 12;
  }

  // Document title + reference
  doc.setFontSize(16);
  doc.setFont(FONT, "bold");
  doc.text(TYPE_LABEL[data.type] ?? "DOCUMENT", margin, y);
  doc.setFontSize(10);
  doc.setFont(FONT, "normal");
  doc.text(`Référence: ${data.reference}`, pW - margin - 60, y);
  y += 6;
  doc.text(`Date: ${fmtDateTime(data.createdAt, locale)}`, pW - margin - 60, y);
  y += 6;

  if (data.notes) {
    doc.setFontSize(7.5);
    doc.setFont(FONT, "italic");
    doc.setTextColor(148, 163, 184);
    doc.text(data.notes, margin, y);
    doc.setTextColor(0, 0, 0);
    y += 6;
  }
  y += 4;

  // Customer + Issuer info boxes
  if (data.customer) {
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y, contentW / 2 - 5, 28, "F");
    doc.setFontSize(9);
    doc.setFont(FONT, "bold");
    doc.text("CLIENT", margin + 3, y + 6);
    doc.setFont(FONT, "normal");
    let cy = y + 12;
    doc.text(data.customer.name, margin + 3, cy); cy += 5;
    if (data.customer.phone) { doc.text(data.customer.phone, margin + 3, cy); cy += 5; }
    if (data.customer.address) doc.text(data.customer.address, margin + 3, cy);
  }
  if (data.issuer) {
    const sx = margin + contentW / 2 + 5;
    doc.setFillColor(248, 250, 252);
    doc.rect(sx, y, contentW / 2 - 5, 28, "F");
    doc.setFontSize(9);
    doc.setFont(FONT, "bold");
    doc.text("VENDEUR", sx + 3, y + 6);
    doc.setFont(FONT, "normal");
    doc.text(data.issuer.name, sx + 3, y + 12);
    if (data.issuer.role) doc.text(data.issuer.role, sx + 3, y + 17);
  }
  if (data.logistics) {
    const sx = margin + contentW / 2 + 5;
    doc.setFillColor(248, 250, 252);
    doc.rect(sx, y, contentW / 2 - 5, 28, "F");
    doc.setFontSize(9);
    doc.setFont(FONT, "bold");
    doc.text("EXPÉDITION", sx + 3, y + 6);
    doc.setFont(FONT, "normal");
    let ly = y + 12;
    if (data.logistics.transporteur) { doc.text(`Transporteur: ${data.logistics.transporteur}`, sx + 3, ly); ly += 5; }
    if (data.logistics.livreurNom) { doc.text(`Livreur: ${data.logistics.livreurNom}`, sx + 3, ly); ly += 5; }
    if (data.logistics.dateExpedition) doc.text(`Expédié le: ${fmtDateTime(data.logistics.dateExpedition, locale)}`, sx + 3, ly);
  }
  y += 35;

  const isDeliveryNote = isDeliveryNoteType(data.type);

  // Product table — a bon de livraison only needs Article + Qté.
  autoTable(doc, {
    startY: y,
    head: isDeliveryNote ? [["Article", "Qté"]] : [["Article", "Qté", "Prix unitaire", "Remise", "Total"]],
    body: data.lines.map((l) =>
      isDeliveryNote
        ? [l.name, String(l.quantity)]
        : [
            l.name,
            String(l.quantity),
            fmtMoney(l.unitPrice, currency, locale),
            l.lineDiscount && l.lineDiscount > 0 ? `-${fmtMoney(l.lineDiscount, currency, locale)}` : "",
            fmtMoney(l.lineTotal, currency, locale),
          ],
    ),
    styles: { fontSize: 9, font: FONT },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: isDeliveryNote
      ? { 0: { cellWidth: "auto" }, 1: { halign: "center", cellWidth: 20 } }
      : {
          0: { cellWidth: "auto" },
          1: { halign: "center", cellWidth: 13 },
          2: { halign: "right", cellWidth: 34 },
          3: { halign: "right", cellWidth: 20 },
          4: { halign: "right", cellWidth: 40 },
        },
    margin: { left: margin, right: margin },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 8;

  if (!isDeliveryNote) {
    // Totals block (right-aligned)
    const totalsX = pW - margin - 70;
    const totalsW = 70;
    doc.setFillColor(248, 250, 252);
    doc.rect(totalsX, y, totalsW, 32, "F");
    let ty = y + 7;
    const totRow = (label: string, val: string, bold = false) => {
      doc.setFontSize(9);
      doc.setFont(FONT, bold ? "bold" : "normal");
      doc.text(label, totalsX + 3, ty);
      const vw = (doc.getStringUnitWidth(val) * 9) / doc.internal.scaleFactor;
      doc.text(val, totalsX + totalsW - 3 - vw, ty);
      ty += 5;
    };
    const t = data.totals;
    if (t.globalDiscount && t.globalDiscount > 0) totRow("Remise", `-${fmtMoney(t.globalDiscount, currency, locale)}`);
    if (t.tax && t.tax > 0) totRow(`Taxe (${t.taxRate}%)`, fmtMoney(t.tax, currency, locale));
    totRow("TOTAL", fmtMoney(t.total, currency, locale), true);
    y += 40;

    // Payments — omitted for internal commande documents (bon de commande /
    // proforma / facture): no real payment is ever recorded against them.
    if (!isCommandeDocument(data.type)) {
      doc.setFontSize(10);
      doc.setFont(FONT, "bold");
      doc.text("Paiements", margin, y);
      y += 6;
      for (const p of data.payments) {
        doc.setFontSize(9);
        doc.setFont(FONT, "normal");
        const txt = p.reference ? `${p.method} (${p.reference})` : p.method;
        doc.text(txt, margin, y);
        doc.text(fmtMoney(p.amount, currency, locale), pW - margin, y, { align: "right" });
        y += 5;
      }
      if (data.amountDue > 0) {
        doc.setFont(FONT, "bold");
        doc.setTextColor(220, 38, 38);
        doc.text("Montant restant (créance)", margin, y);
        doc.text(fmtMoney(data.amountDue, currency, locale), pW - margin, y, { align: "right" });
        doc.setTextColor(0, 0, 0);
        y += 5;
      }
      y += 8;
    }
  }

  // QR Code
  if (data.qrContent) {
    try {
      const qrUrl = await generateQRDataURL(data.qrContent);
      doc.addImage(qrUrl, "PNG", margin, y, 28, 28);
      doc.setFontSize(7);
      doc.text(data.qrContent, margin, y + 31);
      y += 35;
    } catch { /* skip */ }
  }

  // Footer — pinned near the bottom of the page like a letterhead: first
  // line bold (identity), the rest smaller (contact/activities), separated
  // from the body by a thin rule.
  const footerLines = (data.footerOverride ?? cfg.footerMessage ?? "").split("\n").filter(Boolean);
  if (footerLines.length > 0) {
    let fy = Math.max(y, 262);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, fy, pW - margin, fy);
    fy += 6;
    footerLines.forEach((line, i) => {
      doc.setFontSize(i === 0 ? 11 : i === 1 ? 9 : 8);
      doc.setFont(FONT, i === 0 ? "bold" : "normal");
      doc.setTextColor(i <= 1 ? 30 : 148, i <= 1 ? 41 : 163, i <= 1 ? 59 : 184);
      const lines = doc.splitTextToSize(line, contentW);
      doc.text(lines, pW / 2, fy, { align: "center" });
      fy += 4.5 * (Array.isArray(lines) ? lines.length : 1);
    });
    doc.setTextColor(0, 0, 0);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Generates a PDF Blob for the given document. Caller downloads or previews it. */
export async function generatePdfBlob(
  data: DocumentPrintData,
  cfg: PrintConfig = {},
): Promise<Blob> {
  const format = cfg.format ?? "thermal-80";

  let doc: jsPDF;
  if (format === "thermal-58") {
    doc = new jsPDF({ unit: "mm", format: [58, 200], orientation: "portrait" });
  } else if (format === "thermal-80") {
    doc = new jsPDF({ unit: "mm", format: [80, 240], orientation: "portrait" });
  } else {
    doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  }

  if (format === "a4") {
    await drawA4(doc, data, cfg);
  } else {
    await drawThermal(doc, data, cfg);
  }

  return doc.output("blob");
}

/** Triggers a browser download of the generated PDF. */
export async function downloadPdf(
  data: DocumentPrintData,
  cfg: PrintConfig = {},
  filename?: string,
): Promise<void> {
  const blob = await generatePdfBlob(data, cfg);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? `${data.reference}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
