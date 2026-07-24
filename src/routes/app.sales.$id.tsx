import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiErrorState } from "@/components/primitives";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronLeft, Printer, Ban, Loader2, Receipt, User, Store,
  CreditCard, Calendar, Package, CheckCircle, XCircle, RefreshCcw,
  AlertTriangle, Undo2, Clock, Truck, Wallet,
} from "lucide-react";
import { fmtXAF } from "@/lib/mock-data";
import { ventesApi, clientsApi, creancesApi, catalogApi, storesApi, qk } from "@/lib/api";
import { useWorkContext } from "@/lib/work-context";
import { PrintPreviewDialog } from "@/lib/print-engine";
import { saleToDocument, saleToDeliveryNoteDocument } from "@/lib/pos-print-adapter";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useT, formatDateTime } from "@/lib/i18n";
import type { VenteLigneRead, VenteRetourCreate, VenteRemboursementCreate, PaiementMode } from "@/lib/types";

export const Route = createFileRoute("/app/sales/$id")({ component: Page });

// ── Status config ─────────────────────────────────────────────────────────────

const STATUT_LABEL: Record<string, string> = {
  completee: "Payée", partiellement_payee: "Partiellement payée",
  impayee: "Non payée", en_cours: "En cours",
  annulee: "Annulée", partiellement_retournee: "Partiellement retournée",
  retournee: "Retournée", partiellement_remboursee: "Partiellement remboursée",
  remboursee: "Remboursée",
};

const STATUT_COLORS: Record<string, string> = {
  completee: "bg-success/10 text-success border-success/30",
  partiellement_payee: "bg-warning/10 text-warning border-warning/30",
  impayee: "bg-muted text-muted-foreground",
  annulee: "bg-destructive/10 text-destructive border-destructive/30",
  partiellement_retournee: "bg-orange-100 text-orange-700 border-orange-200",
  retournee: "bg-orange-100 text-orange-700 border-orange-200",
  partiellement_remboursee: "bg-purple-100 text-purple-700 border-purple-200",
  remboursee: "bg-purple-100 text-purple-700 border-purple-200",
};

const PAYMENT_LABEL: Record<string, string> = {
  especes: "Espèces", mobile_money: "Mobile Money",
  carte: "Carte Bancaire", virement: "Virement Bancaire", cheque: "Chèque",
};

const MOTIFS = ["Erreur de saisie", "Client insatisfait", "Produit défectueux", "Erreur de prix", "Autre"];

function VenteStatutBadge({ statut }: { statut: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", STATUT_COLORS[statut] ?? "bg-muted text-muted-foreground")}>
      {STATUT_LABEL[statut] ?? statut}
    </span>
  );
}

function VenteLivraisonBadge({ statut }: { statut: string }) {
  const isLivre = statut === "livre";
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
      isLivre ? "bg-success/10 text-success border-success/30" : "bg-warning/10 text-warning border-warning/30",
    )}>
      <Truck className="h-3 w-3" />
      {isLivre ? "Livrée" : "Non livrée"}
    </span>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────────

