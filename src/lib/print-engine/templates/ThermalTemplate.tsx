// Visual preview of the thermal ticket — rendered in the PrintPreviewDialog.
// Width is constrained to 58mm or 80mm equivalent in pixels.
// The same component's outerHTML is serialized and sent to printHtml().

import type { DocumentPrintData, PrintConfig } from "../types";
import { fmtMoney, fmtDateTime } from "../formatters";
import { TYPE_LABEL, isCommandeDocument, isDeliveryNoteType } from "../constants";

const SEP_THIN = "─".repeat(36);
const SEP_THICK = "═".repeat(36);

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: bold ? "bold" : "normal" }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function ThermalTemplate({
  data,
  config,
  qrDataUrl,
}: {
  data: DocumentPrintData;
  config: PrintConfig;
  qrDataUrl?: string;
}) {
  const width = config.format === "thermal-58" ? "200px" : "280px";
  const currency = config.currency ?? "GNF";
  const locale = config.locale ?? "fr-GN";
  const fmt = (n: number) => fmtMoney(n, currency, locale);

  const style: React.CSSProperties = {
    width,
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: "11px",
    lineHeight: "1.5",
    color: "#000",
    padding: "8px",
    background: "#fff",
  };

  const center: React.CSSProperties = { textAlign: "center" };
  const bold: React.CSSProperties = { fontWeight: "bold" };
  const small: React.CSSProperties = { fontSize: "9px" };
  const success: React.CSSProperties = { fontWeight: "bold", textAlign: "right" };

  // A delivery note is about what's being handed over, not money — no unit
  // prices, no totals/payments block (that's the receipt/facture's job).
  const isDeliveryNote = isDeliveryNoteType(data.type);
  // An internal commande document never carries a real payment — see
  // A4Template for the full reasoning.
  const showPayments = !isDeliveryNote && !isCommandeDocument(data.type);
  const footerLines = (data.footerOverride ?? config.footerMessage ?? "Merci pour votre achat !")
    .split("\n")
    .filter(Boolean);

  return (
    <div style={style} className="print-thermal">
      {/* Logo */}
      {config.showLogo !== false && data.organization.logo && (
        <div style={center}>
          <img src={data.organization.logo} alt="logo" style={{ maxWidth: "75px", maxHeight: "50px" }} />
        </div>
      )}

      {/* Organization */}
      <div style={{ ...center, ...bold, fontSize: "13px" }}>{data.organization.name}</div>
      {data.organization.address && <div style={center}>{data.organization.address}</div>}
      {data.organization.phone && <div style={center}>Tél: {data.organization.phone}</div>}
      {data.organization.nif && <div style={center}>NIF: {data.organization.nif}</div>}

      <div style={center}>{SEP_THICK}</div>
      <div style={{ ...center, ...bold }}>{TYPE_LABEL[data.type] ?? "DOCUMENT"}</div>
      <div style={center}>{SEP_THICK}</div>

      {data.deliveryNotice && (
        <div style={{ ...center, ...bold, margin: "4px 0", padding: "3px 0", border: "1px dashed #000" }}>
          {data.deliveryNotice}
        </div>
      )}

      <div>Réf: <strong>{data.reference}</strong></div>
      <div>Date: {fmtDateTime(data.createdAt, locale)}</div>
      {data.issuer && <div>Caissier: {data.issuer.name}</div>}
      {data.customer && <div>Client: <strong>{data.customer.name}</strong></div>}
      {data.notes && <div style={small}>{data.notes}</div>}

      <div>{SEP_THIN}</div>

      {/* Products */}
      {data.lines.map((l, i) => (
        <div key={i}>
          <div style={bold}>{l.name}</div>
          {isDeliveryNote ? (
            <Row label="  Qté" value={String(l.quantity)} />
          ) : (
            <>
              <Row label={`  ${l.quantity} × ${fmt(l.unitPrice)}`} value={fmt(l.lineTotal)} />
              {!!l.lineDiscount && l.lineDiscount > 0 && (
                <div style={small}>  Remise: -{fmt(l.lineDiscount)}</div>
              )}
            </>
          )}
        </div>
      ))}

      <div>{SEP_THIN}</div>

      {!isDeliveryNote && (
        <>
          {/* Totals */}
          {!!data.totals.lineDiscounts && data.totals.lineDiscounts > 0 && (
            <Row label="Remise lignes" value={`-${fmt(data.totals.lineDiscounts)}`} />
          )}
          {!!data.totals.globalDiscount && data.totals.globalDiscount > 0 && (
            <Row label="Remise globale" value={`-${fmt(data.totals.globalDiscount)}`} />
          )}
          {!!data.totals.tax && data.totals.tax > 0 && (
            <Row label={`Taxe (${data.totals.taxRate}%)`} value={fmt(data.totals.tax)} />
          )}
          <Row label="TOTAL" value={fmt(data.totals.total)} bold />

          <div>{SEP_THICK}</div>

          {/* Payments — omitted for internal commande documents. */}
          {showPayments && (
            <>
              {data.payments.map((p, i) => (
                <div key={i}>
                  <Row label={p.method} value={fmt(p.amount)} />
                  {p.reference && <div style={small}>  Réf: {p.reference}</div>}
                  {!!p.change && p.change > 0 && (
                    <Row label="Monnaie rendue" value={fmt(p.change)} />
                  )}
                </div>
              ))}
              <Row label="PAYÉ" value={fmt(data.amountPaid)} bold />
              {data.amountDue > 0 && (
                <div style={{ ...success, color: "#dc2626" }}>
                  <Row label="RESTE (créance)" value={fmt(data.amountDue)} bold />
                </div>
              )}

              <div>{SEP_THICK}</div>
            </>
          )}
        </>
      )}

      {/* QR Code */}
      {qrDataUrl && (
        <div style={{ ...center, margin: "6px 0" }}>
          <img src={qrDataUrl} alt="QR" style={{ width: "80px", height: "80px" }} />
          <div style={{ ...small, marginTop: "2px" }}>{data.qrContent}</div>
        </div>
      )}

      {/* Footer */}
      <div style={{ ...center, marginTop: "4px" }}>
        {footerLines.map((line, i) => (
          <div key={i} style={i === 0 ? bold : small}>{line}</div>
        ))}
      </div>
    </div>
  );
}
