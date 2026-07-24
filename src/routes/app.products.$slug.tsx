import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge, KpiCard, ApiErrorState } from "@/components/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ChevronLeft, Package, TrendingUp, Warehouse, Loader2, Layers, ArrowUpDown, Plus,
  AlertTriangle,
} from "lucide-react";
import { catalogApi, stockApi, storesApi, qk } from "@/lib/api";
import { parseProductParam } from "@/lib/entity-paths";
import { ImageUpload } from "@/components/image-upload";
import { CreateCategoryDialog } from "@/components/create-category-dialog";
import type { CategoryProductRead } from "@/lib/types";
import { fmtXAF } from "@/lib/mock-data";
import { useT, formatDateTime } from "@/lib/i18n";
import { useWorkContext } from "@/lib/work-context";
import { toast } from "sonner";

export const Route = createFileRoute("/app/products/$slug")({ component: Page });

const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  IN: "Entrée",
  OUT: "Sortie",
  TRANSFER: "Transfert",
  ADJUSTMENT: "Ajustement",
};

const MOVEMENT_REASON_LABEL: Record<string, string> = {
  STOCK_INITIAL: "Init. stock",
  PURCHASE: "Achat",
  SALE: "Vente",
  RETURN: "Retour",
  DAMAGE: "Casse",
  LOSS: "Perte",
  THEFT: "Vol",
  INVENTORY: "Inventaire",
  OTHER: "Autre",
};

