import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge, TableSkeleton, ApiErrorState } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Download, Plus, Search, MoreHorizontal, Store } from "lucide-react";
import { storesApi, qk } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useWorkContext, canViewHQ } from "@/lib/work-context";

export const Route = createFileRoute("/app/stores/")({ component: Page });

function Page() {
  const { t } = useT();
  const { isSuperAdmin, has, authorizedStores } = useWorkContext();
  // A network-wide list belongs to HQ-capable roles only — a store-scoped
  // gérant has `stores.view` merely to see their own store's profile page,
  // not to browse every boutique in the network (see authorizedStores, which
  // already applies this exact scoping rule).
  const canView = canViewHQ(isSuperAdmin, has);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: allStores = [], isLoading, error, refetch } = useQuery({
    queryKey: qk.stores.list(),
    queryFn: () => storesApi.list({ limit: 200 }),
  });
  const stores = canView ? allStores : authorizedStores;

  const filtered = stores.filter((s) => {
    const q = search.toLowerCase();
    const matchQ = !q || s.name.toLowerCase().includes(q) || (s.address ?? "").toLowerCase().includes(q);
    const matchStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && s.status === "active") ||
      (statusFilter === "inactive" && s.status !== "active");
    return matchQ && matchStatus;
  });

  return (
    <>
      <PageHeader
        title={t("stores.title") as string}
        description={t("stores.subtitle") as string}
        actions={
          canView ? (
            <>
              <Button variant="outline" size="sm">
                <Download className="mr-1.5 h-3.5 w-3.5" /> {t("common.export") as string}
              </Button>
              <Button size="sm" asChild>
                <Link to="/app/stores/new">
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> {t("stores.new") as string}
                </Link>
              </Button>
            </>
          ) : undefined
        }
      />

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
              <TableHead>{t("stores.col.name") as string}</TableHead>
              <TableHead>{t("common.description") as string}</TableHead>
              <TableHead>Devise</TableHead>
              <TableHead>{t("stores.col.status") as string}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton cols={5} />
            ) : error ? (
              <tr>
                <td colSpan={5}>
                  <ApiErrorState error={error} onRetry={refetch} />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
                    <Store className="h-8 w-8 opacity-30" />
                    <span>Aucune boutique trouvée</span>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <TableRow key={s.id} className="group">
                  <TableCell>
                    <Link to="/app/stores/$id" params={{ id: String(s.id) }} className="block">
                      <div className="font-medium group-hover:text-primary">{s.name}</div>
                      {s.address && (
                        <div className="text-xs text-muted-foreground">{s.address}</div>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                    {s.description ?? ""}
                  </TableCell>
                  <TableCell className="text-sm font-mono">{s.devise}</TableCell>
                  <TableCell>
                    <StatusBadge status={s.status} />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to="/app/stores/$id" params={{ id: String(s.id) }}>
                            {t("common.viewDetails") as string}
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem>{t("common.edit") as string}</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">
                          {t("status.inactive") as string}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between border-t p-3 text-xs text-muted-foreground">
          <span>
            {filtered.length} / {stores.length} boutique{stores.length !== 1 ? "s" : ""}
          </span>
        </div>
      </Card>
    </>
  );
}
