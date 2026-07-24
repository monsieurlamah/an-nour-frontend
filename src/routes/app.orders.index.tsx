import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge, TableSkeleton, ApiErrorState } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, ShoppingCart } from "lucide-react";
import { commandesApi, storesApi, qk } from "@/lib/api";
import { fmtXAF } from "@/lib/mock-data";
import { useT, formatDate } from "@/lib/i18n";
import { useWorkContext } from "@/lib/work-context";
import type { CommandeStatut } from "@/lib/types";

export const Route = createFileRoute("/app/orders/")({ component: Page });

const STATUS_TABS: Array<{ value: string; label: string }> = [
  { value: "all", label: "common.all" },
  { value: "en_attente", label: "status.pending" },
  { value: "validee", label: "status.approved" },
  { value: "proforma_generee", label: "status.proforma" },
  { value: "proforma_rejetee", label: "status.proforma_rejected" },
  { value: "facture_generee", label: "status.invoiced" },
  { value: "en_preparation", label: "status.preparing" },
  { value: "pret_a_expedier", label: "status.ready_to_ship" },
  { value: "expedie", label: "status.shipped" },
  { value: "livree", label: "status.delivered" },
  { value: "partiellement_recu", label: "status.partial" },
  { value: "reception_confirmee", label: "status.received" },
  { value: "rejetee", label: "status.rejected" },
  { value: "annulee", label: "status.cancelled" },
];

function Page() {
  const { t, lang } = useT();
  const { has, store } = useWorkContext();
  // "Nouvelle demande" is a boutique-side action — requires being scoped
  // into a specific boutique's workspace, not just the permission (which
  // super-admin bypasses regardless of workspace).
  const canCreate = has("commandes.create") && !!store;
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");

  const { data: commandes = [], isLoading, error, refetch } = useQuery({
    queryKey: qk.commandes.list({ statut: tab !== "all" ? tab : undefined }),
    queryFn: () =>
      commandesApi.list({
        limit: 200,
        statut: tab !== "all" ? (tab as CommandeStatut) : undefined,
      }),
  });

  // Parallel fetch for store names
  const { data: stores = [] } = useQuery({
    queryKey: qk.stores.list(),
    queryFn: () => storesApi.list({ limit: 200 }),
  });
  const storeMap = Object.fromEntries(stores.map((s) => [s.id, s.name]));

  const filtered = commandes.filter((c) => {
    const q = search.toLowerCase();
    const ref = c.numero ?? `BRO-${String(c.id).padStart(5, "0")}`;
    return (
      !q ||
      ref.toLowerCase().includes(q) ||
      (storeMap[c.boutique_id] ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <>
      <PageHeader
        title={t("orders.title") as string}
        description={t("orders.subtitle") as string}
        actions={
          canCreate ? (
            <Button size="sm" asChild>
              <Link to="/app/orders/new">
                <Plus className="mr-1.5 h-3.5 w-3.5" /> {t("orders.new") as string}
              </Link>
            </Button>
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList>
          {STATUS_TABS.map((s) => (
            <TabsTrigger key={s.value} value={s.value}>
              {t(s.label) as string}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

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
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/40">
              <TableHead>{t("orders.col.reference") as string}</TableHead>
              <TableHead>{t("orders.col.store") as string}</TableHead>
              <TableHead className="text-right">{t("orders.col.items") as string}</TableHead>
              <TableHead className="text-right">{t("orders.col.total") as string}</TableHead>
              <TableHead>{t("orders.col.status") as string}</TableHead>
              <TableHead>{t("orders.col.created") as string}</TableHead>
              <TableHead className="w-24" />
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
                  <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
                    <ShoppingCart className="h-8 w-8 opacity-30" />
                    <span>{t("common.empty") as string}</span>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const ref = c.numero ?? `BRO-${String(c.id).padStart(5, "0")}`;
                return (
                  <TableRow key={c.id} className="group">
                    <TableCell>
                      <Link
                        to="/app/orders/$id"
                        params={{ id: String(c.id) }}
                        className="font-medium group-hover:text-primary"
                      >
                        {ref}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {storeMap[c.boutique_id] ?? `Boutique #${c.boutique_id}`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.lignes.length}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {fmtXAF(Number(c.montant_total))}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={c.statut} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(c.created_at, lang)}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" asChild>
                        <Link to="/app/orders/$id" params={{ id: String(c.id) }}>
                          {t("common.viewDetails") as string}
                        </Link>
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
            {filtered.length} / {commandes.length} commande{commandes.length !== 1 ? "s" : ""}
          </span>
        </div>
      </Card>
    </>
  );
}
