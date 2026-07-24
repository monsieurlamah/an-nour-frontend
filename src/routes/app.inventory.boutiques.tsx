import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { productParam } from "@/lib/entity-paths";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TableSkeleton, ApiErrorState } from "@/components/primitives";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Store } from "lucide-react";
import { stockApi, catalogApi, storesApi, qk } from "@/lib/api";
import { AdjustStockDialog } from "@/components/inventory/adjust-stock-dialog";
import type { StockLocationRead, ProductStockRead } from "@/lib/types";

export const Route = createFileRoute("/app/inventory/boutiques")({
  component: Page,
  validateSearch: (search: Record<string, unknown>): { status?: "out" | "low" } =>
    search.status === "out" || search.status === "low" ? { status: search.status } : {},
});

function Page() {
  const { status } = useSearch({ from: "/app/inventory/boutiques" });
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "low" | "out">(status ?? "all");
  const [adjusting, setAdjusting] = useState<ProductStockRead | null>(null);

  const { data: locations = [] } = useQuery({
    queryKey: qk.stock.locations(),
    queryFn: () => stockApi.listLocations({ limit: 200 }),
  });

  const storeLocations: StockLocationRead[] = locations.filter((l) => l.type === "STORE");

  const {
    data: allProductStocks = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: qk.stock.productStocks(),
    queryFn: () => stockApi.listProductStocks({ limit: 500 }),
  });

  const boutiqueStocks = allProductStocks.filter((s) =>
    storeLocations.some((l) => l.id === s.location_id),
  );

  const { data: products = [] } = useQuery({
    queryKey: qk.catalog.products(),
    queryFn: () => catalogApi.listProducts({ limit: 500 }),
  });

  const { data: stores = [] } = useQuery({
    queryKey: qk.stores.list(),
    queryFn: () => storesApi.list({ limit: 200 }),
  });

  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
  const locationMap = Object.fromEntries(locations.map((l) => [l.id, l]));
  const storeMap = Object.fromEntries(stores.map((s) => [s.id, s.name]));

  const getLocationLabel = (loc: StockLocationRead) =>
    loc.store_id ? (storeMap[loc.store_id] ?? loc.name) : loc.name;

  const filtered = boutiqueStocks.filter((s) => {
    const p = productMap[s.product_id];
    const loc = locationMap[s.location_id];
    const q = search.toLowerCase();
    const matchQ =
      !q ||
      (p?.name ?? "").toLowerCase().includes(q) ||
      (loc?.name ?? "").toLowerCase().includes(q);
    const matchLoc = locationFilter === "all" || String(s.location_id) === locationFilter;
    const isOut = s.quantity === 0;
    const isLow = !isOut && s.alert_threshold > 0 && s.quantity <= s.alert_threshold;
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "low" && isLow) ||
      (statusFilter === "out" && isOut);
    return matchQ && matchLoc && matchStatus;
  });

  // Summary chips per store location
  const locationGroups = storeLocations.map((loc) => {
    const lines = boutiqueStocks.filter((s) => s.location_id === loc.id);
    const lowCount = lines.filter(
      (s) => s.alert_threshold > 0 && s.quantity <= s.alert_threshold,
    ).length;
    return { ...loc, lineCount: lines.length, lowCount };
  }).filter((g) => g.lineCount > 0);

  return (
    <>
      {/* Location summary chips */}
      {locationGroups.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            onClick={() => setLocationFilter("all")}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              locationFilter === "all"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background hover:bg-secondary"
            }`}
          >
            Toutes les boutiques
          </button>
          {locationGroups.map((loc) => (
            <button
              key={loc.id}
              onClick={() => setLocationFilter(String(loc.id))}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                locationFilter === String(loc.id)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background hover:bg-secondary"
              }`}
            >
              <Store className="h-3 w-3" />
              {getLocationLabel(loc)}
              {loc.lowCount > 0 && (
                <span className="rounded-full bg-warning px-1 text-[10px] text-white">
                  {loc.lowCount}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <Card className="shadow-soft">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher produit ou boutique…"
              className="h-9 pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
          >
            <SelectTrigger className="h-9 w-36">
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
              <TableHead>Boutique</TableHead>
              <TableHead>Produit</TableHead>
              <TableHead className="text-right">Quantité</TableHead>
              <TableHead className="text-right">Seuil alerte</TableHead>
              <TableHead>État</TableHead>
              <TableHead className="w-24 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton cols={6} />
            ) : error ? (
              <tr>
                <td colSpan={6}><ApiErrorState error={error} onRetry={refetch} /></td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="flex flex-col items-center gap-3 py-14 text-center">
                    <Store className="h-10 w-10 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      {search || locationFilter !== "all" || statusFilter !== "all"
                        ? "Aucun résultat"
                        : "Aucun stock boutique enregistré"}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((s) => {
                const p = productMap[s.product_id];
                const loc = locationMap[s.location_id];
                const isOut = s.quantity === 0;
                const isLow = !isOut && s.alert_threshold > 0 && s.quantity <= s.alert_threshold;
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium text-sm">
                      {loc ? getLocationLabel(loc) : `Emplacement #${s.location_id}`}
                    </TableCell>
                    <TableCell>
                      <Link
                        to={p ? "/app/products/$slug" : "/app/products"}
                        params={p ? { slug: productParam(p) } : {}}
                        className="hover:text-primary"
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

        <div className="border-t p-3 text-xs text-muted-foreground">
          {filtered.length} / {boutiqueStocks.length} ligne{boutiqueStocks.length !== 1 ? "s" : ""}
        </div>
      </Card>

      {adjusting && (
        <AdjustStockDialog
          stock={adjusting}
          productName={productMap[adjusting.product_id]?.name ?? `Produit #${adjusting.product_id}`}
          locationName={
            locationMap[adjusting.location_id]
              ? getLocationLabel(locationMap[adjusting.location_id])
              : undefined
          }
          onClose={() => setAdjusting(null)}
        />
      )}
    </>
  );
}
