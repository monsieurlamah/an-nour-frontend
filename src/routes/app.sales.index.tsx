import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { PageHeader } from "@/components/app-shell";
import { KpiCard, StatusBadge } from "@/components/primitives";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Search, Receipt, TrendingUp, Download, Printer, Eye, Ban,
  MoreHorizontal, FileSpreadsheet, FileText, ChevronLeft, ChevronRight,
  Filter, CalendarDays, RefreshCw, AlertCircle, Loader2,
} from "lucide-react";
import { fmtXAF } from "@/lib/mock-data";
import { ventesApi, clientsApi, qk, type VenteListParams } from "@/lib/api";
import { useWorkContext, canViewHQ } from "@/lib/work-context";
import { PrintPreviewDialog } from "@/lib/print-engine";
import { saleToDocument } from "@/lib/pos-print-adapter";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useT, formatDateTime } from "@/lib/i18n";
import type { VenteRead, VenteStatut } from "@/lib/types";
import { ApiErrorState, TableSkeleton } from "@/components/primitives";

export const Route = createFileRoute("/app/sales/")({ component: Page });

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const MAX_EXPORT_ROWS = 500;

type DatePreset = "today" | "yesterday" | "7d" | "30d" | "month" | "prev_month" | "custom";

function getPresetDates(preset: DatePreset): { debut: string; fin: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const d7 = new Date(today); d7.setDate(today.getDate() - 6);
  const d30 = new Date(today); d30.setDate(today.getDate() - 29);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  const todayFmt = fmt(today);
  switch (preset) {
    case "today": return { debut: todayFmt, fin: todayFmt };
    case "yesterday": return { debut: fmt(yesterday), fin: fmt(yesterday) };
    case "7d": return { debut: fmt(d7), fin: todayFmt };
    case "30d": return { debut: fmt(d30), fin: todayFmt };
    case "month": return { debut: fmt(monthStart), fin: todayFmt };
    case "prev_month": return { debut: fmt(prevMonthStart), fin: fmt(prevMonthEnd) };
    default: return { debut: "", fin: "" };
  }
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUT_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string }> = {
  completee:          { label: "Payée",               variant: "default",     color: "bg-success/10 text-success border-success/30" },
  partiellement_payee:{ label: "Partielle",           variant: "secondary",   color: "bg-warning/10 text-warning border-warning/30" },
  impayee:            { label: "Non payée",           variant: "outline",     color: "bg-muted text-muted-foreground" },
  en_cours:           { label: "En cours",            variant: "secondary",   color: "bg-blue-100 text-blue-700 border-blue-200" },
  annulee:            { label: "Annulée",             variant: "destructive", color: "bg-destructive/10 text-destructive border-destructive/30" },
  remboursee:         { label: "Remboursée",          variant: "outline",     color: "bg-purple-100 text-purple-700 border-purple-200" },
};

function VenteStatutBadge({ statut }: { statut: string }) {
  const cfg = STATUT_CONFIG[statut] ?? { label: statut, color: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", cfg.color)}>
      {cfg.label}
    </span>
  );
}

// ── Payment mode display ──────────────────────────────────────────────────────

const MODE_SHORT: Record<string, string> = {
  especes: "Esp.", mobile_money: "Mobile", carte: "Carte", virement: "Vir.", cheque: "Chq.",
};
function PaymentModes({ paiements }: { paiements: VenteRead["paiements"] }) {
  const modes = [...new Set(paiements.map(p => MODE_SHORT[p.mode] ?? p.mode))];
  return <span className="text-xs text-muted-foreground">{modes.join(" + ") || ""}</span>;
}

// ── Main component ────────────────────────────────────────────────────────────

