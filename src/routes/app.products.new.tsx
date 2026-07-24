import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, TrendingUp, ChevronLeft, Plus, PackagePlus, ArrowLeft, Lock } from "lucide-react";
import { catalogApi, qk } from "@/lib/api";
import { productParam } from "@/lib/entity-paths";
import { fmtXAF } from "@/lib/mock-data";
import { useT } from "@/lib/i18n";
import { ImageUpload } from "@/components/image-upload";
import { CreateCategoryDialog } from "@/components/create-category-dialog";
import { toast } from "sonner";
import { useWorkContext } from "@/lib/work-context";
import type { CategoryProductRead, ProductRead } from "@/lib/types";

export const Route = createFileRoute("/app/products/new")({ component: Page });

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/* ── Post-creation CTA dialog ─────────────────────────────────────────────── */
function CreatedDialog({
  product,
  onClose,
}: {
  product: ProductRead;
  onClose: () => void;
}) {
  const navigate = useNavigate();

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-success" />
            Produit créé avec succès
          </DialogTitle>
        </DialogHeader>
        <div className="py-3 space-y-2 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">{product.name}</strong> a été ajouté au catalogue.
          </p>
          <p>Souhaitez-vous lui affecter du stock dès maintenant ?</p>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full"
            onClick={() =>
              navigate({
                to: "/app/inventory/adjustments",
                search: { product_id: product.id },
              })
            }
          >
            <PackagePlus className="mr-1.5 h-4 w-4" /> Ajouter du stock
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() =>
              navigate({ to: "/app/products/$slug", params: { slug: productParam(product) } })
            }
          >
            Voir le produit
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => navigate({ to: "/app/products" })}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Retour à la liste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Page() {
  const { t } = useT();
  const { has } = useWorkContext();
  const canManage = has("products.manage");
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [brand, setBrand] = useState("");
  const [uom, setUom] = useState("");
  const [tva, setTva] = useState("0");
  const [prixAchat, setPrixAchat] = useState("");
  const [prixVente, setPrixVente] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [showCatDialog, setShowCatDialog] = useState(false);
  const [createdProduct, setCreatedProduct] = useState<ProductRead | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: qk.catalog.productCategories,
    queryFn: () => catalogApi.listProductCategories(),
  });

  const margin = useMemo(() => {
    const a = Number(prixAchat);
    const v = Number(prixVente);
    if (!a || !v || v <= 0) return null;
    return Math.round(((v - a) / v) * 100);
  }, [prixAchat, prixVente]);

  const mutation = useMutation({
    mutationFn: () =>
      catalogApi.createProduct({
        name: name.trim(),
        slug: slugify(name),
        sku: sku.trim() || undefined,
        barcode: barcode.trim() || undefined,
        brand: brand.trim() || undefined,
        unit_of_measure: uom.trim() || undefined,
        tva: Number(tva),
        description: description.trim() || undefined,
        images: imageUrl ? [imageUrl] : undefined,
        prix_achat: Number(prixAchat),
        prix_vente: Number(prixVente),
        category_product_id: categoryId ? Number(categoryId) : undefined,
      }),
    onSuccess: (product) => {
      toast.success(`Produit "${product.name}" créé avec succès`);
      qc.invalidateQueries({ queryKey: ["catalog"] });
      setCreatedProduct(product);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur lors de la création"),
  });

  const canSubmit =
    name.trim().length > 0 &&
    Number(prixAchat) > 0 &&
    Number(prixVente) > 0 &&
    !mutation.isPending;

  if (!canManage) {
    return (
      <>
        <PageHeader title={t("products.new") as string} />
        <Card className="flex flex-col items-center gap-3 p-10 text-center shadow-soft">
          <Lock className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="font-medium">Accès réservé</p>
            <p className="text-sm text-muted-foreground">
              L'ajout de produits au catalogue est réservé au Boss.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="mt-1">
            <Link to="/app/products">
              <ChevronLeft className="mr-1.5 h-3.5 w-3.5" /> {t("products.title") as string}
            </Link>
          </Button>
        </Card>
      </>
    );
  }

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground">
        <Link to="/app/products">
          <ChevronLeft className="mr-1 h-4 w-4" /> {t("products.title") as string}
        </Link>
      </Button>

      <PageHeader
        title={t("products.new.title") as string}
        description={t("products.new.subtitle") as string}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/app/products">{t("common.cancel") as string}</Link>
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
              {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t("common.save") as string}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── LEFT col ── */}
        <div className="space-y-4 lg:col-span-2">
          {/* Identité */}
          <Card className="shadow-soft">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Nom & description</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("common.name") as string} *</Label>
                <Input
                  placeholder="Ex : Sprite 1,5L"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("common.description") as string}</Label>
                <Textarea
                  rows={3}
                  placeholder="Description optionnelle…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Références catalogue */}
          <Card className="shadow-soft">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Références produit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>SKU (référence interne)</Label>
                  <Input
                    placeholder="SKU-001"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Code-barres</Label>
                  <Input
                    placeholder="6291041500213"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Marque</Label>
                  <Input
                    placeholder="Coca-Cola, Samsung…"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Unité de mesure</Label>
                  <Input
                    placeholder="pièce, kg, L, carton…"
                    value={uom}
                    onChange={(e) => setUom(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Prix */}
          <Card className="shadow-soft">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{t("common.price") as string}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>{t("products.detail.purchase") as string} *</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="450"
                    value={prixAchat}
                    onChange={(e) => setPrixAchat(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Prix de vente *</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="600"
                    value={prixVente}
                    onChange={(e) => setPrixVente(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>TVA (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="0"
                    value={tva}
                    onChange={(e) => setTva(e.target.value)}
                  />
                </div>
              </div>

              {margin !== null && (
                <div
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                    margin >= 0
                      ? "bg-success/10 text-success"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  <TrendingUp className="h-4 w-4 shrink-0" />
                  <span>
                    Marge&nbsp;: <strong>{margin}%</strong>
                    {prixVente && prixAchat && (
                      <span className="ml-2 font-normal text-muted-foreground">
                        ({fmtXAF(Number(prixVente) - Number(prixAchat))} / unité)
                      </span>
                    )}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── RIGHT col ── */}
        <div className="space-y-4">
          <Card className="shadow-soft">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{t("common.category") as string} & statut</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>{t("common.category") as string}</Label>
                  <button
                    type="button"
                    onClick={() => setShowCatDialog(true)}
                    className="flex items-center gap-1 rounded text-xs text-primary hover:underline"
                  >
                    <Plus className="h-3 w-3" /> Nouvelle catégorie
                  </button>
                </div>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Aucune" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Aucune</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>{t("common.status") as string}</Label>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as typeof status)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t("status.active") as string}</SelectItem>
                    <SelectItem value="inactive">{t("status.inactive") as string}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Image upload */}
          <Card className="shadow-soft">
            <CardContent className="p-4">
              <ImageUpload
                value={imageUrl}
                onChange={setImageUrl}
                label="Photo du produit"
              />
            </CardContent>
          </Card>

          {/* Summary */}
          {(Number(prixAchat) > 0 || Number(prixVente) > 0) && (
            <Card className="shadow-soft bg-secondary/30">
              <CardContent className="space-y-2 p-4 text-sm">
                <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  Aperçu
                </p>
                {Number(prixAchat) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Prix achat</span>
                    <span className="font-medium">{fmtXAF(Number(prixAchat))}</span>
                  </div>
                )}
                {Number(prixVente) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Prix vente</span>
                    <span className="font-medium">{fmtXAF(Number(prixVente))}</span>
                  </div>
                )}
                {margin !== null && (
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-muted-foreground">Marge</span>
                    <span className={`font-semibold ${margin >= 0 ? "text-success" : "text-destructive"}`}>
                      {margin}%
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <CreateCategoryDialog
        open={showCatDialog}
        onClose={() => setShowCatDialog(false)}
        onCreated={(cat: CategoryProductRead) => setCategoryId(String(cat.id))}
      />

      {createdProduct && (
        <CreatedDialog
          product={createdProduct}
          onClose={() => {
            setCreatedProduct(null);
            navigate({ to: "/app/products" });
          }}
        />
      )}
    </>
  );
}
