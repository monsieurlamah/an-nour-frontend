import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, ApiErrorState } from "@/components/primitives";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ChevronLeft,
  Truck,
  Printer,
  Ban,
  ClipboardCheck,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/i18n";
import { useWorkContext } from "@/lib/work-context";
import { transfertsApi, catalogApi, qk } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { PrintPreviewDialog, type DocumentPrintData } from "@/lib/print-engine";
import { transfertToBonDocument } from "@/lib/transfert-print-adapter";

export const Route = createFileRoute("/app/transfers/$id")({ component: Page });

function Page() {
  const { id } = useParams({ from: "/app/transfers/$id" });
  const transfertId = Number(id);
  const qc = useQueryClient();
  const { has } = useWorkContext();

  const {
    data: transfert,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: qk.transferts.detail(transfertId),
    queryFn: () => transfertsApi.get(transfertId),
  });

  const { data: products = [] } = useQuery({
    queryKey: qk.catalog.products(),
    queryFn: () => catalogApi.listProducts({ limit: 500 }),
  });
  const productName = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p.name])),
    [products],
  );

  const [receiveOpen, setReceiveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelMotif, setCancelMotif] = useState("");
  const [receivedQty, setReceivedQty] = useState<Record<number, string>>({});
  const [receivedObs, setReceivedObs] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [printDoc, setPrintDoc] = useState<DocumentPrintData | null>(null);

  if (isLoading)
    return <div className="p-8 text-center text-sm text-muted-foreground">Chargement…</div>;
  if (error || !transfert) return <ApiErrorState error={error} onRetry={refetch} />;

  const isEnTransit = transfert.statut === "en_transit";
  const canReceive = has("transferts.receive") && isEnTransit;
  const canCancel = has("transferts.cancel") && isEnTransit;

  const openReceive = () => {
    const defaults: Record<number, string> = {};
    for (const l of transfert.lignes) defaults[l.id] = String(l.quantite_envoyee);
    setReceivedQty(defaults);
    setReceivedObs({});
    setReceiveOpen(true);
  };

  const submitReceive = async () => {
    setBusy(true);
    try {
      const updated = await transfertsApi.receive(transfert.id, {
        lignes: transfert.lignes.map((l) => ({
          ligne_id: l.id,
          quantite_recue: Number(receivedQty[l.id] ?? 0),
          observation: receivedObs[l.id]?.trim() || undefined,
        })),
      });
      await qc.invalidateQueries({ queryKey: ["transferts"] });
      setReceiveOpen(false);
      toast.success(
        updated.statut === "receptionne_avec_ecart"
          ? "Transfert réceptionné — écart constaté et enregistré"
          : "Transfert réceptionné sans écart",
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  const submitCancel = async () => {
    if (!cancelMotif.trim()) {
      toast.error("Le motif est obligatoire.");
      return;
    }
    setBusy(true);
    try {
      await transfertsApi.cancel(transfert.id, { motif: cancelMotif.trim() });
      await qc.invalidateQueries({ queryKey: ["transferts"] });
      setCancelOpen(false);
      toast.success("Transfert annulé — stock source restauré");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.detail : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground">
        <Link to="/app/transfers">
          <ChevronLeft className="mr-1 h-4 w-4" /> Transferts
        </Link>
      </Button>

      <PageHeader
        title={transfert.numero}
        description={`${transfert.boutique_source_name} → ${transfert.boutique_destination_name}`}
        badge={<StatusBadge status={transfert.statut} />}
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setPrintDoc(
                  transfertToBonDocument(transfert, {
                    productName: (id2) => productName[id2] ?? `#${id2}`,
                  }),
                )
              }
            >
              <Printer className="mr-1.5 h-3.5 w-3.5" /> Bon de transfert
            </Button>
            {canReceive && (
              <Button size="sm" onClick={openReceive}>
                <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" /> Réceptionner
              </Button>
            )}
            {canCancel && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                onClick={() => setCancelOpen(true)}
              >
                <Ban className="mr-1.5 h-3.5 w-3.5" /> Annuler
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Articles</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/40">
                  <TableHead>Produit</TableHead>
                  <TableHead className="text-right">Envoyée</TableHead>
                  <TableHead className="text-right">Reçue</TableHead>
                  <TableHead>Observation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfert.lignes.map((l) => {
                  const wasReceived =
                    transfert.statut === "receptionne" ||
                    transfert.statut === "receptionne_avec_ecart";
                  const hasEcart = wasReceived && l.quantite_recue !== l.quantite_envoyee;
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">
                        {productName[l.produit_id] ?? `#${l.produit_id}`}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.quantite_envoyee}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${hasEcart ? "font-semibold text-warning" : ""}`}
                      >
                        {wasReceived ? l.quantite_recue : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {hasEcart && (
                          <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-warning" />
                        )}
                        {l.observation ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="shadow-soft">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Timeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <Truck className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="font-medium">Expédié</div>
                  <div className="text-xs text-muted-foreground">
                    {transfert.expedie_at ? formatDateTime(transfert.expedie_at, "fr") : "—"}
                  </div>
                </div>
              </div>
              {transfert.receptionne_at && (
                <div className="flex items-start gap-2">
                  <ClipboardCheck className="mt-0.5 h-4 w-4 text-success" />
                  <div>
                    <div className="font-medium">Réceptionné</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(transfert.receptionne_at, "fr")}
                    </div>
                  </div>
                </div>
              )}
              {transfert.annule_at && (
                <div className="flex items-start gap-2">
                  <Ban className="mt-0.5 h-4 w-4 text-destructive" />
                  <div>
                    <div className="font-medium">Annulé</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(transfert.annule_at, "fr")}
                    </div>
                    {transfert.annule_motif && (
                      <div className="mt-1 text-xs italic">« {transfert.annule_motif} »</div>
                    )}
                  </div>
                </div>
              )}
              {transfert.motif && (
                <div className="border-t pt-2 text-xs">
                  <span className="font-medium">Motif : </span>
                  {transfert.motif}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Réceptionner ─────────────────────────────────────────────── */}
      <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Réceptionner le transfert</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Saisissez les quantités réellement reçues pour chaque article. Un écart avec la
              quantité envoyée sera automatiquement enregistré et notifié.
            </p>
            {transfert.lignes.map((l) => (
              <div
                key={l.id}
                className="grid grid-cols-[1fr_90px] items-start gap-2 rounded-lg border p-2.5"
              >
                <div>
                  <div className="text-sm font-medium">
                    {productName[l.produit_id] ?? `#${l.produit_id}`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Envoyée : {l.quantite_envoyee}
                  </div>
                  <Input
                    className="mt-1.5 h-8 text-xs"
                    placeholder="Observation (optionnel)"
                    value={receivedObs[l.id] ?? ""}
                    onChange={(e) =>
                      setReceivedObs((prev) => ({ ...prev, [l.id]: e.target.value }))
                    }
                  />
                </div>
                <Input
                  type="number"
                  min={0}
                  className="h-9 text-center"
                  value={receivedQty[l.id] ?? ""}
                  onChange={(e) => setReceivedQty((prev) => ({ ...prev, [l.id]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveOpen(false)}>
              Annuler
            </Button>
            <Button onClick={submitReceive} disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Confirmer la réception
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Annuler ──────────────────────────────────────────────────── */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Annuler le transfert</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Motif *</Label>
            <Textarea
              rows={3}
              value={cancelMotif}
              onChange={(e) => setCancelMotif(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Fermer
            </Button>
            <Button variant="destructive" onClick={submitCancel} disabled={busy}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Confirmer l'annulation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PrintPreviewDialog
        open={!!printDoc}
        document={printDoc}
        config={{ format: "a4" }}
        onClose={() => setPrintDoc(null)}
      />
    </>
  );
}
