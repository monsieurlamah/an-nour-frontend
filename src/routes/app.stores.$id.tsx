import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { KpiCard, StatusBadge, TableSkeleton, ApiErrorState } from "@/components/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Package,
  ChevronLeft,
  MapPin,
  User,
  AlertTriangle,
  ArrowLeftRight,
  Loader2,
  Store,
  SlidersHorizontal,
  Wallet,
  Lock,
  Unlock,
} from "lucide-react";
import { storesApi, stockApi, catalogApi, usersApi, cashApi, qk } from "@/lib/api";
import { fmtXAF } from "@/lib/mock-data";
import { useT, formatDateTime } from "@/lib/i18n";
import { productParam } from "@/lib/entity-paths";
import { useWorkContext } from "@/lib/work-context";
import { toast } from "sonner";
import type { StoreRead, StoreUpdate, ProductStockRead, CashSessionRead } from "@/lib/types";

export const Route = createFileRoute("/app/stores/$id")({ component: Page });

const MOVE_LABEL: Record<string, string> = {
  IN: "Entrée",
  OUT: "Sortie",
  TRANSFER: "Transfert",
  ADJUSTMENT: "Ajustement",
};

const REASON_LABEL: Record<string, string> = {
  STOCK_INITIAL: "Stock initial",
  PURCHASE: "Achat",
  SALE: "Vente",
  RETURN: "Retour",
  DAMAGE: "Dommage",
  LOSS: "Perte",
  THEFT: "Vol",
  INVENTORY: "Inventaire",
  REAPPRO: "Réapprovisionnement",
  OTHER: "Autre",
};

