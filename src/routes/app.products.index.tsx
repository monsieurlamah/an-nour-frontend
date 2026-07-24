import { createFileRoute, Link } from "@tanstack/react-router";
import { productParam } from "@/lib/entity-paths";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge, TableSkeleton, ApiErrorState } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, Download, Package, ArrowRight } from "lucide-react";
import { catalogApi, qk } from "@/lib/api";
import { fmtXAF } from "@/lib/mock-data";
import { useT } from "@/lib/i18n";
import { useWorkContext } from "@/lib/work-context";

export const Route = createFileRoute("/app/products/")({ component: Page });

function Page() {
  const { t } = useT();
  const { has } = useWorkContext();
  const canManage = has("products.manage");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: products = [], isLoading, error, refetch } = useQuery({
    queryKey: qk.catalog.products(),
    queryFn: () => catalogApi.listProducts({ limit: 500 }),
  });

  const { data: categories = [] } = useQuery({
    queryKey: qk.catalog.productCategories,
    queryFn: () => catalogApi.listProductCategories(),
  });

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    const matchQ = !q || p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q);
    const matchCat = categoryFilter === "all" || String(p.category_product_id) === categoryFilter;
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && p.status === "active") ||
      (statusFilter === "inactive" && p.status !== "active");
    return matchQ && matchCat && matchStatus;
  });

  // Stock data lives in product_stocks (per location), not on ProductRead.
  // This page only loads catalog data, so the low-stock banner is omitted.
  const lowStock: typeof filtered = [];

  return (
    <>
      <PageHeader
        title={t("products.title") as string}
        description={t("products.subtitle") as string}
        actions={
          <>
            <Button variant="outline" size="sm">
              <Download className="mr-1.5 h-3.5 w-3.5" /> {t("common.export") as string}
            </Button>
            {canManage && (
              <Button size="sm" asChild>
                <Link to="/app/products/new">
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> {t("products.new") as string}
                </Link>
              </Button>
            )}
          </>
        }
      />

      {lowStock.length > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 px-4 py-2.5 text-sm text-warning-foreground">
          <span className="font-medium">{lowStock.length} produit{lowStock.length > 1 ? "s" : ""} en stock bas</span>
          <span className="text-muted-foreground">· en dessous du seuil d'alerte</span>
        </div>
      )}

      <Card className="shadow-soft">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("common.searchShort") as string}
              className="h-9 pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 w-44">
              <SelectValue placeholder={t("common.category") as string} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all") as string} · {t("common.category") as string}</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all") as string}</SelectItem>
              <SelectItem value="active">{t("status.active") as string}</SelectItem>
              <SelectItem value="inactive">{t("status.inactive") as string}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/40">
              <TableHead className="w-8"><Checkbox /></TableHead>
              <TableHead>{t("products.col.name") as string}</TableHead>
              <TableHead>{t("products.col.category") as string}</TableHead>
              <TableHead className="text-right">{t("products.detail.purchase") as string}</TableHead>
              <TableHead className="text-right">{t("products.col.price") as string}</TableHead>
              <TableHead className="text-right">{t("products.col.stock") as string}</TableHead>
              <TableHead>{t("products.col.status") as string}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton cols={7} />
            ) : error ? (
              <tr>
                <td colSpan={7}>
                  <ApiErrorState error={error} onRetry={refetch} />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="flex flex-col items-center gap-3 py-16 text-center">
                    <Package className="h-10 w-10 text-muted-foreground/30" />
                    {search || categoryFilter !== "all" || statusFilter !== "all" ? (
                      <p className="text-sm text-muted-foreground">{t("common.empty") as string}</p>
                    ) : (
                      <>
                        <p className="text-sm font-medium">Aucun produit dans le catalogue</p>
                        <p className="text-xs text-muted-foreground">
                          {canManage
                            ? "Commencez par ajouter votre premier produit."
                            : "Aucun produit n'a encore été ajouté par le Boss."}
                        </p>
                        {canManage && (
                          <Button size="sm" asChild className="mt-1">
                            <Link to="/app/products/new">
                              <Plus className="mr-1.5 h-3.5 w-3.5" /> Nouveau produit
                              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.id} className="group">
                  <TableCell><Checkbox /></TableCell>
                  <TableCell>
                    <Link
                      to="/app/products/$slug"
                      params={{ slug: productParam(p) }}
                      className="flex items-center gap-2.5"
                    >
                      {p.images?.[0] ? (
                        <img
                          src={p.images[0]}
                          alt={p.name}
                          className="h-9 w-9 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground">
                          <Package className="h-4 w-4" />
                        </div>
                      )}
                      <div>
                        <div className="font-medium group-hover:text-primary">{p.name}</div>
                        {p.description && (
                          <div className="max-w-[200px] truncate text-xs text-muted-foreground">
                            {p.description}
                          </div>
                        )}
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">
                    {p.category_product_id ? (categoryMap[p.category_product_id] ?? "") : ""}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {fmtXAF(Number(p.prix_achat))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {fmtXAF(Number(p.prix_vente))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    N/A
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={p.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between border-t p-3 text-xs text-muted-foreground">
          <span>
            {filtered.length} / {products.length} produit{products.length !== 1 ? "s" : ""}
          </span>
        </div>
      </Card>
    </>
  );
}
