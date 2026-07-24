import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Plus, Minus, Trash2, ShoppingCart, PackagePlus, Loader2 } from "lucide-react";
import { fmtXAF } from "@/lib/mock-data";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { useWorkContext } from "@/lib/work-context";
import { catalogApi, stockApi, commandesApi, qk } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { PrintPreviewDialog } from "@/lib/print-engine";
import { commandeToDemandeDocument } from "@/lib/commande-print-adapter";
import { cn } from "@/lib/utils";
import type { CommandeCreate, CommandeRead } from "@/lib/types";

export const Route = createFileRoute("/app/orders/new")({ component: Page });

type SupplyProduct = {
  id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string;
  unit: string | null;
  prixAchat: number;
  stock: number;
  alertThreshold: number;
};

type DemandeLine =
  | { key: string; kind: "catalog"; productId: number; name: string; unitPrice: number; quantity: number }
  | { key: string; kind: "free"; name: string; quantity: number };

function Page() {
  const { t } = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { store, user, has } = useWorkContext();
  // Boutique-side action — requires being scoped into a specific boutique's
  // workspace, not just the permission (which super-admin bypasses).
  const canCreate = has("commandes.create") && !!store;

  const { data: location } = useQuery({
    queryKey: qk.stock.locations({ store_id: store?.id, type: "STORE" }),
    queryFn: async () =>
      (await stockApi.listLocations({ store_id: store!.id, type: "STORE", limit: 5 }))[0] ?? null,
    enabled: !!store,
  });

  const { data: rawProducts = [], isLoading: productsLoading } = useQuery({
    queryKey: qk.catalog.products(),
    queryFn: () => catalogApi.listProducts({ limit: 500 }),
  });

  const { data: categories = [] } = useQuery({
    queryKey: qk.catalog.productCategories,
    queryFn: () => catalogApi.listProductCategories({ limit: 200 }),
  });

  const { data: productStocks = [] } = useQuery({
    queryKey: qk.stock.productStocks({ location_id: location?.id }),
    queryFn: () => stockApi.listProductStocks({ location_id: location!.id, limit: 500 }),
    enabled: !!location,
  });

  const categoryName = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories],
  );
  const stockByProduct = useMemo(
    () => Object.fromEntries(productStocks.map((s) => [s.product_id, s])),
    [productStocks],
  );

  const products: SupplyProduct[] = useMemo(
    () =>
      rawProducts.map((p) => {
        const s = stockByProduct[p.id];
        return {
          id: p.id,
          name: p.name,
          sku: p.sku,
          barcode: p.barcode,
          category: p.category_product_id
            ? categoryName[p.category_product_id] ?? (t("common.uncategorized") as string)
            : (t("common.uncategorized") as string),
          unit: p.unit_of_measure,
          prixAchat: Number(p.prix_achat),
          stock: s?.quantity ?? 0,
          alertThreshold: s?.alert_threshold ?? 0,
        };
      }),
    [rawProducts, stockByProduct, categoryName, t],
  );

  const productById = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);

  const [q, setQ] = useState("");
  const [freeQty, setFreeQty] = useState(1);
  const [lines, setLines] = useState<Record<string, DemandeLine>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<CommandeRead | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return products.slice(0, 60);
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        (p.sku ?? "").toLowerCase().includes(needle) ||
        (p.barcode ?? "").toLowerCase().includes(needle),
    );
  }, [products, q]);

  const items = useMemo(() => Object.values(lines), [lines]);

  const addProduct = (p: SupplyProduct) => {
    const key = `p-${p.id}`;
    setLines((prev) => {
      const existing = prev[key];
      if (existing && existing.kind === "catalog") {
        return { ...prev, [key]: { ...existing, quantity: existing.quantity + 1 } };
      }
      return {
        ...prev,
        [key]: { key, kind: "catalog", productId: p.id, name: p.name, unitPrice: p.prixAchat, quantity: 1 },
      };
    });
  };

  const addFreeText = () => {
    const name = q.trim();
    if (!name) return;
    const key = `f-${crypto.randomUUID()}`;
    setLines((prev) => ({ ...prev, [key]: { key, kind: "free", name, quantity: Math.max(1, freeQty) } }));
    setQ("");
    setFreeQty(1);
    toast.success(`« ${name} » ajouté comme produit non catalogué`);
  };

  const setQty = (key: string, qty: number) => {
    setLines((prev) => {
      const line = prev[key];
      if (!line) return prev;
      if (qty <= 0) {
        const { [key]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: { ...line, quantity: qty } };
    });
  };
  const inc = (key: string) => setQty(key, (lines[key]?.quantity ?? 0) + 1);
  const dec = (key: string) => setQty(key, (lines[key]?.quantity ?? 0) - 1);
  const remove = (key: string) =>
    setLines((prev) => {
      const { [key]: _removed, ...rest } = prev;
      return rest;
    });

  const subtotal = items.reduce(
    (a, l) => a + (l.kind === "catalog" ? l.unitPrice * l.quantity : 0),
    0,
  );

  const submit = async () => {
    if (!store) {
      toast.error("Aucune boutique active dans cet espace de travail.");
      return;
    }
    if (!canCreate) {
      toast.error("Vous n'avez pas le privilège de créer une demande d'approvisionnement.");
      return;
    }
    if (items.length === 0) {
      toast.error("Ajoutez au moins un produit à la demande.");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload: CommandeCreate = {
        boutique_id: store.id,
        lignes: items.map((l) =>
          l.kind === "catalog"
            ? { produit_id: l.productId, quantite_demandee: l.quantity, prix_unitaire: l.unitPrice }
            : { nom_libre: l.name, quantite_demandee: l.quantity },
        ),
      };
      const created = await commandesApi.create(payload);
      const finalCommande = await commandesApi.submit(created.id);
      await qc.invalidateQueries({ queryKey: ["commandes"] });
      setLines({});
      setSubmitted(finalCommande);
      toast.success(`Demande ${finalCommande.numero ?? `#${finalCommande.id}`} soumise avec succès`);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.detail : err instanceof Error ? err.message : "Erreur";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title={t("orders.new.title") as string}
        description={t("orders.new.subtitle") as string}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/app/orders">{t("common.cancel") as string}</Link>
            </Button>
            {canCreate && (
              <Button onClick={submit} disabled={isSubmitting || items.length === 0 || !store}>
                {isSubmitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {t("orders.new.submit") as string}
              </Button>
            )}
          </>
        }
      />

      {!canCreate ? (
        <Card className="shadow-soft">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Vous n'avez pas le privilège de créer une demande d'approvisionnement — seul un
            gérant de boutique peut soumettre une demande. Vous pouvez la valider une fois
            soumise depuis la fiche de la demande.
          </CardContent>
        </Card>
      ) : !store ? (
        <Card className="shadow-soft">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Passez dans l'espace d'une boutique pour créer une demande d'approvisionnement.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <Card className="shadow-soft">
            <div className="border-b p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("orders.new.addLine") as string}
                  className="h-9 pl-8"
                />
              </div>
            </div>

            {productsLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Chargement du catalogue…</div>
            ) : filtered.length === 0 ? (
              <div className="space-y-3 p-6">
                <p className="text-sm text-muted-foreground">
                  Aucun produit ne correspond à « {q} » dans le catalogue.
                </p>
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3">
                  <div className="min-w-[200px] flex-1 text-sm">
                    Ajouter <span className="font-medium">« {q} »</span> comme produit non catalogué —
                    le Siège devra le rattacher à une fiche produit avant validation.
                  </div>
                  <Input
                    type="number"
                    min={1}
                    value={freeQty}
                    onChange={(e) => setFreeQty(Number(e.target.value))}
                    className="h-8 w-16 text-center"
                  />
                  <Button size="sm" onClick={addFreeText} disabled={!q.trim()}>
                    <PackagePlus className="mr-1.5 h-3.5 w-3.5" />
                    Ajouter
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2">
                {filtered.map((p) => {
                  const low = p.alertThreshold > 0 && p.stock <= p.alertThreshold;
                  return (
                    <button
                      key={p.id}
                      onClick={() => addProduct(p)}
                      className="group flex items-center justify-between gap-3 bg-background p-3 text-left hover:bg-accent/30"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{p.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {p.sku ?? "—"} · {fmtXAF(p.prixAchat)}
                        </div>
                        <div className={cn("truncate text-[11px]", low ? "text-warning" : "text-muted-foreground")}>
                          Stock actuel : {p.stock}
                          {p.alertThreshold > 0 ? ` · Seuil min. : ${p.alertThreshold}` : ""}
                        </div>
                      </div>
                      <Plus className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          <div className="space-y-4">
            <Card className="shadow-soft">
              <CardContent className="space-y-1.5 p-4">
                <Label className="text-xs font-medium">{t("common.store") as string}</Label>
                <div className="text-sm font-medium">{store.name}</div>
                {store.city && <div className="text-xs text-muted-foreground">{store.city}</div>}
              </CardContent>
            </Card>
            <Card className="shadow-soft">
              <div className="flex items-center justify-between border-b p-3">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  <span className="text-sm font-semibold">Panier</span>
                </div>
                <span className="text-xs text-muted-foreground">{items.length} {t("orders.col.items") as string}</span>
              </div>
              {items.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  Ajoutez des produits à votre demande
                </div>
              ) : (
                <ul className="divide-y">
                  {items.map((l) => (
                    <li key={l.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{l.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {l.kind === "catalog" ? fmtXAF(l.unitPrice) : <span className="italic">Produit non catalogué</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => dec(l.key)}>
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-7 text-center text-sm font-semibold tabular-nums">{l.quantity}</span>
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => inc(l.key)}>
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(l.key)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="space-y-1 border-t p-4 text-sm">
                <div className="flex justify-between font-semibold">
                  <span>{t("common.total") as string} (estimé)</span>
                  <span className="tabular-nums">{fmtXAF(subtotal)}</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      <PrintPreviewDialog
        open={!!submitted}
        document={
          submitted
            ? commandeToDemandeDocument(submitted, {
                store,
                issuerName: user ? `${user.firstname} ${user.lastname}` : undefined,
                productName: (id) => productById[id]?.name ?? `Produit #${id}`,
              })
            : null
        }
        config={{ format: "a4" }}
        showSuccess
        onClose={() => {
          const id = submitted?.id;
          setSubmitted(null);
          if (id) void navigate({ to: "/app/orders/$id", params: { id: String(id) } });
        }}
      />
    </>
  );
}
