// Real sale ticket — fed exclusively by the VenteRead the backend returns
// after VenteService.create(). No mock data, no recomputation: every figure
// shown here is exactly what the transactional engine persisted.

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Check, Printer } from "lucide-react";
import { fmtXAF } from "@/lib/mock-data";
import { useT, formatDateTime } from "@/lib/i18n";
import { PAIEMENT_MODE_LABEL } from "@/lib/paiement-labels";
import type { VenteRead } from "@/lib/types";

export function SaleTicket({
  vente,
  storeName,
  vendeurName,
  clientName,
  productName,
  onClose,
}: {
  vente: VenteRead | null;
  storeName: string;
  vendeurName: string;
  clientName: string | null;
  productName: (productId: number) => string;
  onClose: () => void;
}) {
  const { t, lang } = useT();

  return (
    <Dialog open={!!vente} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-success/15 text-success">
              <Check className="h-5 w-5" strokeWidth={3} />
            </div>
            {t("pos.saleCompleted") as string}
          </DialogTitle>
        </DialogHeader>
        {vente && (
          <div className="space-y-3 rounded-lg border bg-background p-4 font-mono text-xs">
            <div className="text-center">
              <div className="text-sm font-bold">{t("pos.receipt") as string}</div>
              <div className="text-muted-foreground">VENTE-{vente.id}</div>
              <div className="text-muted-foreground">{formatDateTime(vente.created_at, lang)}</div>
            </div>
            <Separator />
            <div className="space-y-0.5">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("common.store") as string}</span><span>{storeName}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("common.cashier") as string}</span><span>{vendeurName}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("pos.customer") as string}</span><span>{clientName ?? (t("walkin") as string)}</span></div>
            </div>
            <Separator />
            <ul className="space-y-1">
              {vente.lignes.map((l) => (
                <li key={l.id} className="flex justify-between gap-2">
                  <span className="truncate">
                    {l.quantite}× {productName(l.produit_id)}
                    {Number(l.remise) > 0 && <span className="text-success"> (−{fmtXAF(Number(l.remise))})</span>}
                  </span>
                  <span className="tabular-nums shrink-0">{fmtXAF(Number(l.total_ligne))}</span>
                </li>
              ))}
            </ul>
            <Separator />
            <div className="space-y-0.5">
              {Number(vente.remise) > 0 && (
                <div className="flex justify-between text-success">
                  <span>{t("common.discount") as string}</span>
                  <span className="tabular-nums">−{fmtXAF(Number(vente.remise))}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-1 text-sm font-bold">
                <span>{t("common.total") as string}</span>
                <span className="tabular-nums">{fmtXAF(Number(vente.montant_total))}</span>
              </div>
            </div>
            <Separator />
            <div className="space-y-0.5">
              {vente.paiements.map((p) => (
                <div key={p.id} className="flex justify-between">
                  <span>{PAIEMENT_MODE_LABEL[p.mode] ?? p.mode}{p.reference ? ` · ${p.reference}` : ""}</span>
                  <span className="tabular-nums">{fmtXAF(Number(p.montant))}</span>
                </div>
              ))}
              <div className="flex justify-between font-medium">
                <span>{t("debts.col.paid") as string}</span>
                <span className="tabular-nums">{fmtXAF(Number(vente.montant_paye))}</span>
              </div>
              {Number(vente.montant_restant) > 0 && (
                <div className="flex justify-between text-destructive">
                  <span>{t("debts.col.remaining") as string}</span>
                  <span className="tabular-nums">{fmtXAF(Number(vente.montant_restant))}</span>
                </div>
              )}
            </div>
            <div className="pt-2 text-center text-muted-foreground">{t("pos.thankYou") as string}</div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" />{t("pos.print") as string}
          </Button>
          <Button onClick={onClose}>{t("common.close") as string}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
