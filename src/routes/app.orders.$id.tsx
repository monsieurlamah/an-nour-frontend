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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ChevronLeft, Check, X, Clock, Truck, FileText, AlertTriangle, Loader2, Package,
  Printer, Link2, Ban, ClipboardCheck, Send,
} from "lucide-react";
import { fmtXAF } from "@/lib/mock-data";
import { useT, formatDateTime } from "@/lib/i18n";
import { useWorkContext, canViewHQ } from "@/lib/work-context";
import { commandesApi, catalogApi, storesApi, usersApi, qk } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { PrintPreviewDialog, type DocumentPrintData } from "@/lib/print-engine";
import {
  commandeToDemandeDocument, commandeToProformaDocument, commandeToFactureDocument,
  commandeToBonLivraisonDocument,
} from "@/lib/commande-print-adapter";
import { toast } from "sonner";
import type { CommandeLigneRead, CommandeEvenementType, CommandeAnomalieType } from "@/lib/types";

export const Route = createFileRoute("/app/orders/$id")({ component: Page });

const EVENT_LABEL: Record<CommandeEvenementType, string> = {
  creation: "Demande créée (brouillon)",
  soumission: "Demande soumise au Siège",
  validation: "Validée par le Siège",
  refus: "Refusée par le Siège",
  proforma: "Facture proforma générée",
  proforma_acceptee: "Proforma validée par le gérant — facture générée",
  proforma_rejetee: "Proforma rejetée par le gérant",
  proforma_resoumise: "Proforma modifiée et resoumise par le Siège",
  facture: "Facture générée",
  preparation: "Préparation",
  expedition: "Expédiée",
  livraison: "Marquée livrée",
  reception: "Réception confirmée par la boutique",
  anomalie: "Anomalie signalée",
  quantites_modifiees: "Quantités modifiées",
  produit_resolu: "Produit rattaché au catalogue",
  commentaire: "Commentaire",
  annulation: "Demande annulée",
};

const ANOMALIE_LABEL: Record<CommandeAnomalieType, string> = {
  quantite_manquante: "Quantité manquante",
  produit_casse: "Produit endommagé",
  erreur_preparation: "Erreur de préparation",
  autre: "Autre",
};

const CANCELLABLE = new Set([
  "brouillon", "en_attente", "validee", "proforma_generee", "proforma_rejetee",
  "facture_generee", "en_preparation", "pret_a_expedier",
]);

