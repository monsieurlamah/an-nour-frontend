import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { ApiErrorState, TableSkeleton } from "@/components/primitives";
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
import { Search, ScrollText } from "lucide-react";
import { activityLogsApi, storesApi, qk } from "@/lib/api";
import { formatDateTime, useT } from "@/lib/i18n";
import { useWorkContext, canViewHQ } from "@/lib/work-context";

export const Route = createFileRoute("/app/logs")({ component: Page });

// Cahier des charges §14 — "Les journaux sont non modifiables (append-only)
// et consultables avec filtres (boutique, utilisateur, période, type
// d'action) par le propriétaire ; chaque gérant ne consulte que le journal
// de sa propre boutique." The store filter is only offered to an HQ-capable
// viewer — the backend force-narrows a store-scoped caller to their own
// boutique(s) regardless of what's requested, so showing the control to
// them would be misleading.

const MODULES = ["ventes", "commandes", "transferts", "creances", "cash", "stores", "users"];

function Page() {
  const { lang } = useT();
  const { isSuperAdmin, has, store } = useWorkContext();
  const canView = canViewHQ(isSuperAdmin, has);

  const [search, setSearch] = useState("");
  const [module, setModule] = useState<string>("all");
  const [boutiqueId, setBoutiqueId] = useState<string>("all");

  const { data: stores = [] } = useQuery({
    queryKey: qk.stores.list(),
    queryFn: () => storesApi.list({ limit: 200 }),
    enabled: canView,
  });
  const storeName = Object.fromEntries(stores.map((s) => [s.id, s.name]));

  const {
    data: logs = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: qk.activityLogs.list({ module: module !== "all" ? module : undefined, boutiqueId }),
    queryFn: () =>
      activityLogsApi.list({
        limit: 300,
        module: module !== "all" ? module : undefined,
        boutique_id:
          canView && boutiqueId !== "all"
            ? Number(boutiqueId)
            : !canView && store
              ? store.id
              : undefined,
      }),
  });

  const filtered = logs.filter((l) => {
    const q = search.trim().toLowerCase();
    return (
      !q || l.action.toLowerCase().includes(q) || (l.user_name ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <>
      <PageHeader
        title="Journal d'activité"
        description={
          canView
            ? "Toute action significative du réseau — traçabilité complète, non modifiable."
            : "Le journal des actions de votre boutique."
        }
      />

      <Card className="shadow-soft">
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher une action ou un utilisateur…"
              className="h-9 pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={module} onValueChange={setModule}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les modules</SelectItem>
              {MODULES.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canView && (
            <Select value={boutiqueId} onValueChange={setBoutiqueId}>
              <SelectTrigger className="h-9 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les boutiques</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/40">
              <TableHead>Date</TableHead>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Module</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Boutique</TableHead>
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
                    <ScrollText className="h-8 w-8 opacity-30" />
                    <span>Aucune entrée</span>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(l.created_at, lang)}
                  </TableCell>
                  <TableCell className="text-sm">{l.user_name ?? "Système"}</TableCell>
                  <TableCell className="text-xs">
                    <span className="rounded bg-secondary px-1.5 py-0.5">{l.module ?? "—"}</span>
                  </TableCell>
                  <TableCell className="text-sm">{l.action}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {l.boutique_id ? (storeName[l.boutique_id] ?? `#${l.boutique_id}`) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between border-t p-3 text-xs text-muted-foreground">
          <span>
            {filtered.length} / {logs.length} entrée(s)
          </span>
        </div>
      </Card>
    </>
  );
}
