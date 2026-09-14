// A4 document template — rendered inside the PrintPreviewDialog, serialized
// for the browser print iframe, and rasterised for the downloadable PDF (see
// pdf.ts), so the three outputs are pixel-identical.
//
// Two designs, picked by the issuing brand (PrintOrganization.brand):
//   • "group"    — AN-NOUR GROUP letterhead: navy/brick technical-drawing
//                  look (corner registration ticks, bordered title block,
//                  Barlow Condensed labels).
//   • "boutique" — AN-NOUR Immobilier & Déco d'Intérieur letterhead: warm
//                  paper, swatch bar, Fraunces italic title.
// Both close on the same fixed identity footer (DOCUMENT_FOOTER_LINES).
// Everything is inline-styled on purpose: the markup travels as a string
// into an isolated iframe that has no access to the app's stylesheets.

import type { CSSProperties, ReactNode } from "react";
import type { DocumentPrintData, PrintBrand, PrintConfig } from "../types";
import { fmtMoney } from "../formatters";
import {
  TYPE_LABEL,
  TYPE_TITLE,
  DOCUMENT_FOOTER_LINES,
  isCommandeDocument,
  isDeliveryNoteType,
} from "../constants";

// ── Palette / typography per brand (values lifted from the approved mockups) ─

const BODY_FONT = "'Inter', 'Helvetica Neue', Arial, sans-serif";

