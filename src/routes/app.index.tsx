import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { KpiCard } from "@/components/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DollarSign, Receipt, Store as StoreIcon, Package, AlertTriangle,
  ShoppingCart, CreditCard, Users as UsersIcon, Plus, ArrowRight,
  PackageX, TrendingUp, TrendingDown, RefreshCw, AlertCircle,
  Undo2, Clock, Loader2, Wallet, Banknote, PackageCheck,
  Search,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from "recharts";
import { fmtXAF, fmtCompactCur } from "@/lib/mock-data";
import { dashboardApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { useT } from "@/lib/i18n";
import { useWorkContext, canViewHQ } from "@/lib/work-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/")({ component: Dashboard });

// ── Tooltip style ─────────────────────────────────────────────────────────────

const TIP = {
  contentStyle: {
    background: "var(--popover)", border: "1px solid var(--border)",
    borderRadius: 12, fontSize: 12, boxShadow: "var(--shadow-elevated)",
    color: "var(--foreground)",
  } as const,
  labelStyle: { color: "var(--muted-foreground)", fontSize: 11, marginBottom: 4 } as const,
};

const PIE_COLORS = ["#3b82f6", "#f97316", "#22c55e", "#a855f7", "#ef4444", "#14b8a6"];

// ── Period filter ──────────────────────────────────────────────────────────

type Period = "today" | "week" | "month" | "lastMonth" | "custom";
const PRESETS: Exclude<Period, "custom">[] = ["today", "week", "month", "lastMonth"];

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function presetRange(preset: Exclude<Period, "custom">): { from: Date; to: Date } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (preset === "today") return { from: today, to: today };
  if (preset === "week") {
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    return { from, to: today };
  }
  if (preset === "lastMonth") {
    const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastOfPrevMonth = new Date(firstOfThisMonth.getTime() - 1);
    const firstOfPrevMonth = new Date(lastOfPrevMonth.getFullYear(), lastOfPrevMonth.getMonth(), 1);
    return { from: firstOfPrevMonth, to: lastOfPrevMonth };
  }
  // "month" — mois civil en cours, jusqu'à aujourd'hui
  return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today };
}

// ── Trend badge ───────────────────────────────────────────────────────────────

function Trend({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) return null;
  const pct = previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
  if (pct === null) return null;
  const up = pct >= 0;
  return (
    <span className={cn("ml-1 inline-flex items-center gap-0.5 text-xs font-medium", up ? "text-success" : "text-destructive")}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(pct)}%
    </span>
  );
}

// ── Alert severity colors ─────────────────────────────────────────────────────

const ALERT_COLORS: Record<string, string> = {
  error: "border-destructive/30 bg-destructive/5 text-destructive",
  warning: "border-warning/30 bg-warning/5 text-warning",
  info: "border-blue-200 bg-blue-50 text-blue-700",
};

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  vente: Receipt, remboursement: RefreshCw, retour: Undo2,
  client: UsersIcon, default: Clock,
};

// ── Main dashboard ────────────────────────────────────────────────────────────

