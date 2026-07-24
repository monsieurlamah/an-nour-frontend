import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { KpiCard, StatusBadge, TableSkeleton, ApiErrorState } from "@/components/primitives";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Download, Plus, Search, MoreHorizontal, Truck, Users, Loader2 } from "lucide-react";
import { achatsApi, qk } from "@/lib/api";
import { useT, formatDate } from "@/lib/i18n";
import { ApiError } from "@/lib/api-client";
import { toast } from "sonner";
import type { RecordStatus, SupplierRead } from "@/lib/types";

export const Route = createFileRoute("/app/suppliers/")({ component: Page });

function Page() {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RecordStatus>("all");
  const [deleteTarget, setDeleteTarget] = useState<SupplierRead | null>(null);

  const { data: suppliers = [], isLoading, error, refetch } = useQuery({
    queryKey: qk.suppliers.list(),
    queryFn: () => achatsApi.listSuppliers({ limit: 500 }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["suppliers"] });

  const toggleStatusMutation = useMutation({
    mutationFn: (s: SupplierRead) =>
      achatsApi.updateSupplier(s.id, { status: s.status === "active" ? "inactive" : "active" }),
    onSuccess: () => { toast.success(t("suppliers.updated") as string); invalidate(); },
    onError: (err) => toast.error(err instanceof ApiError ? err.detail : "Erreur"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => achatsApi.deleteSupplier(id),
    onSuccess: () => { toast.success(t("suppliers.deleted") as string); invalidate(); setDeleteTarget(null); },
    onError: (err) => toast.error(err instanceof ApiError ? err.detail : "Erreur"),
  });

  const filtered = suppliers.filter((s) => {
    const q = search.toLowerCase();
    const matchQ =
      !q ||
      s.name.toLowerCase().includes(q) ||
      (s.email ?? "").toLowerCase().includes(q) ||
      (s.phone ?? "").includes(q) ||
      (s.address ?? "").toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || s.status === statusFilter;
    return matchQ && matchStatus;
  });

  const activeCount = suppliers.filter((s) => s.status === "active").length;

  return (
    <>
      <PageHeader
        title={t("suppliers.title") as string}
        description={t("suppliers.subtitle") as string}
        actions={
          <>
            <Button variant="outline" size="sm">
              <Download className="mr-1.5 h-3.5 w-3.5" /> {t("common.export") as string}
            </Button>
            <Button size="sm" asChild>
              <Link to="/app/suppliers/new">
                <Plus className="mr-1.5 h-3.5 w-3.5" /> {t("suppliers.new") as string}
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          label={t("suppliers.kpi.total") as string}
          value={activeCount}
          tone="primary"
          icon={<Truck className="h-5 w-5" />}
          hint={`${suppliers.length} ${t("common.total") as string}`}
        />
        <KpiCard
          label={t("status.inactive") as string}
          value={suppliers.filter((s) => s.status === "inactive").length}
          tone="warning"
          icon={<Users className="h-5 w-5" />}
        />
      </div>

      <Card className="mt-6 shadow-soft">
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
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
          >
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

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/40">
                <TableHead>{t("suppliers.col.name") as string}</TableHead>
                <TableHead>{t("suppliers.col.contact") as string}</TableHead>
                <TableHead>{t("common.address") as string}</TableHead>
                <TableHead>{t("suppliers.col.status") as string}</TableHead>
                <TableHead>{t("common.date") as string}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton cols={6} />
              ) : error ? (
                <tr>
                  <td colSpan={6}>
                    <ApiErrorState error={error} onRetry={refetch} />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
                      <Truck className="h-8 w-8 opacity-30" />
                      <span>{t("common.empty") as string}</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <TableRow key={s.id} className="group">
                    <TableCell>
                      <Link
                        to="/app/suppliers/$id"
                        params={{ id: String(s.id) }}
                        className="block"
                      >
                        <div className="font-medium group-hover:text-primary">{s.name}</div>
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {s.email && <div className="text-xs text-muted-foreground">{s.email}</div>}
                      {s.phone ?? ""}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                      {s.address ?? ""}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={s.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(s.created_at, lang)}
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
                            <Link to="/app/suppliers/$id" params={{ id: String(s.id) }}>
                              {t("common.viewDetails") as string}
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleStatusMutation.mutate(s)}>
                            {s.status === "active"
                              ? (t("status.inactive") as string)
                              : (t("status.active") as string)}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeleteTarget(s)}
                          >
                            {t("common.delete") as string}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between border-t p-3 text-xs text-muted-foreground">
          <span>
            {filtered.length} / {suppliers.length} fournisseur{suppliers.length !== 1 ? "s" : ""}
          </span>
        </div>
      </Card>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("suppliers.delete.title") as string}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && <strong>{deleteTarget.name}</strong>} {t("suppliers.delete.description") as string}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel") as string}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : (t("common.delete") as string)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
