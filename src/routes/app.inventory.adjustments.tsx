import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, PackagePlus, ArrowLeftRight, SlidersHorizontal, Search } from "lucide-react";
import { stockApi, catalogApi, qk } from "@/lib/api";
import { toast } from "sonner";
import type { MovementReason, StockLocationRead, ProductRead, ProductStockRead } from "@/lib/types";

export const Route = createFileRoute("/app/inventory/adjustments")({
  validateSearch: (s: Record<string, unknown>) => ({
    product_id: s.product_id ? Number(s.product_id) : undefined,
  }),
  component: Page,
});

const REASON_LABEL: Record<MovementReason, string> = {
  STOCK_INITIAL: "Stock initial",
  PURCHASE: "Achat / Approvisionnement",
  SALE: "Vente",
  RETURN: "Retour",
  DAMAGE: "Dommage",
  LOSS: "Perte",
  THEFT: "Vol",
  INVENTORY: "Inventaire / Comptage",
  REAPPRO: "Réapprovisionnement",
  OTHER: "Autre",
};

type Tab = "add" | "adjust" | "transfer";

function Page() {
  const { product_id: preselectedProductId } = Route.useSearch();
  const [activeTab, setActiveTab] = useState<Tab>("add");

  const { data: locations = [] } = useQuery({
    queryKey: qk.stock.locations(),
    queryFn: () => stockApi.listLocations({ limit: 200 }),
  });

  const { data: productStocks = [] } = useQuery({
    queryKey: qk.stock.productStocks(),
    queryFn: () => stockApi.listProductStocks({ limit: 500 }),
  });

  const { data: products = [] } = useQuery({
    queryKey: qk.catalog.products(),
    queryFn: () => catalogApi.listProducts({ limit: 500 }),
  });

  return (
    <>
      <div className="mb-4 flex gap-2 rounded-xl border bg-secondary/30 p-1 w-fit">
        {(
          [
            { key: "add", label: "Entrée de stock", icon: PackagePlus },
            { key: "adjust", label: "Ajustement", icon: SlidersHorizontal },
            { key: "transfer", label: "Transfert", icon: ArrowLeftRight },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === key
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "add" && (
        <AddStockForm
          locations={locations}
          products={products}
          preselectedProductId={preselectedProductId}
        />
      )}
      {activeTab === "adjust" && (
        <AdjustStockForm
          locations={locations}
          products={products}
          productStocks={productStocks}
        />
      )}
      {activeTab === "transfer" && (
        <TransferStockForm
          locations={locations}
          products={products}
          productStocks={productStocks}
        />
      )}
    </>
  );
}

/* ── Add Stock ─────────────────────────────────────────────────────────────── */
function AddStockForm({
  locations,
  products,
  preselectedProductId,
}: {
  locations: StockLocationRead[];
  products: ProductRead[];
  preselectedProductId?: number;
}) {
  const qc = useQueryClient();
  const [productSearch, setProductSearch] = useState("");
  const [productId, setProductId] = useState<string>(
    preselectedProductId ? String(preselectedProductId) : "",
  );
  const [locationId, setLocationId] = useState<string>(() => {
    const central = locations.find((l) => l.type === "CENTRAL");
    return central ? String(central.id) : "";
  });
  const [quantity, setQuantity] = useState("");
  const [alertThreshold, setAlertThreshold] = useState("0");
  const [reason, setReason] = useState<MovementReason>("PURCHASE");
  const [unitCost, setUnitCost] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const filteredProducts = productSearch
    ? products.filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase()))
    : products;

  const mutation = useMutation({
    mutationFn: () =>
      stockApi.addStock({
        product_id: Number(productId),
        location_id: Number(locationId),
        quantity: Number(quantity),
        alert_threshold: Number(alertThreshold),
        reason,
        unit_cost: unitCost ? Number(unitCost) : undefined,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      const p = products.find((x) => x.id === Number(productId));
      toast.success(`Stock ajouté : +${quantity} unités pour "${p?.name ?? "#" + productId}"`);
      qc.invalidateQueries({ queryKey: ["stock"] });
      setQuantity("");
      setAlertThreshold("0");
      setReference("");
      setNotes("");
      setUnitCost("");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const canSubmit = productId && locationId && Number(quantity) > 0 && !mutation.isPending;

  return (
    <Card className="shadow-soft max-w-lg">
      <CardContent className="space-y-4 pt-6">
        <div className="space-y-1.5">
          <Label>Produit *</Label>
          <div className="relative mb-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-8 text-xs"
              placeholder="Filtrer les produits…"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
          </div>
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger>
              <SelectValue placeholder="Choisir un produit…" />
            </SelectTrigger>
            <SelectContent>
              {filteredProducts.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                  {p.sku && (
                    <span className="ml-2 text-muted-foreground text-xs">{p.sku}</span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Emplacement *</Label>
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger>
              <SelectValue placeholder="Choisir un emplacement…" />
            </SelectTrigger>
            <SelectContent>
              {locations.map((l) => (
                <SelectItem key={l.id} value={String(l.id)}>
                  <span className="flex items-center gap-2">
                    {l.name}
                    <Badge variant="secondary" className="text-[10px]">
                      {l.type}
                    </Badge>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Quantité *</Label>
            <Input
              type="number"
              min={1}
              placeholder="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Prix unitaire (GNF)</Label>
            <Input
              type="number"
              min={0}
              placeholder="Optionnel"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>
            Seuil d'alerte{" "}
            <span className="text-muted-foreground text-xs">(alerte stock faible)</span>
          </Label>
          <Input
            type="number"
            min={0}
            placeholder="0"
            value={alertThreshold}
            onChange={(e) => setAlertThreshold(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Motif</Label>
          <Select value={reason} onValueChange={(v) => setReason(v as MovementReason)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["PURCHASE", "STOCK_INITIAL", "RETURN", "OTHER"] as MovementReason[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {REASON_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>
            Référence <span className="text-muted-foreground">(N° facture, BL…)</span>
          </Label>
          <Input
            placeholder="FAC-001"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea
            rows={2}
            placeholder="Remarques optionnelles…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <Button className="w-full" onClick={() => mutation.mutate()} disabled={!canSubmit}>
          {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          <PackagePlus className="mr-1.5 h-4 w-4" />
          Enregistrer l'entrée
        </Button>
      </CardContent>
    </Card>
  );
}

/* ── Adjust Stock ──────────────────────────────────────────────────────────── */
function AdjustStockForm({
  locations,
  products,
  productStocks,
}: {
  locations: StockLocationRead[];
  products: ProductRead[];
  productStocks: ProductStockRead[];
}) {
  const qc = useQueryClient();
  const [productId, setProductId] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");
  const [physicalCount, setPhysicalCount] = useState("");
  const [alertThreshold, setAlertThreshold] = useState<string>("");
  const [reason, setReason] = useState<MovementReason>("INVENTORY");
  const [notes, setNotes] = useState("");

  const currentStock = productStocks.find(
    (s) => s.product_id === Number(productId) && s.location_id === Number(locationId),
  );

  const delta = currentStock !== undefined && physicalCount !== ""
    ? Number(physicalCount) - currentStock.quantity
    : null;

  const locationsForProduct = productId
    ? locations.filter((l) =>
        productStocks.some(
          (s) => s.product_id === Number(productId) && s.location_id === l.id,
        ),
      )
    : locations;

  const mutation = useMutation({
    mutationFn: () =>
      stockApi.adjustStock({
        product_id: Number(productId),
        location_id: Number(locationId),
        physical_count: Number(physicalCount),
        alert_threshold: alertThreshold !== "" ? Number(alertThreshold) : undefined,
        reason,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      const p = products.find((x) => x.id === Number(productId));
      toast.success(
        `Stock ajusté : ${currentStock?.quantity ?? "?"} → ${physicalCount} pour "${p?.name}"`,
      );
      qc.invalidateQueries({ queryKey: ["stock"] });
      setPhysicalCount("");
      setAlertThreshold("");
      setNotes("");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const canSubmit =
    productId &&
    locationId &&
    physicalCount !== "" &&
    Number(physicalCount) >= 0 &&
    !mutation.isPending;

  return (
    <Card className="shadow-soft max-w-lg">
      <CardContent className="space-y-4 pt-6">
        <div className="space-y-1.5">
          <Label>Produit *</Label>
          <Select
            value={productId}
            onValueChange={(v) => {
              setProductId(v);
              setLocationId("");
              setAlertThreshold("");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choisir un produit…" />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Emplacement *</Label>
          <Select
            value={locationId}
            onValueChange={(v) => {
              setLocationId(v);
              const s = productStocks.find(
                (ps) => ps.product_id === Number(productId) && ps.location_id === Number(v),
              );
              setAlertThreshold(s ? String(s.alert_threshold) : "");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choisir un emplacement…" />
            </SelectTrigger>
            <SelectContent>
              {locationsForProduct.map((l) => (
                <SelectItem key={l.id} value={String(l.id)}>
                  {l.name}
                  <Badge variant="secondary" className="ml-2 text-[10px]">
                    {l.type}
                  </Badge>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {currentStock !== undefined && (
          <div className="rounded-lg bg-secondary/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Stock actuel : </span>
            <strong>{currentStock.quantity}</strong> unité
            {currentStock.quantity !== 1 ? "s" : ""}
            {currentStock.alert_threshold > 0 && (
              <span className="ml-3 text-muted-foreground">
                · Seuil : <strong>{currentStock.alert_threshold}</strong>
              </span>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Quantité réelle (inventaire) *</Label>
          <Input
            type="number"
            min={0}
            placeholder="Ex : 42"
            value={physicalCount}
            onChange={(e) => setPhysicalCount(e.target.value)}
          />
          {delta !== null && physicalCount !== "" && (
            <p
              className={`text-[12px] font-semibold ${
                delta > 0
                  ? "text-success"
                  : delta < 0
                    ? "text-destructive"
                    : "text-muted-foreground"
              }`}
            >
              {delta === 0
                ? "Aucun changement"
                : delta > 0
                  ? `+${delta} unité${Math.abs(delta) !== 1 ? "s" : ""} ajoutée${Math.abs(delta) !== 1 ? "s" : ""}`
                  : `${delta} unité${Math.abs(delta) !== 1 ? "s" : ""} retirée${Math.abs(delta) !== 1 ? "s" : ""}`}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>
            Seuil d'alerte{" "}
            <span className="text-muted-foreground text-xs">(laisser vide pour ne pas modifier)</span>
          </Label>
          <Input
            type="number"
            min={0}
            placeholder={currentStock ? String(currentStock.alert_threshold) : "0"}
            value={alertThreshold}
            onChange={(e) => setAlertThreshold(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Motif</Label>
          <Select value={reason} onValueChange={(v) => setReason(v as MovementReason)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["INVENTORY", "DAMAGE", "LOSS", "THEFT", "OTHER"] as MovementReason[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {REASON_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea
            rows={2}
            placeholder="Remarques sur cet ajustement…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <Button className="w-full" onClick={() => mutation.mutate()} disabled={!canSubmit}>
          {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          <SlidersHorizontal className="mr-1.5 h-4 w-4" />
          Valider l'ajustement
        </Button>
      </CardContent>
    </Card>
  );
}

/* ── Transfer Stock ────────────────────────────────────────────────────────── */
function TransferStockForm({
  locations,
  products,
  productStocks,
}: {
  locations: StockLocationRead[];
  products: ProductRead[];
  productStocks: ProductStockRead[];
}) {
  const qc = useQueryClient();
  const [productId, setProductId] = useState<string>("");
  const [fromLocationId, setFromLocationId] = useState<string>("");
  const [toLocationId, setToLocationId] = useState<string>("");
  const [quantity, setQuantity] = useState("");
  const [destAlertThreshold, setDestAlertThreshold] = useState<string>("");
  const [notes, setNotes] = useState("");

  const fromStock = productStocks.find(
    (s) => s.product_id === Number(productId) && s.location_id === Number(fromLocationId),
  );

  const toStock = productStocks.find(
    (s) => s.product_id === Number(productId) && s.location_id === Number(toLocationId),
  );

  const mutation = useMutation({
    mutationFn: () =>
      stockApi.transferStock({
        product_id: Number(productId),
        from_location_id: Number(fromLocationId),
        to_location_id: Number(toLocationId),
        quantity: Number(quantity),
        dest_alert_threshold: destAlertThreshold !== "" ? Number(destAlertThreshold) : undefined,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      const p = products.find((x) => x.id === Number(productId));
      const fromLoc = locations.find((l) => l.id === Number(fromLocationId));
      const toLoc = locations.find((l) => l.id === Number(toLocationId));
      toast.success(
        `Transfert : ${quantity} × "${p?.name}" de ${fromLoc?.name ?? "?"} → ${toLoc?.name ?? "?"}`,
      );
      qc.invalidateQueries({ queryKey: ["stock"] });
      setQuantity("");
      setDestAlertThreshold("");
      setNotes("");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const quantityExceeds = fromStock !== undefined && Number(quantity) > fromStock.quantity;

  const canSubmit =
    productId &&
    fromLocationId &&
    toLocationId &&
    fromLocationId !== toLocationId &&
    Number(quantity) > 0 &&
    !quantityExceeds &&
    !mutation.isPending;

  return (
    <Card className="shadow-soft max-w-lg">
      <CardContent className="space-y-4 pt-6">
        <div className="space-y-1.5">
          <Label>Produit *</Label>
          <Select
            value={productId}
            onValueChange={(v) => {
              setProductId(v);
              setFromLocationId("");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choisir un produit…" />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>De *</Label>
            <Select
              value={fromLocationId}
              onValueChange={(v) => {
                setFromLocationId(v);
                if (v === toLocationId) setToLocationId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Vers *</Label>
            <Select
              value={toLocationId}
              onValueChange={(v) => {
                setToLocationId(v);
                const s = productStocks.find(
                  (ps) => ps.product_id === Number(productId) && ps.location_id === Number(v),
                );
                setDestAlertThreshold(s ? String(s.alert_threshold) : "");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Destination" />
              </SelectTrigger>
              <SelectContent>
                {locations
                  .filter((l) => String(l.id) !== fromLocationId)
                  .map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      {l.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {fromStock !== undefined && (
          <div className="rounded-lg bg-secondary/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Disponible à la source : </span>
            <strong className={fromStock.quantity === 0 ? "text-destructive" : ""}>
              {fromStock.quantity}
            </strong>{" "}
            unité{fromStock.quantity !== 1 ? "s" : ""}
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Quantité à transférer *</Label>
          <Input
            type="number"
            min={1}
            max={fromStock?.quantity}
            placeholder="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          {quantityExceeds && (
            <p className="text-[12px] text-destructive font-medium">
              Quantité insuffisante (disponible : {fromStock?.quantity})
            </p>
          )}
        </div>

        {toLocationId && (
          <div className="space-y-1.5">
            <Label>
              Seuil d'alerte (destination){" "}
              <span className="text-muted-foreground text-xs">
                {toStock
                  ? `(actuel : ${toStock.alert_threshold})`
                  : "(nouveau stock : 0 par défaut)"}
              </span>
            </Label>
            <Input
              type="number"
              min={0}
              placeholder="0"
              value={destAlertThreshold}
              onChange={(e) => setDestAlertThreshold(e.target.value)}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea
            rows={2}
            placeholder="Remarques sur ce transfert…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <Button className="w-full" onClick={() => mutation.mutate()} disabled={!canSubmit}>
          {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          <ArrowLeftRight className="mr-1.5 h-4 w-4" />
          Effectuer le transfert
        </Button>
      </CardContent>
    </Card>
  );
}
