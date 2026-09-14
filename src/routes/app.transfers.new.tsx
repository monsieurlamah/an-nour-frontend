import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Plus, Minus, Trash2, ArrowLeftRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { useWorkContext, canViewHQ } from "@/lib/work-context";
import { catalogApi, stockApi, storesApi, transfertsApi, qk } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import type { TransfertCreate } from "@/lib/types";

export const Route = createFileRoute("/app/transfers/new")({ component: Page });

const PRINCIPALE_VALUE = "__principale__";

type TransferLine = {
  key: string;
  productId: number;
  name: string;
  quantity: number;
  available: number;
};

function Page() {
  const { t } = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { store, isSuperAdmin, has } = useWorkContext();
  const canView = canViewHQ(isSuperAdmin, has);
  const canCreate = has("transferts.create");

  const { data: stores = [] } = useQuery({
    queryKey: qk.stores.list(),
    queryFn: () => storesApi.list({ limit: 200 }),
  });

  // Source defaults to the current boutique workspace, else "principale" for
  // an HQ-capable viewer — a gérant can only ever ship FROM their own
  // boutique (enforced server-side too), so the field is locked in that case.
  const [sourceValue, setSourceValue] = useState<string>(
    store ? String(store.id) : canView ? PRINCIPALE_VALUE : "",
  );
  const [destValue, setDestValue] = useState<string>("");
  const [motif, setMotif] = useState("");

  const sourceStoreId =
    sourceValue && sourceValue !== PRINCIPALE_VALUE ? Number(sourceValue) : null;
  const sourceIsPrincipale = sourceValue === PRINCIPALE_VALUE;
  const destStoreId = destValue && destValue !== PRINCIPALE_VALUE ? Number(destValue) : null;
  const destIsPrincipale = destValue === PRINCIPALE_VALUE;

  const { data: sourceLocation } = useQuery({
    queryKey: qk.stock.locations({ store_id: sourceStoreId, central: sourceIsPrincipale }),
    queryFn: async () =>
      sourceIsPrincipale
        ? ((await stockApi.listLocations({ type: "CENTRAL", limit: 5 }))[0] ?? null)
        : ((
            await stockApi.listLocations({ store_id: sourceStoreId!, type: "STORE", limit: 5 })
          )[0] ?? null),
    enabled: !!sourceStoreId || sourceIsPrincipale,
  });

  const { data: rawProducts = [], isLoading: productsLoading } = useQuery({
    queryKey: qk.catalog.products(),
    queryFn: () => catalogApi.listProducts({ limit: 500 }),
  });

  const { data: productStocks = [] } = useQuery({
    queryKey: qk.stock.productStocks({ location_id: sourceLocation?.id }),
    queryFn: () => stockApi.listProductStocks({ location_id: sourceLocation!.id, limit: 500 }),
    enabled: !!sourceLocation,
  });

  const stockByProduct = useMemo(
    () => Object.fromEntries(productStocks.map((s) => [s.product_id, s.quantity])),
    [productStocks],
  );

  const [q, setQ] = useState("");
  const [lines, setLines] = useState<Record<string, TransferLine>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const withStock = rawProducts.filter((p) => (stockByProduct[p.id] ?? 0) > 0);
    if (!needle) return withStock.slice(0, 60);
    return withStock.filter(
      (p) => p.name.toLowerCase().includes(needle) || (p.sku ?? "").toLowerCase().includes(needle),
    );
  }, [rawProducts, stockByProduct, q]);

  const items = useMemo(() => Object.values(lines), [lines]);

  const addProduct = (id: number, name: string) => {
    const available = stockByProduct[id] ?? 0;
    const key = `p-${id}`;
    setLines((prev) => {
      const existing = prev[key];
      const nextQty = Math.min((existing?.quantity ?? 0) + 1, available);
      return { ...prev, [key]: { key, productId: id, name, quantity: nextQty, available } };
    });
  };
  const setQty = (key: string, qty: number) => {
    setLines((prev) => {
      const line = prev[key];
      if (!line) return prev;
      if (qty <= 0) {
        const { [key]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: { ...line, quantity: Math.min(qty, line.available) } };
    });
  };
  const inc = (key: string) => setQty(key, (lines[key]?.quantity ?? 0) + 1);
  const dec = (key: string) => setQty(key, (lines[key]?.quantity ?? 0) - 1);
  const remove = (key: string) =>
    setLines((prev) => {
      const { [key]: _removed, ...rest } = prev;
      return rest;
    });

  // Reset the cart whenever the source changes — quantities/availability
  // were computed against the PREVIOUS source's stock and no longer apply.
  const changeSource = (v: string) => {
    setSourceValue(v);
    setLines({});
  };

  const destOptions = stores.filter((s) => String(s.id) !== sourceValue);

  const canSubmit =
    canCreate &&
    (sourceStoreId !== null || sourceIsPrincipale) &&
    (destStoreId !== null || destIsPrincipale) &&
    !(sourceIsPrincipale && destIsPrincipale) &&
    sourceValue !== destValue &&
    items.length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const payload: TransfertCreate = {
        boutique_source_id: sourceStoreId ?? undefined,
        source_est_principale: sourceIsPrincipale,
        boutique_destination_id: destStoreId ?? undefined,
        destination_est_principale: destIsPrincipale,
        motif: motif.trim() || undefined,
        lignes: items.map((l) => ({ produit_id: l.productId, quantite: l.quantity })),
      };
      const created = await transfertsApi.create(payload);
      await qc.invalidateQueries({ queryKey: ["transferts"] });
      toast.success(`Transfert ${created.numero} créé et expédié`);
      await navigate({ to: "/app/transfers/$id", params: { id: String(created.id) } });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.detail : err instanceof Error ? err.message : "Erreur";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Nouveau transfert"
        description="Le stock de la boutique source est décrémenté immédiatement à la création."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/app/transfers">{t("common.cancel") as string}</Link>
            </Button>
            <Button onClick={submit} disabled={isSubmitting || !canSubmit}>
              {isSubmitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Créer et expédier
            </Button>
          </>
        }
      />

      {!canCreate ? (
        <Card className="shadow-soft">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Vous n'avez pas le privilège de créer un transfert.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <Card className="shadow-soft">
              <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Boutique source</Label>
                  <Select value={sourceValue} onValueChange={changeSource} disabled={!!store}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir…" />
                    </SelectTrigger>
                    <SelectContent>
                      {canView && (
                        <SelectItem value={PRINCIPALE_VALUE}>Boutique principale</SelectItem>
                      )}
                      {stores.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!!store && (
                    <p className="text-[11px] text-muted-foreground">
                      Verrouillé sur votre boutique active.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Boutique destination</Label>
                  <Select value={destValue} onValueChange={setDestValue}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={PRINCIPALE_VALUE}>Boutique principale</SelectItem>
                      {destOptions.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-medium">Motif (optionnel)</Label>
                  <Textarea
                    rows={2}
                    value={motif}
                    onChange={(e) => setMotif(e.target.value)}
                    placeholder="Ex : rééquilibrage de stock entre boutiques"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-soft">
              <div className="border-b p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Rechercher un article en stock…"
                    className="h-9 pl-8"
                    disabled={!sourceLocation}
                  />
                </div>
              </div>
              {!sourceLocation ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Choisissez une boutique source pour voir son stock disponible.
                </div>
              ) : productsLoading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Chargement…</div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Aucun article en stock ne correspond.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2">
                  {filtered.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => addProduct(p.id, p.name)}
                      className="group flex items-center justify-between gap-3 bg-background p-3 text-left hover:bg-accent/30"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{p.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          Disponible : {stockByProduct[p.id] ?? 0}
                        </div>
                      </div>
                      <Plus className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="shadow-soft">
              <div className="flex items-center justify-between border-b p-3">
                <div className="flex items-center gap-2">
                  <ArrowLeftRight className="h-4 w-4" />
                  <span className="text-sm font-semibold">Articles à transférer</span>
                </div>
                <span className="text-xs text-muted-foreground">{items.length} ligne(s)</span>
              </div>
              {items.length === 0 ? (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  Ajoutez des articles au transfert
                </div>
              ) : (
                <ul className="divide-y">
                  {items.map((l) => (
                    <li
                      key={l.key}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{l.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Disponible : {l.available}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => dec(l.key)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-7 text-center text-sm font-semibold tabular-nums">
                          {l.quantity}
                        </span>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => inc(l.key)}
                          disabled={l.quantity >= l.available}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => remove(l.key)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
