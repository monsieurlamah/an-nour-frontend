import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ChevronLeft, Lock, Info } from "lucide-react";
import { accessApi, qk } from "@/lib/api";
import { GROUP_SLUG_LABEL as GROUP_LABEL, GROUP_SLUG_TEXT_COLOR as GROUP_COLOR } from "@/lib/auth";
import { toast } from "sonner";
import type { GroupPermissionRead } from "@/lib/types";

export const Route = createFileRoute("/app/users/permissions")({ component: Page });

const MODULE_ORDER = [
  "dashboard", "stores", "products", "stock", "ventes", "clients",
  "creances", "paiements", "suppliers", "purchases", "expenses",
  "cash", "reports", "notifications", "users", "system",
];

const MODULE_LABEL: Record<string, string> = {
  dashboard: "Tableau de bord",
  stores: "Boutiques",
  products: "Produits",
  stock: "Stock",
  ventes: "Ventes",
  clients: "Clients",
  creances: "Créances",
  paiements: "Paiements",
  suppliers: "Fournisseurs",
  purchases: "Achats",
  expenses: "Dépenses",
  cash: "Caisse",
  reports: "Rapports",
  notifications: "Notifications",
  users: "Utilisateurs",
  system: "Système",
};

function Page() {
  const qc = useQueryClient();
  const [moduleFilter, setModuleFilter] = useState<string>("all");

  const { data: groups = [], isLoading: loadingGroups } = useQuery({
    queryKey: qk.access.groups,
    queryFn: () => accessApi.listGroups(),
  });

  const { data: permissions = [], isLoading: loadingPerms } = useQuery({
    queryKey: qk.access.permissions(),
    queryFn: () => accessApi.listPermissions(),
  });

  const { data: groupPermissions = [], isLoading: loadingGPs } = useQuery({
    queryKey: qk.access.groupPermissions(),
    queryFn: () => accessApi.listGroupPermissions(),
  });

  const isLoading = loadingGroups || loadingPerms || loadingGPs;

  const toggleMutation = useMutation({
    mutationFn: async ({
      existing,
      groupId,
      permId,
      allowed,
    }: {
      cellKey: string; // used by caller to track which cell is pending
      existing: GroupPermissionRead | undefined;
      groupId: number;
      permId: number;
      allowed: boolean;
    }): Promise<void> => {
      if (existing && !allowed) {
        await accessApi.removeGroupPermission(existing.id);
      } else if (!existing && allowed) {
        await accessApi.assignGroupPermission({ group_id: groupId, permission_id: permId, allowed: true });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.access.groupPermissions() });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  // Build lookup: groupId → permId → GroupPermissionRead
  const gpLookup = useMemo(() => {
    const map: Record<number, Record<number, GroupPermissionRead>> = {};
    for (const gp of groupPermissions) {
      if (!map[gp.group_id]) map[gp.group_id] = {};
      map[gp.group_id][gp.permission_id] = gp;
    }
    return map;
  }, [groupPermissions]);

  // Group permissions by module, sorted by MODULE_ORDER
  const modules = useMemo(() => {
    const modMap: Record<string, typeof permissions> = {};
    for (const perm of permissions) {
      if (!modMap[perm.module]) modMap[perm.module] = [];
      modMap[perm.module].push(perm);
    }
    return Object.entries(modMap).sort(([a], [b]) => {
      const ia = MODULE_ORDER.indexOf(a);
      const ib = MODULE_ORDER.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  }, [permissions]);

  const allModules = modules.map(([mod]) => mod);
  const filteredModules = moduleFilter === "all"
    ? modules
    : modules.filter(([mod]) => mod === moduleFilter);

  const superAdminGroup = groups.find((g) => g.slug === "super-admin");

  function isAllowed(groupId: number, permId: number): boolean {
    return !!(gpLookup[groupId]?.[permId]?.allowed);
  }

  function handleToggle(groupId: number, permId: number, newValue: boolean) {
    if (superAdminGroup && groupId === superAdminGroup.id) return;
    const existing = gpLookup[groupId]?.[permId];
    const cellKey = `${groupId}-${permId}`;
    toggleMutation.mutate({ cellKey, existing, groupId, permId, allowed: newValue });
  }

  return (
    <>
      <PageHeader
        title="Matrice des permissions"
        description="Configurez les droits d'accès par rôle"
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/app/users">
              <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Utilisateurs
            </Link>
          </Button>
        }
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          <span>
            La colonne <strong>Super Admin</strong> a tous les accès par défaut et ne peut pas être modifiée ici.
          </span>
        </div>
        <Select value={moduleFilter} onValueChange={setModuleFilter}>
          <SelectTrigger className="h-8 w-48 text-xs">
            <SelectValue placeholder="Tous les modules" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les modules</SelectItem>
            {allModules.map((mod) => (
              <SelectItem key={mod} value={mod}>
                {MODULE_LABEL[mod] ?? mod}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="shadow-soft overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Chargement de la matrice…
          </div>
        ) : permissions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <Info className="h-6 w-6 opacity-40" />
            <p>Aucune permission trouvée. Lancez d'abord les seeds.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-secondary/50">
                <tr>
                  <th className="min-w-[220px] px-4 py-3 text-left font-medium">Permission</th>
                  {groups.map((g) => (
                    <th
                      key={g.id}
                      className={`min-w-[100px] whitespace-nowrap px-3 py-3 text-center font-medium ${GROUP_COLOR[g.slug] ?? ""}`}
                    >
                      {GROUP_LABEL[g.slug] ?? g.name}
                      {g.slug === "super-admin" && (
                        <Lock className="mx-auto mt-0.5 h-2.5 w-2.5 opacity-60" />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredModules.map(([mod, perms]) => (
                  <Fragment key={mod}>
                    <tr className="bg-muted/30">
                      <td
                        colSpan={groups.length + 1}
                        className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        {MODULE_LABEL[mod] ?? mod}
                      </td>
                    </tr>
                    {perms.map((perm) => (
                      <tr key={perm.id} className="border-t transition-colors hover:bg-muted/20">
                        <td className="px-4 py-2.5">
                          <span className="text-sm">{perm.name}</span>
                          <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                            {perm.slug}
                          </span>
                        </td>
                        {groups.map((g) => {
                          const isSuperAdmin = g.slug === "super-admin";
                          const checked = isSuperAdmin || isAllowed(g.id, perm.id);
                          const cellKey = `${g.id}-${perm.id}`;
                          const isCellPending =
                            toggleMutation.isPending &&
                            toggleMutation.variables?.cellKey === cellKey;
                          return (
                            <td key={g.id} className="px-3 py-2.5 text-center">
                              <Switch
                                checked={checked}
                                disabled={isSuperAdmin || isCellPending}
                                onCheckedChange={(v) => handleToggle(g.id, perm.id, v)}
                                className={isSuperAdmin ? "cursor-not-allowed opacity-50" : ""}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {toggleMutation.isPending && (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs text-primary-foreground shadow-lg">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Enregistrement…
        </div>
      )}
    </>
  );
}
