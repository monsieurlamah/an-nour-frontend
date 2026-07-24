import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { PageHeader } from "@/components/app-shell";
import { KpiCard, TableSkeleton, ApiErrorState } from "@/components/primitives";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Wallet, Plus, Download, Printer, Pencil, Trash2, MoreHorizontal,
  CalendarDays, FileSpreadsheet, FileText, ImageIcon, ChevronLeft, ChevronRight,
  RefreshCw, Receipt,
} from "lucide-react";
import { fmtXAF } from "@/lib/mock-data";
import { expensesApi, qk, type ExpenseListParams } from "@/lib/api";
import { useWorkContext, canViewHQ } from "@/lib/work-context";
import { ImageUpload } from "@/components/image-upload";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ExpenseRead, ExpenseCreate, PaiementMode } from "@/lib/types";

export const Route = createFileRoute("/app/expenses")({ component: Page });

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const MAX_EXPORT_ROWS = 500;

const PAYMENT_MODE_LABEL: Record<PaiementMode, string> = {
  especes: "Espèces",
  mobile_money: "Mobile Money",
  carte: "Carte bancaire",
  virement: "Virement",
  cheque: "Chèque",
};

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

// ── Empty draft for the create/edit dialog ───────────────────────────────────

type Draft = {
  montant: string;
  category_id: string; // "" = none
  category_label: string;
  description: string;
  payment_mode: PaiementMode;
  receipt_url: string | null;
};

const EMPTY_DRAFT: Draft = {
  montant: "", category_id: "", category_label: "", description: "", payment_mode: "especes", receipt_url: null,
};

// ── Main component ────────────────────────────────────────────────────────────