const THEME = {
  group: {
    navy: "#001F5F",
    navyDeep: "#00153f",
    gold: "#F1A70A",
    brick: "#A32E2A",
    paper: "#F6F4EF",
    ink: "#1C1D1F",
    steel: "#D9DEE6",
    steelLine: "#B9C2CF",
    muted: "#6b7280",
    text: "#333333",
    zebra: "#EFEDE6",
    display: "'Barlow Condensed', 'Arial Narrow', sans-serif",
  },
  boutique: {
    navy: "#14285E",
    navySoft: "#233B7A",
    gold: "#F0A70A",
    sand: "#EDE6D8",
    stone: "#D8D2C4",
    paper: "#FFFEFB",
    ink: "#262420",
    muted: "#8a8172",
    meta: "#6b6456",
    text: "#40392f",
    display: "'Fraunces', Georgia, 'Times New Roman', serif",
  },
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveBrand(data: DocumentPrintData): PrintBrand {
  if (data.organization.brand) return data.organization.brand;
  return data.organization.logo?.toLowerCase().includes("group") ? "group" : "boutique";
}

/** "08 / 09 / 2026" — the mockups' date format. */
function fmtShortDate(iso: string, sep = "/"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd} ${sep} ${mm} ${sep} ${d.getFullYear()}`;
}

function nbsp(s: string): string {
  return s.replace(/ /g, " ");
}

/** Which "party" label faces the customer block. */
function recipientLabel(type: string, brand: PrintBrand): string {
  if (isDeliveryNoteType(type)) return "Livré à";
  if (type === "commande_demande") return "Adressé à";
  return brand === "group" ? "Facturé à" : "Client";
}

interface MetaCell {
  label: string;
  value: string;
}

/** The small facts that fill the title block (group) / the meta line
 * (boutique): document number + date always, then whatever the document
 * actually carries — validity, issuer, shipment facts. Capped at 4 so the
 * bordered grid stays one row. */
function buildMetaCells(data: DocumentPrintData): MetaCell[] {
  const cells: MetaCell[] = [
    { label: `N° ${TYPE_TITLE[data.type] ?? "Document"}`, value: data.reference },
    { label: "Date d'émission", value: fmtShortDate(data.createdAt) },
  ];
  if (data.validUntil) cells.push({ label: "Valable jusqu'au", value: fmtShortDate(data.validUntil) });
  if (data.logistics?.dateExpedition) {
    cells.push({ label: "Expédié le", value: fmtShortDate(data.logistics.dateExpedition) });
  }
  if (data.logistics?.dateLivraison) {
    cells.push({ label: "Livré le", value: fmtShortDate(data.logistics.dateLivraison) });
  }
  if (data.issuer) {
    cells.push({
      label: data.issuer.role ? `Émis par (${data.issuer.role})` : "Émis par",
      value: data.issuer.name,
    });
  }
  if (data.logistics?.numeroBonPreparation) {
    cells.push({ label: "N° bon de préparation", value: data.logistics.numeroBonPreparation });
  }
  return cells.slice(0, 4);
}

interface TotalsRow {
  label: string;
  value: string;
  kind?: "grand" | "due";
}

function buildTotalsRows(data: DocumentPrintData, fmt: (n: number) => string): TotalsRow[] {
  const t = data.totals;
  const discount = (t.lineDiscounts ?? 0) + (t.globalDiscount ?? 0);
  const hasTax = !!t.tax && t.tax > 0;
  const rows: TotalsRow[] = [];
  rows.push({ label: hasTax ? "Sous-total HT" : "Sous-total", value: fmt(t.subtotal) });
  if (discount > 0) rows.push({ label: "Remise", value: `−${fmt(discount)}` });
  if (hasTax) {
    rows.push({ label: `TVA (${t.taxRate ?? ""} %)`, value: fmt(t.tax ?? 0) });
  }
  rows.push({ label: hasTax ? "TOTAL TTC" : "TOTAL", value: fmt(t.total), kind: "grand" });
  // Real payments only exist on sale documents — an internal commande
  // document never carries an acompte / net à payer.
  if (!isCommandeDocument(data.type)) {
    if (data.amountPaid > 0) rows.push({ label: "Acompte versé", value: `−${fmt(data.amountPaid)}` });
    rows.push({ label: "NET À PAYER", value: fmt(data.amountDue), kind: "due" });
  }
  return rows;
}

// ── Shared blocks ────────────────────────────────────────────────────────────

/** The fixed letterhead footer — identical on every document, laid out like
 * the printed original: bold agency line, phone line, a blank line, the
 * activities strip, then a heavy rule. */
function IdentityFooter({ ink }: { ink: string }) {
  const [agency, phones, activities] = DOCUMENT_FOOTER_LINES;
  return (
    <div style={{ marginTop: "18px", textAlign: "center", fontFamily: BODY_FONT, color: ink }}>
      <div style={{ fontWeight: 700, fontSize: "13.5px", lineHeight: 1.5 }}>{agency}</div>
      <div style={{ fontSize: "12px", lineHeight: 1.5 }}>{phones}</div>
      <div style={{ height: "12px" }} />
      <div style={{ fontSize: "11.5px", lineHeight: 1.55, padding: "0 6mm" }}>{activities}</div>
      <div style={{ height: "3px", background: "#4b5563", marginTop: "10px" }} />
    </div>
  );
}

function DeliveryNotice({ text, bg, border, color }: { text: string; bg: string; border: string; color: string }) {
  return (
    <div
      style={{
        marginTop: "14px",
        padding: "8px 12px",
        background: bg,
        border: `1px solid ${border}`,
        color,
        fontWeight: 700,
        fontSize: "12px",
        letterSpacing: "1px",
        textAlign: "center",
        textTransform: "uppercase",
      }}
    >
      {text}
    </div>
  );
}

function PartyLines({
  data,
  side,
  nameStyle,
  lineStyle,
}: {
  data: DocumentPrintData;
  side: "issuer" | "recipient";
  nameStyle: CSSProperties;
  lineStyle: CSSProperties;
}) {
  if (side === "issuer") {
    const o = data.organization;
    const contact = [o.phone ? `Tél. : ${o.phone}` : null, o.email ?? null].filter(Boolean).join(" · ");
    return (
      <>
        <p style={nameStyle}>{o.name}</p>
        <p style={lineStyle}>
          {o.address && <>{o.address}<br /></>}
          {contact && <>{contact}<br /></>}
          {o.nif && <>NIF : {o.nif}</>}
        </p>
      </>
    );
  }
  const c = data.customer;
  if (!c) {
    return (
      <>
        <p style={nameStyle}>Client comptant</p>
        <p style={lineStyle}>Vente au comptoir</p>
      </>
    );
  }
  return (
    <>
      <p style={nameStyle}>{c.name}</p>
      <p style={lineStyle}>
        {c.code && <>Code client : {c.code}<br /></>}
        {c.address && <>{c.address}<br /></>}
        {c.phone && <>Tél. : {c.phone}<br /></>}
        {c.email && <>{c.email}</>}
      </p>
    </>
  );
}

/** Left-hand block under the table: payments actually recorded, the
 * proforma validity, shipment facts on a bon de livraison, or the
 * document's own note. Never template filler. */
function PayInfoLines({ data, fmt }: { data: DocumentPrintData; fmt: (n: number) => string }): ReactNode {
  const lines: ReactNode[] = [];
  if (data.logistics) {
    const l = data.logistics;
    if (l.transporteur) lines.push(<span key="tr">Transporteur : <strong>{l.transporteur}</strong></span>);
    if (l.livreurNom) lines.push(<span key="lv">Livreur : <strong>{l.livreurNom}</strong></span>);
    if (l.numeroBonPreparation) lines.push(<span key="bp">Bon de préparation : {l.numeroBonPreparation}</span>);
  }
  if (!isDeliveryNoteType(data.type) && !isCommandeDocument(data.type)) {
    if (data.payments.length > 0) {
      for (const [i, p] of data.payments.entries()) {
        lines.push(
          <span key={`p${i}`}>
            {p.method}{p.reference ? ` (${p.reference})` : ""} : <strong>{fmt(p.amount)}</strong>
            {p.change && p.change > 0 ? ` — monnaie rendue ${fmt(p.change)}` : ""}
          </span>,
        );
      }
    } else if (data.amountDue > 0 && data.type !== "quote") {
      // A proforma never carries a payment — only a facture can be unpaid.
      lines.push(<span key="none">Aucun règlement enregistré à ce jour.</span>);
    }
    if (data.amountDue > 0 && data.payments.length > 0) {
      lines.push(<span key="due">Reste à payer : <strong>{fmt(data.amountDue)}</strong></span>);
    }
  }
  if (data.validUntil) {
    lines.push(<span key="val">Offre valable jusqu'au <strong>{fmtShortDate(data.validUntil)}</strong>.</span>);
  }
  if (data.notes) lines.push(<span key="notes">{data.notes}</span>);
  if (data.footerOverride) lines.push(<span key="fo">{data.footerOverride}</span>);
  if (lines.length === 0) lines.push(<span key="ref">Merci de rappeler la référence {data.reference} pour toute correspondance.</span>);
  return (
    <>
      {lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </>
  );
}

// ── Template ─────────────────────────────────────────────────────────────────

export function A4Template({
  data,
  config,
  qrDataUrl,
}: {
  data: DocumentPrintData;
  config: PrintConfig;
  qrDataUrl?: string;
}) {
  const currency = config.currency ?? "GNF";
  const locale = config.locale ?? "fr-GN";
  const fmt = (n: number) => fmtMoney(n, currency, locale);
  const fmtNum = (n: number) => fmt(n).replace(` ${currency}`, "");
  const brand = resolveBrand(data);

  const isDeliveryNote = isDeliveryNoteType(data.type);
  const showTotals = !isDeliveryNote;
  const showDiscountCol = !isDeliveryNote && data.lines.some((l) => (l.lineDiscount ?? 0) > 0);
  const metaCells = buildMetaCells(data);
  const totalsRows = showTotals ? buildTotalsRows(data, fmt) : [];
  const showLogo = config.showLogo !== false && !!data.organization.logo;

  return brand === "group" ? (
    <GroupSheet
      data={data}
      fmtNum={fmtNum}
      fmt={fmt}
      metaCells={metaCells}
      totalsRows={totalsRows}
      showTotals={showTotals}
      showDiscountCol={showDiscountCol}
      isDeliveryNote={isDeliveryNote}
      showLogo={showLogo}
      qrDataUrl={qrDataUrl}
    />
  ) : (
    <BoutiqueSheet
      data={data}
      fmtNum={fmtNum}
      fmt={fmt}
      metaCells={metaCells}
      totalsRows={totalsRows}
      showTotals={showTotals}
      showDiscountCol={showDiscountCol}
      isDeliveryNote={isDeliveryNote}
      showLogo={showLogo}
      qrDataUrl={qrDataUrl}
    />
  );
}

interface SheetProps {
  data: DocumentPrintData;
  fmt: (n: number) => string;
  fmtNum: (n: number) => string;
  metaCells: MetaCell[];
  totalsRows: TotalsRow[];
  showTotals: boolean;
  showDiscountCol: boolean;
  isDeliveryNote: boolean;
  showLogo: boolean;
  qrDataUrl?: string;
}

// ── Design 1 — AN-NOUR GROUP ─────────────────────────────────────────────────

function GroupSheet(p: SheetProps) {
  const T = THEME.group;
  const { data } = p;

  const sheet: CSSProperties = {
    width: "210mm",
    minHeight: "297mm",
    boxSizing: "border-box",
    background: T.paper,
    position: "relative",
    padding: "14mm 14mm 12mm",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    fontFamily: BODY_FONT,
    color: T.ink,
    fontSize: "12.5px",
    lineHeight: 1.4,
    WebkitFontSmoothing: "antialiased",
  };
  const tick: CSSProperties = { position: "absolute", width: "14px", height: "14px", boxSizing: "border-box" };
  const lbl: CSSProperties = {
    fontFamily: T.display,
    fontSize: "10px",
    letterSpacing: "1.5px",
    color: T.muted,
    textTransform: "uppercase",
    display: "block",
    marginBottom: "2px",
  };
  const val: CSSProperties = { fontWeight: 600, fontSize: "13.5px", color: T.ink };
  const partyH3: CSSProperties = {
    fontFamily: T.display,
    fontSize: "12px",
    letterSpacing: "1.5px",
    textTransform: "uppercase",
    color: T.navy,
    margin: "0 0 6px",
    fontWeight: 600,
  };
  const partyP: CSSProperties = { margin: 0, fontSize: "13px", lineHeight: 1.55, color: T.text };
  const partyName: CSSProperties = { ...partyP, fontWeight: 700, fontSize: "14.5px", color: T.ink, marginBottom: "2px" };
  const th: CSSProperties = {
    background: T.navy,
    color: "#fff",
    fontFamily: T.display,
    fontWeight: 600,
    letterSpacing: "1px",
    textTransform: "uppercase",
    fontSize: "11px",
    padding: "9px 10px",
    textAlign: "left",
  };
  const thNum: CSSProperties = { ...th, textAlign: "right" };
  const td: CSSProperties = { padding: "9px 10px", borderBottom: `1px solid ${T.steel}`, verticalAlign: "top" };
  const tdNum: CSSProperties = { ...td, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
  const totalsRow: CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 12px",
    fontSize: "12.5px",
    borderBottom: `1px solid ${T.steel}`,
  };

  return (
    <div style={sheet} className="print-a4">
      {/* corner registration ticks — technical drawing cue */}
      <div style={{ ...tick, top: "6mm", left: "6mm", borderTop: `2px solid ${T.navy}`, borderLeft: `2px solid ${T.navy}` }} />
      <div style={{ ...tick, bottom: "6mm", right: "6mm", borderBottom: `2px solid ${T.navy}`, borderRight: `2px solid ${T.navy}` }} />

      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: `3px solid ${T.navy}`, paddingBottom: "14px" }}>
        <div>
          {p.showLogo && <img src={data.organization.logo} alt={data.organization.name} style={{ height: "58px", display: "block" }} />}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: T.display, fontWeight: 700, fontSize: "44px", letterSpacing: "2px", margin: 0, color: T.navy, lineHeight: 1 }}>
            {TYPE_LABEL[data.type] === "REÇU DE VENTE" ? "FACTURE" : TYPE_LABEL[data.type] ?? "DOCUMENT"}
          </div>
          <div style={{ fontSize: "11px", letterSpacing: "3px", color: T.brick, fontWeight: 600, marginTop: "4px", textTransform: "uppercase" }}>
            {data.organization.name}
          </div>
        </div>
      </div>

      {/* Title block, engineering drawing convention */}
      <div style={{ marginTop: "14px", display: "grid", gridTemplateColumns: `repeat(${p.metaCells.length}, 1fr)`, border: `1.5px solid ${T.navy}` }}>
        {p.metaCells.map((c, i) => (
          <div key={i} style={{ borderRight: i < p.metaCells.length - 1 ? `1px solid ${T.steelLine}` : "none", padding: "7px 10px" }}>
            <span style={lbl}>{c.label}</span>
            <span style={val}>{c.value}</span>
          </div>
        ))}
      </div>

      {data.deliveryNotice && <DeliveryNotice text={data.deliveryNotice} bg="#FBEFEE" border={T.brick} color={T.brick} />}

      {/* Parties */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "22px" }}>
        <div style={{ borderLeft: `3px solid ${T.gold}`, padding: "4px 0 4px 14px" }}>
          <h3 style={partyH3}>Émis par</h3>
          <PartyLines data={data} side="issuer" nameStyle={partyName} lineStyle={partyP} />
        </div>
        <div style={{ borderLeft: `3px solid ${T.gold}`, padding: "4px 0 4px 14px" }}>
          <h3 style={partyH3}>{recipientLabel(data.type, "group")}</h3>
          <PartyLines data={data} side="recipient" nameStyle={partyName} lineStyle={partyP} />
        </div>
      </div>

      {/* Items */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "26px", fontSize: "12.5px" }}>
        <thead>
          <tr>
            <th style={{ ...th, width: "6%" }}>N°</th>
            <th style={th}>Désignation</th>
            <th style={{ ...thNum, width: "9%" }}>Qté</th>
            {!p.isDeliveryNote && (
              <>
                <th style={{ ...thNum, width: "18%" }}>P.U. ({"GNF"})</th>
                {p.showDiscountCol && <th style={{ ...thNum, width: "14%" }}>Remise</th>}
                <th style={{ ...thNum, width: "19%" }}>Montant ({"GNF"})</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {data.lines.map((l, i) => (
            <tr key={i} style={{ background: i % 2 === 1 ? T.zebra : "transparent" }}>
              <td style={{ ...td, color: T.muted, fontSize: "11.5px" }}>{String(i + 1).padStart(2, "0")}</td>
              <td style={{ ...td, fontWeight: 600 }}>{l.name}</td>
              <td style={tdNum}>{l.quantity}</td>
              {!p.isDeliveryNote && (
                <>
                  <td style={tdNum}>{nbsp(p.fmtNum(l.unitPrice))}</td>
                  {p.showDiscountCol && (
                    <td style={tdNum}>{l.lineDiscount && l.lineDiscount > 0 ? `−${nbsp(p.fmtNum(l.lineDiscount))}` : ""}</td>
                  )}
                  <td style={tdNum}>{nbsp(p.fmtNum(l.lineTotal))}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Bottom area — règlement + totals */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "20px", gap: "24px" }}>
        <div style={{ flex: 1.3, fontSize: "12px", lineHeight: 1.7, color: T.text }}>
          <h4 style={{ fontFamily: T.display, fontSize: "12px", letterSpacing: "1.5px", textTransform: "uppercase", color: T.navy, margin: "0 0 8px", borderBottom: `1px solid ${T.steelLine}`, paddingBottom: "5px", fontWeight: 600 }}>
            {p.isDeliveryNote ? "Expédition" : isCommandeDocument(data.type) ? "Observations" : "Règlement"}
          </h4>
          <PayInfoLines data={data} fmt={p.fmt} />
        </div>
        {p.showTotals && (
          <div style={{ flex: 1, border: `1.5px solid ${T.navy}`, alignSelf: "flex-start" }}>
            {p.totalsRows.map((r, i) => {
              const style: CSSProperties =
                r.kind === "grand"
                  ? { ...totalsRow, background: T.navy, color: "#fff", fontWeight: 700, fontSize: "15px", borderBottom: "none" }
                  : r.kind === "due"
                  ? { ...totalsRow, background: T.gold, color: T.navyDeep, fontWeight: 800, fontSize: "15px", borderBottom: "none" }
                  : totalsRow;
              return (
                <div key={i} style={style}>
                  <span style={{ opacity: r.kind ? 1 : 0.85 }}>{r.label}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{nbsp(r.value)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* Gear line + footnote */}
      <div style={{ margin: "26px 0 14px", height: "1px", background: `repeating-linear-gradient(90deg, ${T.brick} 0 6px, transparent 6px 12px)`, opacity: 0.6 }} />
      <div style={{ fontSize: "10.5px", color: T.muted, lineHeight: 1.6, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {p.qrDataUrl && <img src={p.qrDataUrl} alt="QR" style={{ width: "48px", height: "48px", display: "block" }} />}
          <div>
            Marchandise vendue non reprise, non échangée sauf défaut constaté à la livraison.<br />
            Document généré le {fmtShortDate(data.createdAt)} — réf. {data.reference}.
          </div>
        </div>
        <div style={{ fontFamily: T.display, fontSize: "13px", letterSpacing: "1px", color: T.navy, fontWeight: 700, whiteSpace: "nowrap" }}>
          Merci pour votre confiance — AN-NOUR GROUP
        </div>
      </div>

      <IdentityFooter ink={T.ink} />
    </div>
  );
}

// ── Design 2 — AN-NOUR Immobilier & Déco d'Intérieur ────────────────────────

function BoutiqueSheet(p: SheetProps) {
  const T = THEME.boutique;
  const { data } = p;

  const sheet: CSSProperties = {
    width: "210mm",
    minHeight: "297mm",
    boxSizing: "border-box",
    background: T.paper,
    position: "relative",
    padding: "16mm 16mm 14mm",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    fontFamily: BODY_FONT,
    color: T.ink,
    fontSize: "12.5px",
    lineHeight: 1.4,
    WebkitFontSmoothing: "antialiased",
  };
  const partyH3: CSSProperties = { fontFamily: T.display, fontWeight: 600, fontSize: "14px", color: T.gold, margin: "0 0 8px" };
  const partyP: CSSProperties = { margin: 0, fontSize: "13px", lineHeight: 1.65, color: T.text };
  const partyName: CSSProperties = { ...partyP, fontWeight: 700, fontSize: "15px", color: T.navy, marginBottom: "3px" };
  const th: CSSProperties = {
    textAlign: "left",
    fontFamily: T.display,
    fontWeight: 600,
    fontSize: "13px",
    color: T.navy,
    padding: "0 10px 10px",
    borderBottom: `2px solid ${T.navy}`,
  };
  const thNum: CSSProperties = { ...th, textAlign: "right" };
  const td: CSSProperties = { padding: "11px 10px", borderBottom: `1px solid ${T.sand}`, verticalAlign: "top" };
  const tdNum: CSSProperties = { ...td, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
  const totalsRow: CSSProperties = { display: "flex", justifyContent: "space-between", padding: "8px 16px", fontSize: "12.5px", color: T.text };

  const [numCell, dateCell, ...extraCells] = p.metaCells;

  return (
    <div style={sheet} className="print-a4">
      {/* Swatch bar */}
      <div style={{ display: "flex", height: "8px", margin: "-16mm -16mm 26px" }}>
        <span style={{ flex: 1, background: T.navy }} />
        <span style={{ flex: 1, background: T.gold }} />
        <span style={{ flex: 1, background: T.stone }} />
        <span style={{ flex: 1, background: T.navySoft }} />
      </div>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          {p.showLogo && <img src={data.organization.logo} alt={data.organization.name} style={{ height: "64px", display: "block" }} />}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: T.display, fontWeight: 600, fontStyle: "italic", fontSize: "40px", color: T.navy, margin: 0, lineHeight: 1 }}>
            {TYPE_TITLE[data.type] ?? "Document"}
          </div>
          <div style={{ marginTop: "8px", fontSize: "12.5px", color: T.meta, lineHeight: 1.6 }}>
            N° <b style={{ color: T.ink }}>{numCell.value}</b>
            {" · "}Émise le <b style={{ color: T.ink }}>{dateCell.value}</b>
            {extraCells.map((c, i) => (
              <span key={i}>
                <br />
                {c.label} <b style={{ color: T.ink }}>{c.value}</b>
              </span>
            ))}
          </div>
        </div>
      </div>

      {data.deliveryNotice && <DeliveryNotice text={data.deliveryNotice} bg={T.sand} border={T.gold} color={T.navy} />}

      <div style={{ height: "1px", background: T.stone, margin: "22px 0" }} />

      {/* Parties */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "28px" }}>
        <div>
          <h3 style={partyH3}>Vendeur</h3>
          <PartyLines data={data} side="issuer" nameStyle={partyName} lineStyle={partyP} />
        </div>
        <div>
          <h3 style={partyH3}>{recipientLabel(data.type, "boutique")}</h3>
          <PartyLines data={data} side="recipient" nameStyle={partyName} lineStyle={partyP} />
        </div>
      </div>

      {/* Items */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "30px", fontSize: "12.5px" }}>
        <thead>
          <tr>
            <th style={th}>Article</th>
            <th style={{ ...thNum, width: "10%" }}>Qté</th>
            {!p.isDeliveryNote && (
              <>
                <th style={{ ...thNum, width: "18%" }}>P.U. (GNF)</th>
                {p.showDiscountCol && <th style={{ ...thNum, width: "14%" }}>Remise</th>}
                <th style={{ ...thNum, width: "18%" }}>Montant (GNF)</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {data.lines.map((l, i) => (
            <tr key={i}>
              <td style={{ ...td, fontWeight: 600, color: T.ink }}>{l.name}</td>
              <td style={tdNum}>{l.quantity}</td>
              {!p.isDeliveryNote && (
                <>
                  <td style={tdNum}>{nbsp(p.fmtNum(l.unitPrice))}</td>
                  {p.showDiscountCol && (
                    <td style={tdNum}>{l.lineDiscount && l.lineDiscount > 0 ? `−${nbsp(p.fmtNum(l.lineDiscount))}` : ""}</td>
                  )}
                  <td style={tdNum}>{nbsp(p.fmtNum(l.lineTotal))}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Bottom area */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px", gap: "30px" }}>
        <div style={{ flex: 1.3, fontSize: "12px", lineHeight: 1.75, color: T.text }}>
          <h4 style={{ fontFamily: T.display, fontWeight: 600, fontSize: "13.5px", color: T.navy, margin: "0 0 8px" }}>
            {p.isDeliveryNote ? "Expédition" : isCommandeDocument(data.type) ? "Observations" : "Modalités de paiement"}
          </h4>
          <PayInfoLines data={data} fmt={p.fmt} />
        </div>
        {p.showTotals && (
          <div style={{ flex: 1, background: T.sand, border: `1px solid ${T.stone}`, borderRadius: "2px", padding: "4px 0", alignSelf: "flex-start" }}>
            {p.totalsRows.map((r, i) => {
              if (r.kind === "due") {
                return (
                  <div key={i} style={{ ...totalsRow, margin: "6px 10px 4px", background: T.navy, color: "#fff", fontWeight: 700, fontSize: "15px", borderRadius: "2px" }}>
                    <span style={{ color: T.gold, fontWeight: 600 }}>{r.label}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{nbsp(r.value)}</span>
                  </div>
                );
              }
              const style: CSSProperties =
                r.kind === "grand"
                  ? { ...totalsRow, borderTop: `1px solid ${T.stone}`, fontWeight: 700, color: T.navy, fontSize: "14.5px" }
                  : totalsRow;
              return (
                <div key={i} style={style}>
                  <span>{r.label}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{nbsp(r.value)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* Footer line */}
      <div style={{ marginTop: "30px", paddingTop: "16px", borderTop: `1px solid ${T.stone}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", maxWidth: "70%" }}>
          {p.qrDataUrl && <img src={p.qrDataUrl} alt="QR" style={{ width: "48px", height: "48px", display: "block" }} />}
          <div style={{ fontSize: "10.5px", color: T.muted, lineHeight: 1.6 }}>
            Marchandises vendues non reprises. Réclamation à formuler sous 48 h suivant réception.<br />
            Document généré le {fmtShortDate(data.createdAt)} — réf. {data.reference}.
          </div>
        </div>
        <div style={{ fontFamily: T.display, fontStyle: "italic", fontWeight: 600, fontSize: "14px", color: T.navy, textAlign: "right", whiteSpace: "nowrap" }}>
          Merci pour votre confiance
        </div>
      </div>

      <IdentityFooter ink={T.ink} />
    </div>
  );
}
