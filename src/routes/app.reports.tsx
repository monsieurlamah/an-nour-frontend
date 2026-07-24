import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import ExcelJS, { type Worksheet, type Borders } from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { PageHeader } from "@/components/app-shell";
import { KpiCard } from "@/components/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtXAF } from "@/lib/mock-data";
import { reportsApi } from "@/lib/api";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useWorkContext } from "@/lib/work-context";

export const Route = createFileRoute("/app/reports")({ component: Page });

const tip = { contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 } } as const;

const intFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const fmtInt = (n: number) => intFmt.format(n);

function pctDelta(current: number, previous: number): number | undefined {
  if (!previous) return undefined;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function fmtPct(n: number): string {
  const s = n.toFixed(1);
  return `${(s.endsWith(".0") ? s.slice(0, -2) : s).replace(".", ",")}%`;
}

// jsPDF's core fonts (Helvetica/Times/Courier) don't have a glyph for the
// narrow no-break space (U+202F) that Intl's fr-FR grouping uses — it falls
// back to a stray "/" in the rendered PDF. Swap in a plain space for PDF text only.
const pdfXAF = (n: number) => fmtXAF(n).replace(/[\u00A0\u202F]/g, " ");

// Shared export brand palette (mirrors the app's navy/gold AN-NOUR theme).
const RGB = {
  indigo: [0, 31, 95] as [number, number, number], // brand navy #001F5F
  slate: [30, 41, 59] as [number, number, number],
  slateLight: [100, 116, 139] as [number, number, number],
  green: [22, 163, 74] as [number, number, number],
  red: [220, 38, 38] as [number, number, number],
  zebra: [248, 250, 252] as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

const ARGB = {
  indigo: "FF001F5F", // brand navy #001F5F
  slate: "FF1E293B",
  slateLight: "FF64748B",
  green: "FF16A34A",
  red: "FFDC2626",
  zebra: "FFF8FAFC",
  border: "FFE2E8F0",
  white: "FFFFFFFF",
};

function deltaLabel(d: number | undefined): { text: string; rgb: [number, number, number] } | null {
  if (d === undefined) return null;
  return { text: `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`, rgb: d >= 0 ? RGB.green : RGB.red };
}

// ── PDF drawing helpers (module-level: no component state needed) ──────────

function drawKpiCard(
  doc: jsPDF, x: number, y: number, w: number, h: number,
  label: string, value: string,
  delta: { text: string; rgb: [number, number, number] } | null,
  accent: [number, number, number],
) {
  doc.setDrawColor(...RGB.border);
  doc.setFillColor(...RGB.zebra);
  doc.roundedRect(x, y, w, h, 2, 2, "FD");
  doc.setFillColor(...accent);
  doc.roundedRect(x, y, 3, h, 1, 1, "F");

  doc.setTextColor(...RGB.slateLight);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(label.toUpperCase(), x + 6, y + 7);

  doc.setTextColor(...RGB.slate);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.text(value, x + 6, y + 15.5);

  if (delta) {
    doc.setTextColor(...delta.rgb);
    doc.setFontSize(8);
    doc.text(delta.text, x + 6, y + 21);
  }
  doc.setFont("helvetica", "normal");
}

function sectionHeader(doc: jsPDF, x: number, y: number, text: string) {
  doc.setFillColor(...RGB.indigo);
  doc.rect(x, y - 3.2, 2.6, 2.6, "F");
  doc.setTextColor(...RGB.slate);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(text, x + 5, y);
  doc.setFont("helvetica", "normal");
}

function pageTopBar(doc: jsPDF, label: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(...RGB.indigo);
  doc.rect(0, 0, pageWidth, 10, "F");
  doc.setTextColor(...RGB.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Rapports & Analyses", 14, 6.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(label, pageWidth - 14, 6.5, { align: "right" });
}

function addPdfFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(...RGB.border);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...RGB.slateLight);
    doc.text("AN-NOUR · Rapports & Analyses", 14, pageHeight - 7);
    doc.text(`Page ${i} / ${pageCount}`, pageWidth - 14, pageHeight - 7, { align: "right" });
  }
}

