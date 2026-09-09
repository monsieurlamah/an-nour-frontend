// A4 invoice / document template — rendered inside the PrintPreviewDialog.
// Styled as a professional business document. Its outerHTML is serialized for
// printing via the isolated iframe.

import type { DocumentPrintData, PrintConfig } from "../types";
import { fmtMoney, fmtDateTime } from "../formatters";
import { TYPE_LABEL, isCommandeDocument, isDeliveryNoteType } from "../constants";

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

  const isDeliveryNote = isDeliveryNoteType(data.type);
  // An internal commande document (bon de commande / proforma / facture)
  // never carries a real payment — it's a stock transfer inside the same
  // company, not a sale — so the Paiements/Reste (créance) block would only
  // ever show "100% restant" and mislead the reader. Totals still show: the
  // whole point of a proforma/facture is the price.
  const showPayments = !isDeliveryNote && !isCommandeDocument(data.type);
  const showTotals = !isDeliveryNote;
  const footerLines = (data.footerOverride ?? config.footerMessage ?? "").split("\n").filter(Boolean);

  const container: React.CSSProperties = {
    width: "210mm",
    minHeight: "297mm",
    background: "#fff",
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
    fontSize: "11px",
    color: "#1e293b",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
  };

  const header: React.CSSProperties = {
    background: "#001F5F", // brand navy
    color: "#fff",
    padding: "20px 24px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottom: "3px solid #F5A623", // brand gold accent
  };

  const body: React.CSSProperties = { padding: "24px", flex: 1 };

  return (
    <div style={container} className="print-a4">
      {/* Header stripe */}
      <div style={header}>
        <div>
          <div style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "4px" }}>
            {data.organization.name}
          </div>
          {data.organization.address && <div style={{ opacity: 0.85, fontSize: "10px" }}>{data.organization.address}</div>}
          {data.organization.phone && <div style={{ opacity: 0.85, fontSize: "10px" }}>Tél: {data.organization.phone}</div>}
          {data.organization.email && <div style={{ opacity: 0.85, fontSize: "10px" }}>{data.organization.email}</div>}
          {data.organization.nif && <div style={{ opacity: 0.85, fontSize: "10px" }}>NIF: {data.organization.nif}</div>}
        </div>
        {config.showLogo !== false && data.organization.logo && (
          <img
            src={data.organization.logo}
            alt="logo"
            style={{ maxHeight: "64px", maxWidth: "140px", background: "#fff", borderRadius: "4px", padding: "4px" }}
          />
        )}
      </div>

      <div style={body}>
        {data.deliveryNotice && (
          <div style={{
            background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px",
            padding: "10px 14px", marginBottom: "16px", fontWeight: "bold", color: "#92400e",
            textAlign: "center",
          }}>
            {data.deliveryNotice}
          </div>
        )}
        {/* Title + ref */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
          <div>
            <div style={{ fontSize: "22px", fontWeight: "bold", color: "#1e293b" }}>
              {TYPE_LABEL[data.type] ?? "DOCUMENT"}
            </div>
            <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px" }}>
              {fmtDateTime(data.createdAt, locale)}
            </div>
          </div>
          <div style={{ textAlign: "right", background: "#f8fafc", padding: "8px 12px", borderRadius: "6px" }}>
            <div style={{ fontSize: "10px", color: "#64748b" }}>Référence</div>
            <div style={{ fontWeight: "bold", fontSize: "13px" }}>{data.reference}</div>
          </div>
        </div>

        {data.notes && (
          <div style={{ fontSize: "9px", color: "#94a3b8", fontStyle: "italic", marginBottom: "16px" }}>
            {data.notes}
          </div>
        )}

        {/* Info cards */}
        <div style={{ display: "flex", gap: "16px", marginBottom: "20px" }}>
          {data.customer && (
            <div style={{ flex: 1, background: "#f8fafc", padding: "12px", borderRadius: "6px" }}>
              <div style={{ fontSize: "9px", fontWeight: "bold", color: "#64748b", marginBottom: "4px", textTransform: "uppercase" }}>Client</div>
              <div style={{ fontWeight: "bold" }}>{data.customer.name}</div>
              {data.customer.code && <div style={{ color: "#64748b", fontSize: "10px" }}>Code: {data.customer.code}</div>}
              {data.customer.phone && <div style={{ fontSize: "10px" }}>{data.customer.phone}</div>}
              {data.customer.address && <div style={{ fontSize: "10px" }}>{data.customer.address}</div>}
            </div>
          )}
          {data.issuer && (
            <div style={{ flex: 1, background: "#f8fafc", padding: "12px", borderRadius: "6px" }}>
              <div style={{ fontSize: "9px", fontWeight: "bold", color: "#64748b", marginBottom: "4px", textTransform: "uppercase" }}>Vendeur</div>
              <div style={{ fontWeight: "bold" }}>{data.issuer.name}</div>
              {data.issuer.role && <div style={{ color: "#64748b", fontSize: "10px" }}>{data.issuer.role}</div>}
            </div>
          )}
          {data.logistics && (
            <div style={{ flex: 1, background: "#f8fafc", padding: "12px", borderRadius: "6px" }}>
              <div style={{ fontSize: "9px", fontWeight: "bold", color: "#64748b", marginBottom: "4px", textTransform: "uppercase" }}>Expédition</div>
              {data.logistics.transporteur && (
                <div style={{ fontSize: "10px" }}>Transporteur : <strong>{data.logistics.transporteur}</strong></div>
              )}
              {data.logistics.livreurNom && (
                <div style={{ fontSize: "10px" }}>Livreur : <strong>{data.logistics.livreurNom}</strong></div>
              )}
              {data.logistics.dateExpedition && (
                <div style={{ fontSize: "10px" }}>Expédié le : {fmtDateTime(data.logistics.dateExpedition, locale)}</div>
              )}
              {data.logistics.dateLivraison && (
                <div style={{ fontSize: "10px" }}>Livré le : {fmtDateTime(data.logistics.dateLivraison, locale)}</div>
              )}
            </div>
          )}
        </div>

        {/* Product table — a bon de livraison only needs Article + Qté, no
            pricing columns (that's the proforma/facture's job). */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px" }}>
          <thead>
            <tr style={{ background: "#001F5F", color: "#fff" }}>
              <th style={{ padding: "8px 10px", textAlign: "left", fontSize: "10px" }}>Article</th>
              <th style={{ padding: "8px 8px", textAlign: "center", fontSize: "10px", width: "42px" }}>Qté</th>
              {!isDeliveryNote && (
                <>
                  <th style={{ padding: "8px 8px", textAlign: "right", fontSize: "10px", width: "108px" }}>Prix unitaire</th>
                  <th style={{ padding: "8px 8px", textAlign: "right", fontSize: "10px", width: "70px" }}>Remise</th>
                  <th style={{ padding: "8px 10px", textAlign: "right", fontSize: "10px", width: "120px" }}>Total</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l, i) => (
              <tr key={i} style={{ background: i % 2 === 1 ? "#f8fafc" : "#fff", borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: "7px 10px" }}>{l.name}</td>
                <td style={{ padding: "7px 8px", textAlign: "center" }}>{l.quantity}</td>
                {!isDeliveryNote && (
                  <>
                    <td style={{ padding: "7px 8px", textAlign: "right", whiteSpace: "nowrap" }}>{fmt(l.unitPrice)}</td>
                    <td style={{ padding: "7px 8px", textAlign: "right", color: "#059669", whiteSpace: "nowrap" }}>
                      {l.lineDiscount && l.lineDiscount > 0 ? `-${fmt(l.lineDiscount)}` : ""}
                    </td>
                    <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: "bold", whiteSpace: "nowrap" }}>{fmt(l.lineTotal)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals block — omitted on a bon de livraison: it's about what was
            shipped, not what's owed (that's the proforma/facture's job). */}
        {showTotals && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "20px" }}>
          <div style={{ width: "220px", background: "#f8fafc", borderRadius: "6px", padding: "12px" }}>
            {!!data.totals.globalDiscount && data.totals.globalDiscount > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", color: "#059669" }}>
                <span>Remise globale</span><span>-{fmt(data.totals.globalDiscount)}</span>
              </div>
            )}
            {!!data.totals.tax && data.totals.tax > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span>Taxe ({data.totals.taxRate}%)</span><span>{fmt(data.totals.tax)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: "14px", borderTop: "2px solid #001F5F", paddingTop: "6px", marginTop: "6px" }}>
              <span>TOTAL</span><span>{fmt(data.totals.total)}</span>
            </div>
          </div>
        </div>
        )}

        {/* Payments — omitted for internal commande documents (no real
            payment is ever recorded against them) and for a bon de livraison. */}
        {showPayments && (
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontWeight: "bold", fontSize: "12px", marginBottom: "8px" }}>Paiements</div>
          {data.payments.map((p, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f1f5f9" }}>
              <span>{p.method}{p.reference ? ` · ${p.reference}` : ""}</span>
              <span style={{ fontWeight: "500" }}>{fmt(p.amount)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", marginTop: "4px" }}>
            <span>Total payé</span><span>{fmt(data.amountPaid)}</span>
          </div>
          {data.amountDue > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", color: "#dc2626", marginTop: "4px" }}>
              <span>Reste (créance)</span><span>{fmt(data.amountDue)}</span>
            </div>
          )}
        </div>
        )}

        {/* QR code, floated beside the footer identity block below. */}
        {qrDataUrl && (
          <div style={{ marginBottom: "8px" }}>
            <img src={qrDataUrl} alt="QR" style={{ width: "70px", height: "70px" }} />
            <div style={{ fontSize: "8px", color: "#94a3b8", marginTop: "2px" }}>{data.qrContent}</div>
          </div>
        )}
      </div>

      {/* Footer — pinned to the bottom of the page, like a letterhead. */}
      {footerLines.length > 0 && (
        <div style={{ padding: "14px 24px 20px", borderTop: "1px solid #e2e8f0", textAlign: "center" }}>
          {footerLines.map((line, i) => (
            <div
              key={i}
              style={
                i === 0
                  ? { fontWeight: "bold", fontSize: "11px", color: "#1e293b", marginBottom: "2px" }
                  : i === 1
                  ? { fontSize: "10px", color: "#475569", marginBottom: "4px" }
                  : { fontSize: "8.5px", color: "#94a3b8", lineHeight: 1.5 }
              }
            >
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