function TimelineStep({ label, done, date, icon: Icon, last = false, color = "" }: {
  label: string; done: boolean; date?: string; icon: React.ElementType; last?: boolean; color?: string;
}) {
  const lang = "fr";
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 transition-colors",
          done
            ? color || "border-success bg-success/10 text-success"
            : "border-muted bg-muted/30 text-muted-foreground",
        )}>
          <Icon className="h-4 w-4" />
        </div>
        {!last && (
          <div className={cn("mt-1 flex-1 w-0.5", done ? "bg-success/30" : "bg-muted")}
            style={{ minHeight: "24px" }} />
        )}
      </div>
      <div className="pb-4">
        <p className={cn("text-sm font-medium", done ? "text-foreground" : "text-muted-foreground")}>
          {label}
        </p>
        {date && done && (
          <p className="text-xs text-muted-foreground">
            {new Date(date).toLocaleString(lang === "fr" ? "fr-FR" : "en-GB")}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

function Page() {
  const { t, lang } = useT();
  const { id } = useParams({ from: "/app/sales/$id" });
  const { has } = useWorkContext();
  const qc = useQueryClient();

  const [printOpen, setPrintOpen] = useState(false);
  const [printBLOpen, setPrintBLOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [retourOpen, setRetourOpen] = useState(false);
  const [remboursementOpen, setRemboursementOpen] = useState(false);
  const [encaisserOpen, setEncaisserOpen] = useState(false);

  // "Encaisser le reste" form state
  const [encaisserMontant, setEncaisserMontant] = useState("");
  const [encaisserMode, setEncaisserMode] = useState<PaiementMode>("especes");
  const [encaisserRef, setEncaisserRef] = useState("");

  // Return form state
  const [selectedLines, setSelectedLines] = useState<Record<number, number>>({});
  const [retourMotif, setRetourMotif] = useState("Autre");
  const [retourNotes, setRetourNotes] = useState("");

  // Refund form state
  const [refundMontant, setRefundMontant] = useState("");
  const [refundMode, setRefundMode] = useState<PaiementMode>("especes");
  const [refundRef, setRefundRef] = useState("");
  const [refundMotif, setRefundMotif] = useState("Autre");
  const [refundNotes, setRefundNotes] = useState("");

  const { data: vente, isLoading, error, refetch } = useQuery({
    queryKey: ["ventes", "detail", Number(id)],
    queryFn: () => ventesApi.get(Number(id)),
  });

  const { data: retours = [] } = useQuery({
    queryKey: ["ventes", "retours", Number(id)],
    queryFn: () => ventesApi.getRetours(Number(id)),
    enabled: !!vente,
  });

  const { data: remboursements = [] } = useQuery({
    queryKey: ["ventes", "remboursements", Number(id)],
    queryFn: () => ventesApi.getRemboursements(Number(id)),
    enabled: !!vente,
  });

  const { data: clients = [] } = useQuery({
    queryKey: qk.clients.list(),
    queryFn: () => clientsApi.list({ limit: 500 }),
  });

  const { data: products = [] } = useQuery({
    queryKey: qk.catalog.products({ limit: 500 }),
    queryFn: () => catalogApi.listProducts({ limit: 500 }),
  });
  const productById = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p])),
    [products],
  );
  const productName = (productId: number) => productById[productId]?.name ?? `Produit #${productId}`;

  const { data: store } = useQuery({
    queryKey: qk.stores.detail(vente?.boutique_id ?? 0),
    queryFn: () => storesApi.get(vente!.boutique_id),
    enabled: !!vente,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ventes"] });
    qc.invalidateQueries({ queryKey: ["stock"] });
  };

  const voidMutation = useMutation({
    mutationFn: () => ventesApi.void(Number(id)),
    onSuccess: () => { toast.success("Vente annulée : stock restauré"); invalidate(); setVoidOpen(false); },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const retourMutation = useMutation({
    mutationFn: (payload: VenteRetourCreate) => ventesApi.createRetour(Number(id), payload),
    onSuccess: (r) => {
      toast.success(`Retour enregistré : ${fmtXAF(Number(r.total_retourne))} restituée en stock`);
      invalidate();
      setRetourOpen(false);
      setSelectedLines({});
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const refundMutation = useMutation({
    mutationFn: (payload: VenteRemboursementCreate) => ventesApi.createRemboursement(Number(id), payload),
    onSuccess: (r) => {
      toast.success(`Remboursement de ${fmtXAF(Number(r.montant))} enregistré`);
      invalidate();
      setRemboursementOpen(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const livraisonMutation = useMutation({
    mutationFn: () => ventesApi.confirmLivraison(Number(id)),
    onSuccess: () => {
      toast.success("Livraison confirmée — stock mis à jour");
      invalidate();
      setPrintBLOpen(true);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const encaisserMutation = useMutation({
    mutationFn: () =>
      creancesApi.createPayment({
        vente_id: Number(id),
        creance_id: vente?.creance?.id,
        montant: Number(encaisserMontant),
        mode: encaisserMode,
        reference: encaisserRef || undefined,
      }),
    onSuccess: () => {
      toast.success("Paiement enregistré");
      invalidate();
      setEncaisserOpen(false);
      setEncaisserMontant("");
      setEncaisserRef("");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  // useMemo must be called unconditionally — before any early returns.
  const alreadyReturned = useMemo(() => {
    const map: Record<number, number> = {};
    retours.forEach(r => r.lignes.forEach(l => {
      map[l.vente_ligne_id] = (map[l.vente_ligne_id] ?? 0) + l.quantite;
    }));
    return map;
  }, [retours]);

  if (isLoading) return (
    <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  );
  if (error || !vente) return <ApiErrorState error={error ?? new Error("Vente introuvable")} onRetry={refetch} />;

  const clientObj = vente.client_id ? clients.find(c => c.id === vente.client_id) : null;
  const clientLabel = clientObj ? `${clientObj.name}${clientObj.prenom ? ` ${clientObj.prenom}` : ""}` : "Client comptant";

  const canVoid = has("ventes.annuler") && !["annulee", "remboursee"].includes(vente.statut);
  const canReturn = has("ventes.retourner") && !["annulee", "retournee"].includes(vente.statut);
  const canRefund = has("ventes.rembourser") && !["annulee", "remboursee"].includes(vente.statut);
  const canDeliver =
    has("ventes.livrer") && vente.livraison_statut === "non_livre" && vente.statut !== "annulee";
  const canEncaisser =
    has("paiements.create") && Number(vente.montant_restant) > 0 && vente.statut !== "annulee";

  const returnableLines = (vente.lignes ?? []).filter(
    l => (l.quantite - (alreadyReturned[l.id] ?? 0)) > 0
  );

  const handleToggleLine = (ligne: VenteLigneRead) => {
    const maxQty = ligne.quantite - (alreadyReturned[ligne.id] ?? 0);
    setSelectedLines(prev => {
      if (prev[ligne.id] !== undefined) {
        const next = { ...prev }; delete next[ligne.id]; return next;
      }
      return { ...prev, [ligne.id]: maxQty };
    });
  };

  const submitRetour = () => {
    const lignes = Object.entries(selectedLines).map(([vid, qty]) => ({
      vente_ligne_id: Number(vid), quantite: qty,
    }));
    if (!lignes.length) { toast.error("Sélectionnez au moins une ligne."); return; }
    retourMutation.mutate({ lignes, motif: retourMotif, notes: retourNotes || undefined });
  };

  const submitRefund = () => {
    const montant = Number(refundMontant);
    if (!montant || montant <= 0) { toast.error("Montant invalide"); return; }
    refundMutation.mutate({
      montant, mode: refundMode,
      reference: refundRef || undefined,
      motif: refundMotif, notes: refundNotes || undefined,
    });
  };

  const submitEncaisser = () => {
    const montant = Number(encaisserMontant);
    if (!montant || montant <= 0) { toast.error("Montant invalide"); return; }
    if (montant > Number(vente.montant_restant)) { toast.error("Montant supérieur au reste à payer"); return; }
    encaisserMutation.mutate();
  };

  const isVoided = vente.statut === "annulee";
  const isReturned = ["retournee", "partiellement_retournee"].includes(vente.statut);
  const isRefunded = ["remboursee", "partiellement_remboursee"].includes(vente.statut);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground">
        <Link to="/app/sales"><ChevronLeft className="mr-1 h-4 w-4" /> Ventes</Link>
      </Button>
      <PageHeader
        title={`VENTE-${vente.id}`}
        description={vente.created_at ? formatDateTime(vente.created_at, lang) : ""}
        badge={
          <div className="flex flex-wrap gap-1.5">
            <VenteStatutBadge statut={vente.statut} />
            {!isVoided && <VenteLivraisonBadge statut={vente.livraison_statut} />}
          </div>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {has("ventes.imprimer") && (
              <Button variant="outline" size="sm" onClick={() => setPrintOpen(true)}>
                <Printer className="mr-1.5 h-3.5 w-3.5" /> Imprimer
              </Button>
            )}
            {vente.numero_bon_livraison && (
              <Button variant="outline" size="sm" onClick={() => setPrintBLOpen(true)}>
                <Truck className="mr-1.5 h-3.5 w-3.5" /> Bon de livraison
              </Button>
            )}
            {canDeliver && (
              <Button size="sm" onClick={() => livraisonMutation.mutate()} disabled={livraisonMutation.isPending}>
                {livraisonMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Truck className="mr-1.5 h-3.5 w-3.5" />}
                Procéder à la livraison
              </Button>
            )}
            {canEncaisser && (
              <Button size="sm" variant="outline" onClick={() => setEncaisserOpen(true)}>
                <Wallet className="mr-1.5 h-3.5 w-3.5" /> Encaisser le reste
              </Button>
            )}
            {canReturn && (
              <Button variant="outline" size="sm" onClick={() => setRetourOpen(true)}>
                <Undo2 className="mr-1.5 h-3.5 w-3.5" /> Retourner
              </Button>
            )}
            {canRefund && (
              <Button variant="outline" size="sm" onClick={() => setRemboursementOpen(true)}>
                <RefreshCcw className="mr-1.5 h-3.5 w-3.5" /> Rembourser
              </Button>
            )}
            {canVoid && (
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive"
                onClick={() => setVoidOpen(true)}>
                <Ban className="mr-1.5 h-3.5 w-3.5" /> Annuler
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* ── Left ────────────────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Info cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: Store, label: "Boutique", value: store?.name ?? `#${vente.boutique_id}` },
              { icon: User, label: "Client", value: clientLabel },
              { icon: Calendar, label: "Date", value: vente.created_at ? new Date(vente.created_at).toLocaleDateString("fr-FR") : "" },
              { icon: Package, label: "Articles", value: `${vente.lignes?.length ?? 0} ligne(s)` },
            ].map(({ icon: Icon, label, value }) => (
              <Card key={label} className="p-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" /><span className="text-xs">{label}</span>
                </div>
                <p className="mt-1 text-sm font-medium truncate">{value}</p>
              </Card>
            ))}
          </div>

          {/* Products */}
          <Card className="shadow-soft">
            <CardHeader className="pb-2 pt-4 px-5"><CardTitle className="text-sm font-semibold">Produits</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40">
                  <tr>
                    <th className="px-5 py-2.5 text-left font-medium">Produit</th>
                    <th className="px-5 text-center font-medium">Qté</th>
                    <th className="px-5 text-right font-medium">Prix u.</th>
                    <th className="px-5 text-right font-medium">Remise</th>
                    <th className="px-5 text-right font-medium">Total</th>
                    <th className="px-5 text-center font-medium text-warning">Retourné</th>
                  </tr>
                </thead>
                <tbody>
                  {(vente.lignes ?? []).map((l) => {
                    const returned = alreadyReturned[l.id] ?? 0;
                    return (
                      <tr key={l.id} className="border-t">
                        <td className="px-5 py-3 font-medium">{productName(l.produit_id)}</td>
                        <td className="px-5 text-center tabular-nums">{l.quantite}</td>
                        <td className="px-5 text-right tabular-nums">{fmtXAF(Number(l.prix_unitaire))}</td>
                        <td className="px-5 text-right tabular-nums text-success">
                          {Number(l.remise) > 0 ? `-${fmtXAF(Number(l.remise))}` : ""}
                        </td>
                        <td className="px-5 text-right tabular-nums font-medium">{fmtXAF(Number(l.total_ligne))}</td>
                        <td className="px-5 text-center">
                          {returned > 0 ? (
                            <Badge className="bg-warning/10 text-warning border-warning/30">{returned}</Badge>
                          ) : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="flex justify-end p-5 pt-3">
                <div className="w-56 space-y-1 text-sm">
                  {Number(vente.remise) > 0 && (
                    <div className="flex justify-between text-success">
                      <span>Remise</span><span className="tabular-nums">-{fmtXAF(Number(vente.remise))}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-1 font-semibold">
                    <span>Total</span><span className="tabular-nums">{fmtXAF(Number(vente.montant_total))}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payments */}
          <Card className="shadow-soft">
            <CardHeader className="pb-2 pt-4 px-5"><CardTitle className="text-sm font-semibold">Paiements</CardTitle></CardHeader>
            <CardContent className="px-5 pb-5 space-y-2">
              {(vente.paiements ?? []).map((p) => (
                <div key={p.id} className="flex justify-between rounded-md bg-secondary/30 px-3 py-2 text-sm">
                  <span>{PAYMENT_LABEL[p.mode] ?? p.mode}{p.reference ? ` · ${p.reference}` : ""}</span>
                  <span className="tabular-nums font-medium">{fmtXAF(Number(p.montant))}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between text-sm font-medium">
                <span>Payé</span><span className="tabular-nums text-success">{fmtXAF(Number(vente.montant_paye))}</span>
              </div>
              {Number(vente.montant_restant) > 0 && (
                <div className="flex justify-between text-sm font-semibold text-destructive">
                  <span>Reste</span><span className="tabular-nums">{fmtXAF(Number(vente.montant_restant))}</span>
                </div>
              )}
              {vente.creance && (
                <div className="mt-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs space-y-0.5">
                  <p className="font-semibold text-warning">Créance</p>
                  <div className="flex justify-between"><span>Initial</span><span>{fmtXAF(Number(vente.creance.montant_initial))}</span></div>
                  <div className="flex justify-between"><span>Restant</span><span>{fmtXAF(Number(vente.creance.montant_restant))}</span></div>
                  <div className="flex justify-between"><span>Statut</span><span>{vente.creance.statut}</span></div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Retours history */}
          {retours.length > 0 && (
            <Card className="shadow-soft">
              <CardHeader className="pb-2 pt-4 px-5"><CardTitle className="text-sm font-semibold">Historique des retours</CardTitle></CardHeader>
              <CardContent className="px-5 pb-4 space-y-3">
                {retours.map((r) => (
                  <div key={r.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex justify-between font-medium">
                      <span>Retour #{r.id}</span>
                      <span className="tabular-nums text-warning">{fmtXAF(Number(r.total_retourne))}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{r.motif}</p>
                    <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("fr-FR")}</p>
                    {r.lignes.map((l) => (
                      <div key={l.id} className="text-xs mt-1">
                        {productName(l.produit_id)} · {l.quantite} unité(s) · {fmtXAF(Number(l.total_ligne))}
                      </div>
                    ))}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Remboursements history */}
          {remboursements.length > 0 && (
            <Card className="shadow-soft">
              <CardHeader className="pb-2 pt-4 px-5"><CardTitle className="text-sm font-semibold">Historique des remboursements</CardTitle></CardHeader>
              <CardContent className="px-5 pb-4 space-y-3">
                {remboursements.map((r) => (
                  <div key={r.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex justify-between font-medium">
                      <span>{PAYMENT_LABEL[r.mode] ?? r.mode}{r.reference ? ` · ${r.reference}` : ""}</span>
                      <span className="tabular-nums text-purple-700">{fmtXAF(Number(r.montant))}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{r.motif}</p>
                    <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("fr-FR")}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Right: Timeline ─────────────────────────────────────────── */}
        <div className="space-y-4">
          <Card className="shadow-soft">
            <CardHeader className="pb-2 pt-4 px-5"><CardTitle className="text-sm font-semibold">Timeline</CardTitle></CardHeader>
            <CardContent className="px-5 pb-4">
              <TimelineStep icon={Receipt} label="Vente créée" done date={vente.created_at} />
              <TimelineStep icon={CheckCircle} label="Validée" done date={vente.created_at} />
              <TimelineStep icon={CreditCard} label="Paiement enregistré"
                done={(vente.paiements?.length ?? 0) > 0}
                date={vente.paiements?.[0]?.created_at} />
              <TimelineStep icon={Truck}
                label={vente.livraison_statut === "livre" ? "Livrée" : "En attente de livraison"}
                done={vente.livraison_statut === "livre"}
                color={vente.livraison_statut === "livre" ? undefined : "border-warning bg-warning/10 text-warning"}
                date={vente.livree_at ?? undefined} />
              <TimelineStep icon={Printer} label="Ticket imprimé" done={false} />
              {retours.length > 0 && (
                <TimelineStep icon={Undo2} label={`Retour (${retours.length})`}
                  done color="border-warning bg-warning/10 text-warning"
                  date={retours[retours.length - 1]?.created_at} />
              )}
              {remboursements.length > 0 && (
                <TimelineStep icon={RefreshCcw} label={`Remboursement (${remboursements.length})`}
                  done color="border-purple-500 bg-purple-50 text-purple-600"
                  date={remboursements[remboursements.length - 1]?.created_at} />
              )}
              {isVoided && (
                <TimelineStep icon={XCircle} label="Annulée" done
                  color="border-destructive bg-destructive/10 text-destructive"
                  date={vente.updated_at} />
              )}
              <TimelineStep icon={CheckCircle} label="Soldée"
                done={vente.statut === "completee" || vente.statut === "remboursee"} last />
            </CardContent>
          </Card>

          <Card className="shadow-soft">
            <CardHeader className="pb-2 pt-4 px-5"><CardTitle className="text-sm font-semibold">Référence</CardTitle></CardHeader>
            <CardContent className="px-5 pb-4 text-center">
              <p className="font-mono text-lg font-bold">VENTE-{vente.id}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {vente.created_at ? formatDateTime(vente.created_at, lang) : ""}
              </p>
              {has("ventes.imprimer") && (
                <Button size="sm" className="mt-3 w-full" onClick={() => setPrintOpen(true)}>
                  <Printer className="mr-1.5 h-3.5 w-3.5" /> Imprimer le ticket
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Print ─────────────────────────────────────────────────────── */}
      <PrintPreviewDialog
        open={printOpen}
        document={saleToDocument(vente, {
          store,
          clientName: clientLabel === "Client comptant" ? null : clientLabel,
          productName,
        })}
        onClose={() => setPrintOpen(false)}
      />

      {/* ── Bon de livraison ──────────────────────────────────────────── */}
      <PrintPreviewDialog
        open={printBLOpen}
        document={saleToDeliveryNoteDocument(vente, {
          store,
          clientName: clientLabel === "Client comptant" ? null : clientLabel,
          productName,
        })}
        onClose={() => setPrintBLOpen(false)}
      />

      {/* ── Encaisser le reste ────────────────────────────────────────── */}
      <Dialog open={encaisserOpen} onOpenChange={(o) => !encaisserMutation.isPending && setEncaisserOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Wallet className="h-4 w-4" />Encaisser le reste</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-secondary/30 p-3 text-sm">
              <div className="flex justify-between"><span>Total vente</span><span className="font-medium tabular-nums">{fmtXAF(Number(vente.montant_total))}</span></div>
              <div className="flex justify-between"><span>Déjà payé</span><span className="tabular-nums">{fmtXAF(Number(vente.montant_paye))}</span></div>
              <div className="flex justify-between font-semibold text-destructive"><span>Reste à payer</span><span className="tabular-nums">{fmtXAF(Number(vente.montant_restant))}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Montant *</Label>
                <Input type="number" min={0} max={Number(vente.montant_restant)} value={encaisserMontant}
                  onChange={(e) => setEncaisserMontant(e.target.value)} className="h-9 tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Mode</Label>
                <Select value={encaisserMode} onValueChange={(v) => setEncaisserMode(v as PaiementMode)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAYMENT_LABEL).map(([mode, label]) => (
                      <SelectItem key={mode} value={mode}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Référence</Label>
              <Input value={encaisserRef} onChange={(e) => setEncaisserRef(e.target.value)} className="h-9 text-xs" placeholder="N° de transaction..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEncaisserOpen(false)} disabled={encaisserMutation.isPending}>Annuler</Button>
            <Button onClick={submitEncaisser} disabled={encaisserMutation.isPending || !encaisserMontant || Number(encaisserMontant) <= 0}>
              {encaisserMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Confirmer l'encaissement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Annulation ────────────────────────────────────────────────── */}
      <AlertDialog open={voidOpen} onOpenChange={(o) => !o && setVoidOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler VENTE-{id} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le stock sera automatiquement restauré pour chaque produit vendu.
              La créance (si existante) sera annulée. Cette action est définitive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Retour</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90"
              onClick={() => voidMutation.mutate()} disabled={voidMutation.isPending}>
              {voidMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Confirmer l'annulation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Retour ────────────────────────────────────────────────────── */}
      <Dialog open={retourOpen} onOpenChange={(o) => !retourMutation.isPending && setRetourOpen(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Undo2 className="h-4 w-4" />Retour de produits</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            <p className="text-sm text-muted-foreground">Sélectionnez les produits à retourner et ajustez les quantités.</p>
            {returnableLines.length === 0 && (
              <p className="text-sm text-muted-foreground">Tous les produits ont déjà été retournés.</p>
            )}
            {returnableLines.map((l) => {
              const maxQty = l.quantite - (alreadyReturned[l.id] ?? 0);
              const checked = selectedLines[l.id] !== undefined;
              return (
                <div key={l.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <Checkbox checked={checked} onCheckedChange={() => handleToggleLine(l)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{productName(l.produit_id)}</p>
                    <p className="text-xs text-muted-foreground">{fmtXAF(Number(l.prix_unitaire))} · max {maxQty} unité(s)</p>
                  </div>
                  {checked && (
                    <Input type="number" min={1} max={maxQty}
                      value={selectedLines[l.id] ?? maxQty}
                      onChange={(e) => setSelectedLines(prev => ({ ...prev, [l.id]: Math.min(maxQty, Math.max(1, Number(e.target.value))) }))}
                      className="h-8 w-20 tabular-nums" />
                  )}
                </div>
              );
            })}
            <div className="space-y-1.5">
              <Label className="text-xs">Motif *</Label>
              <Select value={retourMotif} onValueChange={setRetourMotif}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{MOTIFS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes (optionnel)</Label>
              <Textarea value={retourNotes} onChange={(e) => setRetourNotes(e.target.value)} className="text-sm" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetourOpen(false)} disabled={retourMutation.isPending}>Annuler</Button>
            <Button onClick={submitRetour} disabled={retourMutation.isPending || Object.keys(selectedLines).length === 0}>
              {retourMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Confirmer le retour
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Remboursement ─────────────────────────────────────────────── */}
      <Dialog open={remboursementOpen} onOpenChange={(o) => !refundMutation.isPending && setRemboursementOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><RefreshCcw className="h-4 w-4" />Remboursement</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-secondary/30 p-3 text-sm">
              <div className="flex justify-between"><span>Total vente</span><span className="font-medium tabular-nums">{fmtXAF(Number(vente.montant_total))}</span></div>
              <div className="flex justify-between"><span>Déjà remboursé</span><span className="tabular-nums">{fmtXAF(remboursements.reduce((a, r) => a + Number(r.montant), 0))}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Montant *</Label>
                <Input type="number" min={0} value={refundMontant}
                  onChange={(e) => setRefundMontant(e.target.value)} className="h-9 tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Mode</Label>
                <Select value={refundMode} onValueChange={(v) => setRefundMode(v as PaiementMode)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAYMENT_LABEL).map(([mode, label]) => (
                      <SelectItem key={mode} value={mode}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Référence</Label>
              <Input value={refundRef} onChange={(e) => setRefundRef(e.target.value)} className="h-9 text-xs" placeholder="N° de transaction..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Motif *</Label>
              <Select value={refundMotif} onValueChange={setRefundMotif}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{MOTIFS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea value={refundNotes} onChange={(e) => setRefundNotes(e.target.value)} className="text-sm" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemboursementOpen(false)} disabled={refundMutation.isPending}>Annuler</Button>
            <Button onClick={submitRefund} disabled={refundMutation.isPending || !refundMontant || Number(refundMontant) <= 0}>
              {refundMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Confirmer le remboursement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
