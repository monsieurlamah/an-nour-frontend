import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { productParam } from "@/lib/entity-paths";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TableSkeleton, ApiErrorState } from "@/components/primitives";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, AlertTriangle, Package, Lock } from "lucide-react";
import { stockApi, catalogApi, qk } from "@/lib/api";
import { fmtXAF } from "@/lib/mock-data";
import { AdjustStockDialog } from "@/components/inventory/adjust-stock-dialog";
import { useWorkContext, canViewHQ } from "@/lib/work-context";
import type { ProductStockRead } from "@/lib/types";

export const Route = createFileRoute("/app/inventory/central")({
  component: Page,
  validateSearch: (search: Record<string, unknown>): { status?: "out" | "low" } =>
    search.status === "out" || search.status === "low" ? { status: search.status } : {},
});

/* ── Page ─────────────────────────────────────────────────────────────────── */
function Page() {
  const { isSuperAdmin, has } = useWorkContext();
  const canView = canViewHQ(isSuperAdmin, has);
  const { status } = useSearch({ from: "/app/inventory/central" });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "out">(status ?? "all");
  const [adjusting, setAdjusting] = useState<ProductStockRead | null>(null);

  // Fetch the CENTRAL location first, then its product_stocks
  const { data: locations = [] } = useQuery({
    queryKey: qk.stock.locations(),
    queryFn: () => stockApi.listLocations({ limit: 200 }),
  });
  const centralLocation = locations.find((l) => l.type === "CENTRAL");

  const {
    data: centralStocks = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: qk.stock.productStocks({ location_id: centralLocation?.id }),
    queryFn: () => stockApi.listProductStocks({ location_id: centralLocation!.id, limit: 500 }),
    enabled: !!centralLocation,
  });

  const { data: products = [] } = useQuery({
    queryKey: qk.catalog.products(),
    queryFn: () => catalogApi.listProducts({ limit: 500 }),
  });

  const { data: categories = [] } = useQuery({
    queryKey: qk.catalog.productCategories,
    queryFn: () => catalogApi.listProductCategories(),
  });

  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  const filtered = centralStocks.filter((s) => {
    const p = productMap[s.product_id];
    const q = search.toLowerCase();
    const matchQ = !q || (p?.name ?? "").toLowerCase().includes(q);
    const matchFilter =
      filter === "all" ||
      (filter === "low" && s.alert_threshold > 0 && s.quantity <= s.alert_threshold && s.quantity > 0) ||
      (filter === "out" && s.quantity === 0);
    return matchQ && matchFilter;
  });

  const lowCount = centralStocks.filter(
    (s) => s.alert_threshold > 0 && s.quantity <= s.alert_threshold,
  ).length;

  if (!canView) {
    return (
      <Card className="flex flex-col items-center gap-3 p-10 text-center shadow-soft">
        <Lock className="h-8 w-8 text-muted-foreground" />
        <div>
          <p className="font-medium">Accès réservé</p>
          <p className="text-sm text-muted-foreground">
            Le stock central est réservé au Boss — vous ne voyez que le stock de votre boutique.
          </p>
        </div>
        <Link to="/app/inventory/boutiques" className="text-sm text-primary hover:underline">
          Voir le stock de ma boutique →
        </Link>
      </Card>
    );
  }

  return (
    <>
      {lowCount > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-4 py-2.5 text-sm text-warning-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            <strong>{lowCount}</strong> produit{lowCount > 1 ? "s" : ""} sous le seuil d'alerte :{" "}
            <button className="underline underline-offset-2" onClick={() => setFilter("low")}>
              voir uniquement ceux-ci
            </button>
          </span>
        </div>
      )}

      <Card className="shadow-soft">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher un produit…"
              className="h-9 pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="low">Stock bas</SelectItem>
              <SelectItem value="out">Rupture</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/40">
              <TableHead>Produit</TableHead>
              <TableHead>Catégorie</TableHead>
              <TableHead className="text-right">Prix achat</TableHead>
              <TableHead className="text-right">Quantité</TableHead>
              <TableHead className="text-right">Seuil alerte</TableHead>
              <TableHead>État</TableHead>
              <TableHead className="w-24 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading || (!centralLocation && locations.length === 0) ? (
              <TableSkeleton cols={7} />
            ) : error ? (
              <tr>
                <td colSpan={7}><ApiErrorState error={error} onRetry={refetch} /></td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="flex flex-col items-center gap-3 py-14 text-center">
                    <Package className="h-10 w-10 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      {search || filter !== "all" ? "Aucun résultat" : "Aucun stock central enregistré"}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((s) => {
                const p = productMap[s.product_id];
                const isOut = s.quantity === 0;
                const isLow = !isOut && s.alert_threshold > 0 && s.quantity <= s.alert_threshold;
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
                    <TableCell className="text-sm text-muted-foreground">
                      {p ? (catMap[p.category_product_id ?? 0] ?? "") : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground text-sm">
                      {p ? fmtXAF(p.prix_achat) : ""}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums font-semibold ${isOut ? "text-destructive" : isLow ? "text-warning" : ""}`}
                    >
                      {s.quantity}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {s.alert_threshold}
                    </TableCell>
                    <TableCell>
                      {isOut ? (
                        <Badge variant="destructive" className="text-[10px]">Rupture</Badge>
                      ) : isLow ? (
                        <Badge className="bg-warning/15 text-warning hover:bg-warning/20 border-0 text-[10px]">
                          Stock bas
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Normal</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setAdjusting(s)}
                      >
                        Ajuster
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
            {filtered.length} / {centralStocks.length} ligne{centralStocks.length !== 1 ? "s" : ""}
          </span>
        </div>
      </Card>

      {adjusting && (
        <AdjustStockDialog
          stock={adjusting}
          productName={productMap[adjusting.product_id]?.name ?? `Produit #${adjusting.product_id}`}
          onClose={() => setAdjusting(null)}
        />
      )}
    </>
  );
}
