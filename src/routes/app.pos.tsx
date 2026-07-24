import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useBarcodeScanner } from "@/lib/use-barcode-scanner";
import { matchScan } from "@/lib/barcode-match";
import { CameraScannerDialog } from "@/components/pos/camera-scanner-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Search, Plus, Minus, ShoppingBag, ShoppingCart, Check, AlertTriangle, PackageX,
  Trash2, Hash, Percent, Pause, Loader2, Store as StoreIcon, Tag, Ban, User, UserX, X, Clock,
  Zap, ZapOff, Camera, FileText, LayoutGrid, List,
} from "lucide-react";
import { fmtXAF } from "@/lib/mock-data";
import { catalogApi, stockApi, clientsApi, ventesApi, qk } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { useWorkContext } from "@/lib/work-context";
import {
  type Discount, type CartLine, type TaxConfig,
  clampDiscount, clampQuantity, computeCartTotals, discountAmount, lineGrossAmount, lineNetAmount,
  NO_DISCOUNT, DEFAULT_TAX,
} from "@/lib/pos-cart";
import { PrintPreviewDialog } from "@/lib/print-engine";
import { saleToDocument, cartToInvoiceDocument } from "@/lib/pos-print-adapter";
import {
  type PaymentMethod, type PaymentLine,
  PAYMENT_METHOD_CONFIG, PAYMENT_METHOD_LABEL, getMethodConfig, computeChange, sumPaid, toApiPayments,
} from "@/lib/payment-engine";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import type { ClientRead, VenteCreate, VenteRead } from "@/lib/types";

export const Route = createFileRoute("/app/pos")({ component: POS });

type StockFilter = "all" | "in" | "low" | "out";
type StatusFilter = "all" | "active" | "inactive" | "archived";
type Unavailable = "deleted" | "archived" | null;

interface HeldSale {
  id: string;
  clientId: number;
  clientName: string;
  cart: Record<number, CartLine>;
  globalDiscount: Discount;
  tax: TaxConfig;
  heldAt: string;
  total: number;
}

const HOLDS_KEY = "pos:holds";
const VIEW_MODE_KEY = "pos:viewMode";

// Catalog product + its stock at the active store's location, merged into the
// single shape the POS grid/cart actually need. Real data only — no mock.
type PosProduct = {
  id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string;
  price: number;
  image: string | null;
  status: "active" | "inactive" | "archived";
  stock: number;
  alertThreshold: number;
};

function stockState(p: { stock: number; alertThreshold: number }): "in" | "low" | "out" {
  if (p.stock <= 0) return "out";
  if (p.alertThreshold > 0 && p.stock <= p.alertThreshold) return "low";
  return "in";
}

