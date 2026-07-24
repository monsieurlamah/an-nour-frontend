import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { KpiCard, StatusBadge, FieldError, ApiErrorState, TableSkeleton } from "@/components/primitives";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ChevronLeft, Wallet, Receipt, Mail, Phone, MapPin, Plus, Trash2, Loader2,
} from "lucide-react";
import { achatsApi, catalogApi, qk } from "@/lib/api";
import { fmtXAF } from "@/lib/mock-data";
import { useT, formatDate } from "@/lib/i18n";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import type { PurchaseStatut, RecordStatus, SupplierRead } from "@/lib/types";

export const Route = createFileRoute("/app/suppliers/$id")({ component: Page });

const PURCHASE_STATUTS: PurchaseStatut[] = [
  "brouillon", "commandee", "partiellement_recue", "recue", "annulee",
];

/* ── New purchase dialog ──────────────────────────────────────────────────── */
function NewPurchaseDialog({
  supplierId, open, onClose,
}: { supplierId: number; open: boolean; onClose: () => void }) {
  const { t } = useT();
  const qc = useQueryClient();

  type Line = { productId: string; quantity: string; prixUnitaire: string };
  const [lines, setLines] = useState<Line[]>([{ productId: "", quantity: "1", prixUnitaire: "" }]);

  const { data: products = [] } = useQuery({
    queryKey: qk.catalog.products(),
    queryFn: () => catalogApi.listProducts({ limit: 500 }),
    enabled: open,
  });
  const productMap = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function pickProduct(i: number, productId: string) {
    const product = productMap[Number(productId)];
    updateLine(i, {
      productId,
      prixUnitaire: product ? String(product.prix_achat) : "",
    });
  }
  function addLine() {
    setLines((prev) => [...prev, { productId: "", quantity: "1", prixUnitaire: "" }]);
  }
  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  const validLines = lines.filter((l) => l.productId && Number(l.quantity) > 0);
  const total = validLines.reduce(
    (a, l) => a + Number(l.quantity) * (Number(l.prixUnitaire) || 0), 0,
  );

  const mutation = useMutation({
    mutationFn: () =>
      achatsApi.createPurchase({
        supplier_id: supplierId,
        lignes: validLines.map((l) => ({
          product_id: Number(l.productId),
          quantity: Number(l.quantity),
          prix_unitaire: Number(l.prixUnitaire) || 0,
        })),
      }),
    onSuccess: () => {
      toast.success(t("suppliers.purchase.created") as string);
      qc.invalidateQueries({ queryKey: ["purchases"] });
      setLines([{ productId: "", quantity: "1", prixUnitaire: "" }]);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.detail : "Erreur"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("suppliers.purchase.new") as string}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto py-1">
          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_120px_32px] items-end gap-2">
              <div className="space-y-1.5">
                {i === 0 && <Label className="text-xs">{t("suppliers.purchase.product") as string}</Label>}
                <Select value={line.productId} onValueChange={(v) => pickProduct(i, v)}>
                  <SelectTrigger><SelectValue placeholder="…" /></SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                {i === 0 && <Label className="text-xs">{t("suppliers.purchase.quantity") as string}</Label>}
                <Input type="number" min={1} value={line.quantity}
                  onChange={(e) => updateLine(i, { quantity: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                {i === 0 && <Label className="text-xs">{t("suppliers.purchase.unitPrice") as string}</Label>}
                <Input type="number" min={0} value={line.prixUnitaire}
                  onChange={(e) => updateLine(i, { prixUnitaire: e.target.value })} />
              </div>
              <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive"
                disabled={lines.length === 1} onClick={() => removeLine(i)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addLine}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> {t("suppliers.purchase.addLine") as string}
          </Button>
          <div className="flex items-center justify-between border-t pt-3 text-sm">
            <span className="text-muted-foreground">{t("suppliers.purchase.col.total") as string}</span>
            <span className="font-semibold">{fmtXAF(total)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel") as string}</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || validLines.length === 0}>
            {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {t("common.create") as string}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Edit tab ──────────────────────────────────────────────────────────────── */
function EditTab({ supplier }: { supplier: SupplierRead }) {
  const { t } = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [name, setName] = useState(supplier.name);
  const [phone, setPhone] = useState(supplier.phone ?? "");
  const [email, setEmail] = useState(supplier.email ?? "");
  const [address, setAddress] = useState(supplier.address ?? "");
  const [status, setStatus] = useState<RecordStatus>(supplier.status);
  const [errors, setErrors] = useState<{ name?: string }>({});

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!name.trim()) {
        setErrors({ name: t("common.required") as string });
        throw new Error("validation");
      }
      setErrors({});
      return achatsApi.updateSupplier(supplier.id, {
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        status,
      });
    },
    onSuccess: () => {
      toast.success(t("suppliers.updated") as string);
      qc.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (err) => {
      if (err instanceof Error && err.message === "validation") return;
      toast.error(err instanceof ApiError ? err.detail : "Erreur");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => achatsApi.deleteSupplier(supplier.id),
    onSuccess: () => {
      toast.success(t("suppliers.deleted") as string);
      navigate({ to: "/app/suppliers" });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.detail : "Erreur"),
  });

  return (
    <Card className="shadow-soft">
      <CardContent className="space-y-4 p-6">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("suppliers.col.name") as string} *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)}
              className={errors.name ? "border-destructive focus-visible:ring-destructive" : ""} />
            <FieldError>{errors.name}</FieldError>
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.status") as string}</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as RecordStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{t("status.active") as string}</SelectItem>
                <SelectItem value="inactive">{t("status.inactive") as string}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{t("common.phone") as string}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t("common.address") as string}</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="flex items-center justify-between border-t pt-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-destructive hover:text-destructive">
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> {t("common.delete") as string}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("suppliers.delete.title") as string}</AlertDialogTitle>
                <AlertDialogDescription>
                  <strong>{supplier.name}</strong> {t("suppliers.delete.description") as string}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel") as string}</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => deleteMutation.mutate()}
                >
                  {t("common.delete") as string}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {t("common.save") as string}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Main page ─────────────────────────────────────────────────────────────── */
function Page() {
  const { t, lang } = useT();
  const { id } = useParams({ from: "/app/suppliers/$id" });
  const supplierId = Number(id);
  const qc = useQueryClient();
  const [newPurchaseOpen, setNewPurchaseOpen] = useState(false);

  const { data: supplier, isLoading, error, refetch } = useQuery({
    queryKey: qk.suppliers.detail(supplierId),
    queryFn: () => achatsApi.getSupplier(supplierId),
  });

  const { data: purchases = [], isLoading: purchasesLoading } = useQuery({
    queryKey: qk.purchases.list({ supplier_id: supplierId }),
    queryFn: () => achatsApi.listPurchases({ supplier_id: supplierId, limit: 200 }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ purchaseId, statut }: { purchaseId: number; statut: PurchaseStatut }) =>
      achatsApi.updatePurchaseStatus(purchaseId, statut),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchases"] }),
    onError: (err) => toast.error(err instanceof ApiError ? err.detail : "Erreur"),
  });

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (error || !supplier) {
    return <ApiErrorState error={error ?? new Error("Fournisseur introuvable")} onRetry={refetch} />;
  }

  const activePurchases = purchases.filter((p) => p.statut !== "annulee");
  const totalSpend = activePurchases.reduce((a, p) => a + Number(p.montant_total), 0);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground">
        <Link to="/app/suppliers"><ChevronLeft className="mr-1 h-4 w-4" /> {t("suppliers.title") as string}</Link>
      </Button>
      <PageHeader
        title={supplier.name}
        description={[supplier.phone, supplier.email].filter(Boolean).join(" · ")}
        badge={<StatusBadge status={supplier.status} />}
        actions={
          <Button size="sm" onClick={() => setNewPurchaseOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> {t("suppliers.purchase.new") as string}
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <KpiCard label={t("suppliers.kpi.spendTotal") as string} value={fmtXAF(totalSpend)}
          valueClassName="text-base sm:text-lg lg:text-xl" tone="primary" icon={<Wallet className="h-5 w-5" />} />
        <KpiCard label={t("suppliers.kpi.purchases") as string} value={purchases.length}
          tone="default" icon={<Receipt className="h-5 w-5" />} />
        <KpiCard label={t("suppliers.lastOrder") as string}
          value={purchases[0] ? formatDate(purchases[0].created_at, lang) : "—"} tone="default" />
      </div>

      <Tabs defaultValue="overview" className="mt-6">
        <TabsList>
          <TabsTrigger value="overview">{t("suppliers.tab.overview") as string}</TabsTrigger>
          <TabsTrigger value="purchases">{t("suppliers.tab.purchases") as string}</TabsTrigger>
          <TabsTrigger value="edit">{t("suppliers.tab.edit") as string}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card className="shadow-soft">
            <CardContent className="space-y-3 p-5 text-sm">
              <div className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 text-muted-foreground" /> {supplier.phone ?? "—"}
              </div>
              <div className="flex items-center gap-2.5">
                <Mail className="h-4 w-4 text-muted-foreground" /> <span className="truncate">{supplier.email ?? "—"}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <MapPin className="h-4 w-4 text-muted-foreground" /> {supplier.address ?? "—"}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="purchases" className="mt-4">
          <Card className="shadow-soft">
            <Table>
              <TableHeader>
                <TableRow className="bg-secondary/40">
                  <TableHead>{t("suppliers.purchase.col.reference") as string}</TableHead>
                  <TableHead>{t("suppliers.purchase.col.date") as string}</TableHead>
                  <TableHead className="text-right">{t("suppliers.purchase.col.items") as string}</TableHead>
                  <TableHead className="text-right">{t("suppliers.purchase.col.total") as string}</TableHead>
                  <TableHead>{t("suppliers.purchase.col.status") as string}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchasesLoading ? (
                  <TableSkeleton cols={5} />
                ) : purchases.length === 0 ? (
                  <tr><td colSpan={5}>
                    <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
                      <Receipt className="h-8 w-8 opacity-30" />
                      <span>{t("common.empty") as string}</span>
                    </div>
                  </td></tr>
                ) : (
                  purchases.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs font-medium">ACH-{p.id}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(p.created_at, lang)}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.lignes.length}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{fmtXAF(Number(p.montant_total))}</TableCell>
                      <TableCell>
                        <Select value={p.statut}
                          onValueChange={(v) => statusMutation.mutate({ purchaseId: p.id, statut: v as PurchaseStatut })}>
                          <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PURCHASE_STATUTS.map((s) => (
                              <SelectItem key={s} value={s}>{t(`suppliers.purchase.status.${s}`) as string}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="edit" className="mt-4">
          <EditTab supplier={supplier} />
        </TabsContent>
      </Tabs>

      <NewPurchaseDialog
        supplierId={supplierId}
        open={newPurchaseOpen}
        onClose={() => setNewPurchaseOpen(false)}
      />
    </>
  );
}
