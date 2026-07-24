import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { catalogApi, qk } from "@/lib/api";
import { toast } from "sonner";
import type { CategoryProductRead } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called with the newly created category so the parent can auto-select it. */
  onCreated?: (category: CategoryProductRead) => void;
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function CreateCategoryDialog({ open, onClose, onCreated }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      catalogApi.createProductCategory({
        name: name.trim(),
        slug: slugify(name.trim()),
        description: description.trim() || undefined,
      }),
    onSuccess: (cat) => {
      toast.success(`Catégorie "${cat.name}" créée`);
      qc.invalidateQueries({ queryKey: qk.catalog.productCategories });
      onCreated?.(cat);
      handleClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  function handleClose() {
    setName("");
    setDescription("");
    onClose();
  }

  const canSubmit = name.trim().length > 0 && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Nouvelle catégorie</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Nom *</Label>
            <Input
              placeholder="Ex: Boissons"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && canSubmit && mutation.mutate()}
            />
            {name.trim() && (
              <p className="text-[11px] text-muted-foreground">
                Slug : <code className="font-mono">{slugify(name.trim())}</code>
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Description <span className="text-muted-foreground">(optionnel)</span></Label>
            <Textarea
              rows={2}
              placeholder="Courte description de la catégorie…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Annuler
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
            {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