function POS() {
  const { t } = useT();
  const { store, user, has } = useWorkContext();
  const qc = useQueryClient();

  // ── Real data: products (global catalog) + stock at this store's location ──
  const { data: location, isLoading: locationLoading } = useQuery({
    queryKey: qk.stock.locations({ store_id: store?.id, type: "STORE" }),
    queryFn: async () => {
      const list = await stockApi.listLocations({ store_id: store!.id, type: "STORE", limit: 5 });
      return list[0] ?? null;
    },
    enabled: !!store,
  });

  const { data: rawProducts = [], isLoading: productsLoading } = useQuery({
    queryKey: qk.catalog.products(),
    queryFn: () => catalogApi.listProducts({ limit: 500 }),
  });

  const { data: categories = [] } = useQuery({
    queryKey: qk.catalog.productCategories,
    queryFn: () => catalogApi.listProductCategories({ limit: 200 }),
  });

  const { data: productStocks = [], isLoading: stocksLoading } = useQuery({
    queryKey: qk.stock.productStocks({ location_id: location?.id }),
    queryFn: () => stockApi.listProductStocks({ location_id: location!.id, limit: 500 }),
    enabled: !!location,
  });

  const { data: clients = [] } = useQuery({
    queryKey: qk.clients.list(),
    queryFn: () => clientsApi.list({ limit: 200 }),
  });

  const categoryName = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories],
  );
  const stockByProduct = useMemo(
    () => Object.fromEntries(productStocks.map((s) => [s.product_id, s])),
    [productStocks],
  );

  // Catalog products are global; availability is scoped to this store's
  // location. A product with no stock row here simply shows as 0/rupture —
  // it still "belongs" to the boutique in the sense that it's sellable here.
  const products: PosProduct[] = useMemo(
    () =>
      rawProducts.map((p) => {
        const s = stockByProduct[p.id];
        return {
          id: p.id,
          name: p.name,
          sku: p.sku,
          barcode: p.barcode,
          category: p.category_product_id
            ? categoryName[p.category_product_id] ?? (t("common.uncategorized") as string)
            : (t("common.uncategorized") as string),
          price: Number(p.prix_vente),
          image: p.images?.[0] ?? null,
          status: p.status as PosProduct["status"],
          stock: s?.quantity ?? 0,
          alertThreshold: s?.alert_threshold ?? 0,
        };
      }),
    [rawProducts, stockByProduct, categoryName],
  );

  const productById = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);

  const isLoading = productsLoading || locationLoading || (!!location && stocksLoading);
  const categoryOptions = useMemo(() => ["All", ...categories.map((c) => c.name)], [categories]);

  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [stockF, setStockF] = useState<StockFilter>("all");
  const [statusF, setStatusF] = useState<StatusFilter>("active");
  const [viewMode, setViewMode] = useState<"grid" | "list">(
    () => (localStorage.getItem(VIEW_MODE_KEY) as "grid" | "list" | null) ?? "grid",
  );
  const setAndPersistViewMode = (mode: "grid" | "list") => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  };

  // ── Cart state — 100% local, no API of any kind reads or writes this. ──────
  // Keyed by productId. Each line owns its own price/discount, decoupled from
  // the live catalog after it's added (see lib/pos-cart.ts for why).
  const [cart, setCart] = useState<Record<number, CartLine>>({});
  const [globalDiscount, setGlobalDiscount] = useState<Discount>(NO_DISCOUNT);
  const [tax, setTax] = useState<TaxConfig>(DEFAULT_TAX);

  const [pay, setPay] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedSale, setCompletedSale] = useState<VenteRead | null>(null);
  const [ticketClientName, setTicketClientName] = useState<string | null>(null);
  // "Générer la facture" — a pre-sale preview/print of the cart, distinct
  // from the post-encaissement sale_receipt (nothing is persisted here).
  const [invoicePreviewOpen, setInvoicePreviewOpen] = useState(false);

  // ── Payment + client — built up via the generic payment engine
  // (lib/payment-engine.ts). Nothing here is sent until "Valider"; the
  // engine only shapes the draft, toApiPayments() converts it at submit. ──
  const [selectedClient, setSelectedClient] = useState<ClientRead | null>(null);
  // Whether the goods leave right away or the sale is rung up "non livré"
  // (customer collects later — stock stays put until confirmed). Entirely
  // independent from payment: a credit sale can still be delivered now.
  const [deliverNow, setDeliverNow] = useState(true);
  const [payments, setPayments] = useState<PaymentLine[]>([]);
  const [draftMode, setDraftMode] = useState<PaymentMethod>("especes");
  const [draftAmount, setDraftAmount] = useState("");
  const [draftTendered, setDraftTendered] = useState("");
  const [draftRef, setDraftRef] = useState("");
  const [draftNote, setDraftNote] = useState("");

  // ── Ventes en attente — stockées en sessionStorage pour survivre aux rechargements ──
  const [holds, setHolds] = useState<HeldSale[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(HOLDS_KEY) ?? "[]"); }
    catch { return []; }
  });
  const [holdsOpen, setHoldsOpen] = useState(false);
  const [holdClientOpen, setHoldClientOpen] = useState(false);

  useEffect(() => {
    sessionStorage.setItem(HOLDS_KEY, JSON.stringify(holds));
  }, [holds]);

  const filtered = useMemo(() => products.filter(p => {
    if (cat !== "All" && p.category !== cat) return false;
    if (statusF !== "all" && p.status !== statusF) return false;
    const s = stockState(p);
    if (stockF !== "all" && s !== stockF) return false;
    const needle = q.trim().toLowerCase();
    if (
      needle &&
      !p.name.toLowerCase().includes(needle) &&
      !(p.sku ?? "").toLowerCase().includes(needle) &&
      !(p.barcode ?? "").toLowerCase().includes(needle)
    ) return false;
    return true;
  }), [products, cat, q, stockF, statusF]);

  // View-model: every cart line, joined with the *live* product so we can
  // detect a product deleted from the catalog or archived since it was added.
  const cartItems = useMemo(
    () =>
      Object.values(cart).map((line) => {
        const live = productById[line.productId];
        const unavailable: Unavailable = !live ? "deleted" : live.status !== "active" ? "archived" : null;
        return {
          line,
          unavailable,
          maxStock: live ? live.stock : 0,
          gross: lineGrossAmount(line),
          net: lineNetAmount(line),
        };
      }),
    [cart, productById],
  );

  // The single source of truth for every total on screen — see lib/pos-cart.ts.
  const totals = useMemo(
    () => computeCartTotals(Object.values(cart), globalDiscount, tax),
    [cart, globalDiscount, tax],
  );

  const paidTotal = useMemo(() => sumPaid(payments), [payments]);
  const remaining = Math.max(0, totals.total - paidTotal);

  // ── Barcode scanner — placed AFTER all state declarations to avoid TDZ ───
  const handleScan = useCallback(({ code }: { code: string; durationMs: number }) => {
    if (!code.trim()) return;

    const result = matchScan(products, code);
    if (result.kind === "ambiguous") {
      setQ(code); // surface in search bar so caissier can pick
      toast.message(t("pos.scanMultiple") as string, { description: code });
      return;
    }
    if (result.kind === "not_found") {
      toast.error(t("pos.scanNotFound") as string, { description: code });
      return;
    }
    const match = result.product;
    if (match.status !== "active") {
      toast.error(t("pos.scanArchived") as string, { description: match.name });
      return;
    }
    if (match.stock <= 0) {
      toast.error(t("pos.outOfStock") as string, { description: match.name, icon: <PackageX className="h-4 w-4" /> });
      return;
    }
    const existing = cart[match.id];
    const currentQty = existing?.quantity ?? 0;
    if (currentQty + 1 > match.stock) {
      toast.warning(t("pos.notEnoughStock") as string, { description: `${match.name} · ${match.stock} ${t("pos.unitsLeft") as string}` });
      return;
    }
    // Add/increment — mirrors the manual add() logic exactly
    setCart(c => ({
      ...c,
      [match.id]: existing
        ? { ...existing, quantity: existing.quantity + 1 }
        : { productId: match.id, name: match.name, unitPrice: match.price, quantity: 1, discount: NO_DISCOUNT },
    }));
    if (match.stock - currentQty - 1 <= match.alertThreshold && match.alertThreshold > 0) {
      toast.message(t("pos.lowStockBadge") as string, {
        description: `${match.name} · ${match.stock - currentQty - 1} ${t("pos.unitsLeft") as string}`,
      });
    }
  }, [products, cart, t]);

  const scannerInputRef = useBarcodeScanner(handleScan);

  // Give the hidden HID-scanner input focus as soon as the page is ready —
  // reliable capture no longer depends on the cashier clicking a visible
  // bar first (the hook itself re-focuses it after every scan).
  useEffect(() => {
    scannerInputRef.current?.focus();
  }, [scannerInputRef]);

  // ── Camera scanner — batch merge of a whole scanning session into the
  // cart in one shot, applying the exact same guards as add()/handleScan(). ──
  const mergeScannedProducts = useCallback((entries: { code: string; qty: number }[]) => {
    let addedCount = 0;
    let skippedCount = 0;
    setCart((c) => {
      const next = { ...c };
      for (const { code, qty } of entries) {
        const result = matchScan(products, code);
        if (result.kind !== "found" || result.product.status !== "active") {
          skippedCount++;
          continue;
        }
        const p = result.product;
        const existing = next[p.id];
        const currentQty = existing?.quantity ?? 0;
        const desiredQty = Math.min(currentQty + qty, p.stock);
        if (desiredQty <= currentQty) {
          skippedCount++;
          continue;
        }
        next[p.id] = existing
          ? { ...existing, quantity: desiredQty }
          : { productId: p.id, name: p.name, unitPrice: p.price, quantity: desiredQty, discount: NO_DISCOUNT };
        addedCount++;
      }
      return next;
    });
    if (addedCount > 0) {
      toast.success(t("pos.cameraAddedToCart", { count: addedCount }) as string);
    }
    if (skippedCount > 0) {
      toast.warning(t("pos.cameraSomeSkipped", { count: skippedCount }) as string);
    }
  }, [products, t]);

  // Live preview of the draft payment row — recomputed on every keystroke,
  // never persisted until "Ajouter" pushes it into `payments`.
  const draftMethodConfig = getMethodConfig(draftMode);
  const draftChange = useMemo(() => {
    if (!draftMethodConfig.supportsChange) return 0;
    const amount = Number(draftAmount) || 0;
    const tendered = Number(draftTendered) || 0;
    return tendered > amount ? tendered - amount : 0;
  }, [draftMethodConfig, draftAmount, draftTendered]);

  // Every frontend-side guard before we ever call the API. The backend is
  // still the source of truth (it re-validates everything), but these catch
  // obvious mistakes immediately instead of round-tripping for nothing.
  const validationError = useMemo((): string | null => {
    if (cartItems.length === 0) return t("pos.cartEmpty") as string;
    if (!store) return t("pos.noStore") as string;
    if (!has("ventes.create")) return t("pos.permissionDenied") as string;
    if (cartItems.some((i) => i.line.quantity <= 0)) return t("pos.invalidPaymentAmount") as string;
    if (payments.some((p) => p.montant <= 0)) return t("pos.invalidPaymentAmount") as string;
    if (paidTotal > totals.total) return t("pos.paidExceedsTotal") as string;
    if (remaining > 0 && !selectedClient) return t("pos.clientRequired") as string;
    return null;
  }, [cartItems, store, has, payments, paidTotal, totals.total, remaining, selectedClient, t]);

  const add = (id: number) => {
    const p = productById[id];
    if (!p) return;
    if (p.status !== "active") {
      toast.error(t("pos.productArchived") as string, { description: p.name, icon: <Ban className="h-4 w-4" /> });
      return;
    }
    const s = stockState(p);
    if (s === "out") {
      toast.error(t("pos.outOfStock") as string, { description: p.name, icon: <PackageX className="h-4 w-4" /> });
      return;
    }
    const existing = cart[id];
    const currentQty = existing?.quantity ?? 0;
    if (currentQty + 1 > p.stock) {
      toast.warning(t("pos.notEnoughStock") as string, { description: `${p.name} · ${p.stock} ${t("pos.unitsLeft") as string}` });
      return;
    }
    if (s === "low") {
      toast.message(t("pos.lowStockBadge") as string, { description: `${p.name} · ${p.stock} ${t("pos.unitsLeft") as string}`, icon: <AlertTriangle className="h-4 w-4" /> });
    }
    setCart(c => ({
      ...c,
      [id]: existing
        ? { ...existing, quantity: existing.quantity + 1 }
        : { productId: id, name: p.name, unitPrice: p.price, quantity: 1, discount: NO_DISCOUNT },
    }));
  };

  const dec = (id: number) => setCart(c => {
    const line = c[id];
    if (!line) return c;
    const n = line.quantity - 1;
    if (n <= 0) { const { [id]: _drop, ...rest } = c; return rest; }
    return { ...c, [id]: { ...line, quantity: n } };
  });

  const removeLine = (id: number) => setCart(c => { const { [id]: _drop, ...rest } = c; return rest; });

  const setQty = (id: number, n: number) => {
    const line = cart[id];
    if (!line) return;
    const live = productById[id];
    const maxStock = live ? live.stock : 0;
    if (Number.isFinite(n) && n > maxStock) {
      toast.warning(t("pos.notEnoughStock") as string, { description: `${line.name} · ${maxStock} ${t("pos.unitsLeft") as string}` });
    }
    const v = clampQuantity(n, maxStock);
    setCart(c => {
      if (v <= 0) { const { [id]: _drop, ...rest } = c; return rest; }
      return { ...c, [id]: { ...c[id], quantity: v } };
    });
  };

  const setLineDiscount = (id: number, discount: Discount) => {
    setCart(c => {
      const line = c[id];
      if (!line) return c;
      return { ...c, [id]: { ...line, discount: clampDiscount(discount) } };
    });
  };

  const clearCart = () => setCart({});

  // ── Ventes en attente ──────────────────────────────────────────────────────

  const handleHold = () => {
    if (cartItems.length === 0) {
      toast.error(t("pos.cartEmpty") as string);
      return;
    }
    setHoldClientOpen(true);
  };

  const confirmHold = (client: ClientRead) => {
    const held: HeldSale = {
      id: crypto.randomUUID(),
      clientId: client.id,
      clientName: `${client.name}${client.prenom ? ` ${client.prenom}` : ""}`,
      cart: { ...cart },
      globalDiscount: { ...globalDiscount },
      tax: { ...tax },
      heldAt: new Date().toISOString(),
      total: totals.total,
    };
    setHolds((h) => [...h, held]);
    clearCart();
    setGlobalDiscount(NO_DISCOUNT);
    setTax(DEFAULT_TAX);
    setHoldClientOpen(false);
    toast.success(t("pos.holdSaved") as string, { description: client.name });
  };

  const recallHold = (hold: HeldSale) => {
    if (cartItems.length > 0) {
      toast.error(t("pos.holdRecallBlocked") as string);
      return;
    }
    setCart(hold.cart);
    setGlobalDiscount(hold.globalDiscount);
    setTax(hold.tax);
    setHolds((h) => h.filter((x) => x.id !== hold.id));
    setHoldsOpen(false);
    toast.success(t("pos.holdRecalled") as string, { description: hold.clientName });
  };

  const deleteHold = (id: string) => setHolds((h) => h.filter((x) => x.id !== id));

  const openPay = () => setPay(true);

  // Canceling checkout discards the in-progress payment split (it may no
  // longer match the cart total by the time the dialog is reopened) but
  // deliberately keeps the cart itself untouched.
  // Shared by "Annuler" and a successful sale — a fresh checkout should
  // never inherit the previous one's payment method or draft fields.
  const resetPaymentDraft = () => {
    setPayments([]);
    setSelectedClient(null);
    setDeliverNow(true);
    setDraftMode("especes");
    setDraftAmount("");
    setDraftTendered("");
    setDraftRef("");
    setDraftNote("");
  };

  const closePay = () => {
    setPay(false);
    resetPaymentDraft();
  };

  // Builds one PaymentLine from the current draft fields and appends it.
  // `tendered` is only kept when it actually exceeds the applied amount —
  // that's the one case computeChange() has anything to show.
  const pushPayment = (amount: number) => {
    const tenderedNum = Number(draftTendered) || 0;
    const supportsChange = getMethodConfig(draftMode).supportsChange;
    setPayments(p => [...p, {
      id: crypto.randomUUID(),
      method: draftMode,
      montant: amount,
      tendered: supportsChange && tenderedNum > amount ? tenderedNum : undefined,
      reference: draftRef.trim() || undefined,
      note: draftNote.trim() || undefined,
    }]);
    setDraftAmount("");
    setDraftTendered("");
    setDraftRef("");
    setDraftNote("");
  };

  const addPayment = () => {
    const amount = Number(draftAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t("pos.invalidPaymentAmount") as string);
      return;
    }
    if (paidTotal + amount > totals.total) {
      toast.error(t("pos.paymentExceedsTotal") as string);
      return;
    }
    pushPayment(amount);
  };

  // Un seul clic = paiement intégral du solde restant ajouté immédiatement.
  const payAll = () => {
    if (remaining > 0) pushPayment(remaining);
  };

  const removePayment = (id: string) => setPayments(p => p.filter((l) => l.id !== id));

  // ── The only place that talks to the transactional engine. Everything
  // else above is just UI state until this fires. ──────────────────────────
  const confirmSale = async () => {
    if (isSubmitting) return; // double-click guard
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setIsSubmitting(true);
    try {
      const payload: VenteCreate = {
        boutique_id: store!.id,
        client_id: selectedClient?.id,
        type_vente: remaining > 0 ? "credit" : "directe",
        remise: totals.globalDiscount,
        lignes: cartItems.map(({ line }) => ({
          produit_id: line.productId,
          quantite: line.quantity,
          prix_unitaire: line.unitPrice,
          remise: discountAmount(lineGrossAmount(line), line.discount),
        })),
        paiements: toApiPayments(payments),
        livraison_statut: deliverNow ? "livre" : "non_livre",
      };
      const sale = await ventesApi.create(payload);

      // Real data changed server-side — every screen reading it must refetch.
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["catalog", "products"] }),
        qc.invalidateQueries({ queryKey: ["stock"] }),
        qc.invalidateQueries({ queryKey: ["ventes"] }),
      ]);

      setTicketClientName(
        selectedClient ? `${selectedClient.name}${selectedClient.prenom ? ` ${selectedClient.prenom}` : ""}` : null,
      );
      clearCart();
      setGlobalDiscount(NO_DISCOUNT);
      setTax(DEFAULT_TAX);
      resetPaymentDraft();
      setPay(false);
      setCartOpen(false);
      setCompletedSale(sale);
      toast.success(t("status.completed") as string, { description: `VENTE-${sale.id}` });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.detail : err instanceof Error ? err.message : "Erreur";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const cartPanel = (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b px-4 py-3 pr-12 sm:px-5 sm:py-3.5">
        <h3 className="text-sm font-semibold">{t("pos.cart") as string}</h3>
        <p className="truncate text-xs text-muted-foreground">{t("walkin") as string} · {t("common.cashier") as string}: {user ? `${user.firstname} ${user.lastname}` : "…"}</p>
      </div>
      <ScrollArea className="flex-1">
        {cartItems.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-muted-foreground"><ShoppingBag className="h-6 w-6" /></div>
            <p className="mt-4 text-sm font-medium">{t("pos.cartEmpty") as string}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("pos.cartEmptyHint") as string}</p>
          </div>
        ) : (
          <ul className="divide-y">
            {cartItems.map(({ line, unavailable, maxStock, gross, net }) => {
              const hasDiscount = net < gross;
              return (
                <li key={line.productId} className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-4 py-3 sm:px-5", unavailable && "bg-destructive/5")}>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{line.name}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {fmtXAF(line.unitPrice)} ·{" "}
                      {hasDiscount ? (
                        <>
                          <span className="line-through opacity-60">{fmtXAF(gross)}</span>{" "}
                          <span className="font-medium text-foreground">{fmtXAF(net)}</span>
                        </>
                      ) : (
                        fmtXAF(gross)
                      )}
                    </div>
                    {unavailable && (
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-destructive">
                        <Ban className="h-3 w-3" />
                        {unavailable === "archived" ? (t("pos.productArchived") as string) : (t("pos.productDeleted") as string)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => dec(line.productId)} aria-label="−"><Minus className="h-3 w-3" /></Button>
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={line.quantity}
                      min={0}
                      max={maxStock}
                      onChange={(e) => setQty(line.productId, Number(e.target.value))}
                      className="h-7 w-12 px-1 text-center text-sm font-semibold tabular-nums"
                    />
                    <Button
                      size="icon" variant="outline" className="h-7 w-7"
                      onClick={() => add(line.productId)}
                      disabled={!!unavailable}
                      aria-label="+"
                      title={unavailable ? (t("pos.productUnavailableHint") as string) : undefined}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    <LineDiscountPopover
                      discount={line.discount}
                      onChange={(d) => setLineDiscount(line.productId, d)}
                    />
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => removeLine(line.productId)} aria-label="remove"><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
      <div className="space-y-2 border-t px-4 py-3 sm:px-5">
        <div className="grid grid-cols-[auto_1fr] items-center gap-2">
          <Select value={globalDiscount.kind} onValueChange={(v) => setGlobalDiscount(d => clampDiscount({ ...d, kind: v as Discount["kind"] }))}>
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">% {t("pos.discount") as string}</SelectItem>
              <SelectItem value="amount">{t("pos.discountAmount") as string}</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            {globalDiscount.kind === "percent"
              ? <Percent className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              : <Hash className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />}
            <Input
              type="number" min={0}
              value={globalDiscount.value}
              onChange={(e) => setGlobalDiscount(d => clampDiscount({ ...d, value: Number(e.target.value) }))}
              className="h-8 pr-7 tabular-nums"
              placeholder={t("pos.discount") as string}
            />
          </div>
        </div>
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
          <span className="w-20 text-xs font-medium text-muted-foreground">{t("pos.taxRate") as string}</span>
          <div className="relative">
            <Percent className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="number" min={0} step={0.25}
              value={tax.rate}
              disabled={!tax.enabled}
              onChange={(e) => setTax(c => ({ ...c, rate: Math.max(0, Number(e.target.value)) }))}
              className="h-8 pr-7 tabular-nums"
            />
          </div>
          <div className="flex items-center gap-1.5" title={t("pos.taxEnabled") as string}>
            <Switch checked={tax.enabled} onCheckedChange={(v) => setTax(c => ({ ...c, enabled: v }))} />
          </div>
        </div>
      </div>
      <div className="space-y-1 px-4 py-3 text-sm sm:px-5">
        <div className="flex justify-between text-muted-foreground"><span>{t("common.subtotal") as string}</span><span className="tabular-nums">{fmtXAF(totals.subtotal)}</span></div>
        {totals.lineDiscounts > 0 && <div className="flex justify-between text-success"><span>{t("pos.lineDiscount") as string}</span><span className="tabular-nums">−{fmtXAF(totals.lineDiscounts)}</span></div>}
        {totals.globalDiscount > 0 && <div className="flex justify-between text-success"><span>{t("common.discount") as string}{globalDiscount.kind === "percent" ? ` ${globalDiscount.value}%` : ""}</span><span className="tabular-nums">−{fmtXAF(totals.globalDiscount)}</span></div>}
        <div className="flex justify-between text-muted-foreground">
          <span>{t("common.tax") as string} {tax.rate.toString().replace(".", ",")}%{!tax.enabled && ` (${t("status.inactive") as string})`}</span>
          <span className="tabular-nums">{fmtXAF(totals.tax)}</span>
        </div>
        <div className="flex justify-between border-t pt-2 text-base font-bold"><span>{t("common.total") as string}</span><span className="tabular-nums">{fmtXAF(totals.total)}</span></div>
      </div>
      <div className="grid grid-cols-2 gap-2 px-4 pb-3 sm:px-5">
        <Button variant="outline" size="sm" className="relative" onClick={handleHold}
          disabled={cartItems.length === 0}>
          <Pause className="mr-1.5 h-3.5 w-3.5" /> {t("pos.hold") as string}
        </Button>
        <Button variant="outline" size="sm" onClick={clearCart}><X className="mr-1.5 h-3.5 w-3.5" /> {t("pos.clear") as string}</Button>
      </div>
      {holds.length > 0 && (
        <div className="px-4 pb-2 sm:px-5">
          <Button variant="outline" size="sm" className="w-full gap-2 text-warning border-warning/30 bg-warning/5 hover:bg-warning/10"
            onClick={() => setHoldsOpen(true)}>
            <Clock className="h-3.5 w-3.5" />
            {t("pos.heldSalesBtn") as string}
            <Badge className="ml-auto h-5 min-w-5 rounded-full bg-warning text-[10px] text-warning-foreground">
              {holds.length}
            </Badge>
          </Button>
        </div>
      )}
      <div className="px-4 pb-2 sm:px-5">
        <Button variant="outline" size="sm" className="w-full gap-2" disabled={cartItems.length === 0}
          onClick={() => setInvoicePreviewOpen(true)}>
          <FileText className="h-3.5 w-3.5" /> {t("pos.generateInvoice") as string}
        </Button>
      </div>
      <div className="px-4 pb-5 sm:px-5">
        <Button className="h-12 w-full text-base shadow-glow" disabled={cartItems.length === 0} onClick={openPay}>
          {t("pos.chargeAmount", { amount: fmtXAF(totals.total) }) as string}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="-m-4 grid grid-cols-1 sm:-m-6 lg:-m-8 lg:h-[calc(100dvh-7rem)] lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_400px]">
      <div className="flex min-h-0 flex-col bg-secondary/40 p-3 sm:p-5 lg:p-6">
        {/* Hardware barcode scanner (HID/keyboard-wedge) capture — no visible
            UI: the hook listens page-wide, this input just gives it a
            reliable, always-available focus target (auto-(re)focused after
            every scan) so a physical scanner works from anywhere on the
            page without a dedicated status bar cluttering the screen. */}
        <input
          ref={scannerInputRef}
          data-scanner="true"
          aria-hidden="true"
          tabIndex={-1}
          className="sr-only"
          onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
          readOnly
        />
        <div className="mb-3 flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder={t("pos.searchProduct") as string} className="h-10 bg-background pl-8 shadow-soft" />
          </div>
          <Button
            variant="outline" size="icon"
            className="h-10 w-10 shrink-0 border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
            onClick={() => setCameraOpen(true)}
            title={t("pos.cameraScan") as string}
          >
            <Camera className="h-4 w-4" />
          </Button>
          <Sheet open={cartOpen} onOpenChange={setCartOpen}>
            <SheetTrigger asChild>
              <Button variant="default" size="icon" className="relative h-10 w-10 shrink-0 lg:hidden">
                <ShoppingCart className="h-4 w-4" />
                {totals.itemCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                    {totals.itemCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full max-w-md p-0 sm:max-w-md">{cartPanel}</SheetContent>
          </Sheet>
        </div>

        {!store ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-background/50 px-6 py-16 text-center">
            <StoreIcon className="mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">{t("pos.noStore") as string}</p>
            <p className="text-xs text-muted-foreground">{t("pos.noStoreHint") as string}</p>
          </div>
        ) : (
          <>
            {/* Filters */}
            <div className="mb-3 grid grid-cols-2 gap-2 sm:flex sm:items-center">
              <Select value={stockF} onValueChange={(v) => setStockF(v as StockFilter)}>
                <SelectTrigger className="h-9 bg-background sm:w-44"><SelectValue placeholder={t("pos.filter.stock") as string} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("pos.filter.stockAll") as string}</SelectItem>
                  <SelectItem value="in">{t("pos.filter.inStock") as string}</SelectItem>
                  <SelectItem value="low">{t("pos.lowStockBadge") as string}</SelectItem>
                  <SelectItem value="out">{t("pos.outOfStock") as string}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusF} onValueChange={(v) => setStatusF(v as StatusFilter)}>
                <SelectTrigger className="h-9 bg-background sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("pos.filter.statusAll") as string}</SelectItem>
                  <SelectItem value="active">{t("status.active") as string}</SelectItem>
                  <SelectItem value="inactive">{t("status.inactive") as string}</SelectItem>
                  <SelectItem value="archived">{t("status.archived") as string}</SelectItem>
                </SelectContent>
              </Select>
              <div className="col-span-2 flex items-center gap-3 text-xs text-muted-foreground sm:ml-auto">
                {filtered.length} {t("pos.results") as string}
                <div className="flex overflow-hidden rounded-lg border bg-background">
                  <button type="button" onClick={() => setAndPersistViewMode("grid")}
                    aria-label={t("pos.viewGrid") as string}
                    className={cn("grid h-8 w-8 place-items-center transition-colors",
                      viewMode === "grid" ? "bg-foreground text-background" : "hover:bg-accent")}>
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => setAndPersistViewMode("list")}
                    aria-label={t("pos.viewList") as string}
                    className={cn("grid h-8 w-8 place-items-center border-l transition-colors",
                      viewMode === "list" ? "bg-foreground text-background" : "hover:bg-accent")}>
                    <List className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <ScrollArea className="-mx-2 mb-3 whitespace-nowrap">
              <div className="flex gap-1.5 px-2">
                {categoryOptions.map(c => (
                  <button key={c} onClick={() => setCat(c)} className={cn("rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    cat === c ? "bg-foreground text-background shadow-soft" : "bg-background hover:bg-accent")}>
                    {c === "All" ? (t("pos.category.all") as string) : c}
                  </button>
                ))}
              </div>
            </ScrollArea>

            <ScrollArea className="flex-1">
              {isLoading ? (
                <div className="grid h-full place-items-center py-16 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <div className={viewMode === "grid"
                  ? "grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5"
                  : "flex flex-col gap-1.5"}>
                  {filtered.map(p => {
                    const qty = cart[p.id]?.quantity ?? 0;
                    const selected = qty > 0;
                    const s = stockState(p);
                    const out = s === "out";
                    const low = s === "low";

                    if (viewMode === "list") {
                      return (
                        <button key={p.id} onClick={() => add(p.id)} disabled={out} aria-disabled={out}
                          className={cn(
                            "group flex items-center gap-3 rounded-xl border bg-background p-2 text-left shadow-soft transition-all",
                            !out && "hover:shadow-elevated",
                            out && "cursor-not-allowed opacity-60 grayscale",
                            selected && "border-primary ring-2 ring-primary/60 shadow-glow"
                          )}>
                          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-secondary to-accent/30">
                            {p.image && (
                              <img src={p.image} alt={p.name} loading="lazy"
                                className="h-full w-full object-cover"
                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                            )}
                            <div className="pointer-events-none absolute inset-0 grid place-items-center text-muted-foreground opacity-40">
                              <ShoppingBag className="h-5 w-5" />
                            </div>
                            {selected && <div className="absolute inset-0 bg-primary/10" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-medium">{p.name}</span>
                              {out && (
                                <Badge variant="destructive" className="h-5 shrink-0 px-1.5 text-[10px] uppercase">
                                  {t("pos.outOfStock") as string}
                                </Badge>
                              )}
                              {!out && low && (
                                <Badge className="h-5 shrink-0 bg-warning px-1.5 text-[10px] uppercase text-warning-foreground">
                                  {t("pos.restocking") as string}
                                </Badge>
                              )}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">{p.category}</div>
                          </div>
                          <span className="shrink-0 text-sm font-semibold tabular-nums">{fmtXAF(p.price)}</span>
                          <Badge
                            variant={out ? "destructive" : low ? "outline" : "secondary"}
                            className="h-5 shrink-0 px-1.5 text-[10px] tabular-nums"
                            title={`${p.stock} ${t("pos.unitsLeft") as string} · seuil ${p.alertThreshold}`}
                          >
                            {p.stock}
                          </Badge>
                          {selected && (
                            <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                              {qty > 1 ? `×${qty}` : <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                            </span>
                          )}
                        </button>
                      );
                    }

                    return (
                      <button key={p.id} onClick={() => add(p.id)} disabled={out} aria-disabled={out}
                        className={cn(
                          "group relative flex flex-col gap-1.5 rounded-xl border bg-background p-2.5 text-left shadow-soft transition-all sm:p-3",
                          !out && "hover:-translate-y-0.5 hover:shadow-elevated",
                          out && "cursor-not-allowed opacity-60 grayscale",
                          selected && "border-primary ring-2 ring-primary/60 shadow-glow"
                        )}>
                        {selected && (
                          <span className="absolute -right-2 -top-2 z-10 grid h-7 min-w-7 place-items-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground shadow-elevated ring-2 ring-background">
                            {qty > 1 ? `×${qty}` : <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                          </span>
                        )}
                        {out && (
                          <span className="absolute left-2 top-2 z-10 rounded-md bg-destructive px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive-foreground shadow-soft">
                            {t("pos.outOfStock") as string}
                          </span>
                        )}
                        {!out && low && (
                          <span className="absolute left-2 top-2 z-10 rounded-md bg-warning px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning-foreground shadow-soft">
                            {t("pos.restocking") as string}
                          </span>
                        )}
                        <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-gradient-to-br from-secondary to-accent/30">
                          {p.image && (
                            <img src={p.image} alt={p.name} loading="lazy"
                              className="h-full w-full object-cover transition-transform group-hover:scale-105"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                          )}
                          <div className="pointer-events-none absolute inset-0 grid place-items-center text-muted-foreground opacity-40">
                            <ShoppingBag className="h-7 w-7" />
                          </div>
                          {selected && <div className="absolute inset-0 bg-primary/10" />}
                        </div>
                        <div className="line-clamp-2 text-xs font-medium leading-tight">{p.name}</div>
                        <div className="truncate text-[10px] text-muted-foreground">{p.category}</div>
                        <div className="mt-auto flex items-center justify-between gap-1">
                          <span className="truncate text-xs font-semibold tabular-nums sm:text-sm">{fmtXAF(p.price)}</span>
                          <Badge
                            variant={out ? "destructive" : low ? "outline" : "secondary"}
                            className="h-5 shrink-0 px-1.5 text-[10px] tabular-nums"
                            title={`${p.stock} ${t("pos.unitsLeft") as string} · seuil ${p.alertThreshold}`}
                          >
                            {p.stock}
                          </Badge>
                        </div>
                      </button>
                    );
                  })}
                  {filtered.length === 0 && (
                    <div className="col-span-full grid place-items-center rounded-xl border border-dashed bg-background/50 px-6 py-16 text-center">
                      <Search className="mb-2 h-6 w-6 text-muted-foreground" />
                      <p className="text-sm font-medium">{t("pos.noResults") as string}</p>
                      <p className="text-xs text-muted-foreground">{t("pos.noResultsHint") as string}</p>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </>
        )}
      </div>

      <div className="hidden min-h-0 border-l lg:flex lg:flex-col">{cartPanel}</div>

      {/* Checkout dialog */}
      <Dialog open={pay} onOpenChange={(o) => !isSubmitting && (o ? setPay(true) : closePay())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("pos.payment") as string}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl bg-secondary/50 p-4 text-center">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("common.total") as string}</div>
              <div className="text-3xl font-bold tabular-nums">{fmtXAF(totals.total)}</div>
              <div className="mt-1 text-xs text-muted-foreground">{totals.itemCount} {t("pos.results") as string}</div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">{t("pos.customer") as string}</Label>
              <ClientPickerPopover clients={clients} selected={selectedClient} onSelect={setSelectedClient} storeId={store?.id} />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <Label className="text-sm font-medium">{t("pos.deliverNow") as string}</Label>
                <p className="text-xs text-muted-foreground">
                  {deliverNow ? t("pos.deliverNowHint") as string : t("pos.deliverLaterHint") as string}
                </p>
              </div>
              <Switch checked={deliverNow} onCheckedChange={setDeliverNow} />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">{t("pos.payment") as string}</Label>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Select value={draftMode} onValueChange={(v) => setDraftMode(v as PaymentMethod)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHOD_CONFIG.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* ── Saisie du paiement — layout en grille étiquetée ─────── */}
              <div className="rounded-lg border bg-secondary/20 p-3 space-y-3">

                {/* Ligne 1 : montant appliqué à la vente */}
                <div className="grid grid-cols-[130px_1fr] items-center gap-3">
                  <span className="text-xs font-medium text-foreground">
                    {t("pos.amountToRecord") as string}
                  </span>
                  <div className="flex gap-2">
                    <Input
                      type="number" min={0}
                      placeholder="0"
                      value={draftAmount}
                      onChange={(e) => setDraftAmount(e.target.value)}
                      className="h-9 tabular-nums"
                    />
                    {remaining > 0 && (
                      <button
                        type="button"
                        onClick={payAll}
                        className="h-9 shrink-0 rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 text-xs font-medium text-primary hover:bg-primary/10 transition-colors tabular-nums whitespace-nowrap"
                      >
                        = {fmtXAF(remaining)}
                      </button>
                    )}
                  </div>
                </div>

                {/* Ligne 2 : montant physiquement remis — espèces seulement */}
                {draftMethodConfig.supportsChange && (
                  <div className="grid grid-cols-[130px_1fr] items-center gap-3">
                    <span className="text-xs font-medium text-foreground">
                      {t("pos.clientGives") as string}
                      <span className="block text-[10px] font-normal text-muted-foreground">
                        {t("pos.clientGivesHint") as string}
                      </span>
                    </span>
                    <div className="flex gap-2">
                      <Input
                        type="number" min={0}
                        placeholder={t("pos.tendered") as string}
                        value={draftTendered}
                        onChange={(e) => setDraftTendered(e.target.value)}
                        className="h-9 tabular-nums"
                      />
                      <div className={cn(
                        "flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs tabular-nums whitespace-nowrap",
                        draftChange > 0 ? "border-success/40 bg-success/5 text-success font-semibold" : "text-muted-foreground",
                      )}>
                        ↩ {fmtXAF(draftChange)}
                      </div>
                    </div>
                  </div>
                )}

                {/* Ligne 3 : référence (label dynamique selon le mode) */}
                {!draftMethodConfig.supportsChange && (
                  <div className="grid grid-cols-[130px_1fr] items-center gap-3">
                    <span className="text-xs font-medium text-foreground">{draftMethodConfig.referenceLabel}</span>
                    <Input
                      placeholder={draftMethodConfig.referencePlaceholder}
                      value={draftRef}
                      onChange={(e) => setDraftRef(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                )}

                {/* Ligne 4 : commentaire libre */}
                <div className="grid grid-cols-[130px_1fr] items-center gap-3">
                  <span className="text-xs font-medium text-foreground">{t("pos.paymentNote") as string}</span>
                  <Input
                    placeholder={t("pos.paymentNotePlaceholder") as string}
                    value={draftNote}
                    onChange={(e) => setDraftNote(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>

                <Button type="button" className="w-full h-9" onClick={addPayment}>
                  <Plus className="mr-1.5 h-4 w-4" />{t("pos.addPayment") as string}
                </Button>
              </div>

              {payments.length > 0 && (
                <ul className="divide-y rounded-lg border">
                  {payments.map((p) => {
                    const change = computeChange(p);
                    return (
                      <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="min-w-0 truncate">
                          {PAYMENT_METHOD_LABEL[p.method]}
                          {p.reference ? ` · ${p.reference}` : ""}
                          {p.note ? ` · ${p.note}` : ""}
                          {change > 0 && (
                            <span className="text-success"> · {t("pos.change") as string} {fmtXAF(change)}</span>
                          )}
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="tabular-nums font-medium">{fmtXAF(p.montant)}</span>
                          <Button
                            size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:bg-destructive/10"
                            onClick={() => removePayment(p.id)} aria-label="remove-payment"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <Separator />

            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("pos.paid") as string}</span>
                <span className="tabular-nums font-medium">{fmtXAF(paidTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("pos.remaining") as string}</span>
                <span className={cn("tabular-nums font-medium", remaining > 0 && "text-destructive")}>{fmtXAF(remaining)}</span>
              </div>
            </div>

            {validationError && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                {validationError}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={closePay} disabled={isSubmitting}>
              {t("common.cancel") as string}
            </Button>
            <Button disabled={!!validationError || isSubmitting} onClick={confirmSale} className="shadow-glow">
              {isSubmitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
              {t("pos.confirmPayment") as string}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PrintPreviewDialog
        open={!!completedSale}
        document={completedSale
          ? saleToDocument(completedSale, {
              store,
              vendeurName: user ? `${user.firstname} ${user.lastname}` : undefined,
              clientName: ticketClientName,
              productName: (id) => productById[id]?.name ?? `#${id}`,
            })
          : null}
        showSuccess
        onClose={() => setCompletedSale(null)}
      />

      <PrintPreviewDialog
        open={invoicePreviewOpen}
        document={invoicePreviewOpen
          ? cartToInvoiceDocument(cartItems.map((i) => i.line), totals, {
              store,
              vendeurName: user ? `${user.firstname} ${user.lastname}` : undefined,
              client: selectedClient,
            })
          : null}
        showSuccess
        onClose={() => setInvoicePreviewOpen(false)}
      />

      {/* ── Sélection client obligatoire avant mise en attente ──────────── */}
      <Dialog open={holdClientOpen} onOpenChange={(o) => !o && setHoldClientOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-warning/15 text-warning">
                <Pause className="h-4 w-4" />
              </div>
              {t("pos.holdSelectClient") as string}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("pos.holdClientHint") as string}</p>
          <div className="max-h-64 overflow-y-auto rounded-lg border divide-y">
            {clients.map((c) => (
              <button
                key={c.id}
                onClick={() => confirmHold(c)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-secondary text-muted-foreground text-xs font-bold">
                    {c.name.charAt(0)}
                  </span>
                  <span>
                    <span className="block font-medium">{c.name}{c.prenom ? ` ${c.prenom}` : ""}</span>
                    {c.phone && <span className="text-xs text-muted-foreground">{c.phone}</span>}
                  </span>
                </span>
              </button>
            ))}
            {clients.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t("common.empty") as string}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHoldClientOpen(false)}>{t("common.cancel") as string}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Liste des ventes en attente ─────────────────────────────────── */}
      <Sheet open={holdsOpen} onOpenChange={setHoldsOpen}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-sm">
          <SheetHeader className="border-b pb-4">
            <SheetTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-warning" />
              {t("pos.heldSales") as string}
              {holds.length > 0 && (
                <Badge className="bg-warning text-warning-foreground text-xs">{holds.length}</Badge>
              )}
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 py-4">
            {holds.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <Clock className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">{t("pos.holdEmpty") as string}</p>
              </div>
            ) : (
              <ul className="space-y-2 px-1">
                {holds.map((hold) => (
                  <li key={hold.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{hold.clientName}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(hold.heldAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                          {" · "}
                          {hold.cart ? Object.values(hold.cart).length : 0} article(s)
                        </p>
                      </div>
                      <span className="tabular-nums text-sm font-bold text-right shrink-0">
                        {fmtXAF(hold.total)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1" onClick={() => recallHold(hold)}>
                        <Check className="mr-1.5 h-3.5 w-3.5" /> {t("pos.holdRecall") as string}
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive"
                        onClick={() => deleteHold(hold.id)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* ── Scanner caméra — session de scan multi-produits ─────────────── */}
      <CameraScannerDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        products={products}
        onFinish={mergeScannedProducts}
      />
    </div>
  );
}

/* ── Per-line discount popover ────────────────────────────────────────────── */
function LineDiscountPopover({
  discount,
  onChange,
}: {
  discount: Discount;
  onChange: (d: Discount) => void;
}) {
  const { t } = useT();
  const hasDiscount = discount.value > 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant={hasDiscount ? "default" : "outline"}
          className="h-7 w-7"
          aria-label={t("pos.lineDiscount") as string}
          title={t("pos.lineDiscount") as string}
        >
          <Tag className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 space-y-2 p-3">
        <p className="text-xs font-medium text-muted-foreground">{t("pos.lineDiscount") as string}</p>
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <Select value={discount.kind} onValueChange={(v) => onChange({ ...discount, kind: v as Discount["kind"] })}>
            <SelectTrigger className="h-8 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percent">%</SelectItem>
              <SelectItem value="amount">{t("pos.discountAmount") as string}</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number" min={0}
            value={discount.value}
            onChange={(e) => onChange({ ...discount, value: Number(e.target.value) })}
            className="h-8 tabular-nums"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ── Client picker — search existing clients, quick-create, or walk-in ───── */
function ClientPickerPopover({
  clients,
  selected,
  onSelect,
  storeId,
}: {
  clients: ClientRead[];
  selected: ClientRead | null;
  onSelect: (c: ClientRead | null) => void;
  storeId?: number;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrenom, setNewPrenom] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return clients;
    return clients.filter((c) =>
      `${c.name} ${c.prenom ?? ""} ${c.phone ?? ""} ${c.code_client}`.toLowerCase().includes(needle),
    );
  }, [clients, query]);

  const createMutation = useMutation({
    mutationFn: () =>
      clientsApi.create({
        name: newName.trim(),
        prenom: newPrenom.trim() || undefined,
        phone: newPhone.trim() || undefined,
        email: newEmail.trim() || undefined,
        store_id: storeId,
      }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: qk.clients.list() });
      onSelect(created);
      setOpen(false);
      resetCreate();
      toast.success(t("pos.clientCreated") as string);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erreur");
    },
  });

  const resetCreate = () => {
    setCreating(false);
    setNewName("");
    setNewPrenom("");
    setNewPhone("");
    setNewEmail("");
    setQuery("");
  };

  const handleOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) resetCreate();
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 w-full justify-start gap-2 text-sm font-normal">
          <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {selected ? `${selected.name}${selected.prenom ? ` ${selected.prenom}` : ""}` : t("walkin") as string}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        {creating ? (
          /* ── Formulaire de création rapide ────────────────────────────── */
          <div className="space-y-3 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("pos.newClient") as string}</span>
              <button
                onClick={resetCreate}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ← {t("common.back") as string}
              </button>
            </div>
            <div className="space-y-2">
              <Input
                autoFocus
                placeholder={t("pos.clientLastName") as string}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-8 text-xs"
              />
              <Input
                placeholder={t("pos.clientFirstName") as string}
                value={newPrenom}
                onChange={(e) => setNewPrenom(e.target.value)}
                className="h-8 text-xs"
              />
              <Input
                placeholder={`${t("common.phone") as string} *`}
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="h-8 text-xs"
              />
              <Input
                placeholder={`${t("common.email") as string} *`}
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="h-8 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">* {t("pos.phoneOrEmailRequired") as string}</p>
            </div>
            <Button
              size="sm"
              className="w-full"
              disabled={!newName.trim() || (!newPhone.trim() && !newEmail.trim()) || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending
                ? "…"
                : t("common.create") as string}
            </Button>
          </div>
        ) : (
          /* ── Liste des clients + recherche ────────────────────────────── */
          <>
            <div className="border-b p-2">
              <Input
                autoFocus
                placeholder={t("common.searchShort") as string}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <ScrollArea className="max-h-56">
              <div className="p-1">
                <button
                  onClick={() => { onSelect(null); setOpen(false); setQuery(""); }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent"
                >
                  <UserX className="h-3.5 w-3.5 text-muted-foreground" /> {t("walkin") as string}
                </button>
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { onSelect(c); setOpen(false); setQuery(""); }}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="min-w-0 truncate">{c.name}{c.prenom ? ` ${c.prenom}` : ""}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{c.phone ?? c.code_client}</span>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                    {t("common.empty") as string}
                  </p>
                )}
              </div>
            </ScrollArea>
            {/* Création rapide — toujours accessible en bas */}
            <div className="border-t p-1">
              <button
                onClick={() => { setCreating(true); setQuery(""); }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium text-primary hover:bg-accent"
              >
                <Plus className="h-3.5 w-3.5" /> {t("pos.createClient") as string}
              </button>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