function Page() {
  const { t, lang } = useT();
  const { id } = useParams({ from: "/app/orders/$id" });
  const commandeId = Number(id);
  const qc = useQueryClient();
  const { has, user, workspace, isSuperAdmin } = useWorkContext();
  // The proforma decision is the *boutique's own* checks-and-balances on
  // what HQ proposed — the backend deliberately refuses it to any
  // HQ-capable account (super-admin, stores.manage…), even one that has
  // switched its browsing workspace to this store (see
  // commandes/router.py::approve_proforma / _is_boutique_member). Mirror
  // that here so the buttons are never shown to an account that's
  // guaranteed to get a 404 from the API.
  const isHQCapable = canViewHQ(isSuperAdmin, has);

  const { data: commande, isLoading, error, refetch } = useQuery({
    queryKey: qk.commandes.detail(commandeId),
    queryFn: () => commandesApi.get(commandeId),
  });

  const { data: events = [] } = useQuery({
    queryKey: qk.commandes.events(commandeId),
    queryFn: () => commandesApi.listEvents(commandeId),
  });

  const { data: stores = [] } = useQuery({
    queryKey: qk.stores.list(),
    queryFn: () => storesApi.list({ limit: 200 }),
  });

  const { data: products = [] } = useQuery({
    queryKey: qk.catalog.products(),
    queryFn: () => catalogApi.listProducts({ limit: 500 }),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: qk.users.list(),
    queryFn: () => usersApi.list({ limit: 500 }),
  });

  const store = stores.find((s) => s.id === commande?.boutique_id) ?? null;
  const productById = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const userName = useMemo(
    () => Object.fromEntries(allUsers.map((u) => [u.id, `${u.firstname} ${u.lastname}`])),
    [allUsers],
  );
  const productName = (pid: number) => productById[pid]?.name ?? `Produit #${pid}`;

  const [busy, setBusy] = useState(false);
  const [qtyOverride, setQtyOverride] = useState<Record<number, number>>({});
  const [resolveTarget, setResolveTarget] = useState<CommandeLigneRead | null>(null);
  const [resolveSearch, setResolveSearch] = useState("");
  const [refuseOpen, setRefuseOpen] = useState(false);
  const [refuseMotif, setRefuseMotif] = useState("");
  const [rejectProformaOpen, setRejectProformaOpen] = useState(false);
  const [rejectProformaMotif, setRejectProformaMotif] = useState("");
  const [resubmitOpen, setResubmitOpen] = useState(false);
  const [resubmitQty, setResubmitQty] = useState<Record<number, number>>({});
  const [resubmitPrix, setResubmitPrix] = useState<Record<number, number>>({});
  const [resubmitComment, setResubmitComment] = useState("");
  const [shipOpen, setShipOpen] = useState(false);
  const [shipTransporteur, setShipTransporteur] = useState("");
  const [shipLivreur, setShipLivreur] = useState("");
  const [receptionOpen, setReceptionOpen] = useState(false);
  const [receptionQty, setReceptionQty] = useState<Record<number, number>>({});
  const [anomalyLigne, setAnomalyLigne] = useState<number | "none">("none");
  const [anomalyType, setAnomalyType] = useState<CommandeAnomalieType>("quantite_manquante");
  const [anomalyDesc, setAnomalyDesc] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelMotif, setCancelMotif] = useState("");
  const [printDoc, setPrintDoc] = useState<DocumentPrintData | null>(null);

  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: qk.commandes.detail(commandeId) }),
      qc.invalidateQueries({ queryKey: qk.commandes.events(commandeId) }),
      qc.invalidateQueries({ queryKey: ["commandes"] }),
    ]);

  const runAction = async (label: string, fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await invalidate();
      toast.success(label);
    } catch (err) {
      const message = err instanceof ApiError ? err.detail : err instanceof Error ? err.message : "Erreur";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Chargement…</div>;
  }
  if (error || !commande) {
    return <ApiErrorState error={error} onRetry={refetch} />;
  }

  const ref = commande.numero ?? `BRO-${String(commande.id).padStart(5, "0")}`;
  const unresolvedLines = commande.lignes.filter((l) => l.produit_id == null);
  // The proforma decision belongs to the requesting boutique's gérant — a
  // permission check alone isn't enough (super-admin bypasses every `has()`
  // check), so this also requires the active workspace to be scoped to this
  // exact boutique, not the HQ/global view.
  const isActingAsThisStore = workspace.kind === "store" && Number(workspace.id) === commande.boutique_id;
  const hasReceivableLines = commande.lignes.some((l) => l.quantite_validee - l.quantite_recue > 0);

  const handleValidate = () =>
    runAction("Demande validée", () =>
      commandesApi.validate(commande.id, { quantites_validees: qtyOverride }),
    );

  const handleRefuse = () =>
    runAction("Demande refusée", async () => {
      await commandesApi.refuse(commande.id, { motif: refuseMotif });
      setRefuseOpen(false);
      setRefuseMotif("");
    });

  const handleResolve = (produitId: number) =>
    runAction("Produit rattaché", async () => {
      if (!resolveTarget) return;
      await commandesApi.resolveLigne(commande.id, resolveTarget.id, { produit_id: produitId });
      setResolveTarget(null);
      setResolveSearch("");
    });

  const handleGenerateProforma = () =>
    runAction("Facture proforma générée", async () => {
      const updated = await commandesApi.generateProforma(commande.id);
      setPrintDoc(commandeToProformaDocument(updated, {
        destinationStore: store,
        issuerName: user ? `${user.firstname} ${user.lastname}` : undefined,
        productName,
      }));
    });

  const handleApproveProforma = () =>
    runAction("Proforma validée — facture générée", async () => {
      const updated = await commandesApi.approveProforma(commande.id);
      setPrintDoc(commandeToFactureDocument(updated, {
        destinationStore: store,
        issuerName: commande.validated_by ? userName[commande.validated_by] : undefined,
        productName,
      }));
    });

  const handleRejectProforma = () =>
    runAction("Proforma rejetée", async () => {
      await commandesApi.rejectProforma(commande.id, { motif: rejectProformaMotif });
      setRejectProformaOpen(false);
      setRejectProformaMotif("");
    });

  const handleResubmitProforma = () =>
    runAction("Proforma resoumise", async () => {
      await commandesApi.resubmitProforma(commande.id, {
        quantites: resubmitQty,
        prix: resubmitPrix,
        commentaire: resubmitComment || undefined,
      });
      setResubmitOpen(false);
      setResubmitQty({});
      setResubmitPrix({});
      setResubmitComment("");
    });

  const handleStartPreparation = () => runAction("Préparation démarrée", () => commandesApi.startPreparation(commande.id));
  const handleConfirmPreparation = () => runAction("Préparation confirmée", () => commandesApi.confirmPreparation(commande.id));

  const handleShip = () =>
    runAction("Commande expédiée", async () => {
      const updated = await commandesApi.ship(commande.id, {
        transporteur: shipTransporteur,
        livreur_nom: shipLivreur || undefined,
      });
      setShipOpen(false);
      setShipTransporteur("");
      setShipLivreur("");
      setPrintDoc(commandeToBonLivraisonDocument(updated, { destinationStore: store, productName }));
    });

  const handleMarkDelivered = () => runAction("Marquée livrée", () => commandesApi.markDelivered(commande.id));

  const handleConfirmReception = () =>
    runAction("Réception enregistrée", async () => {
      // Inputs are pre-filled with the full remaining quantity (see dialog
      // below) — default to that same value here too, so clicking Confirmer
      // without touching any field genuinely receives everything shown,
      // instead of silently submitting an empty `lignes` (which used to log
      // a no-op "réception confirmée" event and leave quantities untouched,
      // letting the button reappear and get clicked again indefinitely).
      const lignes = Object.fromEntries(
        commande.lignes
          .map((l) => {
            const restant = l.quantite_validee - l.quantite_recue;
            return [l.id, receptionQty[l.id] ?? restant] as const;
          })
          .filter(([, q]) => q > 0),
      ) as Record<number, number>;
      const anomalies =
        anomalyLigne !== "none"
          ? [{ ligne_id: anomalyLigne, type_anomalie: anomalyType, description: anomalyDesc || undefined }]
          : [];
      const allReceived = commande.lignes.every((l) => {
        const restant = l.quantite_validee - l.quantite_recue;
        return (receptionQty[l.id] ?? restant) >= restant;
      });
      await commandesApi.confirmReception(commande.id, {
        statut_reception: anomalies.length > 0 ? "partiel" : allReceived ? "accepte" : "partiel",
        lignes,
        anomalies,
      });
      setReceptionOpen(false);
      setReceptionQty({});
      setAnomalyLigne("none");
      setAnomalyDesc("");
    });

  const handleCancel = () =>
    runAction("Demande annulée", async () => {
      await commandesApi.cancel(commande.id, cancelMotif || undefined);
      setCancelOpen(false);
      setCancelMotif("");
    });

  const downloadDemande = () =>
    setPrintDoc(
      commandeToDemandeDocument(commande, {
        store,
        issuerName: commande.created_by ? userName[commande.created_by] : undefined,
        productName,
      }),
    );

  const downloadProforma = () =>
    setPrintDoc(
      commandeToProformaDocument(commande, {
        destinationStore: store,
        issuerName: commande.validated_by ? userName[commande.validated_by] : undefined,
        productName,
      }),
    );

  const downloadFacture = () =>
    setPrintDoc(
      commandeToFactureDocument(commande, {
        destinationStore: store,
        issuerName: commande.validated_by ? userName[commande.validated_by] : undefined,
        productName,
      }),
    );

  const downloadBonLivraison = () =>
    setPrintDoc(commandeToBonLivraisonDocument(commande, { destinationStore: store, productName }));

  const canCancel =
    CANCELLABLE.has(commande.statut) &&
    ((has("commandes.create") && isActingAsThisStore) || has("commandes.validate"));

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground">
        <Link to="/app/orders"><ChevronLeft className="mr-1 h-4 w-4" /> {t("orders.title") as string}</Link>
      </Button>
      <PageHeader
        title={`Demande ${ref}`}
        description={`${store?.name ?? `Boutique #${commande.boutique_id}`} · ${commande.lignes.length} ${t("orders.col.items") as string}`}
        badge={<StatusBadge status={commande.statut} />}
        actions={
          <>
            {commande.numero && (
              <Button size="sm" variant="outline" onClick={downloadDemande}>
                <Printer className="mr-1.5 h-3.5 w-3.5" /> Demande
              </Button>
            )}
            {commande.numero_proforma && (
              <Button size="sm" variant="outline" onClick={downloadProforma}>
                <Printer className="mr-1.5 h-3.5 w-3.5" /> Proforma
              </Button>
            )}
            {commande.numero_facture && (
              <Button size="sm" variant="outline" onClick={downloadFacture}>
                <Printer className="mr-1.5 h-3.5 w-3.5" /> Facture
              </Button>
            )}
            {commande.livraison?.numero_bon_livraison && (
              <Button size="sm" variant="outline" onClick={downloadBonLivraison}>
                <Printer className="mr-1.5 h-3.5 w-3.5" /> Bon de livraison
              </Button>
            )}
            {canCancel && (
              <Button size="sm" variant="outline" className="text-destructive" onClick={() => setCancelOpen(true)}>
                <Ban className="mr-1.5 h-3.5 w-3.5" /> Annuler
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="shadow-soft lg:col-span-2">
          <CardHeader><CardTitle className="text-base">{t("sales.items") as string}</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("products.col.name") as string}</TableHead>
                <TableHead className="text-right">Demandée</TableHead>
                {commande.statut !== "en_attente" && <TableHead className="text-right">Validée</TableHead>}
                <TableHead className="text-right">{t("common.price") as string}</TableHead>
                <TableHead className="text-right">{t("common.total") as string}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {commande.lignes.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">
                      {l.produit_id != null ? (
                        productName(l.produit_id)
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="italic text-muted-foreground">{l.nom_libre} (non catalogué)</span>
                          {commande.statut === "en_attente" && has("commandes.validate") && (
                            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => setResolveTarget(l)}>
                              <Link2 className="mr-1 h-3 w-3" /> Rattacher
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {commande.statut === "en_attente" && has("commandes.validate") ? (
                        <Input
                          type="number"
                          min={0}
                          className="ml-auto h-7 w-20 text-right"
                          defaultValue={l.quantite_demandee}
                          onChange={(e) =>
                            setQtyOverride((prev) => ({ ...prev, [l.id]: Number(e.target.value) }))
                          }
                        />
                      ) : (
                        l.quantite_demandee
                      )}
                    </TableCell>
                    {commande.statut !== "en_attente" && (
                      <TableCell className="text-right tabular-nums">{l.quantite_validee}</TableCell>
                    )}
                    <TableCell className="text-right tabular-nums">{fmtXAF(Number(l.prix_unitaire))}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{fmtXAF(Number(l.total_ligne))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="space-y-1 border-t p-4 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>{t("common.subtotal") as string} (HT)</span>
                <span className="tabular-nums">{fmtXAF(Number(commande.montant_ht) || Number(commande.montant_total))}</span>
              </div>
              {Number(commande.montant_tva) > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t("common.tax") as string} {Number(commande.tva_taux)}%</span>
                  <span className="tabular-nums">{fmtXAF(Number(commande.montant_tva))}</span>
                </div>
              )}
              <div className="mt-2 flex justify-between border-t pt-2 text-base font-semibold">
                <span>{t("common.total") as string}</span>
                <span className="tabular-nums">
                  {fmtXAF(Number(commande.montant_ttc) || Number(commande.montant_total))}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* ── Actions contextuelles au statut courant ────────────────────── */}
          <Card className="shadow-soft">
            <CardHeader><CardTitle className="text-base">Actions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {commande.statut === "en_attente" && has("commandes.validate") && (
                <>
                  {unresolvedLines.length > 0 && (
                    <p className="rounded-md bg-warning/10 p-2 text-xs text-warning-foreground">
                      {unresolvedLines.length} ligne(s) non catalogué(es) à rattacher avant validation.
                    </p>
                  )}
                  <Button className="w-full" disabled={busy} onClick={handleValidate}>
                    {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                    {t("orders.approve") as string}
                  </Button>
                  <Button variant="outline" className="w-full text-destructive" disabled={busy} onClick={() => setRefuseOpen(true)}>
                    <X className="mr-1.5 h-4 w-4" /> {t("orders.reject") as string}
                  </Button>
                </>
              )}

              {commande.statut === "validee" && has("commandes.validate") && (
                <Button className="w-full" disabled={busy} onClick={handleGenerateProforma}>
                  {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileText className="mr-1.5 h-4 w-4" />}
                  Générer la facture proforma
                </Button>
              )}

              {commande.statut === "proforma_generee" && has("commandes.approve_proforma") && isActingAsThisStore && !isHQCapable && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Le Siège a soumis une facture proforma — validez-la pour générer la facture,
                    ou rejetez-la si elle ne convient pas.
                  </p>
                  <Button className="w-full" disabled={busy} onClick={handleApproveProforma}>
                    {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                    Valider le proforma
                  </Button>
                  <Button variant="outline" className="w-full text-destructive" disabled={busy} onClick={() => setRejectProformaOpen(true)}>
                    <X className="mr-1.5 h-4 w-4" /> Rejeter le proforma
                  </Button>
                </>
              )}

              {commande.statut === "proforma_generee" && !(has("commandes.approve_proforma") && isActingAsThisStore && !isHQCapable) && (
                <p className="rounded-md bg-info/10 p-2 text-xs text-info">
                  {isHQCapable
                    ? "En attente de la décision du gérant de la boutique sur la facture proforma — le Siège ne peut pas valider sa propre proforma."
                    : "En attente de la décision du gérant de la boutique sur la facture proforma."}
                </p>
              )}

              {commande.statut === "proforma_rejetee" && (
                <div className="space-y-2">
                  <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                    Proforma rejetée par le gérant{commande.proforma_refus_motif ? ` : « ${commande.proforma_refus_motif} »` : "."}
                  </p>
                  {has("commandes.validate") && (
                    <Button className="w-full" disabled={busy} onClick={() => setResubmitOpen(true)}>
                      <Send className="mr-1.5 h-4 w-4" /> Modifier et resoumettre le proforma
                    </Button>
                  )}
                </div>
              )}

              {commande.statut === "facture_generee" && has("commandes.prepare") && (
                <Button className="w-full" disabled={busy} onClick={handleStartPreparation}>
                  {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Package className="mr-1.5 h-4 w-4" />}
                  Lancer la préparation
                </Button>
              )}

              {commande.statut === "en_preparation" && has("commandes.prepare") && (
                <Button className="w-full" disabled={busy} onClick={handleConfirmPreparation}>
                  {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ClipboardCheck className="mr-1.5 h-4 w-4" />}
                  Confirmer la préparation
                </Button>
              )}

              {commande.statut === "pret_a_expedier" && has("commandes.ship") && (
                <Button className="w-full" disabled={busy} onClick={() => setShipOpen(true)}>
                  <Send className="mr-1.5 h-4 w-4" /> Expédier
                </Button>
              )}

              {commande.statut === "expedie" && has("commandes.deliver") && (
                <Button className="w-full" disabled={busy} onClick={handleMarkDelivered}>
                  {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Truck className="mr-1.5 h-4 w-4" />}
                  {t("orders.markDelivered") as string}
                </Button>
              )}

              {(commande.statut === "livree" || commande.statut === "partiellement_recu") && has("commandes.receive") && isActingAsThisStore && hasReceivableLines && (
                <Button className="w-full" disabled={busy} onClick={() => setReceptionOpen(true)}>
                  <ClipboardCheck className="mr-1.5 h-4 w-4" /> Confirmer la réception
                </Button>
              )}

              {["rejetee", "reception_confirmee", "annulee"].includes(commande.statut) && (
                <p className="text-xs text-muted-foreground">Aucune action disponible — demande clôturée.</p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-soft">
            <CardHeader><CardTitle className="text-base">{t("orders.timeline") as string}</CardTitle></CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucun évènement.</p>
              ) : (
                <ol className="space-y-3">
                  {events.map((e) => (
                    <li key={e.id} className="flex gap-3">
                      <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full gradient-brand text-white shadow-glow">
                        <Clock className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{EVENT_LABEL[e.type_evenement] ?? e.type_evenement}</div>
                        <div className="text-xs text-muted-foreground">
                          {e.acteur_id ? (userName[e.acteur_id] ?? `Utilisateur #${e.acteur_id}`) : "Système"}
                          {" · "}{formatDateTime(e.created_at, lang)}
                        </div>
                        {e.commentaire && <div className="mt-0.5 text-xs italic text-muted-foreground">« {e.commentaire} »</div>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Rattacher un produit non catalogué ─────────────────────────────── */}
      <Dialog open={!!resolveTarget} onOpenChange={(o) => !o && setResolveTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rattacher « {resolveTarget?.nom_libre} » à un produit du catalogue</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Rechercher un produit…"
            value={resolveSearch}
            onChange={(e) => setResolveSearch(e.target.value)}
          />
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {products
              .filter((p) => p.name.toLowerCase().includes(resolveSearch.trim().toLowerCase()))
              .slice(0, 50)
              .map((p) => (
                <button
                  key={p.id}
                  disabled={busy}
                  onClick={() => handleResolve(p.id)}
                  className="flex w-full items-center justify-between rounded-md p-2 text-left text-sm hover:bg-accent/40"
                >
                  <span className="truncate">{p.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{p.sku ?? "—"}</span>
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Refus ───────────────────────────────────────────────────────────── */}
      <Dialog open={refuseOpen} onOpenChange={setRefuseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Refuser la demande</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Motif du refus</Label>
            <Textarea rows={3} value={refuseMotif} onChange={(e) => setRefuseMotif(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefuseOpen(false)}>{t("common.cancel") as string}</Button>
            <Button variant="destructive" disabled={busy || !refuseMotif.trim()} onClick={handleRefuse}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Confirmer le refus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Rejet du proforma (gérant) ──────────────────────────────────────── */}
      <Dialog open={rejectProformaOpen} onOpenChange={setRejectProformaOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Rejeter la facture proforma</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Motif du rejet</Label>
            <Textarea rows={3} value={rejectProformaMotif} onChange={(e) => setRejectProformaMotif(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectProformaOpen(false)}>{t("common.cancel") as string}</Button>
            <Button variant="destructive" disabled={busy || !rejectProformaMotif.trim()} onClick={handleRejectProforma}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Confirmer le rejet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modifier + resoumettre le proforma (Siège) ───────────────────────── */}
      <Dialog open={resubmitOpen} onOpenChange={setResubmitOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Modifier et resoumettre le proforma</DialogTitle></DialogHeader>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {commande.lignes.map((l) => (
              <div key={l.id} className="flex items-center gap-2 rounded-md border p-2">
                <div className="min-w-0 flex-1 truncate text-sm font-medium">
                  {l.produit_id != null ? productName(l.produit_id) : l.nom_libre}
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px] text-muted-foreground">Qté</Label>
                  <Input
                    type="number"
                    min={0}
                    className="h-8 w-20 text-right"
                    defaultValue={l.quantite_validee}
                    onChange={(e) => setResubmitQty((prev) => ({ ...prev, [l.id]: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px] text-muted-foreground">{t("common.price") as string}</Label>
                  <Input
                    type="number"
                    min={0}
                    className="h-8 w-28 text-right"
                    defaultValue={Number(l.prix_unitaire)}
                    onChange={(e) => setResubmitPrix((prev) => ({ ...prev, [l.id]: Number(e.target.value) }))}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Commentaire (optionnel)</Label>
            <Textarea rows={2} value={resubmitComment} onChange={(e) => setResubmitComment(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResubmitOpen(false)}>{t("common.cancel") as string}</Button>
            <Button disabled={busy} onClick={handleResubmitProforma}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Resoumettre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Expédition ──────────────────────────────────────────────────────── */}
      <Dialog open={shipOpen} onOpenChange={setShipOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Expédier la commande</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Transporteur *</Label>
              <Input value={shipTransporteur} onChange={(e) => setShipTransporteur(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Livreur (nom)</Label>
              <Input value={shipLivreur} onChange={(e) => setShipLivreur(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShipOpen(false)}>{t("common.cancel") as string}</Button>
            <Button disabled={busy || !shipTransporteur.trim()} onClick={handleShip}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Expédier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Réception boutique ──────────────────────────────────────────────── */}
      <Dialog open={receptionOpen} onOpenChange={setReceptionOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Confirmer la réception</DialogTitle></DialogHeader>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {commande.lignes.map((l) => {
              const restant = l.quantite_validee - l.quantite_recue;
              if (restant <= 0) return null;
              return (
                <div key={l.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                  <div className="min-w-0 text-sm">
                    <div className="truncate font-medium">
                      {l.produit_id != null ? productName(l.produit_id) : l.nom_libre}
                    </div>
                    <div className="text-xs text-muted-foreground">Restant à recevoir : {restant}</div>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={restant}
                    className="h-8 w-20 text-right"
                    value={receptionQty[l.id] ?? restant}
                    onChange={(e) => setReceptionQty((prev) => ({ ...prev, [l.id]: Number(e.target.value) }))}
                  />
                </div>
              );
            })}
          </div>
          <div className="space-y-2 rounded-md border border-dashed p-3">
            <Label className="flex items-center gap-1.5 text-xs font-medium">
              <AlertTriangle className="h-3.5 w-3.5" /> Signaler une anomalie (optionnel)
            </Label>
            <select
              className="h-8 w-full rounded-md border bg-background px-2 text-sm"
              value={anomalyLigne}
              onChange={(e) => setAnomalyLigne(e.target.value === "none" ? "none" : Number(e.target.value))}
            >
              <option value="none">Aucune anomalie</option>
              {commande.lignes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.produit_id != null ? productName(l.produit_id) : l.nom_libre}
                </option>
              ))}
            </select>
            {anomalyLigne !== "none" && (
              <>
                <select
                  className="h-8 w-full rounded-md border bg-background px-2 text-sm"
                  value={anomalyType}
                  onChange={(e) => setAnomalyType(e.target.value as CommandeAnomalieType)}
                >
                  {Object.entries(ANOMALIE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <Textarea
                  rows={2}
                  placeholder="Description de l'anomalie"
                  value={anomalyDesc}
                  onChange={(e) => setAnomalyDesc(e.target.value)}
                />
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceptionOpen(false)}>{t("common.cancel") as string}</Button>
            <Button disabled={busy || !hasReceivableLines} onClick={handleConfirmReception}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Annulation ──────────────────────────────────────────────────────── */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Annuler la demande</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Motif (optionnel)</Label>
            <Textarea rows={3} value={cancelMotif} onChange={(e) => setCancelMotif(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>{t("common.cancel") as string}</Button>
            <Button variant="destructive" disabled={busy} onClick={handleCancel}>
              {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Confirmer l'annulation
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