function Dashboard() {
  const { t } = useT();
  const { workspace, store, isSuperAdmin, has, authorizedStores, storesLoading, isUnassigned } =
    useWorkContext();
  const isHQCapable = canViewHQ(isSuperAdmin, has);

  // Boss-only: browse any boutique's dashboard without switching the whole
  // app's workspace (that's what the header WorkspaceSwitcher is for — this
  // is a page-local, throwaway lens). Defaults to whatever the global
  // workspace already is when the page mounts, but changing it here never
  // writes back to the global workspace.
  const [boutiqueFilter, setBoutiqueFilter] = useState<string>(
    () => (workspace.kind === "store" && workspace.id ? workspace.id : "all"),
  );

  const boutiqueId = isHQCapable
    ? (boutiqueFilter === "all" ? undefined : Number(boutiqueFilter))
    : (workspace.kind === "store" ? Number(workspace.id) : undefined);

  const selectedStore = isHQCapable
    ? authorizedStores.find((s) => String(s.id) === boutiqueFilter) ?? null
    : store;

  const initialRange = useMemo(() => presetRange("month"), []);
  const [preset, setPreset] = useState<Period>("month");
  const [dateFrom, setDateFrom] = useState(isoDate(initialRange.from));
  const [dateTo, setDateTo] = useState(isoDate(initialRange.to));
  const [search, setSearch] = useState("");

  function applyPreset(p: Exclude<Period, "custom">) {
    setPreset(p);
    const r = presetRange(p);
    setDateFrom(isoDate(r.from));
    setDateTo(isoDate(r.to));
  }

  function handleDateFromChange(value: string) {
    if (!value) return;
    setPreset("custom");
    setDateFrom(value);
  }

  function handleDateToChange(value: string) {
    if (!value) return;
    setPreset("custom");
    setDateTo(value);
  }

  const { data: stats, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["dashboard", "stats", boutiqueId, dateFrom, dateTo],
    queryFn: () => dashboardApi.getStats(boutiqueId, { date_from: dateFrom, date_to: dateTo }),
    refetchInterval: 5 * 60 * 1000, // auto-refresh every 5 min
    staleTime: 60 * 1000,
    // A store-scoped user with no boutique assigned can't load any stats —
    // don't fire a request that's guaranteed to 403; show the empty state.
    enabled: !isUnassigned,
  });

  const kpi = stats?.kpi;
  const title = selectedStore ? selectedStore.name : isSuperAdmin ? "Siège · Vue consolidée" : "Dashboard";
  const desc = selectedStore ? (selectedStore.city ? `Boutique · ${selectedStore.city}` : "Boutique") : "Toutes les boutiques";

  // Format evolution chart data
  const evolutionData = (stats?.evolution_ventes ?? []).map(e => ({
    date: new Date(e.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }),
    ventes: e.count,
    ca: Number(e.ca),
  }));

  const activiteFiltree = useMemo(() => {
    const all = stats?.activite_recente ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(a => a.reference.toLowerCase().includes(q));
  }, [stats?.activite_recente, search]);

  if (isUnassigned) {
    return (
      <>
        <PageHeader title="Dashboard" description={t("dashboard.unassigned.subtitle") as string} />
        <div className="mx-auto mt-10 flex max-w-md flex-col items-center rounded-xl border bg-card p-8 text-center">
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
            <StoreIcon className="h-6 w-6" />
          </div>
          <h2 className="text-base font-semibold">{t("dashboard.unassigned.title") as string}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("dashboard.unassigned.body") as string}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={title}
        description={desc}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", isFetching && "animate-spin")} />
            {t("common.refresh") as string}
          </Button>
        }
      />

      {/* ── Filtres ───────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        {isHQCapable && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">{t("dashboard.filter.store") as string}</label>
            <Select value={boutiqueFilter} onValueChange={setBoutiqueFilter}>
              <SelectTrigger className="h-9 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les boutiques</SelectItem>
                {storesLoading && <SelectItem value="__loading" disabled>{t("common.loading") as string}</SelectItem>}
                {authorizedStores.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">{t("dashboard.filter.period") as string}</label>
          <Select value={preset} onValueChange={(v) => applyPreset(v as Exclude<Period, "custom">)}>
            <SelectTrigger className="h-9 w-40">
              <SelectValue>
                {preset === "custom" ? (t("dashboard.period.custom") as string) : (t(`dashboard.period.${preset}`) as string)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PRESETS.map((p) => (
                <SelectItem key={p} value={p}>{t(`dashboard.period.${p}`) as string}</SelectItem>
              ))}
              <SelectItem value="custom" disabled>{t("dashboard.period.custom") as string}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">{t("dashboard.filter.dateFrom") as string}</label>
          <Input
            type="date"
            className="h-9 w-40"
            value={dateFrom}
            max={dateTo}
            onChange={(e) => handleDateFromChange(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">{t("dashboard.filter.dateTo") as string}</label>
          <Input
            type="date"
            className="h-9 w-40"
            value={dateTo}
            min={dateFrom}
            max={isoDate(new Date())}
            onChange={(e) => handleDateToChange(e.target.value)}
          />
        </div>
        <div className="flex flex-1 min-w-[180px] flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">{t("dashboard.filter.search") as string}</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-8"
              placeholder={t("dashboard.filter.searchPlaceholder") as string}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Chargement du tableau de bord…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
          <p>
            {error instanceof ApiError && error.status === 403
              ? error.detail
              : "Impossible de charger le tableau de bord."}
          </p>
          <Button variant="link" size="sm" onClick={() => refetch()}>Réessayer</Button>
        </div>
      ) : (
        <div className="space-y-6">

          {/* ── Alertes ───────────────────────────────────────────────────── */}
          {(stats?.alertes ?? []).length > 0 && (
            <div className="space-y-2">
              {stats!.alertes.map((a, i) => (
                <div key={i} className={cn("flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm", ALERT_COLORS[a.severity] ?? ALERT_COLORS.info)}>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{a.message}</span>
                  </div>
                  {a.link && (
                    <Link to={a.link} className="shrink-0 text-xs font-medium underline underline-offset-2">
                      Voir
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── KPIs ──────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              label={t("dashboard.kpi.revenueDay") as string}
              value={kpi ? fmtXAF(Number(kpi.ca_jour)) : "…"}
              icon={<DollarSign className="h-5 w-5" />}
              tone="primary"
              hint={kpi ? `Encaissements : ${fmtXAF(Number(kpi.encaissements_jour))}` : undefined}
            />
            <KpiCard
              label={t("dashboard.kpi.revenue") as string}
              value={
                <span className="flex flex-wrap items-center gap-1">
                  {kpi ? fmtXAF(Number(kpi.ca_mois)) : "…"}
                  {kpi && <Trend current={Number(kpi.ca_mois)} previous={Number(kpi.ca_mois_precedent)} />}
                </span>
              }
              icon={<TrendingUp className="h-5 w-5" />}
              tone="success"
            />
            <KpiCard
              label={t("dashboard.kpi.orders") as string}
              value={
                <span className="flex items-center">
                  {kpi ? String(kpi.ventes_mois) : "…"}
                  {kpi && <Trend current={kpi.ventes_mois} previous={kpi.ventes_mois_precedent} />}
                </span>
              }
              icon={<Receipt className="h-5 w-5" />}
              tone="default"
              hint={kpi ? `Aujourd'hui : ${kpi.ventes_jour}` : undefined}
            />
            <KpiCard
              label={t("dashboard.kpi.productsSold") as string}
              value={kpi ? String(kpi.produits_vendus) : "…"}
              icon={<PackageCheck className="h-5 w-5" />}
              tone="default"
            />
            <KpiCard
              label={t("dashboard.kpi.cashBalance") as string}
              value={
                kpi
                  ? kpi.caisse_ouverte
                    ? fmtXAF(Number(kpi.caisse_solde))
                    : "—"
                  : "…"
              }
              icon={<Wallet className="h-5 w-5" />}
              tone={kpi && !kpi.caisse_ouverte ? "warning" : "default"}
              hint={
                kpi
                  ? kpi.caisse_ouverte
                    ? "Session ouverte"
                    : (t("dashboard.period.noOpenCaisse") as string)
                  : undefined
              }
            />
            <KpiCard
              label={t("dashboard.kpi.payouts") as string}
              value={kpi ? fmtXAF(Number(kpi.total_decaissement)) : "…"}
              icon={<Banknote className="h-5 w-5" />}
              tone="default"
            />
            <KpiCard
              label={t("dashboard.kpi.customers") as string}
              value={kpi ? String(kpi.clients_total) : "…"}
              icon={<UsersIcon className="h-5 w-5" />}
              tone="default"
              hint={kpi ? `+${kpi.clients_mois} ce mois` : undefined}
            />
            <KpiCard
              label={t("dashboard.kpi.stockValue") as string}
              value={kpi ? fmtXAF(Number(kpi.stock_valeur)) : "…"}
              icon={<Package className="h-5 w-5" />}
              tone={kpi && kpi.stock_rupture > 0 ? "warning" : "default"}
              hint={kpi ? `${kpi.stock_rupture} rupture · ${kpi.stock_alerte} alerte` : undefined}
            />
            <KpiCard
              label={t("dashboard.kpi.debts") as string}
              value={kpi ? fmtXAF(Number(kpi.creances_montant)) : "…"}
              icon={<CreditCard className="h-5 w-5" />}
              tone={kpi && kpi.creances_actives > 0 ? "warning" : "default"}
              hint={kpi ? `${kpi.creances_actives} créance(s)` : undefined}
            />
          </div>

          {/* ── Charts ────────────────────────────────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Évolution CA (période sélectionnée) */}
            <Card className="shadow-soft lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">{t("dashboard.chart.revenue30d") as string}</CardTitle>
              </CardHeader>
              <CardContent>
                {evolutionData.length === 0 ? (
                  <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">Aucune vente sur la période</div>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={evolutionData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="caGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} />
                      <YAxis tick={{ fontSize: 10 }} tickLine={false} tickFormatter={v => fmtCompactCur(v)} />
                      <Tooltip {...TIP} formatter={(v: number) => fmtXAF(v)} />
                      <Area type="monotone" dataKey="ca" stroke="#3b82f6" strokeWidth={2} fill="url(#caGrad)" name="CA" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Modes de paiement */}
            <Card className="shadow-soft">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">{t("dashboard.chart.paymentModes") as string}</CardTitle>
              </CardHeader>
              <CardContent>
                {(stats?.modes_paiement ?? []).length === 0 ? (
                  <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">Aucun paiement sur la période</div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={140}>
                      <PieChart>
                        <Pie data={stats!.modes_paiement} dataKey="montant" nameKey="label"
                          cx="50%" cy="50%" outerRadius={55} innerRadius={28}>
                          {stats!.modes_paiement.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip {...TIP} formatter={(v: number) => fmtXAF(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <ul className="mt-2 space-y-1">
                      {stats!.modes_paiement.map((m, i) => (
                        <li key={i} className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5">
                            <span className="inline-block h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                            {m.label}
                          </span>
                          <span className="tabular-nums text-muted-foreground">{fmtXAF(Number(m.montant))}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Top produits + Top clients (+ Top boutiques pour le Boss) ──── */}
          <div className={cn("grid gap-4", boutiqueId === undefined ? "lg:grid-cols-3" : "lg:grid-cols-2")}>
            <Card className="shadow-soft">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">{t("dashboard.chart.topProducts") as string}</CardTitle>
              </CardHeader>
              <CardContent>
                {(stats?.top_produits ?? []).length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">Aucune vente sur la période</div>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={stats!.top_produits.slice(0, 7)} layout="vertical" margin={{ left: 8, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} tickFormatter={v => `${v}`} />
                      <YAxis type="category" dataKey="nom" tick={{ fontSize: 10 }} tickLine={false} width={80} />
                      <Tooltip {...TIP} />
                      <Bar dataKey="quantite" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Qté vendue" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-soft">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">{t("dashboard.chart.topClients") as string}</CardTitle>
              </CardHeader>
              <CardContent>
                {(stats?.top_clients ?? []).length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">Aucune vente client sur la période</div>
                ) : (
                  <ul className="space-y-2">
                    {stats!.top_clients.slice(0, 6).map((c, i) => (
                      <li key={c.client_id} className="flex items-center gap-3">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{c.nom}</p>
                          <p className="text-xs text-muted-foreground">{c.nb_ventes} vente(s)</p>
                        </div>
                        <span className="tabular-nums text-sm font-medium">{fmtXAF(Number(c.ca))}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Top boutiques — vue agrégée uniquement (comparer une boutique à
                elle-même n'a pas de sens ; le backend renvoie déjà [] quand
                un boutiqueId est passé, ce garde évite juste d'afficher une
                carte vide côté Gérant ou quand le Boss a filtré sur une
                boutique précise). */}
            {boutiqueId === undefined && (
              <Card className="shadow-soft">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">{t("dashboard.chart.topStores") as string}</CardTitle>
                </CardHeader>
                <CardContent>
                  {(stats?.top_boutiques ?? []).length === 0 ? (
                    <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">Aucune vente sur la période</div>
                  ) : (
                    <ul className="space-y-2">
                      {stats!.top_boutiques.slice(0, 6).map((b, i) => (
                        <li key={b.boutique_id} className="flex items-center gap-3">
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                            {i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{b.nom}</p>
                            <p className="text-xs text-muted-foreground">{b.nb_ventes} vente(s)</p>
                          </div>
                          <span className="tabular-nums text-sm font-medium">{fmtXAF(Number(b.ca))}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Activité récente + Raccourcis ─────────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="shadow-soft lg:col-span-2">
              <CardHeader className="pb-2 flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">{t("dashboard.recentActivity") as string}</CardTitle>
                <Link to="/app/sales" className="text-xs text-primary hover:underline">{t("common.viewAll") as string} →</Link>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="max-h-64">
                  {activiteFiltree.length === 0 ? (
                    <p className="px-5 py-6 text-center text-xs text-muted-foreground">
                      {search ? "Aucun résultat pour cette recherche" : "Aucune activité récente"}
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {activiteFiltree.map((a, i) => {
                        const Icon = ACTIVITY_ICONS[a.type] ?? ACTIVITY_ICONS.default;
                        return (
                          <li key={i} className="flex items-center gap-3 px-5 py-2.5">
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-secondary">
                              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                            </span>
                            <div className="min-w-0 flex-1">
                              {a.link ? (
                                <Link to={a.link} className="truncate text-sm font-medium hover:text-primary">{a.reference}</Link>
                              ) : (
                                <p className="truncate text-sm font-medium">{a.reference}</p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {new Date(a.date).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                            {a.montant !== null && (
                              <span className="tabular-nums text-sm font-medium">{fmtXAF(Number(a.montant))}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Actions rapides */}
            <Card className="shadow-soft">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">{t("dashboard.quickActions") as string}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { to: "/app/pos", icon: Receipt, label: t("dashboard.action.newSale") as string, tone: "primary" },
                  ...(has("products.manage")
                    ? [{ to: "/app/products/new", icon: Package, label: t("dashboard.action.newProduct") as string, tone: "default" }]
                    : []),
                  { to: "/app/customers/new", icon: UsersIcon, label: t("dashboard.action.newClient") as string, tone: "default" },
                  { to: "/app/inventory/adjustments", icon: TrendingUp, label: t("dashboard.action.transferStock") as string, tone: "default" },
                  { to: "/app/sales", icon: ShoppingCart, label: t("dashboard.action.saleHistory") as string, tone: "default" },
                  { to: "/app/debts", icon: CreditCard, label: t("dashboard.action.debts") as string, tone: "default" },
                ].map(({ to, icon: Icon, label, tone }) => (
                  <Button key={to} asChild variant="outline" size="sm"
                    className={cn("w-full justify-start gap-2", tone === "primary" && "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10")}>
                    <Link to={to}>
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </Link>
                  </Button>
                ))}
              </CardContent>
            </Card>
          </div>

        </div>
      )}
    </>
  );
}