function Page() {
  const { t, lang } = useT();
  const { has } = useWorkContext();
  const canManage = has("products.manage");
  const { slug } = useParams({ from: "/app/products/$slug" });
  const productUuid = parseProductParam(slug);
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: product, isLoading, error, refetch } = useQuery({
    queryKey: qk.catalog.productByUuid(productUuid),
    queryFn: () => catalogApi.getProductByUuid(productUuid),
  });

  const { data: categories = [] } = useQuery({
    queryKey: qk.catalog.productCategories,
    queryFn: () => catalogApi.listProductCategories(),
  });

  const { data: productStocks = [] } = useQuery({
    queryKey: qk.stock.productStocks({ product_id: product?.id }),
    queryFn: () => stockApi.listProductStocks({ product_id: product!.id }),
    enabled: !!product,
  });

  const { data: locations = [] } = useQuery({
    queryKey: qk.stock.locations(),
    queryFn: () => stockApi.listLocations({ limit: 200 }),
    enabled: !!product,
  });

  const { data: movements = [] } = useQuery({
    queryKey: qk.stock.movements({ product_id: product?.id }),
    queryFn: () => stockApi.listMovements({ product_id: product!.id }),
    enabled: !!product,
  });

  const { data: stores = [] } = useQuery({
    queryKey: qk.stores.list(),
    queryFn: () => storesApi.list({ limit: 200 }),
  });
  const storeMap = Object.fromEntries(stores.map((s) => [s.id, s.name]));
  const locationMap = Object.fromEntries(locations.map((l) => [l.id, l]));

  // ── Edit form state ───────────────────────────────────────────────────────
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editSku, setEditSku] = useState("");
  const [editBarcode, setEditBarcode] = useState("");
  const [editBrand, setEditBrand] = useState("");
  const [editUom, setEditUom] = useState("");
  const [editTva, setEditTva] = useState("0");
  const [editPrixAchat, setEditPrixAchat] = useState("");
  const [editPrixVente, setEditPrixVente] = useState("");
  const [editCat, setEditCat] = useState("");
  const [editStatus, setEditStatus] = useState<"active" | "inactive">("active");
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const [showCatDialog, setShowCatDialog] = useState(false);
  const [editReady, setEditReady] = useState(false);

  if (product && !editReady) {
    setEditName(product.name);
    setEditDesc(product.description ?? "");
    setEditSku(product.sku ?? "");
    setEditBarcode(product.barcode ?? "");
    setEditBrand(product.brand ?? "");
    setEditUom(product.unit_of_measure ?? "");
    setEditTva(String(product.tva ?? 0));
    setEditPrixAchat(String(product.prix_achat));
    setEditPrixVente(String(product.prix_vente));
    setEditCat(product.category_product_id ? String(product.category_product_id) : "");
    setEditStatus(product.status === "active" ? "active" : "inactive");
    setEditImageUrl(product.images?.[0] ?? null);
    setEditReady(true);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: () =>
      catalogApi.updateProduct(product!.id, {
        name: editName.trim(),
        description: editDesc.trim() || undefined,
        sku: editSku.trim() || undefined,
        barcode: editBarcode.trim() || undefined,
        brand: editBrand.trim() || undefined,
        unit_of_measure: editUom.trim() || undefined,
        tva: Number(editTva),
        images: editImageUrl ? [editImageUrl] : undefined,
        prix_achat: Number(editPrixAchat),
        prix_vente: Number(editPrixVente),
        category_product_id: editCat ? Number(editCat) : undefined,
      }),
    onSuccess: () => {
      toast.success("Produit mis à jour");
      qc.invalidateQueries({ queryKey: qk.catalog.productByUuid(productUuid) });
      qc.invalidateQueries({ queryKey: ["catalog", "products"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => catalogApi.deleteProduct(product!.id),
    onSuccess: () => {
      toast.success("Produit supprimé");
      qc.invalidateQueries({ queryKey: ["catalog", "products"] });
      navigate({ to: "/app/products" });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const totalStock = productStocks.reduce((a, s) => a + s.quantity, 0);
  const locationCount = productStocks.filter((s) => s.quantity > 0).length;
  const lowStockCount = productStocks.filter(
    (s) => s.alert_threshold > 0 && s.quantity <= s.alert_threshold,
  ).length;
  const margin =
    product && Number(product.prix_vente) > 0
      ? Math.round(
          ((Number(product.prix_vente) - Number(product.prix_achat)) /
            Number(product.prix_vente)) *
            100,
        )
      : 0;

  // ── Loading / error ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <>
        <Skeleton className="mb-4 h-6 w-32" />
        <Skeleton className="mb-6 h-10 w-64" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </>
    );
  }

  if (error || !product) {
    return <ApiErrorState error={error ?? new Error("Produit introuvable")} onRetry={refetch} />;
  }

  const categoryName =
    categories.find((c) => c.id === product.category_product_id)?.name ?? "";

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground">
        <Link to="/app/products">
          <ChevronLeft className="mr-1 h-4 w-4" /> {t("products.title") as string}
        </Link>
      </Button>

      <PageHeader
        title={product.name}
        description={`${categoryName} · ${totalStock} unité${totalStock !== 1 ? "s" : ""} en stock`}
        badge={<StatusBadge status={product.status} />}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate({ to: "/app/inventory/adjustments", search: { product_id: undefined } })}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Ajouter du stock
            </Button>
            {canManage && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                    Supprimer
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer ce produit ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cette action est irréversible. Le produit{" "}
                      <strong>{product.name}</strong> sera définitivement supprimé.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive hover:bg-destructive/90"
                      onClick={() => deleteMutation.mutate()}
                    >
                      {deleteMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Supprimer"
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          label="Stock total"
          value={totalStock}
          icon={<Warehouse className="h-5 w-5" />}
          tone={lowStockCount > 0 ? "warning" : "default"}
          hint={`${locationCount} emplacement${locationCount !== 1 ? "s" : ""} actif${locationCount !== 1 ? "s" : ""}`}
        />
        <KpiCard
          label="Emplacements"
          value={productStocks.length}
          icon={<Layers className="h-5 w-5" />}
          tone="default"
          hint={lowStockCount > 0 ? `${lowStockCount} sous seuil` : "Tous normaux"}
        />
        <KpiCard
          label={t("products.detail.purchase") as string}
          value={fmtXAF(product.prix_achat)}
          icon={<Package className="h-5 w-5" />}
          tone="default"
        />
        <KpiCard
          label={t("common.price") as string}
          value={fmtXAF(product.prix_vente)}
          icon={<TrendingUp className="h-5 w-5" />}
          tone="primary"
          hint={`Marge : ${margin}%`}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="stock" className="mt-6">
        <TabsList>
          <TabsTrigger value="stock">
            <Layers className="mr-1.5 h-3.5 w-3.5" /> Stock par emplacement
          </TabsTrigger>
          <TabsTrigger value="movements">
            <ArrowUpDown className="mr-1.5 h-3.5 w-3.5" /> Mouvements
          </TabsTrigger>
          {canManage && <TabsTrigger value="edit">Modifier</TabsTrigger>}
        </TabsList>

        {/* ── Stock par emplacement ── */}
        <TabsContent value="stock" className="mt-4">
          <Card className="shadow-soft">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/40">
                  <TableHead>Emplacement</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Quantité</TableHead>
                  <TableHead className="text-right">Seuil alerte</TableHead>
                  <TableHead>État</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productStocks.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
                        <p>Aucun stock enregistré pour ce produit.</p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate({ to: "/app/inventory/adjustments", search: { product_id: undefined } })}
                        >
                          <Plus className="mr-1.5 h-4 w-4" /> Ajouter du stock
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  productStocks.map((ps) => {
                    const loc = locationMap[ps.location_id];
                    const isOut = ps.quantity === 0;
                    const isLow =
                      !isOut && ps.alert_threshold > 0 && ps.quantity <= ps.alert_threshold;
                    return (
                      <TableRow key={ps.id}>
                        <TableCell className="font-medium">
                          {loc?.name ?? `Emplacement #${ps.location_id}`}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">{loc?.type ?? ""}</span>
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums font-semibold ${
                            isOut
                              ? "text-destructive"
                              : isLow
                              ? "text-warning"
                              : ""
                          }`}
                        >
                          {ps.quantity}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {ps.alert_threshold}
                        </TableCell>
                        <TableCell>
                          {isOut ? (
                            <Badge variant="destructive" className="text-[10px]">Rupture</Badge>
                          ) : isLow ? (
                            <Badge className="bg-warning/15 text-warning border-0 text-[10px]">
                              <AlertTriangle className="mr-1 h-3 w-3" /> Stock bas
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">Normal</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ── Mouvements ── */}
        <TabsContent value="movements" className="mt-4">
          <Card className="shadow-soft">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/40">
                  <TableHead>Type</TableHead>
                  <TableHead>Raison</TableHead>
                  <TableHead>De → Vers</TableHead>
                  <TableHead className="text-right">Avant</TableHead>
                  <TableHead className="text-right">Qté</TableHead>
                  <TableHead className="text-right">Après</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="py-10 text-center text-sm text-muted-foreground">
                        Aucun mouvement enregistré.
                      </div>
                    </td>
                  </tr>
                ) : (
                  movements.map((m) => {
                    const isIn = m.movement_type === "IN";
                    const isOut = m.movement_type === "OUT";
                    const fromLoc = m.from_location_id ? locationMap[m.from_location_id] : null;
                    const toLoc = m.to_location_id ? locationMap[m.to_location_id] : null;
                    return (
                      <TableRow key={m.id}>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              isIn
                                ? "bg-success/10 text-success"
                                : isOut
                                ? "bg-destructive/10 text-destructive"
                                : "bg-secondary text-muted-foreground"
                            }`}
                          >
                            {MOVEMENT_TYPE_LABEL[m.movement_type] ?? m.movement_type}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {m.reason ? (MOVEMENT_REASON_LABEL[m.reason] ?? m.reason) : ""}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fromLoc?.name ?? (m.from_location_id ? `#${m.from_location_id}` : "")}
                          {" → "}
                          {toLoc?.name ?? (m.to_location_id ? `#${m.to_location_id}` : "")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {m.quantity_before}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums font-medium ${
                            isIn ? "text-success" : isOut ? "text-destructive" : ""
                          }`}
                        >
                          {isIn ? `+${m.quantity}` : isOut ? `-${m.quantity}` : m.quantity}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{m.quantity_after}</TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(m.created_at, lang)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* ── Modifier ── */}
        <TabsContent value="edit" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <Card className="shadow-soft">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Identité</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>{t("common.name") as string}</Label>
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("common.description") as string}</Label>
                    <Textarea
                      rows={3}
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-soft">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Références produit</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>SKU</Label>
                      <Input
                        value={editSku}
                        onChange={(e) => setEditSku(e.target.value)}
                        placeholder="SKU-001"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Code-barres</Label>
                      <Input
                        value={editBarcode}
                        onChange={(e) => setEditBarcode(e.target.value)}
                        placeholder="6291041500213"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Marque</Label>
                      <Input
                        value={editBrand}
                        onChange={(e) => setEditBrand(e.target.value)}
                        placeholder="Marque…"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Unité de mesure</Label>
                      <Input
                        value={editUom}
                        onChange={(e) => setEditUom(e.target.value)}
                        placeholder="pièce, kg, L…"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-soft">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">{t("common.price") as string}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label>{t("products.detail.purchase") as string}</Label>
                      <Input
                        type="number"
                        min={0}
                        value={editPrixAchat}
                        onChange={(e) => setEditPrixAchat(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Prix vente</Label>
                      <Input
                        type="number"
                        min={0}
                        value={editPrixVente}
                        onChange={(e) => setEditPrixVente(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>TVA (%)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={editTva}
                        onChange={(e) => setEditTva(e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card className="shadow-soft">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">{t("common.category") as string} & statut</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>{t("common.category") as string}</Label>
                      <button
                        type="button"
                        onClick={() => setShowCatDialog(true)}
                        className="flex items-center gap-1 rounded text-xs text-primary hover:underline"
                      >
                        <Plus className="h-3 w-3" /> Nouvelle
                      </button>
                    </div>
                    <Select value={editCat} onValueChange={setEditCat}>
                      <SelectTrigger>
                        <SelectValue placeholder="Aucune" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Aucune</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("common.status") as string}</Label>
                    <Select
                      value={editStatus}
                      onValueChange={(v) => setEditStatus(v as typeof editStatus)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">{t("status.active") as string}</SelectItem>
                        <SelectItem value="inactive">{t("status.inactive") as string}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-soft">
                <CardContent className="p-4">
                  <ImageUpload
                    value={editImageUrl}
                    onChange={setEditImageUrl}
                    label="Photo du produit"
                  />
                </CardContent>
              </Card>

              <Button
                className="w-full"
                onClick={() => updateMutation.mutate()}
                disabled={!editName.trim() || updateMutation.isPending}
              >
                {updateMutation.isPending && (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                )}
                {t("common.save") as string}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <CreateCategoryDialog
        open={showCatDialog}
        onClose={() => setShowCatDialog(false)}
        onCreated={(cat: CategoryProductRead) => setEditCat(String(cat.id))}
      />
    </>
  );
}