function Page() {
  const { t } = useT();
  const { store, has, isSuperAdmin, authorizedStores } = useWorkContext();
  const isHQCapable = canViewHQ(isSuperAdmin, has);
  const qc = useQueryClient();
  const navigate = useNavigate();

  // ── Filter state ──────────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [statut, setStatut] = useState<string>("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("30d");
  const [customDebut, setCustomDebut] = useState("");
  const [customFin, setCustomFin] = useState("");
  const [skip, setSkip] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  // Boss-only: browse any boutique's sales without switching the whole app's
  // workspace (same page-local pattern as the dashboard/créances/dépenses filters).
  const [boutiqueFilter, setBoutiqueFilter] = useState<string>("all");

  // ── Print/void state ──────────────────────────────────────────────────────
  const [printVente, setPrintVente] = useState<VenteRead | null>(null);
  const [voidTarget, setVoidTarget] = useState<VenteRead | null>(null);

  // ── Resolved dates ────────────────────────────────────────────────────────
  const { debut, fin } = useMemo(() => {
    if (datePreset === "custom") return { debut: customDebut, fin: customFin };
    return getPresetDates(datePreset);
  }, [datePreset, customDebut, customFin]);

  // ── Query params ──────────────────────────────────────────────────────────
  const params: VenteListParams = {
    boutique_id: isHQCapable
      ? (boutiqueFilter === "all" ? undefined : Number(boutiqueFilter))
      : store?.id,
    statut: statut !== "all" ? statut as VenteStatut : undefined,
    search: search.trim() || undefined,
    date_debut: debut || undefined,
    date_fin: fin || undefined,
    skip,
    limit: PAGE_SIZE,
  };

  const countParams = { ...params, skip: undefined, limit: undefined };

  const { data: ventes = [], isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ["ventes", "list", params],
    queryFn: () => ventesApi.list(params),
    placeholderData: (prev) => prev,
  });

  const { data: countData } = useQuery({
    queryKey: ["ventes", "count", countParams],
    queryFn: () => ventesApi.count(countParams),
    placeholderData: (prev) => prev,
  });

  const { data: clients = [] } = useQuery({
    queryKey: qk.clients.list(),
    queryFn: () => clientsApi.list({ limit: 500 }),
  });

  const clientMap = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])), [clients]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const totalCount = countData?.total ?? 0;
  const kpiRevenue = ventes
    .filter(v => v.statut !== "annulee" && v.statut !== "remboursee")
    .reduce((a, v) => a + Number(v.montant_total), 0);
  const kpiPaid = ventes.reduce((a, v) => a + Number(v.montant_paye), 0);
  const kpiDue = ventes.reduce((a, v) => a + Number(v.montant_restant), 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;

  // ── Void mutation ─────────────────────────────────────────────────────────
  const voidMutation = useMutation({
    mutationFn: (id: number) => ventesApi.void(id),
    onSuccess: () => {
      toast.success("Vente annulée");
      qc.invalidateQueries({ queryKey: ["ventes"] });
      setVoidTarget(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  // ── Export helpers ────────────────────────────────────────────────────────
  const fetchAllForExport = async () => {
    const data = await ventesApi.list({ ...params, skip: 0, limit: MAX_EXPORT_ROWS });
    return data;
  };

  const exportXlsx = async () => {
    try {
      const data = await fetchAllForExport();
      const rows = data.map(v => ({
        "Référence": `VENTE-${v.id}`,
        "Date": v.created_at ? new Date(v.created_at).toLocaleString("fr-FR") : "",
        ...(isHQCapable ? { "Boutique": v.store_name ?? `Boutique #${v.boutique_id}` } : {}),
        "Client": v.client_id ? (clientMap[v.client_id]?.name ?? `#${v.client_id}`) : "Comptant",
        "Statut": STATUT_CONFIG[v.statut]?.label ?? v.statut,
        "Articles": v.lignes?.length ?? 0,
        "Total (GNF)": Number(v.montant_total),
        "Payé (GNF)": Number(v.montant_paye),
        "Reste (GNF)": Number(v.montant_restant),
        "Modes paiement": [...new Set(v.paiements?.map(p => p.mode) ?? [])].join(", "),
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Ventes");
      XLSX.writeFile(wb, `ventes-${debut || "all"}-${fin || "all"}.xlsx`);
      toast.success(`${data.length} ventes exportées`);
    } catch {
      toast.error("Erreur lors de l'export Excel");
    }
  };

  const exportCsv = async () => {
    try {
      const data = await fetchAllForExport();
      const header = [
        "Référence", "Date", ...(isHQCapable ? ["Boutique"] : []),
        "Client", "Statut", "Total", "Payé", "Reste",
      ];
      const rows = data.map(v => [
        `VENTE-${v.id}`,
        v.created_at ? new Date(v.created_at).toLocaleString("fr-FR") : "",
        ...(isHQCapable ? [v.store_name ?? `Boutique #${v.boutique_id}`] : []),
        v.client_id ? (clientMap[v.client_id]?.name ?? `#${v.client_id}`) : "Comptant",
        STATUT_CONFIG[v.statut]?.label ?? v.statut,
        Number(v.montant_total),
        Number(v.montant_paye),
        Number(v.montant_restant),
      ]);
      const csv = [header, ...rows].map(r => r.join(";")).join("\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `ventes-${debut || "all"}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`${data.length} ventes exportées (CSV)`);
    } catch {
      toast.error("Erreur lors de l'export CSV");
    }
  };

  // jsPDF's core fonts have no glyph for the narrow no-break space (U+202F)
  // that Intl's fr-FR grouping uses — it renders as a stray "/". Regular
  // breakable spaces read correctly in the PDF; only used for jsPDF text,
  // never on-screen (fmtXAF elsewhere keeps the non-breaking version).
  const fmtPdf = (n: number) => fmtXAF(n).replace(/[  ]/g, " ");

  const exportPdf = async () => {
    try {
      const data = await fetchAllForExport();
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(14);
      doc.text(`Historique des ventes${selectedStoreName ? ` · ${selectedStoreName}` : ""}`, 14, 15);
      doc.setFontSize(9);
      // "→" has no glyph in jsPDF's core fonts either — same class of bug as the space.
      doc.text(`Période : ${debut || "N/A"} au ${fin || "N/A"}`, 14, 22);
      autoTable(doc, {
        startY: 28,
        head: [[
          "Réf.", "Date", ...(isHQCapable ? ["Boutique"] : []),
          "Client", "Statut", "Total", "Payé", "Reste", "Modes",
        ]],
        body: data.map(v => [
          `VENTE-${v.id}`,
          v.created_at ? new Date(v.created_at).toLocaleDateString("fr-FR") : "",
          ...(isHQCapable ? [v.store_name ?? `Boutique #${v.boutique_id}`] : []),
          v.client_id ? (clientMap[v.client_id]?.name ?? `#${v.client_id}`) : "Comptant",
          STATUT_CONFIG[v.statut]?.label ?? v.statut,
          fmtPdf(Number(v.montant_total)),
          fmtPdf(Number(v.montant_paye)),
          fmtPdf(Number(v.montant_restant)),
          [...new Set(v.paiements?.map(p => MODE_SHORT[p.mode] ?? p.mode) ?? [])].join("+"),
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [0, 31, 95] }, // brand navy #001F5F
      });
      doc.save(`ventes-${debut || "all"}.pdf`);
      toast.success(`${data.length} ventes exportées (PDF)`);
    } catch {
      toast.error("Erreur lors de l'export PDF");
    }
  };

  const resetPage = useCallback(() => setSkip(0), []);

  const selectedStoreName = isHQCapable
    ? (boutiqueFilter !== "all" ? authorizedStores.find((s) => String(s.id) === boutiqueFilter)?.name : undefined)
    : store?.name;

  return (
    <>
      <PageHeader
        title={t("sales.title") as string}
        description={`${totalCount > 0 ? `${totalCount} ventes` : "Aucune vente"}${selectedStoreName ? ` · ${selectedStoreName}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", isFetching && "animate-spin")} />
              {t("common.refresh") as string}
            </Button>
            {has("ventes.exporter") && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Download className="mr-1.5 h-3.5 w-3.5" /> Exporter
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={exportXlsx}>
                    <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel (.xlsx)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportCsv}>
                    <FileText className="mr-2 h-4 w-4" /> CSV
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportPdf}>
                    <FileText className="mr-2 h-4 w-4" /> PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        }
      />

      {/* ── KPI cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
        <KpiCard label="Total (page actuelle)" value={fmtXAF(kpiRevenue)} valueClassName="text-base sm:text-lg lg:text-xl" icon={<Receipt className="h-5 w-5" />} />
        <KpiCard label="Payé" value={fmtXAF(kpiPaid)} valueClassName="text-base sm:text-lg lg:text-xl" icon={<TrendingUp className="h-5 w-5" />} tone="success" />
        <KpiCard label="Créances" value={fmtXAF(kpiDue)} valueClassName="text-base sm:text-lg lg:text-xl" icon={<AlertCircle className="h-5 w-5" />} tone={kpiDue > 0 ? "warning" : "default"} />
        <KpiCard label="Ventes trouvées" value={String(totalCount)} icon={<Filter className="h-5 w-5" />} tone="primary" />
      </div>

      <Card className="shadow-soft">
        {/* ── Search & quick filters ──────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Référence, client…"
              className="h-9 pl-8"
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            />
          </div>
          {isHQCapable && (
            <Select value={boutiqueFilter} onValueChange={(v) => { setBoutiqueFilter(v); resetPage(); }}>
              <SelectTrigger className="h-9 w-48">
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
          <Select value={statut} onValueChange={(v) => { setStatut(v); resetPage(); }}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              {Object.entries(STATUT_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={datePreset} onValueChange={(v) => { setDatePreset(v as DatePreset); resetPage(); }}>
            <SelectTrigger className="h-9 w-44">
              <CalendarDays className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Aujourd'hui</SelectItem>
              <SelectItem value="yesterday">Hier</SelectItem>
              <SelectItem value="7d">7 derniers jours</SelectItem>
              <SelectItem value="30d">30 derniers jours</SelectItem>
              <SelectItem value="month">Ce mois</SelectItem>
              <SelectItem value="prev_month">Mois précédent</SelectItem>
              <SelectItem value="custom">Personnalisé</SelectItem>
            </SelectContent>
          </Select>
          {datePreset === "custom" && (
            <>
              <Input type="date" className="h-9 w-36" value={customDebut}
                onChange={(e) => { setCustomDebut(e.target.value); resetPage(); }} />
              <Input type="date" className="h-9 w-36" value={customFin}
                onChange={(e) => { setCustomFin(e.target.value); resetPage(); }} />
            </>
          )}
        </div>

        {/* ── Table ───────────────────────────────────────────────────── */}
        <div className="min-h-[300px]">
          {isLoading ? (
            <Table><TableHeader><TableRow className="bg-secondary/40">
              <TableHead>Référence</TableHead><TableHead>Date</TableHead>
              {isHQCapable && <TableHead>Boutique</TableHead>}
              <TableHead>Client</TableHead><TableHead>Total</TableHead>
              <TableHead>Statut</TableHead><TableHead></TableHead>
            </TableRow></TableHeader><TableBody><TableSkeleton cols={isHQCapable ? 7 : 6} /></TableBody></Table>
          ) : error ? (
            <div className="p-6"><ApiErrorState error={error} onRetry={refetch} /></div>
          ) : ventes.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Receipt className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-medium">Aucune vente trouvée</p>
              <p className="text-xs text-muted-foreground">Modifiez les filtres ou effectuez une vente depuis le POS.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/40">
                  <TableHead className="w-28">Référence</TableHead>
                  <TableHead>Date</TableHead>
                  {isHQCapable && <TableHead>Boutique</TableHead>}
                  <TableHead>Client</TableHead>
                  <TableHead>Articles</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Payé</TableHead>
                  <TableHead className="text-right">Reste</TableHead>
                  <TableHead>Paiements</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ventes.map((v) => {
                  const client = v.client_id ? clientMap[v.client_id] : null;
                  const clientLabel = client ? `${client.name}${client.prenom ? ` ${client.prenom}` : ""}` : "Comptant";
                  const canVoid = has("ventes.annuler") && v.statut !== "annulee" && v.statut !== "remboursee";
                  return (
                    <TableRow key={v.id} className="group cursor-pointer hover:bg-secondary/30"
                      onClick={() => navigate({ to: "/app/sales/$id", params: { id: String(v.id) } })}>
                      <TableCell className="font-mono text-xs font-medium">VENTE-{v.id}</TableCell>
                      <TableCell className="text-sm tabular-nums text-muted-foreground whitespace-nowrap">
                        {v.created_at ? new Date(v.created_at).toLocaleDateString("fr-FR") : ""}
                      </TableCell>
                      {isHQCapable && (
                        <TableCell className="max-w-[140px] truncate text-sm text-muted-foreground">
                          {v.store_name ?? `Boutique #${v.boutique_id}`}
                        </TableCell>
                      )}
                      <TableCell className="max-w-[130px] truncate text-sm">{clientLabel}</TableCell>
                      <TableCell className="text-center text-sm">{v.lignes?.length ?? 0}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{fmtXAF(Number(v.montant_total))}</TableCell>
                      <TableCell className="text-right tabular-nums text-success">{fmtXAF(Number(v.montant_paye))}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", Number(v.montant_restant) > 0 && "font-medium text-destructive")}>
                        {fmtXAF(Number(v.montant_restant))}
                      </TableCell>
                      <TableCell><PaymentModes paiements={v.paiements ?? []} /></TableCell>
                      <TableCell><VenteStatutBadge statut={v.statut} /></TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate({ to: "/app/sales/$id", params: { id: String(v.id) } })}>
                              <Eye className="mr-2 h-4 w-4" /> Voir détail
                            </DropdownMenuItem>
                            {has("ventes.imprimer") && (
                              <DropdownMenuItem onClick={() => setPrintVente(v)}>
                                <Printer className="mr-2 h-4 w-4" /> Réimprimer
                              </DropdownMenuItem>
                            )}
                            {canVoid && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => setVoidTarget(v)}
                                >
                                  <Ban className="mr-2 h-4 w-4" /> Annuler la vente
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* ── Pagination ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
          <span>
            {totalCount > 0
              ? `${skip + 1}–${Math.min(skip + PAGE_SIZE, totalCount)} sur ${totalCount}`
              : "0 résultats"}
          </span>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" className="h-7 w-7"
              disabled={currentPage === 1} onClick={() => setSkip(0)}>
              <ChevronLeft className="h-3 w-3" /><ChevronLeft className="h-3 w-3 -ml-1.5" />
            </Button>
            <Button size="icon" variant="outline" className="h-7 w-7"
              disabled={currentPage === 1} onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}>
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="px-2 tabular-nums">Page {currentPage} / {totalPages}</span>
            <Button size="icon" variant="outline" className="h-7 w-7"
              disabled={currentPage >= totalPages} onClick={() => setSkip(skip + PAGE_SIZE)}>
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Reprint via Print Engine ───────────────────────────────────────── */}
      <PrintPreviewDialog
        open={!!printVente}
        document={printVente ? saleToDocument(printVente, {
          clientName: printVente.client_id
            ? (() => { const c = clientMap[printVente.client_id!]; return c ? `${c.name}${c.prenom ? ` ${c.prenom}` : ""}` : null; })()
            : null,
        }) : null}
        onClose={() => setPrintVente(null)}
      />

      {/* ── Void confirmation ──────────────────────────────────────────────── */}
      <AlertDialog open={!!voidTarget} onOpenChange={(o) => !o && setVoidTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler la vente ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action va annuler <strong>VENTE-{voidTarget?.id}</strong>.
              Le stock ne sera pas automatiquement restauré.
              Cette action est définitive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => voidTarget && voidMutation.mutate(voidTarget.id)}
              disabled={voidMutation.isPending}
            >
              {voidMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Confirmer l'annulation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