function Page() {
  const { store, has, isSuperAdmin, authorizedStores } = useWorkContext();
  const isHQCapable = canViewHQ(isSuperAdmin, has);
  const qc = useQueryClient();

  // ── Filter state ──────────────────────────────────────────────────────────
  // Boss-only: browse any boutique's expenses without switching the whole
  // app's workspace (same page-local pattern as the dashboard/créances filters).
  const [boutiqueFilter, setBoutiqueFilter] = useState<string>("all");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("30d");
  // The two date inputs are always visible (not hidden behind "Personnalisé")
  // and are the actual source of truth for the filter — presets are just a
  // quick way to fill them in. Editing either one directly switches the
  // preset dropdown to "custom" so it stops overwriting a manual choice.
  const [customDebut, setCustomDebut] = useState(() => getPresetDates("30d").debut);
  const [customFin, setCustomFin] = useState(() => getPresetDates("30d").fin);
  const [skip, setSkip] = useState(0);
  const resetPage = () => setSkip(0);

  const applyDatePreset = (preset: DatePreset) => {
    setDatePreset(preset);
    if (preset !== "custom") {
      const { debut, fin } = getPresetDates(preset);
      setCustomDebut(debut);
      setCustomFin(fin);
    }
    resetPage();
  };
  const setDateFrom = (value: string) => { setCustomDebut(value); setDatePreset("custom"); resetPage(); };
  const setDateTo = (value: string) => { setCustomFin(value); setDatePreset("custom"); resetPage(); };

  // ── Dialog state ──────────────────────────────────────────────────────────
  const [editing, setEditing] = useState<ExpenseRead | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRead | null>(null);

  // ── Resolved dates ────────────────────────────────────────────────────────
  const debut = customDebut;
  const fin = customFin;

  const params: ExpenseListParams = {
    store_id: isHQCapable
      ? (boutiqueFilter === "all" ? undefined : Number(boutiqueFilter))
      : store?.id,
    category_id: categoryId !== "all" ? Number(categoryId) : undefined,
    date_from: debut || undefined,
    date_to: fin || undefined,
    skip,
    limit: PAGE_SIZE,
  };
  const countParams = { ...params, skip: undefined, limit: undefined };

  const { data: expenses = [], isLoading, error, isFetching, refetch } = useQuery({
    queryKey: qk.expenses.list(params),
    queryFn: () => expensesApi.list(params),
    placeholderData: (prev) => prev,
  });

  const { data: countData } = useQuery({
    queryKey: ["expenses", "count", countParams],
    queryFn: () => expensesApi.count(countParams),
    placeholderData: (prev) => prev,
  });

  const { data: categories = [] } = useQuery({
    queryKey: qk.expenses.categories,
    queryFn: () => expensesApi.listCategories(),
  });
  const categoryMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories],
  );
  const otherCategoryId = useMemo(
    () => categories.find((c) => c.slug === "autre")?.id,
    [categories],
  );
  const categoryLabel = (e: { category_id: number | null; category_label: string | null }) => {
    if (!e.category_id) return "Non catégorisé";
    const name = categoryMap[e.category_id]?.name ?? `#${e.category_id}`;
    return e.category_id === otherCategoryId && e.category_label
      ? `${name}: ${e.category_label}`
      : name;
  };

  const totalCount = countData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;
  const pageTotal = expenses.reduce((a, e) => a + Number(e.montant), 0);
  const pageAverage = expenses.length > 0 ? pageTotal / expenses.length : 0;

  // ── Mutations ─────────────────────────────────────────────────────────────
  const invalidate = () => qc.invalidateQueries({ queryKey: ["expenses"] });

  const createMutation = useMutation({
    mutationFn: (body: ExpenseCreate) => expensesApi.create(body),
    onSuccess: () => { toast.success("Dépense enregistrée"); invalidate(); closeDialog(); },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: ExpenseCreate }) =>
      expensesApi.update(id, body),
    onSuccess: () => { toast.success("Dépense modifiée"); invalidate(); closeDialog(); },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => expensesApi.delete(id),
    onSuccess: () => { toast.success("Dépense supprimée"); invalidate(); setDeleteTarget(null); },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  // ── Dialog helpers ────────────────────────────────────────────────────────
  const openCreate = () => { setEditing(null); setDraft(EMPTY_DRAFT); setDialogOpen(true); };
  const openEdit = (e: ExpenseRead) => {
    setEditing(e);
    setDraft({
      montant: String(e.montant),
      category_id: e.category_id ? String(e.category_id) : "",
      category_label: e.category_label ?? "",
      description: e.description ?? "",
      payment_mode: e.payment_mode,
      receipt_url: e.receipt_url,
    });
    setDialogOpen(true);
  };
  function closeDialog() { setDialogOpen(false); setEditing(null); setDraft(EMPTY_DRAFT); }

  const isOtherCategory = otherCategoryId !== undefined && Number(draft.category_id) === otherCategoryId;

  const draftError = useMemo(() => {
    if (!draft.montant || Number(draft.montant) <= 0) return "Montant invalide.";
    if (draft.description.trim().length < 3) return "Le motif (justification) est obligatoire.";
    if (isOtherCategory && !draft.category_label.trim()) return "Précisez la catégorie \"Autre\".";
    return null;
  }, [draft, isOtherCategory]);

  const submitDraft = () => {
    if (draftError) return;
    const body: ExpenseCreate = {
      montant: Number(draft.montant),
      category_id: draft.category_id ? Number(draft.category_id) : undefined,
      category_label: isOtherCategory ? draft.category_label.trim() : undefined,
      description: draft.description.trim(),
      payment_mode: draft.payment_mode,
      receipt_url: draft.receipt_url ?? undefined,
    };
    if (editing) updateMutation.mutate({ id: editing.id, body });
    else createMutation.mutate(body);
  };

  // ── Export/print helpers ──────────────────────────────────────────────────
  const fetchAllForExport = async () => expensesApi.list({ ...params, skip: 0, limit: MAX_EXPORT_ROWS });

  const rowsForExport = (data: ExpenseRead[]) => data.map((e) => ({
    "Date": e.created_at ? new Date(e.created_at).toLocaleString("fr-FR") : "",
    ...(isHQCapable ? { "Boutique": e.store_name ?? (e.store_id ? `Boutique #${e.store_id}` : "—") } : {}),
    "Catégorie": categoryLabel(e),
    "Motif": e.description ?? "",
    "Montant (GNF)": Number(e.montant),
    "Mode de paiement": PAYMENT_MODE_LABEL[e.payment_mode] ?? e.payment_mode,
    "Justificatif": e.receipt_url ? "Oui" : "Non",
  }));

  const exportXlsx = async () => {
    try {
      const data = await fetchAllForExport();
      const ws = XLSX.utils.json_to_sheet(rowsForExport(data));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Dépenses");
      XLSX.writeFile(wb, `depenses-${debut || "all"}-${fin || "all"}.xlsx`);
      toast.success(`${data.length} dépenses exportées`);
    } catch {
      toast.error("Erreur lors de l'export Excel");
    }
  };

  const exportCsv = async () => {
    try {
      const data = await fetchAllForExport();
      const header = [
        "Date", ...(isHQCapable ? ["Boutique"] : []),
        "Catégorie", "Motif", "Montant", "Mode", "Justificatif",
      ];
      const rows = data.map((e) => [
        e.created_at ? new Date(e.created_at).toLocaleString("fr-FR") : "",
        ...(isHQCapable ? [e.store_name ?? (e.store_id ? `Boutique #${e.store_id}` : "—")] : []),
        categoryLabel(e),
        e.description ?? "",
        Number(e.montant),
        PAYMENT_MODE_LABEL[e.payment_mode] ?? e.payment_mode,
        e.receipt_url ? "Oui" : "Non",
      ]);
      const csv = [header, ...rows].map((r) => r.join(";")).join("\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `depenses-${debut || "all"}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`${data.length} dépenses exportées (CSV)`);
    } catch {
      toast.error("Erreur lors de l'export CSV");
    }
  };

  // jsPDF's core fonts have no glyph for the narrow no-break space (U+202F)
  // that Intl's fr-FR grouping uses — it renders as a stray "/". Regular
  // breakable spaces read correctly in the PDF; only used for jsPDF text,
  // never on-screen (fmtXAF elsewhere keeps the non-breaking version).
  const fmtPdf = (n: number) => fmtXAF(n).replace(/[  ]/g, " ");

  const buildReportPdf = (data: ExpenseRead[]) => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text(`Journal des dépenses${selectedStoreName ? ` · ${selectedStoreName}` : ""}`, 14, 15);
    doc.setFontSize(9);
    // "→" has no glyph in jsPDF's core fonts either — same class of bug as the space.
    doc.text(`Période : ${debut || "N/A"} au ${fin || "N/A"}`, 14, 22);
    const total = data.reduce((a, e) => a + Number(e.montant), 0);
    doc.text(`Total : ${fmtPdf(total)} · ${data.length} dépense(s)`, 14, 27);
    autoTable(doc, {
      startY: 33,
      head: [[
        "Date", ...(isHQCapable ? ["Boutique"] : []),
        "Catégorie", "Motif", "Montant", "Mode", "Justificatif",
      ]],
      body: data.map((e) => [
        e.created_at ? new Date(e.created_at).toLocaleDateString("fr-FR") : "",
        ...(isHQCapable ? [e.store_name ?? (e.store_id ? `Boutique #${e.store_id}` : "—")] : []),
        categoryLabel(e),
        e.description ?? "",
        fmtPdf(Number(e.montant)),
        PAYMENT_MODE_LABEL[e.payment_mode] ?? e.payment_mode,
        e.receipt_url ? "Oui" : "Non",
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [0, 31, 95] }, // brand navy #001F5F
    });
    return doc;
  };

  const exportPdf = async () => {
    try {
      const data = await fetchAllForExport();
      buildReportPdf(data).save(`depenses-${debut || "all"}.pdf`);
      toast.success(`${data.length} dépenses exportées (PDF)`);
    } catch {
      toast.error("Erreur lors de l'export PDF");
    }
  };

  const printReport = async () => {
    try {
      const data = await fetchAllForExport();
      const doc = buildReportPdf(data);
      doc.autoPrint();
      window.open(doc.output("bloburl"), "_blank");
    } catch {
      toast.error("Erreur lors de la préparation de l'impression");
    }
  };

  const canManage = has("expenses.manage");
  const canExport = has("expenses.exporter");
  const selectedStoreName = isHQCapable
    ? (boutiqueFilter !== "all" ? authorizedStores.find((s) => String(s.id) === boutiqueFilter)?.name : undefined)
    : store?.name;

  return (
    <>
      <PageHeader
        title="Dépenses"
        description={`${totalCount > 0 ? `${totalCount} dépenses` : "Aucune dépense"}${selectedStoreName ? ` · ${selectedStoreName}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", isFetching && "animate-spin")} />
              Actualiser
            </Button>
            {canExport && (
              <>
                <Button variant="outline" size="sm" onClick={printReport}>
                  <Printer className="mr-1.5 h-3.5 w-3.5" /> Imprimer
                </Button>
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
              </>
            )}
            {canManage && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Nouvelle dépense
              </Button>
            )}
          </div>
        }
      />

      {/* ── KPI cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-4">
        <KpiCard label="Total (page actuelle)" value={fmtXAF(pageTotal)} valueClassName="text-base sm:text-lg lg:text-xl" icon={<Wallet className="h-5 w-5" />} tone="destructive" />
        <KpiCard label="Dépense moyenne" value={fmtXAF(pageAverage)} valueClassName="text-base sm:text-lg lg:text-xl" icon={<Receipt className="h-5 w-5" />} />
        <KpiCard label="Dépenses trouvées" value={String(totalCount)} icon={<CalendarDays className="h-5 w-5" />} tone="primary" />
        <KpiCard label="Catégories" value={String(categories.length)} icon={<FileText className="h-5 w-5" />} />
      </div>

      <Card className="shadow-soft">
        {/* ── Filters ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
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
          <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); resetPage(); }}>
            <SelectTrigger className="h-9 w-48">
              <SelectValue placeholder="Catégorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les catégories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={datePreset} onValueChange={(v) => applyDatePreset(v as DatePreset)}>
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
          {/* Toujours visibles — la sélection d'une date bascule automatiquement
              le préréglage sur "Personnalisé" au lieu de se faire écraser. */}
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">Du</Label>
            <Input type="date" className="h-9 w-36" value={customDebut}
              onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-muted-foreground">Au</Label>
            <Input type="date" className="h-9 w-36" value={customFin}
              onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>

        {/* ── Table ───────────────────────────────────────────────────── */}
        <div className="min-h-[300px]">
          {isLoading ? (
            <Table><TableHeader><TableRow className="bg-secondary/40">
              <TableHead>Date</TableHead>
              {isHQCapable && <TableHead>Boutique</TableHead>}
              <TableHead>Catégorie</TableHead>
              <TableHead>Motif</TableHead><TableHead>Montant</TableHead>
              <TableHead>Mode</TableHead><TableHead></TableHead><TableHead></TableHead>
            </TableRow></TableHeader><TableBody><TableSkeleton cols={isHQCapable ? 8 : 7} /></TableBody></Table>
          ) : error ? (
            <div className="p-6"><ApiErrorState error={error} onRetry={refetch} /></div>
          ) : expenses.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Wallet className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-medium">Aucune dépense trouvée</p>
              <p className="text-xs text-muted-foreground">
                Modifiez les filtres{canManage ? " ou enregistrez une nouvelle dépense." : "."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/40">
                  <TableHead>Date</TableHead>
                  {isHQCapable && <TableHead>Boutique</TableHead>}
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Motif</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Justificatif</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((e) => (
                  <TableRow key={e.id} className="group">
                    <TableCell className="text-sm tabular-nums text-muted-foreground whitespace-nowrap">
                      {e.created_at ? new Date(e.created_at).toLocaleDateString("fr-FR") : ""}
                    </TableCell>
                    {isHQCapable && (
                      <TableCell className="max-w-[140px] truncate text-sm">
                        {e.store_name ?? (e.store_id ? `Boutique #${e.store_id}` : "—")}
                      </TableCell>
                    )}
                    <TableCell className="max-w-[160px] truncate text-sm">
                      {e.category_id ? categoryLabel(e) : (
                        <span className="text-muted-foreground">Non catégorisé</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate text-sm">{e.description}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-destructive">
                      −{fmtXAF(Number(e.montant))}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {PAYMENT_MODE_LABEL[e.payment_mode] ?? e.payment_mode}
                    </TableCell>
                    <TableCell>
                      {e.receipt_url ? (
                        <a href={e.receipt_url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                          <ImageIcon className="h-3.5 w-3.5" /> Voir
                        </a>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">Aucun</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {canManage && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(e)}>
                              <Pencil className="mr-2 h-4 w-4" /> Modifier
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(e)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
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

      {/* ── Create/Edit dialog ─────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier la dépense" : "Nouvelle dépense"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Montant (GNF) *</Label>
                <Input type="number" min={1} value={draft.montant}
                  onChange={(e) => setDraft((d) => ({ ...d, montant: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Mode de paiement</Label>
                <Select value={draft.payment_mode}
                  onValueChange={(v) => setDraft((d) => ({ ...d, payment_mode: v as PaiementMode }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAYMENT_MODE_LABEL).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Catégorie</Label>
              <Select value={draft.category_id || "none"}
                onValueChange={(v) => setDraft((d) => ({
                  ...d,
                  category_id: v === "none" ? "" : v,
                  // Reset the free-text precision the moment the category
                  // changes away from "Autre" — it would be stale/misleading otherwise.
                  category_label: otherCategoryId !== undefined && Number(v) === otherCategoryId
                    ? d.category_label
                    : "",
                }))}>
                <SelectTrigger><SelectValue placeholder="Catégorie" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isOtherCategory && (
                <Input
                  placeholder="Précisez la catégorie…"
                  value={draft.category_label}
                  onChange={(e) => setDraft((d) => ({ ...d, category_label: e.target.value }))}
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Motif / justification *</Label>
              <Textarea rows={3} placeholder="Décrivez précisément la raison de cette dépense…"
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
              <p className="text-xs text-muted-foreground">
                Chaque dépense doit être justifiée — le motif est obligatoire, la photo du reçu est recommandée.
              </p>
            </div>
            <ImageUpload
              label="Justificatif (photo du reçu)"
              value={draft.receipt_url}
              onChange={(url) => setDraft((d) => ({ ...d, receipt_url: url }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Annuler</Button>
            <Button
              disabled={!!draftError || createMutation.isPending || updateMutation.isPending}
              onClick={submitDraft}
            >
              {editing ? "Enregistrer" : "Ajouter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation ─────────────────────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette dépense ?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.description}</strong> ({deleteTarget ? fmtXAF(Number(deleteTarget.montant)) : ""})
              sera définitivement supprimée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
