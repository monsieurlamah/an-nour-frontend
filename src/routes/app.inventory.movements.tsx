import { createFileRoute, Link } from "@tanstack/react-router";
import { productParam } from "@/lib/entity-paths";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TableSkeleton, ApiErrorState } from "@/components/primitives";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, SlidersHorizontal } from "lucide-react";
import { stockApi, catalogApi, usersApi, qk } from "@/lib/api";
import { useT, formatDateTime } from "@/lib/i18n";
import type { MovementType, MovementReason } from "@/lib/types";

export const Route = createFileRoute("/app/inventory/movements")({ component: Page });

const MOVEMENT_CONFIG: Record<
  MovementType,
  { label: string; icon: typeof ArrowDownToLine; cls: string }
> = {
  IN: {
    label: "Entrée",
    icon: ArrowDownToLine,
    cls: "text-success bg-success/10",
  },
  OUT: {
    label: "Sortie",
    icon: ArrowUpFromLine,
    cls: "text-destructive bg-destructive/10",
  },
  TRANSFER: {
    label: "Transfert",
    icon: ArrowLeftRight,
    cls: "text-blue-600 bg-blue-50",
  },
  ADJUSTMENT: {
    label: "Ajustement",
    icon: SlidersHorizontal,
    cls: "text-warning bg-warning/10",
  },
};

const REASON_LABEL: Record<MovementReason, string> = {
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
  const { lang } = useT();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | MovementType>("all");

  const {
    data: movements = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: qk.stock.movements({
      movement_type: typeFilter !== "all" ? typeFilter : undefined,
    }),
    queryFn: () =>
      stockApi.listMovements({
        limit: 500,
        movement_type: typeFilter !== "all" ? typeFilter : undefined,
      }),
  });

  const { data: products = [] } = useQuery({
    queryKey: qk.catalog.products(),
    queryFn: () => catalogApi.listProducts({ limit: 500 }),
  });

  const { data: locations = [] } = useQuery({
    queryKey: qk.stock.locations(),
    queryFn: () => stockApi.listLocations({ limit: 200 }),
  });

  const { data: users = [] } = useQuery({
    queryKey: qk.users.list(),
    queryFn: () => usersApi.list({ limit: 200 }),
  });

  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
  const locationMap = Object.fromEntries(locations.map((l) => [l.id, l.name]));
  const userMap = Object.fromEntries(users.map((u) => [u.id, `${u.firstname} ${u.lastname}`]));

  const filtered = movements.filter((m) => {
    const q = search.toLowerCase();
    const pName = productMap[m.product_id]?.name ?? "";
    const fromName = m.from_location_id ? (locationMap[m.from_location_id] ?? "") : "";
    const toName = m.to_location_id ? (locationMap[m.to_location_id] ?? "") : "";
    return !q || pName.toLowerCase().includes(q) || fromName.toLowerCase().includes(q) || toName.toLowerCase().includes(q);
  });

  const locationLabel = (id: number | null | undefined): string => {
    if (!id) return "";
    return locationMap[id] ?? `#${id}`;
  };

  return (
    <Card className="shadow-soft">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher produit ou emplacement…"
            className="h-9 pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={typeFilter}
          onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}
        >
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Tous les types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            {(Object.keys(MOVEMENT_CONFIG) as MovementType[]).map((type) => (
              <SelectItem key={type} value={type}>
                {MOVEMENT_CONFIG[type].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="bg-secondary/40">
            <TableHead>Type</TableHead>
            <TableHead>Produit</TableHead>
            <TableHead>De</TableHead>
            <TableHead>Vers</TableHead>
            <TableHead>Motif</TableHead>
            <TableHead className="text-right">Avant</TableHead>
            <TableHead className="text-right">Qté</TableHead>
            <TableHead className="text-right">Après</TableHead>
            <TableHead>Par</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableSkeleton cols={10} />
          ) : error ? (
            <tr>
              <td colSpan={10}>
                <ApiErrorState error={error} onRetry={refetch} />
              </td>
            </tr>
          ) : filtered.length === 0 ? (
            <tr>
              <td colSpan={10}>
                <div className="py-14 text-center text-sm text-muted-foreground">
                  {search || typeFilter !== "all"
                    ? "Aucun résultat"
                    : "Aucun mouvement enregistré"}
                </div>
              </td>
            </tr>
          ) : (
            filtered.map((m) => {
              const cfg = MOVEMENT_CONFIG[m.movement_type] ?? {
                label: m.movement_type,
                icon: SlidersHorizontal,
                cls: "text-muted-foreground bg-secondary",
              };
              const Icon = cfg.icon;
              const p = productMap[m.product_id];
              const isOut = m.movement_type === "OUT";
              const isIn = m.movement_type === "IN";

              return (
                <TableRow key={m.id}>
                  <TableCell>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.cls}`}
                    >
                      <Icon className="h-3 w-3" />
                      {cfg.label}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Link
                      to={p ? "/app/products/$slug" : "/app/products"}
                      params={p ? { slug: productParam(p) } : {}}
                      className="font-medium hover:text-primary"
                    >
                      {p?.name ?? `Produit #${m.product_id}`}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {locationLabel(m.from_location_id)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {locationLabel(m.to_location_id)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {m.reason ? (REASON_LABEL[m.reason] ?? m.reason) : ""}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {m.quantity_before}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums font-semibold ${
                      isOut
                        ? "text-destructive"
                        : isIn
                          ? "text-success"
                          : "text-muted-foreground"
                    }`}
                  >
                    {isOut ? `-${m.quantity}` : isIn ? `+${m.quantity}` : `~${m.quantity}`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {m.quantity_after}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {m.created_by ? (userMap[m.created_by] ?? `#${m.created_by}`) : "Système"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDateTime(m.created_at, lang)}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <div className="border-t p-3 text-xs text-muted-foreground">
        {filtered.length} mouvement{filtered.length !== 1 ? "s" : ""}
      </div>
    </Card>
  );
}
