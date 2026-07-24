import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { stockApi } from "@/lib/api";
import { toast } from "sonner";
import type { ProductStockRead } from "@/lib/types";

/**
 * Quick-restock dialog reused everywhere a stock line (central or boutique)
 * needs a fast "set the real count" action — stock overview rupture list,
 * central stock table, boutique stock table.
 */
export function AdjustStockDialog({
  stock,
  productName,
  locationName,
  onClose,
}: {
  stock: ProductStockRead;
  productName: string;
  locationName?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [physicalCount, setPhysicalCount] = useState(String(stock.quantity));
  const [alertThreshold, setAlertThreshold] = useState(String(stock.alert_threshold));
  const [notes, setNotes] = useState("");

  const delta = Number(physicalCount) - stock.quantity;

  const mutation = useMutation({
    mutationFn: async () => {
      if (Number(alertThreshold) !== stock.alert_threshold) {
        await stockApi.updateProductStock(stock.id, { alert_threshold: Number(alertThreshold) });
      }
      if (Number(physicalCount) !== stock.quantity) {
        await stockApi.adjustStock({
          product_id: stock.product_id,
          location_id: stock.location_id,
          physical_count: Number(physicalCount),
          reason: "INVENTORY",
          notes: notes.trim() || undefined,
        });
      }
    },
    onSuccess: () => {
      toast.success(`Stock ajusté : ${stock.quantity} → ${physicalCount}`);
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" /> Ajuster le stock
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="rounded-lg bg-secondary/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Produit : </span>
            <span className="font-medium">{productName}</span>
            {locationName && (
              <>
                <br />
                <span className="text-muted-foreground">Emplacement : </span>
                <span className="font-medium">{locationName}</span>
              </>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Quantité réelle</Label>
              <Input
                type="number"
                min={0}
                value={physicalCount}
                onChange={(e) => setPhysicalCount(e.target.value)}
                autoFocus
              />
              {delta !== 0 && physicalCount !== "" && (
                <p className={`text-[11px] font-medium ${delta > 0 ? "text-success" : "text-destructive"}`}>
                  {delta > 0 ? `+${delta}` : delta} unité{Math.abs(delta) > 1 ? "s" : ""}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Seuil d'alerte</Label>
              <Input
                type="number"
                min={0}
                value={alertThreshold}
                onChange={(e) => setAlertThreshold(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes <span className="text-muted-foreground">(optionnel)</span></Label>
            <Textarea
              rows={2}
              placeholder="Raison de l'ajustement…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={physicalCount === "" || Number(physicalCount) < 0 || mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
