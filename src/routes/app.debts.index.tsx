import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { KpiCard, StatusBadge, TableSkeleton, ApiErrorState } from "@/components/primitives";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, Clock, TrendingDown, Search, CreditCard as DebtIcon } from "lucide-react";
import { creancesApi, qk } from "@/lib/api";
import { fmtXAF } from "@/lib/mock-data";
import { useT, formatDate } from "@/lib/i18n";
import { useWorkContext, canViewHQ } from "@/lib/work-context";
import { toast } from "sonner";
import type { CreanceRead, PaiementMode } from "@/lib/types";

export const Route = createFileRoute("/app/debts/")({ component: Page });

function RecordPaymentDialog({
  creance,
  open,
  onClose,
}: {
  creance: CreanceRead;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const [amount, setAmount] = useState(String(creance.montant_restant));
  const [mode, setMode] = useState<PaiementMode>("especes");
  const [reference, setReference] = useState("");

  const amountError =
    !amount || Number(amount) <= 0
      ? "Montant invalide."
      : Number(amount) > Number(creance.montant_restant)
        ? "Le montant dépasse le reste dû."
        : null;

  const mutation = useMutation({
    mutationFn: () =>
      creancesApi.createPayment({
        creance_id: creance.id,
        montant: Number(amount),
        mode,
        reference: reference.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Paiement enregistré");
      qc.invalidateQueries({ queryKey: ["creances"] });
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("debts.recordPayment") as string}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-secondary/30 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{creance.client_name}</span>
              <span className="text-muted-foreground">{creance.store_name}</span>
            </div>
            <div className="mt-1 flex justify-between font-medium">
              <span>Reste dû</span>
              <span className="tabular-nums text-destructive">{fmtXAF(Number(creance.montant_restant))}</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.amount") as string}</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={1}
              max={Number(creance.montant_restant)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Mode de paiement</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as PaiementMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="especes">Espèces</SelectItem>
                <SelectItem value="mobile_money">Mobile Money</SelectItem>
                <SelectItem value="carte">Carte</SelectItem>
                <SelectItem value="virement">Virement</SelectItem>
                <SelectItem value="cheque">Chèque</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Référence (optionnel)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="N° transaction, chèque…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel") as string}</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !!amountError}
          >
            {mutation.isPending ? "…" : t("common.confirm") as string}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Page() {
  const { t, lang } = useT();
  const { isSuperAdmin, has, authorizedStores } = useWorkContext();
  const isHQ = canViewHQ(isSuperAdmin, has);
  const [search, setSearch] = useState("");
  const [boutiqueId, setBoutiqueId] = useState<string>("all");
  const [selected, setSelected] = useState<CreanceRead | null>(null);

  const scopedBoutiqueId = isHQ && boutiqueId !== "all" ? Number(boutiqueId) : undefined;

  const { data: creances = [], isLoading, error, refetch } = useQuery({
    queryKey: qk.creances.list({ boutique_id: scopedBoutiqueId }),
    queryFn: () => creancesApi.list({ limit: 500, boutique_id: scopedBoutiqueId }),
  });

  const filtered = creances.filter((d) => {
    const q = search.toLowerCase();
    const clientName = d.client_name ?? "";
    const storeName = d.store_name ?? "";
    return !q || clientName.toLowerCase().includes(q) || storeName.toLowerCase().includes(q);
  });

  // KPIs
  const total = filtered.reduce((a, d) => a + Number(d.montant_restant), 0);
  const overdue = filtered.filter((d) => d.statut === "en_retard").length;
  const totalInitial = filtered.reduce((a, d) => a + Number(d.montant_initial), 0);
  const totalPaid = totalInitial - total;
  const collectionRate = totalInitial > 0 ? Math.round((totalPaid / totalInitial) * 100) : 0;
  const dueSoon = filtered.filter((d) => {
    if (!d.date_echeance) return false;
    const days = (new Date(d.date_echeance).getTime() - Date.now()) / 86_400_000;
    return days >= 0 && days <= 7;
  }).length;

  return (
    <>
      <PageHeader
        title={t("debts.title") as string}
        description={t("debts.subtitle") as string}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          label={t("dashboard.kpi.outstanding") as string}
          value={fmtXAF(total)}
          valueClassName="text-base sm:text-lg lg:text-xl"
          tone="destructive"
          icon={<CreditCard className="h-5 w-5" />}
        />
        <KpiCard
          label={t("status.overdue") as string}
          value={overdue}
          tone="warning"
          icon={<Clock className="h-5 w-5" />}
        />
        <KpiCard
          label={t("dashboard.collection") as string}
          value={`${collectionRate}%`}
          tone="success"
          icon={<TrendingDown className="h-5 w-5" />}
        />
        <KpiCard label={t("status.dueSoon") as string} value={dueSoon} tone="default" />
      </div>

      <Card className="mt-4 shadow-soft">
        <div className="flex items-center gap-2 border-b p-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("common.searchShort") as string}
              className="h-9 pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {isHQ && (
            <Select value={boutiqueId} onValueChange={setBoutiqueId}>
              <SelectTrigger className="h-9 w-48 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les boutiques</SelectItem>
                {authorizedStores.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/40">
              <TableHead>{t("debts.col.customer") as string}</TableHead>
              <TableHead>{t("debts.col.store") as string}</TableHead>
              <TableHead className="w-48">{t("debts.col.paid") as string}</TableHead>
              <TableHead className="text-right">{t("debts.col.remaining") as string}</TableHead>
              <TableHead>{t("debts.col.due") as string}</TableHead>
              <TableHead>{t("debts.col.status") as string}</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton cols={7} />
            ) : error ? (
              <tr>
                <td colSpan={7}>
                  <ApiErrorState error={error} onRetry={refetch} />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
                    <DebtIcon className="h-8 w-8 opacity-30" />
                    <span>{t("common.empty") as string}</span>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((d) => {
                const initial = Number(d.montant_initial);
                const restant = Number(d.montant_restant);
                const pct = initial > 0 ? Math.round(((initial - restant) / initial) * 100) : 0;
                return (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">
                      <div>{d.client_name ?? `Client #${d.client_id}`}</div>
                      {d.client_phone && (
                        <div className="text-xs text-muted-foreground">{d.client_phone}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {d.store_name ?? `Boutique #${d.boutique_id}`}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={pct} className="h-1.5" />
                        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {pct}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {fmtXAF(restant)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {d.date_echeance ? formatDate(d.date_echeance, lang) : ""}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={d.statut} />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelected(d)}
                        disabled={d.statut === "soldee" || d.statut === "annulee"}
                      >
                        {t("debts.recordPayment") as string}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between border-t p-3 text-xs text-muted-foreground">
          <span>
            {filtered.length} / {creances.length} créance{creances.length !== 1 ? "s" : ""}
          </span>
        </div>
      </Card>

      {selected && (
        <RecordPaymentDialog
          creance={selected}
          open={!!selected}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
