// PDF generation using jsPDF (already in the project).
//   • Thermal tickets are drawn with jsPDF primitives (vector text).
//   • A4 documents are the *same* A4Template the preview and the browser
//     print use, mounted off-screen and rasterised with html2canvas — so the
//     downloaded PDF is pixel-identical to the approved letterhead design
//     (Google fonts, swatch bars, bordered title block…) instead of a
//     hand-drawn approximation that would drift from it.

import jsPDF from "jspdf";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import type { DocumentPrintData, PrintConfig } from "./types";
import { fmtMoney, fmtDateTime, truncate } from "./formatters";
import { generateQRDataURL } from "./qr";
import { loadImageForPdf } from "./image";
import { TYPE_LABEL, isCommandeDocument, isDeliveryNoteType, PRINT_FONTS_URL } from "./constants";
import { A4Template } from "./templates/A4Template";

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

// ── A4 document — rasterised from the shared A4Template ──────────────────────

const A4_W_MM = 210;
const A4_H_MM = 297;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

async function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) return resolve();
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  );
}

/** Waits for an iframe's own document to finish loading — `<iframe>.onload`
 * fires once for the initial `about:blank`, so a `readyState` poll after
 * `document.write()` is the only reliable signal for content written via
 * `iframeDoc.write()`. */
function waitForIframeReady(iframeDoc: Document): Promise<void> {
  if (iframeDoc.readyState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if (iframeDoc.readyState === "complete") resolve();
      else setTimeout(check, 30);
    };
    check();
  });
}

async function drawA4(doc: jsPDF, data: DocumentPrintData, cfg: PrintConfig): Promise<void> {
  if (typeof document === "undefined") throw new Error("La génération PDF A4 nécessite un navigateur.");

  const qrDataUrl = data.qrContent
    ? await generateQRDataURL(data.qrContent).catch(() => undefined)
    : undefined;

  // html2canvas (1.4.1, unmaintained) clones the ENTIRE document that owns
  // the target element — including every <style>/<link> in <head> — and its
  // color parser predates CSS Color 4, so it throws the moment it meets one
  // of the app's Tailwind v4 `oklch(...)` tokens, even on an ancestor the
  // sheet itself never touches. The fix used everywhere else in this file
  // for the exact same reason (browser print, see print.ts) is to render
  // into an ISOLATED iframe that only ever sees this component's own inline
  // styles + the two Google Fonts — never the app's stylesheet.
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:210mm;height:297mm;border:none;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);
  const iframeDoc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!iframeDoc) {
    iframe.remove();
    throw new Error("Impossible de préparer le document A4.");
  }
  iframeDoc.open();
  iframeDoc.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8">` +
      `<link rel="preconnect" href="https://fonts.googleapis.com">` +
      `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
      `<link rel="stylesheet" href="${PRINT_FONTS_URL}">` +
      `<style>*{box-sizing:border-box;}html,body{margin:0;padding:0;background:#fff;}` +
      `img{max-width:100%;height:auto;}table{border-collapse:collapse;width:100%;}</style>` +
      `</head><body></body></html>`,
  );
  iframeDoc.close();
  await waitForIframeReady(iframeDoc);

  const root = createRoot(iframeDoc.body);

  try {
    root.render(createElement(A4Template, { data, config: { ...cfg, format: "a4" }, qrDataUrl }));
    await nextFrame();
    const fonts = (iframeDoc as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
    if (fonts?.ready) await fonts.ready;
    await waitForImages(iframeDoc.body);
    await nextFrame();

    const sheet = iframeDoc.body.firstElementChild as HTMLElement | null;
    if (!sheet) throw new Error("Impossible de préparer le document A4.");

    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(sheet, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: sheet.scrollWidth,
    });

    // Slice the tall bitmap into A4 pages (almost always a single page — the
    // sheet is min-height 297mm — but a very long line list may overflow).
    const pxPerMm = canvas.width / A4_W_MM;
    const pageHpx = Math.floor(A4_H_MM * pxPerMm);
    let offset = 0;
    let first = true;
    while (offset < canvas.height) {
      const sliceH = Math.min(pageHpx, canvas.height - offset);
      // Ignore a sub-2mm sliver left over by rounding.
      if (!first && sliceH < 2 * pxPerMm) break;
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = sliceH;
      const ctx = slice.getContext("2d");
      if (!ctx) break;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, offset, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      if (!first) doc.addPage();
      doc.addImage(slice.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, A4_W_MM, sliceH / pxPerMm);
      first = false;
      offset += sliceH;
    }
  } finally {
    root.unmount();
    iframe.remove();
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