function Page() {
  const { t } = useT();
  const { workspace, store } = useWorkContext();
  const boutiqueId = workspace.kind === "store" ? Number(workspace.id) : undefined;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["reports", "data", boutiqueId],
    queryFn: () => reportsApi.getData(boutiqueId),
    staleTime: 60 * 1000,
  });

  const kpi = data?.kpi;
  // Decimal fields arrive as JSON strings (e.g. "4680000.00") — convert to
  // numbers here so recharts scales/positions them correctly.
  const revenueTrend = (data?.revenue_trend ?? []).map(p => ({ ...p, ca: Number(p.ca), ventes: Number(p.ventes) }));
  const stockByCategory = (data?.stock_by_category ?? []).map(c => ({ ...c, valeur: Number(c.valeur) }));
  const collectionTrend = (data?.collection_trend ?? []).map(w => ({ ...w, collected: Number(w.collected), outstanding: Number(w.outstanding) }));
  const storeRevenue = (data?.store_revenue ?? []).map(s => ({ ...s, ca: Number(s.ca) }));
  const sellerRevenue = (data?.seller_revenue ?? []).map(s => ({ ...s, ventes: Number(s.ventes), ca: Number(s.ca) }));

  const margeDelta = kpi
    ? Math.round((Number(kpi.marge_pct) - Number(kpi.marge_pct_precedent)) * 10) / 10
    : undefined;

  const today = new Date().toISOString().slice(0, 10);

  const exportXlsx = async () => {
    if (!kpi) return;
    const wb = new ExcelJS.Workbook();
    wb.creator = "AN-NOUR";
    wb.created = new Date();

    const thin = { style: "thin" as const, color: { argb: ARGB.border } };
    const cellBorder: Partial<Borders> = { top: thin, left: thin, bottom: thin, right: thin };

    // ── Résumé ────────────────────────────────────────────────────────────
    const resume = wb.addWorksheet("Résumé", { views: [{ showGridLines: false }] });
    resume.getColumn(1).width = 34;
    resume.getColumn(2).width = 20;
    resume.getColumn(3).width = 20;

    resume.mergeCells(1, 1, 1, 3);
    const resumeTitle = resume.getCell(1, 1);
    resumeTitle.value = "Rapports & Analyses";
    resumeTitle.font = { size: 16, bold: true, color: { argb: ARGB.white } };
    resumeTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB.slate } };
    resumeTitle.alignment = { vertical: "middle", indent: 1 };
    resume.getRow(1).height = 30;

    resume.mergeCells(2, 1, 2, 3);
    const resumeSubtitle = resume.getCell(2, 1);
    resumeSubtitle.value = `Généré le ${new Date().toLocaleDateString("fr-FR")} · ${store?.name ?? "Toutes les boutiques"}`;
    resumeSubtitle.font = { size: 10, italic: true, color: { argb: ARGB.slateLight } };
    resumeSubtitle.alignment = { indent: 1 };
    resume.getRow(2).height = 18;

    const resumeHead = resume.getRow(4);
    ["Indicateur", "Valeur", "Mois précédent"].forEach((h, i) => {
      const cell = resumeHead.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: ARGB.white } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB.indigo } };
      cell.border = cellBorder;
      cell.alignment = { vertical: "middle", indent: 1 };
    });
    resumeHead.height = 20;

    const kpiRows: Array<{ label: string; value: number; prev: number | null; numFmt: string; sign: number }> = [
      {
        label: "CA du mois", value: Number(kpi.ca_mois), prev: Number(kpi.ca_mois_precedent),
        numFmt: '#,##0" GNF"', sign: Math.sign(Number(kpi.ca_mois) - Number(kpi.ca_mois_precedent)),
      },
      {
        label: "Ventes du mois", value: kpi.ventes_mois, prev: kpi.ventes_mois_precedent,
        numFmt: "#,##0", sign: Math.sign(kpi.ventes_mois - kpi.ventes_mois_precedent),
      },
      {
        label: "Marge", value: Number(kpi.marge_pct), prev: Number(kpi.marge_pct_precedent),
        numFmt: '0.0"%"', sign: Math.sign(Number(kpi.marge_pct) - Number(kpi.marge_pct_precedent)),
      },
      {
        label: "Recouvrement des créances", value: Number(kpi.recouvrement_pct), prev: null,
        numFmt: '0.0"%"', sign: 0,
      },
    ];

    kpiRows.forEach((k, idx) => {
      const row = resume.getRow(5 + idx);
      const zebra = idx % 2 === 1;

      const labelCell = row.getCell(1);
      labelCell.value = k.label;
      labelCell.font = { bold: true };
      labelCell.border = cellBorder;
      labelCell.alignment = { indent: 1 };

      const valueCell = row.getCell(2);
      valueCell.value = k.value;
      valueCell.numFmt = k.numFmt;
      valueCell.font = { bold: true, color: { argb: k.sign > 0 ? ARGB.green : k.sign < 0 ? ARGB.red : ARGB.slate } };
      valueCell.alignment = { horizontal: "right", indent: 1 };
      valueCell.border = cellBorder;

      const prevCell = row.getCell(3);
      if (k.prev !== null) {
        prevCell.value = k.prev;
        prevCell.numFmt = k.numFmt;
      }
      prevCell.font = { color: { argb: ARGB.slateLight } };
      prevCell.alignment = { horizontal: "right", indent: 1 };
      prevCell.border = cellBorder;

      if (zebra) {
        [labelCell, valueCell, prevCell].forEach(c => {
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB.zebra } };
        });
      }
      row.height = 20;
    });

    // ── Data sheets ───────────────────────────────────────────────────────
    type Col = { header: string; width: number; numFmt?: string; align?: "left" | "right" };

    const addSheet = (name: string, sheetTitle: string, cols: Col[], rows: (string | number)[][]): Worksheet => {
      const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 3, showGridLines: false }] });
      cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

      ws.mergeCells(1, 1, 1, cols.length);
      const titleCell = ws.getCell(1, 1);
      titleCell.value = sheetTitle;
      titleCell.font = { size: 13, bold: true, color: { argb: ARGB.white } };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB.slate } };
      titleCell.alignment = { vertical: "middle", indent: 1 };
      ws.getRow(1).height = 26;
      ws.getRow(2).height = 6;

      const headerRow = ws.getRow(3);
      cols.forEach((c, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = c.header;
        cell.font = { bold: true, color: { argb: ARGB.white } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB.indigo } };
        cell.alignment = { vertical: "middle", horizontal: c.align ?? "left", indent: 1 };
        cell.border = cellBorder;
      });
      headerRow.height = 20;

      rows.forEach((values, idx) => {
        const row = ws.getRow(4 + idx);
        const zebra = idx % 2 === 1;
        values.forEach((val, i) => {
          const cell = row.getCell(i + 1);
          cell.value = val;
          const c = cols[i];
          if (c.numFmt) cell.numFmt = c.numFmt;
          cell.alignment = { horizontal: c.align ?? "left", indent: 1 };
          cell.border = cellBorder;
          if (zebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB.zebra } };
        });
      });

      if (rows.length > 0) {
        ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: cols.length } };
      }
      return ws;
    };

    addSheet("Évolution CA", "Évolution du chiffre d'affaires",
      [
        { header: "Mois", width: 14 },
        { header: "CA (GNF)", width: 20, numFmt: '#,##0" GNF"', align: "right" },
        { header: "Ventes", width: 12, numFmt: "#,##0", align: "right" },
      ],
      revenueTrend.map(p => [p.label, p.ca, p.ventes]));

    addSheet("Stock par catégorie", "Stock par catégorie",
      [
        { header: "Catégorie", width: 28 },
        { header: "Valeur (GNF)", width: 20, numFmt: '#,##0" GNF"', align: "right" },
      ],
      stockByCategory.map(c => [c.category, c.valeur]));

    addSheet("Créances", "Recouvrement des créances",
      [
        { header: "Semaine", width: 12 },
        { header: "Encaissé (GNF)", width: 20, numFmt: '#,##0" GNF"', align: "right" },
        { header: "Nouvelles créances (GNF)", width: 26, numFmt: '#,##0" GNF"', align: "right" },
      ],
      collectionTrend.map(w => [w.week, w.collected, w.outstanding]));

    addSheet("Boutiques", "Top boutiques",
      [
        { header: "Boutique", width: 28 },
        { header: "CA (GNF)", width: 20, numFmt: '#,##0" GNF"', align: "right" },
      ],
      storeRevenue.map(s => [s.nom, s.ca]));

    addSheet("Vendeurs", "Ventes par vendeur",
      [
        { header: "Vendeur", width: 28 },
        { header: "Ventes", width: 12, numFmt: "#,##0", align: "right" },
        { header: "CA (GNF)", width: 20, numFmt: '#,##0" GNF"', align: "right" },
      ],
      sellerRevenue.map(s => [s.nom, s.ventes, s.ca]));

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapports-analyses-${today}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Rapport exporté (Excel)");
  };

  const exportPdf = () => {
    if (!kpi) return;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;

    // ── Page 1 : bannière + KPIs + évolution du CA ─────────────────────────
    doc.setFillColor(...RGB.slate);
    doc.rect(0, 0, pageWidth, 26, "F");
    doc.setTextColor(...RGB.white);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("Rapports & Analyses", margin, 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(store?.name ?? "Toutes les boutiques · Vue globale", margin, 21);
    doc.setFontSize(8.5);
    doc.text(`Généré le ${new Date().toLocaleDateString("fr-FR")}`, pageWidth - margin, 14, { align: "right" });

    const cardY = 34;
    const cardH = 24;
    const gap = 4;
    const cardW = (pageWidth - margin * 2 - gap * 3) / 4;

    const caDelta = deltaLabel(pctDelta(Number(kpi.ca_mois), Number(kpi.ca_mois_precedent)));
    const ventesDeltaV = deltaLabel(pctDelta(kpi.ventes_mois, kpi.ventes_mois_precedent));
    const margeDeltaV = deltaLabel(margeDelta);
    const margeAccent: [number, number, number] = Number(kpi.marge_pct) >= 0 ? RGB.green : RGB.red;

    drawKpiCard(doc, margin, cardY, cardW, cardH, "CA du mois", pdfXAF(Number(kpi.ca_mois)), caDelta, RGB.indigo);
    drawKpiCard(doc, margin + cardW + gap, cardY, cardW, cardH, "Ventes du mois", fmtInt(kpi.ventes_mois), ventesDeltaV, RGB.green);
    drawKpiCard(doc, margin + (cardW + gap) * 2, cardY, cardW, cardH, "Marge", fmtPct(Number(kpi.marge_pct)), margeDeltaV, margeAccent);
    drawKpiCard(doc, margin + (cardW + gap) * 3, cardY, cardW, cardH, "Recouvrement des créances", fmtPct(Number(kpi.recouvrement_pct)), null, RGB.slateLight);

    const section1Y = cardY + cardH + 12;
    sectionHeader(doc, margin, section1Y, "Évolution du chiffre d'affaires");
    autoTable(doc, {
      startY: section1Y + 4,
      margin: { left: margin, right: margin },
      head: [["Mois", "CA", "Ventes"]],
      body: revenueTrend.map(p => [p.label, pdfXAF(p.ca), fmtInt(p.ventes)]),
      theme: "grid",
      styles: { fontSize: 8, textColor: RGB.slate, lineColor: RGB.border, lineWidth: 0.1 },
      headStyles: { fillColor: RGB.indigo, textColor: RGB.white, fontStyle: "bold" },
      alternateRowStyles: { fillColor: RGB.zebra },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    });

    // ── Page 2 : stock + créances ───────────────────────────────────────────
    doc.addPage();
    pageTopBar(doc, "Stock & Créances");
    sectionHeader(doc, margin, 20, "Stock par catégorie");
    autoTable(doc, {
      startY: 24,
      margin: { left: margin, right: margin },
      head: [["Catégorie", "Valeur"]],
      body: stockByCategory.map(c => [c.category, pdfXAF(c.valeur)]),
      theme: "grid",
      styles: { fontSize: 8, textColor: RGB.slate, lineColor: RGB.border, lineWidth: 0.1 },
      headStyles: { fillColor: RGB.indigo, textColor: RGB.white, fontStyle: "bold" },
      alternateRowStyles: { fillColor: RGB.zebra },
      columnStyles: { 1: { halign: "right" } },
    });

    const y2 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
    sectionHeader(doc, margin, y2, "Recouvrement des créances");
    autoTable(doc, {
      startY: y2 + 4,
      margin: { left: margin, right: margin },
      head: [["Semaine", "Encaissé", "Nouvelles créances"]],
      body: collectionTrend.map(w => [w.week, pdfXAF(w.collected), pdfXAF(w.outstanding)]),
      theme: "grid",
      styles: { fontSize: 8, textColor: RGB.slate, lineColor: RGB.border, lineWidth: 0.1 },
      headStyles: { fillColor: RGB.indigo, textColor: RGB.white, fontStyle: "bold" },
      alternateRowStyles: { fillColor: RGB.zebra },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    });

    // ── Page 3 : boutiques + vendeurs ────────────────────────────────────────
    doc.addPage();
    pageTopBar(doc, "Boutiques & Vendeurs");
    sectionHeader(doc, margin, 20, "Top boutiques");
    autoTable(doc, {
      startY: 24,
      margin: { left: margin, right: margin },
      head: [["Boutique", "CA"]],
      body: storeRevenue.map(s => [s.nom, pdfXAF(s.ca)]),
      theme: "grid",
      styles: { fontSize: 8, textColor: RGB.slate, lineColor: RGB.border, lineWidth: 0.1 },
      headStyles: { fillColor: RGB.indigo, textColor: RGB.white, fontStyle: "bold" },
      alternateRowStyles: { fillColor: RGB.zebra },
      columnStyles: { 1: { halign: "right" } },
    });

    const y3 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
    sectionHeader(doc, margin, y3, "Ventes par vendeur");
    autoTable(doc, {
      startY: y3 + 4,
      margin: { left: margin, right: margin },
      head: [["Vendeur", "Ventes", "CA"]],
      body: sellerRevenue.map(s => [s.nom, fmtInt(s.ventes), pdfXAF(s.ca)]),
      theme: "grid",
      styles: { fontSize: 8, textColor: RGB.slate, lineColor: RGB.border, lineWidth: 0.1 },
      headStyles: { fillColor: RGB.indigo, textColor: RGB.white, fontStyle: "bold" },
      alternateRowStyles: { fillColor: RGB.zebra },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    });

    addPdfFooter(doc);
    doc.save(`rapports-analyses-${today}.pdf`);
    toast.success("Rapport exporté (PDF)");
  };


  return (
    <>
      <PageHeader
        title={t("reports.title") as string}
        description={t("reports.subtitle") as string}
        actions={<>
          <Button variant="outline" size="sm" onClick={exportPdf} disabled={!kpi}><FileText className="mr-1.5 h-3.5 w-3.5" /> PDF</Button>
          <Button variant="outline" size="sm" onClick={exportXlsx} disabled={!kpi}><FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" /> Excel</Button>
        </>}
      />

      {isLoading ? (
        <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Chargement des rapports…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
          Impossible de charger les rapports. <Button variant="link" size="sm" onClick={() => refetch()}>Réessayer</Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <KpiCard
              label={t("dashboard.kpi.revenue") as string}
              value={fmtXAF(Number(kpi!.ca_mois))}
              delta={pctDelta(Number(kpi!.ca_mois), Number(kpi!.ca_mois_precedent))}
              tone="primary"
            />
            <KpiCard
              label={t("dashboard.kpi.orders") as string}
              value={fmtInt(kpi!.ventes_mois)}
              delta={pctDelta(kpi!.ventes_mois, kpi!.ventes_mois_precedent)}
              tone="success"
            />
            <KpiCard
              label={t("products.detail.margin") as string}
              value={fmtPct(Number(kpi!.marge_pct))}
              delta={margeDelta}
            />
            <KpiCard
              label={t("dashboard.collection") as string}
              value={fmtPct(Number(kpi!.recouvrement_pct))}
            />
          </div>

          <Tabs defaultValue="sales" className="mt-6">
            <TabsList className="flex-wrap">
              <TabsTrigger value="sales">{t("reports.tab.revenue") as string}</TabsTrigger>
              <TabsTrigger value="inventory">{t("reports.tab.inventory") as string}</TabsTrigger>
              <TabsTrigger value="debts">{t("reports.tab.debts") as string}</TabsTrigger>
              <TabsTrigger value="stores">{t("nav.stores") as string}</TabsTrigger>
              <TabsTrigger value="sellers">{t("role.cashier") as string}</TabsTrigger>
            </TabsList>

            <TabsContent value="sales" className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card className="shadow-soft">
                <CardHeader><CardTitle className="text-base">{t("dashboard.revenueTrend") as string}</CardTitle></CardHeader>
                <CardContent><div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={revenueTrend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <defs><linearGradient id="r2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.4} /><stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => fmtXAF(Number(v))} width={110} />
                      <Tooltip {...tip} formatter={(v: number) => fmtXAF(Number(v))} />
                      <Area type="monotone" dataKey="ca" stroke="var(--color-chart-1)" strokeWidth={2} fill="url(#r2)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div></CardContent>
              </Card>
              <Card className="shadow-soft">
                <CardHeader><CardTitle className="text-base">{t("dashboard.kpi.orders") as string}</CardTitle></CardHeader>
                <CardContent><div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={revenueTrend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => fmtInt(Number(v))} />
                      <Tooltip {...tip} formatter={(v: number) => fmtInt(Number(v))} />
                      <Line type="monotone" dataKey="ventes" stroke="var(--color-chart-2)" strokeWidth={2.5} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div></CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="inventory" className="mt-4">
              <Card className="shadow-soft"><CardHeader><CardTitle className="text-base">{t("dashboard.inventoryByCat") as string}</CardTitle></CardHeader>
                <CardContent><div className="h-80">
                  {stockByCategory.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Aucune valeur de stock</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart><Pie data={stockByCategory} dataKey="valeur" nameKey="category" innerRadius={70} outerRadius={120}>
                        {stockByCategory.map((_, i) => <Cell key={i} fill={`var(--color-chart-${(i % 5) + 1})`} />)}
                      </Pie><Tooltip {...tip} formatter={(v: number) => fmtXAF(Number(v))} /><Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" /></PieChart>
                    </ResponsiveContainer>
                  )}
                </div></CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="debts" className="mt-4">
              <Card className="shadow-soft"><CardHeader><CardTitle className="text-base">{t("dashboard.collection") as string}</CardTitle></CardHeader>
                <CardContent><div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={collectionTrend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="week" stroke="var(--muted-foreground)" fontSize={11} />
                      <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => fmtXAF(Number(v))} width={110} />
                      <Tooltip {...tip} formatter={(v: number) => fmtXAF(Number(v))} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="collected" name={t("dashboard.chart.collected") as string} fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="outstanding" name={t("dashboard.chart.outstanding") as string} fill="var(--color-chart-4)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div></CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="stores" className="mt-4">
              <Card className="shadow-soft"><CardHeader><CardTitle className="text-base">{t("dashboard.topStores") as string}</CardTitle></CardHeader>
                <CardContent><div className="h-80">
                  {storeRevenue.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Aucune vente ce mois</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={storeRevenue} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="nom" stroke="var(--muted-foreground)" fontSize={11} />
                        <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => fmtXAF(Number(v))} width={110} />
                        <Tooltip {...tip} formatter={(v: number) => fmtXAF(Number(v))} />
                        <Bar dataKey="ca" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div></CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sellers" className="mt-4">
              <Card className="shadow-soft"><CardHeader><CardTitle className="text-base">{t("role.cashier") as string}</CardTitle></CardHeader>
                <CardContent><div className="h-72">
                  {sellerRevenue.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Aucune vente ce mois</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart layout="vertical" data={sellerRevenue} margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} />
                        <YAxis type="category" dataKey="nom" width={90} stroke="var(--muted-foreground)" fontSize={11} />
                        <Tooltip {...tip} />
                        <Bar dataKey="ventes" fill="var(--color-chart-3)" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div></CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </>
  );
}
