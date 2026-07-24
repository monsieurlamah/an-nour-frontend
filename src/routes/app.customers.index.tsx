import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { TableSkeleton, ApiErrorState } from "@/components/primitives";
import { ClientFormDialog } from "@/components/customers/client-form-dialog";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Users, MoreHorizontal, Loader2 } from "lucide-react";
import { clientsApi, qk } from "@/lib/api";
import { useT, formatDate } from "@/lib/i18n";
import { useWorkContext, canViewHQ } from "@/lib/work-context";
import type { ClientRead } from "@/lib/types";
import { toast } from "sonner";

export const Route = createFileRoute("/app/customers/")({ component: Page });

function initials(name: string) {
  return name
    .split(" ")
    .map((x) => x[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function fullName(c: ClientRead) {
  return c.prenom ? `${c.name} ${c.prenom}` : c.name;
}

function Page() {
  const { t, lang } = useT();
  const { has, isSuperAdmin, authorizedStores } = useWorkContext();
  const isHQCapable = canViewHQ(isSuperAdmin, has);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [boutiqueFilter, setBoutiqueFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editClient, setEditClient] = useState<ClientRead | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClientRead | null>(null);

  const storeId = isHQCapable
    ? (boutiqueFilter === "all" ? undefined : Number(boutiqueFilter))
    : undefined;

  const { data: clients = [], isLoading, error, refetch } = useQuery({
    queryKey: qk.clients.list({ store_id: storeId }),
    queryFn: () => clientsApi.list({ limit: 500, store_id: storeId }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => clientsApi.delete(id),
    onSuccess: () => {
      toast.success(t("customers.deleted") as string);
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    return (
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.prenom ?? "").toLowerCase().includes(q) ||
      c.code_client.toLowerCase().includes(q) ||
      (c.phone ?? "").includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.ville ?? "").toLowerCase().includes(q) ||
      (c.address ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <>
      <PageHeader
        title={t("customers.title") as string}
        description={t("customers.subtitle") as string}
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> {t("customers.new") as string}
          </Button>
        }
      />

      <Card className="shadow-soft">
        <div className="flex items-center gap-2 border-b p-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("common.searchShort") as string}
              className="h-9 pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {isHQCapable && (
            <Select value={boutiqueFilter} onValueChange={setBoutiqueFilter}>
              <SelectTrigger className="h-9 w-48 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les boutiques</SelectItem>
                {authorizedStores.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/40">
                <TableHead>{t("customers.col.code") as string}</TableHead>
                <TableHead>{t("customers.col.name") as string}</TableHead>
                {isHQCapable && <TableHead>Boutique</TableHead>}
                <TableHead>{t("customers.col.phone") as string}</TableHead>
                <TableHead>{t("customers.col.email") as string}</TableHead>
                <TableHead>{t("customers.col.city") as string}</TableHead>
                <TableHead>{t("common.address") as string}</TableHead>
                <TableHead>{t("customers.col.type") as string}</TableHead>
                <TableHead>{t("common.date") as string}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton cols={isHQCapable ? 10 : 9} />
              ) : error ? (
                <tr>
                  <td colSpan={isHQCapable ? 10 : 9}>
                    <ApiErrorState error={error} onRetry={refetch} />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={isHQCapable ? 10 : 9}>
                    <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
                      <Users className="h-8 w-8 opacity-30" />
                      <span>{t("common.empty") as string}</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <TableRow key={c.id} className="group">
                    <TableCell className="text-xs text-muted-foreground">{c.code_client}</TableCell>
                    <TableCell>
                      <Link
                        to="/app/customers/$id"
                        params={{ id: String(c.id) }}
                        className="flex items-center gap-2.5"
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-[11px]">{initials(fullName(c))}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium group-hover:text-primary">
                            {fullName(c)}
                          </div>
                        </div>
                      </Link>
                    </TableCell>
                    {isHQCapable && (
                      <TableCell className="max-w-[140px] truncate text-sm text-muted-foreground">
                        {c.store_name ?? (c.store_id ? `Boutique #${c.store_id}` : "—")}
                      </TableCell>
                    )}
                    <TableCell className="text-sm">{c.phone ?? ""}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.email ?? ""}</TableCell>
                    <TableCell className="text-sm">{c.ville ?? ""}</TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                      {c.address ?? ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {c.type_client === "entreprise"
                          ? (t("customers.type.entreprise") as string)
                          : (t("customers.type.particulier") as string)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(c.created_at, lang)}
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
                            <Link to="/app/customers/$id" params={{ id: String(c.id) }}>
                              {t("common.viewDetails") as string}
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditClient(c)}>
                            {t("common.edit") as string}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeleteTarget(c)}
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
            {filtered.length} / {clients.length} client{clients.length !== 1 ? "s" : ""}
          </span>
        </div>
      </Card>

      <ClientFormDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      {editClient !== null && (
        <ClientFormDialog client={editClient} open onClose={() => setEditClient(null)} />
      )}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("customers.delete.title") as string}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <strong>{fullName(deleteTarget)}</strong> ({deleteTarget.code_client}).{" "}
                </>
              )}
              {t("customers.delete.description") as string}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel") as string}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              {deleteMutation.isPending
                ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> {t("common.delete") as string}…</>
                : (t("common.delete") as string)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
