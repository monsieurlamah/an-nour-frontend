import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { KpiCard } from "@/components/primitives";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Package, AlertTriangle, TrendingDown, Layers, Store, ArrowLeftRight, ClipboardList, PackageX,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { stockApi, catalogApi, storesApi, qk } from "@/lib/api";
import { fmtXAF } from "@/lib/mock-data";
import { useT } from "@/lib/i18n";
import { useWorkContext, canViewHQ } from "@/lib/work-context";
import { AdjustStockDialog } from "@/components/inventory/adjust-stock-dialog";
import { productParam } from "@/lib/entity-paths";
import { cn } from "@/lib/utils";
import type { ProductStockRead } from "@/lib/types";

export const Route = createFileRoute("/app/inventory")({ component: Layout });

const TABS = [
  { to: "/app/inventory",             label: "Vue d'ensemble",  exact: true },
  { to: "/app/inventory/central",     label: "Stock central"                },
  { to: "/app/inventory/boutiques",   label: "Stock boutiques"              },
  { to: "/app/inventory/movements",   label: "Mouvements"                   },
  { to: "/app/inventory/adjustments", label: "Ajustements"                  },
];

const MOVE_LABEL: Record<string, string> = {
  IN: "Entrée", OUT: "Sortie", TRANSFER: "Transfert", ADJUSTMENT: "Ajustement",
};

function Layout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isSuperAdmin, has } = useWorkContext();
  // Stock central belongs to the Boss only — a boutique-scoped gérant never
  // sees the network-wide warehouse, only their own store's stock (backend
  // already enforces this in app/modules/stock/router.py; this just keeps
  // the UI from offering a tab that would only ever render empty for them).
  const canView = canViewHQ(isSuperAdmin, has);
  const tabs = canView ? TABS : TABS.filter((t) => t.to !== "/app/inventory/central");
  const isRoot = pathname === "/app/inventory";
  const activeTab =
    tabs.find((t) => (t.exact ? pathname === t.to : pathname.startsWith(t.to)))?.to ??
    "/app/inventory";

  return (
    <>
      <PageHeader title="Stock" description="Gestion du stock central et des boutiques." />

      <Tabs value={activeTab} className="mb-4">
        <TabsList className="flex-wrap">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.to} value={tab.to} asChild>
              <Link to={tab.to}>{tab.label}</Link>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isRoot ? <Overview canViewCentral={canView} /> : <Outlet />}
    </>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */
function Overview({ canViewCentral }: { canViewCentral: boolean }) {
  const { data: productStocks = [], isLoading: loadingStocks } = useQuery({
    queryKey: qk.stock.productStocks(),
    queryFn: () => stockApi.listProductStocks({ limit: 500 }),
  });

  const { data: locations = [] } = useQuery({
    queryKey: qk.stock.locations(),
    queryFn: () => stockApi.listLocations({ limit: 200 }),
  });

  const { data: products = [] } = useQuery({
    queryKey: qk.catalog.products(),
    queryFn: () => catalogApi.listProducts({ limit: 500 }),
  });

  const { data: categories = [] } = useQuery({
    queryKey: qk.catalog.productCategories,
    queryFn: () => catalogApi.listProductCategories(),
  });

  const { data: movements = [] } = useQuery({
    queryKey: qk.stock.movements({ limit: 30 }),
    queryFn: () => stockApi.listMovements({ limit: 30 }),
  });

  const { data: stores = [] } = useQuery({
    queryKey: qk.stores.list(),
    queryFn: () => storesApi.list({ limit: 200 }),
  });

  const { lang } = useT();
  const [adjusting, setAdjusting] = useState<ProductStockRead | null>(null);

  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const locationMap = Object.fromEntries(locations.map((l) => [l.id, l]));
  const storeMap = Object.fromEntries(stores.map((s) => [s.id, s.name]));

  const getLocationLabel = (locationId: number) => {
    const loc = locationMap[locationId];
    if (!loc) return `Emplacement #${locationId}`;
    return loc.store_id ? (storeMap[loc.store_id] ?? loc.name) : "Stock central";
  };

  const centralLocation = locations.find((l) => l.type === "CENTRAL");
  const centralStocks = centralLocation
    ? productStocks.filter((s) => s.location_id === centralLocation.id)
    : [];
  const storeLocations = locations.filter((l) => l.type === "STORE");
  const storeStocks = productStocks.filter((s) =>
    storeLocations.some((l) => l.id === s.location_id),
  );

  const lowStock = productStocks.filter(
    (s) => s.alert_threshold > 0 && s.quantity <= s.alert_threshold,
  );
  const outOfStock = productStocks.filter((s) => s.quantity === 0);

  const centralValue = centralStocks.reduce((acc, s) => {
    const p = productMap[s.product_id];
    return acc + s.quantity * Number(p?.prix_achat ?? 0);
  }, 0);
  const storeValue = storeStocks.reduce((acc, s) => {
    const p = productMap[s.product_id];
    return acc + s.quantity * Number(p?.prix_achat ?? 0);
  }, 0);

  // Stock value by category (central only)
  const catValueMap: Record<string, number> = {};
  for (const s of centralStocks) {
    const p = productMap[s.product_id];
    if (!p) continue;
    const cat = catMap[p.category_product_id ?? 0] ?? "Autres";
    catValueMap[cat] = (catValueMap[cat] ?? 0) + s.quantity * Number(p.prix_achat);
  }
  const chartData = Object.entries(catValueMap)
    .map(([category, value]) => ({ category, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {loadingStocks ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
        ) : (
          <>
            <KpiCard
              label="Produits en stock"
              value={new Set(productStocks.map((s) => s.product_id)).size}
              icon={<Package className="h-5 w-5" />}
              tone="primary"
              hint={`${products.length} référence${products.length !== 1 ? "s" : ""} au catalogue`}
            />
            <KpiCard
              label={canViewCentral ? "Valeur stock central" : "Valeur stock boutique"}
              value={fmtXAF(canViewCentral ? centralValue : storeValue)}
              icon={<TrendingDown className="h-5 w-5" />}
              tone="default"
            />
            <KpiCard
              label="Alertes stock bas"
              value={lowStock.length}
              icon={<AlertTriangle className="h-5 w-5" />}
              tone={lowStock.length > 0 ? "warning" : "success"}
              hint={`${outOfStock.length} en rupture totale`}
            />
            <KpiCard
              label="Lignes boutiques"
              value={storeStocks.length}
              icon={<Store className="h-5 w-5" />}
              tone="default"
              hint={`${storeLocations.length} boutique${storeLocations.length !== 1 ? "s" : ""}`}
            />
          </>
        )}
      </div>

      {/* Produits en rupture — actionnable : la raison d'être du lien "Voir"
          de l'alerte dashboard, central et boutiques réunis. */}
      {outOfStock.length > 0 && (
        <Card className="mt-4 shadow-soft border-destructive/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-destructive">
              <PackageX className="h-4 w-4" />
              {outOfStock.length} produit{outOfStock.length > 1 ? "s" : ""} en rupture totale
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {outOfStock.map((s) => {
              const p = productMap[s.product_id];
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-destructive/5 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      to={p ? "/app/products/$slug" : "/app/products"}
                      params={p ? { slug: productParam(p) } : {}}
                      className="truncate text-sm font-medium hover:text-primary"
                    >
                      {p?.name ?? `Produit #${s.product_id}`}
                    </Link>
                    <div className="mt-0.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {getLocationLabel(s.location_id)}
                      </Badge>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => setAdjusting(s)} className="shrink-0">
                    + Ajouter du stock
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Chart — central-only breakdown, so only the Boss sees it */}
        {canViewCentral && (
          <Card className="shadow-soft lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Valeur stock central par catégorie</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length === 0 ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  Aucune donnée disponible
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="category" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false}
                        tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                      <Tooltip
                        contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                        formatter={(v: number) => [fmtXAF(v), "Valeur"]}
                      />
                      <Bar dataKey="value" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Alertes + accès rapides */}
        <div className={cn("space-y-4", !canViewCentral && "lg:col-span-3")}>
          {/* Alertes */}
          <Card className="shadow-soft">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                Alertes stock bas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {lowStock.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucune alerte : stock en bonne santé.</p>
              ) : (
                lowStock.slice(0, 5).map((s) => {
                  const p = productMap[s.product_id];
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <span className="truncate font-medium">{p?.name ?? `#${s.product_id}`}</span>
                        <span className="ml-1 text-muted-foreground/60">({getLocationLabel(s.location_id)})</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-semibold text-warning">
                          {s.quantity} / {s.alert_threshold}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => setAdjusting(s)}
                        >
                          Ajuster
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
              {lowStock.length > 5 && (
                <Link to={canViewCentral ? "/app/inventory/central" : "/app/inventory/boutiques"} className="text-xs text-primary hover:underline">
                  +{lowStock.length - 5} autres →
                </Link>
              )}
            </CardContent>
          </Card>

          {/* Accès rapides */}
          <Card className="shadow-soft">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Accès rapides</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {canViewCentral && (
                <Link to="/app/inventory/central" className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-secondary/60 transition-colors">
                  <Layers className="h-4 w-4 text-muted-foreground" /> Stock central
                </Link>
              )}
              <Link to="/app/inventory/boutiques" className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-secondary/60 transition-colors">
                <Store className="h-4 w-4 text-muted-foreground" /> Stock boutiques
              </Link>
              <Link to="/app/inventory/movements" className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-secondary/60 transition-colors">
                <ArrowLeftRight className="h-4 w-4 text-muted-foreground" /> Mouvements
              </Link>
              <Link to="/app/inventory/adjustments" search={{ product_id: undefined }} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-secondary/60 transition-colors">
                <ClipboardList className="h-4 w-4 text-muted-foreground" /> Ajustements
              </Link>
            </CardContent>
          </Card>

          {/* Derniers mouvements */}
          <Card className="shadow-soft">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Derniers mouvements</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {movements.slice(0, 5).map((m) => {
                const p = productMap[m.product_id];
                const isIn = m.movement_type === "IN";
                return (
                  <div key={m.id} className="flex items-center justify-between text-xs">
                    <span className="truncate text-muted-foreground">
                      {p?.name ?? `#${m.product_id}`}
                      <span className="ml-1 text-muted-foreground/50">
                        {MOVE_LABEL[m.movement_type] ?? m.movement_type}
                      </span>
                    </span>
                    <span
                      className={`ml-2 shrink-0 font-semibold ${
                        isIn ? "text-success" : m.movement_type === "OUT" ? "text-destructive" : "text-muted-foreground"
                      }`}
                    >
                      {isIn ? "+" : m.movement_type === "OUT" ? "-" : "~"}{m.quantity}
                    </span>
                  </div>
                );
              })}
              {movements.length === 0 && (
                <p className="text-xs text-muted-foreground">Aucun mouvement récent.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {adjusting && (
        <AdjustStockDialog
          stock={adjusting}
          productName={productMap[adjusting.product_id]?.name ?? `Produit #${adjusting.product_id}`}
          locationName={getLocationLabel(adjusting.location_id)}
          onClose={() => setAdjusting(null)}
        />
      )}
    </>
  );
}
