import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { StatusBadge, TableSkeleton, ApiErrorState } from "@/components/primitives";
import { CreateCategoryDialog } from "@/components/create-category-dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Tag, Pencil, Trash2, Loader2, ChevronLeft } from "lucide-react";
import { catalogApi, qk } from "@/lib/api";
import { useT, formatDate } from "@/lib/i18n";
import { toast } from "sonner";
import type { CategoryProductRead } from "@/lib/types";

export const Route = createFileRoute("/app/products/categories")({ component: Page });

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/* ── Edit Dialog ─────────────────────────────────────────────────────────── */
function EditDialog({
  category,
  onClose,
}: {
  category: CategoryProductRead;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      catalogApi.updateProductCategory(category.id, {
        name: name.trim(),
        slug: slugify(name.trim()),
        description: description.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Catégorie mise à jour");
      qc.invalidateQueries({ queryKey: qk.catalog.productCategories });
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Modifier la catégorie</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Nom *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
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
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
function Page() {
  const { lang } = useT();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<CategoryProductRead | null>(null);

  const { data: categories = [], isLoading, error, refetch } = useQuery({
    queryKey: qk.catalog.productCategories,
    queryFn: () => catalogApi.listProductCategories(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => catalogApi.deleteProductCategory(id),
    onSuccess: () => {
      toast.success("Catégorie supprimée");
      qc.invalidateQueries({ queryKey: qk.catalog.productCategories });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const filtered = categories.filter((c) => {
    const q = search.toLowerCase();
    return (
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.slug.toLowerCase().includes(q) ||
      (c.description ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground">
        <Link to="/app/products">
          <ChevronLeft className="mr-1 h-4 w-4" /> Produits
        </Link>
      </Button>

      <PageHeader
        title="Catégories de produits"
        description="Organisez votre catalogue en catégories claires."
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Nouvelle catégorie
          </Button>
        }
      />

      <Card className="shadow-soft">
        {/* Search bar */}
        <div className="flex items-center gap-2 border-b p-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher une catégorie…"
              className="h-9 pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/40">
              <TableHead>Nom</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Créée le</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton cols={6} />
            ) : error ? (
              <tr>
                <td colSpan={6}>
                  <ApiErrorState error={error} onRetry={refetch} />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="flex flex-col items-center gap-3 py-16 text-center">
                    <Tag className="h-10 w-10 text-muted-foreground/30" />
                    {search ? (
                      <p className="text-sm text-muted-foreground">Aucune catégorie trouvée.</p>
                    ) : (
                      <>
                        <p className="text-sm font-medium">Aucune catégorie pour le moment</p>
                        <p className="text-xs text-muted-foreground">
                          Créez votre première catégorie pour organiser votre catalogue.
                        </p>
                        <Button size="sm" onClick={() => setShowCreate(true)} className="mt-1">
                          <Plus className="mr-1.5 h-3.5 w-3.5" /> Nouvelle catégorie
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell>
                    <span className="font-medium">{cat.name}</span>
                  </TableCell>
                  <TableCell>
                    <code className="rounded bg-secondary px-1.5 py-0.5 text-xs font-mono text-muted-foreground">
                      {cat.slug}
                    </code>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                    {cat.description ?? ""}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={cat.status} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(cat.created_at, lang)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setEditing(cat)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Supprimer « {cat.name} » ?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Les produits liés à cette catégorie ne seront pas supprimés mais
                              perdront leur catégorie. Cette action est irréversible.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive hover:bg-destructive/90"
                              onClick={() => deleteMutation.mutate(cat.id)}
                            >
                              {deleteMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                "Supprimer"
                              )}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="flex items-center justify-between border-t p-3 text-xs text-muted-foreground">
          <span>
            {filtered.length} / {categories.length} catégorie{categories.length !== 1 ? "s" : ""}
          </span>
        </div>
      </Card>

      {/* Create dialog */}
      <CreateCategoryDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />

      {/* Edit dialog */}
      {editing && (
        <EditDialog category={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}
