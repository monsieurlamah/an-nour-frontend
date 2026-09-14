import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge, TableSkeleton, ApiErrorState } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Plus, ArrowLeftRight } from "lucide-react";
import { transfertsApi, qk } from "@/lib/api";
import { formatDate, useT } from "@/lib/i18n";
import { useWorkContext } from "@/lib/work-context";
import type { TransfertStatut } from "@/lib/types";

export const Route = createFileRoute("/app/transfers/")({ component: Page });

const STATUS_TABS: Array<{ value: string; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "en_transit", label: "En transit" },
  { value: "receptionne", label: "Réceptionnés" },
  { value: "receptionne_avec_ecart", label: "Avec écart" },
  { value: "annule", label: "Annulés" },
];

function Page() {
  const { lang } = useT();
  const { has } = useWorkContext();
  const canCreate = has("transferts.create");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");

  const {
    data: transferts = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: qk.transferts.list({ statut: tab !== "all" ? tab : undefined }),
    queryFn: () =>
      transfertsApi.list({
        limit: 200,
        statut: tab !== "all" ? (tab as TransfertStatut) : undefined,
      }),
  });

  const filtered = transferts.filter((t) => {
    const q = search.toLowerCase();
    return (
      !q ||
      t.numero.toLowerCase().includes(q) ||
      (t.boutique_source_name ?? "").toLowerCase().includes(q) ||
      (t.boutique_destination_name ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <>
      <PageHeader
        title="Transferts inter-boutiques"
        description="Mouvements de marchandises entre boutiques du réseau"
        actions={
          canCreate ? (
            <Button size="sm" asChild>
              <Link to="/app/transfers/new">
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Nouveau transfert
              </Link>
            </Button>
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList>
          {STATUS_TABS.map((s) => (
            <TabsTrigger key={s.value} value={s.value}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card className="shadow-soft">
        <div className="flex items-center gap-2 border-b p-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher un transfert…"
              className="h-9 pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/40">
              <TableHead>Référence</TableHead>
              <TableHead>De</TableHead>
              <TableHead>Vers</TableHead>
              <TableHead className="text-right">Articles</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Créé le</TableHead>
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
                    <ArrowLeftRight className="h-8 w-8 opacity-30" />
                    <span>Aucun transfert</span>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((t) => (
                <TableRow key={t.id} className="group">
                  <TableCell>
                    <Link
                      to="/app/transfers/$id"
                      params={{ id: String(t.id) }}
                      className="font-medium group-hover:text-primary"
                    >
                      {t.numero}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{t.boutique_source_name}</TableCell>
                  <TableCell className="text-sm">{t.boutique_destination_name}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.lignes.length}</TableCell>
                  <TableCell>
                    <StatusBadge status={t.statut} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(t.created_at, lang)}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" asChild>
                      <Link to="/app/transfers/$id" params={{ id: String(t.id) }}>
                        Voir
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between border-t p-3 text-xs text-muted-foreground">
          <span>
            {filtered.length} / {transferts.length} transfert{transferts.length !== 1 ? "s" : ""}
          </span>
        </div>
      </Card>
    </>
  );
}