function Page() {
  const { t } = useT();
  const { id } = Route.useParams();
  const storeId = Number(id);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { has } = useWorkContext();

  const {
    data: store,
    isLoading: loadingStore,
    error: storeError,
    refetch: refetchStore,
  } = useQuery({
    queryKey: qk.stores.detail(storeId),
    queryFn: () => storesApi.get(storeId),
  });

  // Fetch only this store's STORE location
  const { data: locations = [] } = useQuery({
    queryKey: qk.stock.locations({ store_id: storeId }),
    queryFn: () => stockApi.listLocations({ store_id: storeId, limit: 10 }),
    enabled: !!storeId,
  });

  const storeLocation = locations[0];

  // Product stocks for this store's location
  const { data: productStocks = [], isLoading: loadingStocks } = useQuery({
    queryKey: qk.stock.productStocks({ location_id: storeLocation?.id }),
    queryFn: () => stockApi.listProductStocks({ location_id: storeLocation!.id, limit: 500 }),
    enabled: !!storeLocation,
  });

  // Stock movements for this store's location (from or to)
  const { data: movements = [] } = useQuery({
    queryKey: qk.stock.movements({ to_location_id: storeLocation?.id }),
    queryFn: () => stockApi.listMovements({ limit: 100 }),
    select: (data) =>
      data.filter(
        (m) => m.from_location_id === storeLocation?.id || m.to_location_id === storeLocation?.id,
      ),
    enabled: !!storeLocation,
  });

  const { data: products = [] } = useQuery({
    queryKey: qk.catalog.products(),
    queryFn: () => catalogApi.listProducts({ limit: 500 }),
  });

  const { data: users = [] } = useQuery({
    queryKey: qk.users.list(),
    queryFn: () => usersApi.list({ limit: 200 }),
  });

  const { data: allLocations = [] } = useQuery({
    queryKey: qk.stock.locations(),
    queryFn: () => stockApi.listLocations({ limit: 200 }),
  });

  const {
    data: cashSessions = [],
    isLoading: loadingCash,
    refetch: refetchCash,
  } = useQuery({
    queryKey: qk.cash.sessions({ store_id: storeId }),
    queryFn: () => cashApi.listSessions({ store_id: storeId, limit: 20 }),
    enabled: !!storeId,
  });

  const openSession = cashSessions.find((s) => s.status === "ouverte");
  const closedSessions = cashSessions.filter((s) => s.status !== "ouverte");

  const { data: cashMovements = [] } = useQuery({
    queryKey: qk.cash.movements({ cash_session_id: openSession?.id }),
    queryFn: () => cashApi.listMovements({ cash_session_id: openSession!.id, limit: 200 }),
    enabled: !!openSession,
  });
  const cashBalance =
    (openSession ? Number(openSession.opening_amount) : 0) +
    cashMovements.reduce((acc, m) => acc + (m.type === "entree" ? Number(m.amount) : -Number(m.amount)), 0);

  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
  const userMap = Object.fromEntries(
    users.map((u) => [u.id, `${u.firstname} ${u.lastname}`]),
  );
  const locationMap = Object.fromEntries(allLocations.map((l) => [l.id, l.name]));

  const gerantName = store?.gerant_id ? (userMap[store.gerant_id] ?? "Aucun") : "Aucun";

  // KPIs
  const totalItems = productStocks.reduce((acc, s) => acc + s.quantity, 0);
  const stockValue = productStocks.reduce((acc, s) => {
    const p = productMap[s.product_id];
    return acc + s.quantity * Number(p?.prix_achat ?? 0);
  }, 0);
  const lowStockCount = productStocks.filter(
    (s) => s.alert_threshold > 0 && s.quantity <= s.alert_threshold,
  ).length;

  if (loadingStore) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…
      </div>
    );
  }
  if (storeError || !store) {
    return <ApiErrorState error={storeError} onRetry={refetchStore} />;
  }

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground">
        <Link to="/app/stores">
          <ChevronLeft className="mr-1 h-4 w-4" /> {t("stores.title") as string}
        </Link>
      </Button>

      <PageHeader
        title={store.name}
        description={
          [store.code && `#${store.code}`, store.city, store.address]
            .filter(Boolean)
            .join(" · ") || "Boutique"
        }
        badge={<StatusBadge status={store.status} />}
        actions={
          <>
            <EditStoreDialog store={store} userMap={userMap} onUpdated={() => {
              qc.invalidateQueries({ queryKey: qk.stores.detail(storeId) });
            }} />
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 mb-6">
        <KpiCard
          label="Références en stock"
          value={productStocks.length}
          icon={<Package className="h-5 w-5" />}
          tone="primary"
          hint={`${totalItems} unités au total`}
        />
        <KpiCard
          label="Valeur du stock"
          value={fmtXAF(stockValue)}
          icon={<Store className="h-5 w-5" />}
          tone="default"
        />
        <KpiCard
          label="Alertes stock bas"
          value={lowStockCount}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={lowStockCount > 0 ? "warning" : "success"}
        />
        <KpiCard
          label="Gérant"
          value={gerantName}
          icon={<User className="h-5 w-5" />}
          tone="default"
        />
      </div>

      <Tabs defaultValue="stock">
        <TabsList className="flex-wrap mb-4">
          <TabsTrigger value="stock">Stock boutique</TabsTrigger>
          <TabsTrigger value="movements">Mouvements</TabsTrigger>
          <TabsTrigger value="caisse" className="gap-1.5">
            Caisse
            {!loadingCash && (
              <span
                className={`h-1.5 w-1.5 rounded-full ${openSession ? "bg-success" : "bg-destructive"}`}
              />
            )}
          </TabsTrigger>
          <TabsTrigger value="infos">Informations</TabsTrigger>
        </TabsList>

        {/* ── Stock tab ── */}
        <TabsContent value="stock">
          {!storeLocation ? (
            <Card className="shadow-soft">
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <Package className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  Aucun emplacement de stock trouvé pour cette boutique.
                </p>
                <p className="text-xs text-muted-foreground">
                  Vérifiez que la boutique a bien été créée via l'API (emplacement créé
                  automatiquement).
                </p>
              </div>
            </Card>
          ) : (
            <Card className="shadow-soft">
              <div className="border-b px-4 py-2.5 flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  Emplacement :{" "}
                  <span className="font-medium text-foreground">{storeLocation.name}</span>
                  <Badge variant="secondary" className="ml-2 text-[10px]">
                    {storeLocation.type}
                  </Badge>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                  <Link to="/app/inventory/adjustments" search={{ product_id: undefined }}>
                    <ArrowLeftRight className="mr-1 h-3 w-3" /> Transférer du stock
                  </Link>
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/40">
                    <TableHead>Produit</TableHead>
                    <TableHead className="text-right">Quantité</TableHead>
                    <TableHead className="text-right">Seuil alerte</TableHead>
                    <TableHead className="text-right">Valeur</TableHead>
                    <TableHead>État</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingStocks ? (
                    <TableSkeleton cols={6} />
                  ) : productStocks.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="flex flex-col items-center gap-2 py-12 text-center">
                          <Package className="h-8 w-8 text-muted-foreground/30" />
                          <p className="text-sm text-muted-foreground">
                            Aucun stock : transférez des produits depuis le Stock Central.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    productStocks.map((s) => {
                      const p = productMap[s.product_id];
                      const isOut = s.quantity === 0;
                      const isLow =
                        !isOut && s.alert_threshold > 0 && s.quantity <= s.alert_threshold;
                      return (
                        <TableRow key={s.id}>
                          <TableCell>
                            <Link
                              to={p ? "/app/products/$slug" : "/app/products"}
                              params={p ? { slug: productParam(p) } : {}}
                              className="font-medium hover:text-primary"
                            >
                              {p?.name ?? `Produit #${s.product_id}`}
                            </Link>
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums font-semibold ${
                              isOut ? "text-destructive" : isLow ? "text-warning" : ""
                            }`}
                          >
                            {s.quantity}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {s.alert_threshold}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                            {p ? fmtXAF(s.quantity * Number(p.prix_achat)) : ""}
                          </TableCell>
                          <TableCell>
                            {isOut ? (
                              <Badge variant="destructive" className="text-[10px]">
                                Rupture
                              </Badge>
                            ) : isLow ? (
                              <Badge className="bg-warning/15 text-warning border-0 text-[10px]">
                                Stock bas
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">
                                Normal
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <EditThresholdDialog
                              stock={s}
                              productName={p?.name ?? `#${s.product_id}`}
                              onUpdated={() => qc.invalidateQueries({ queryKey: ["stock"] })}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              {productStocks.length > 0 && (
                <div className="border-t p-3 flex justify-between text-xs text-muted-foreground">
                  <span>{productStocks.length} référence{productStocks.length !== 1 ? "s" : ""}</span>
                  <span>Valeur totale : {fmtXAF(stockValue)}</span>
                </div>
              )}
            </Card>
          )}
        </TabsContent>

        {/* ── Movements tab ── */}
        <TabsContent value="movements">
          <Card className="shadow-soft">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/40">
                  <TableHead>Type</TableHead>
                  <TableHead>Produit</TableHead>
                  <TableHead>De</TableHead>
                  <TableHead>Vers</TableHead>
                  <TableHead>Motif</TableHead>
                  <TableHead className="text-right">Qté</TableHead>
                  <TableHead>Par</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="py-14 text-center text-sm text-muted-foreground">
                        Aucun mouvement enregistré pour cette boutique
                      </div>
                    </td>
                  </tr>
                ) : (
                  movements.map((m) => {
                    const p = productMap[m.product_id];
                    const isIn =
                      m.movement_type === "IN" ||
                      (m.movement_type === "TRANSFER" && m.to_location_id === storeLocation?.id);
                    return (
                      <TableRow key={m.id}>
                        <TableCell>
                          <span className="text-xs font-medium text-muted-foreground">
                            {MOVE_LABEL[m.movement_type] ?? m.movement_type}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Link
                            to={p ? "/app/products/$slug" : "/app/products"}
                            params={p ? { slug: productParam(p) } : {}}
                            className="font-medium hover:text-primary text-sm"
                          >
                            {p?.name ?? `#${m.product_id}`}
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {m.from_location_id ? (locationMap[m.from_location_id] ?? "") : ""}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {m.to_location_id ? (locationMap[m.to_location_id] ?? "") : ""}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {m.reason ? (REASON_LABEL[m.reason] ?? m.reason) : ""}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums font-semibold text-sm ${
                            isIn ? "text-success" : "text-destructive"
                          }`}
                        >
                          {isIn ? `+${m.quantity}` : `-${m.quantity}`}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {m.created_by ? (userMap[m.created_by] ?? `#${m.created_by}`) : "Système"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(m.created_at, "fr")}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ── Caisse tab ── */}
        <TabsContent value="caisse">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="shadow-soft lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Wallet className="h-4 w-4" /> État de la caisse
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingCash ? (
                  <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…
                  </div>
                ) : openSession ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-lg bg-success/10 px-4 py-3">
                      <div className="flex items-center gap-2 text-success">
                        <Unlock className="h-4 w-4" />
                        <span className="text-sm font-medium">Caisse ouverte</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        depuis {formatDateTime(openSession.opened_at, "fr")}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Fonds initial</p>
                        <p className="text-lg font-semibold tabular-nums">{fmtXAF(Number(openSession.opening_amount))}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Solde attendu</p>
                        <p className="text-lg font-semibold tabular-nums">{fmtXAF(cashBalance)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Mouvements</p>
                        <p className="text-lg font-semibold tabular-nums">{cashMovements.length}</p>
                      </div>
                    </div>
                    {has("cash.manage") && (
                      <CloseCashSessionDialog
                        session={openSession}
                        expectedAmount={cashBalance}
                        onClosed={() => {
                          refetchCash();
                          qc.invalidateQueries({ queryKey: ["cash"] });
                        }}
                      />
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <Lock className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      Aucune caisse ouverte pour cette boutique.
                    </p>
                    {has("cash.manage") && (
                      <OpenCashSessionDialog
                        storeId={storeId}
                        onOpened={() => refetchCash()}
                      />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-soft">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Historique des sessions</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {closedSessions.length === 0 ? (
                  <p className="px-5 py-6 text-center text-xs text-muted-foreground">
                    Aucune session clôturée pour le moment.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {closedSessions.slice(0, 8).map((s) => (
                      <li key={s.id} className="flex items-center justify-between px-5 py-2.5 text-xs">
                        <div>
                          <p className="font-medium text-foreground">
                            {formatDateTime(s.opened_at, "fr")}
                          </p>
                          <p className="text-muted-foreground">
                            {s.closed_at ? `Fermée ${formatDateTime(s.closed_at, "fr")}` : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="tabular-nums font-medium">
                            {s.closing_amount !== null ? fmtXAF(Number(s.closing_amount)) : ""}
                          </p>
                          {s.difference_amount !== null && Number(s.difference_amount) !== 0 && (
                            <p className={`tabular-nums ${Number(s.difference_amount) < 0 ? "text-destructive" : "text-success"}`}>
                              {Number(s.difference_amount) > 0 ? "+" : ""}
                              {fmtXAF(Number(s.difference_amount))}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Infos tab ── */}
        <TabsContent value="infos">
          <Card className="shadow-soft">
            <CardContent className="grid gap-6 p-6 sm:grid-cols-2">
              <div className="space-y-4">
                <InfoRow label="Nom" value={store.name} />
                {store.code && <InfoRow label="Code" value={store.code} />}
                <InfoRow label="Gérant" value={gerantName} />
                <InfoRow label="Devise" value={store.devise} />
                <InfoRow label="Statut" value={<StatusBadge status={store.status} />} />
              </div>
              <div className="space-y-4">
                {store.city && (
                  <InfoRow
                    label="Ville"
                    value={
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                        {store.city}
                      </span>
                    }
                  />
                )}
                {store.address && <InfoRow label="Adresse" value={store.address} />}
                <InfoRow label="Fuseau horaire" value={store.timezone} />
                {store.description && (
                  <InfoRow label="Description" value={store.description} />
                )}
                {storeLocation && (
                  <InfoRow
                    label="Emplacement stock"
                    value={
                      <span className="flex items-center gap-1.5">
                        {storeLocation.name}
                        <Badge variant="secondary" className="text-[10px]">
                          {storeLocation.type}
                        </Badge>
                      </span>
                    }
                  />
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

/* ── Edit threshold dialog ────────────────────────────────────────────────── */
function EditThresholdDialog({
  stock,
  productName,
  onUpdated,
}: {
  stock: ProductStockRead;
  productName: string;
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [threshold, setThreshold] = useState(String(stock.alert_threshold));

  const mutation = useMutation({
    mutationFn: () =>
      stockApi.updateProductStock(stock.id, { alert_threshold: Number(threshold) }),
    onSuccess: () => {
      toast.success(`Seuil mis à jour : ${threshold} pour "${productName}"`);
      onUpdated();
      setOpen(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => {
          setThreshold(String(stock.alert_threshold));
          setOpen(true);
        }}
      >
        <SlidersHorizontal className="mr-1 h-3 w-3" />
        Seuil
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Modifier le seuil d'alerte</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Produit : <span className="font-medium text-foreground">{productName}</span>
            </p>
            <div className="rounded-lg bg-secondary/50 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Stock actuel : </span>
              <strong>{stock.quantity}</strong>
              <span className="ml-3 text-muted-foreground">
                · Seuil actuel : <strong>{stock.alert_threshold}</strong>
              </span>
            </div>
            <div className="space-y-1.5">
              <Label>Nouveau seuil d'alerte</Label>
              <Input
                type="number"
                min={0}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                Une alerte "Stock faible" s'affiche quand la quantité est ≤ ce seuil.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={threshold === "" || Number(threshold) < 0 || mutation.isPending}
            >
              {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

/* ── Edit dialog ──────────────────────────────────────────────────────────── */
function EditStoreDialog({
  store,
  userMap,
  onUpdated,
}: {
  store: StoreRead;
  userMap: Record<number, string>;
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(store.name);
  const [code, setCode] = useState(store.code ?? "");
  const [city, setCity] = useState(store.city ?? "");
  const [address, setAddress] = useState(store.address ?? "");
  const [devise, setDevise] = useState(store.devise);
  const [gerantId, setGerantId] = useState(store.gerant_id ? String(store.gerant_id) : "");

  const { data: users = [] } = useQuery({
    queryKey: qk.users.list(),
    queryFn: () => usersApi.list({ limit: 200 }),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: () =>
      storesApi.update(store.id, {
        name: name.trim() || undefined,
        code: code.trim() || undefined,
        city: city.trim() || undefined,
        address: address.trim() || undefined,
        devise: devise || undefined,
        gerant_id: gerantId ? Number(gerantId) : undefined,
      } satisfies StoreUpdate),
    onSuccess: () => {
      toast.success("Boutique mise à jour");
      onUpdated();
      setOpen(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Modifier
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier la boutique</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nom *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ELS001"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ville</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Devise</Label>
                <Select value={devise} onValueChange={setDevise}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["GNF", "XAF", "XOF", "EUR", "USD"].map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Adresse</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Gérant</Label>
              <Select value={gerantId} onValueChange={setGerantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Aucun gérant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Aucun gérant</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.firstname} {u.lastname}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={!name.trim() || mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ── Open cash session dialog ─────────────────────────────────────────────── */
function OpenCashSessionDialog({
  storeId,
  onOpened,
}: {
  storeId: number;
  onOpened: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [openingAmount, setOpeningAmount] = useState("0");

  const mutation = useMutation({
    mutationFn: () =>
      cashApi.openSession({ store_id: storeId, opening_amount: Number(openingAmount) }),
    onSuccess: () => {
      toast.success("Caisse ouverte");
      onOpened();
      setOpen(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          setOpeningAmount("0");
          setOpen(true);
        }}
      >
        <Unlock className="mr-1.5 h-3.5 w-3.5" /> Ouvrir la caisse
      </Button>
      <Dialog open={open} onOpenChange={(o) => !mutation.isPending && setOpen(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ouvrir la caisse</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Fonds de caisse initial</Label>
              <Input
                type="number"
                min={0}
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
                className="tabular-nums"
              />
              <p className="text-xs text-muted-foreground">
                Montant en espèces physiquement présent à l'ouverture.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>
              Annuler
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || Number(openingAmount) < 0}
            >
              {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Ouvrir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ── Close cash session dialog ────────────────────────────────────────────── */
function CloseCashSessionDialog({
  session,
  expectedAmount,
  onClosed,
}: {
  session: CashSessionRead;
  expectedAmount: number;
  onClosed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [closingAmount, setClosingAmount] = useState("");

  const diff = closingAmount === "" ? null : Number(closingAmount) - expectedAmount;

  const mutation = useMutation({
    mutationFn: () => cashApi.closeSession(session.id, { closing_amount: Number(closingAmount) }),
    onSuccess: () => {
      toast.success("Caisse fermée");
      onClosed();
      setOpen(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setClosingAmount("");
          setOpen(true);
        }}
      >
        <Lock className="mr-1.5 h-3.5 w-3.5" /> Fermer la caisse
      </Button>
      <Dialog open={open} onOpenChange={(o) => !mutation.isPending && setOpen(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Fermer la caisse</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg bg-secondary/30 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Solde attendu</span>
                <span className="font-medium tabular-nums">{fmtXAF(expectedAmount)}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Montant compté en caisse</Label>
              <Input
                type="number"
                min={0}
                value={closingAmount}
                onChange={(e) => setClosingAmount(e.target.value)}
                className="tabular-nums"
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                Montant en espèces réellement compté à la fermeture.
              </p>
            </div>
            {diff !== null && diff !== 0 && (
              <p className={`text-xs font-medium ${diff < 0 ? "text-destructive" : "text-warning"}`}>
                Écart : {diff > 0 ? "+" : ""}
                {fmtXAF(diff)} par rapport au solde attendu
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>
              Annuler
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || closingAmount === "" || Number(closingAmount) < 0}
            >
              {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
