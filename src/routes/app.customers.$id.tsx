import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiErrorState, EmptyState, KpiCard, SectionCard } from "@/components/primitives";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, Mail, Phone, MapPin, CreditCard, Receipt, Wallet, Loader2 } from "lucide-react";
import { clientsApi, qk } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { ClientFormDialog } from "@/components/customers/client-form-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/app/customers/$id")({ component: Page });

function Page() {
  const { t } = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { id } = useParams({ from: "/app/customers/$id" });
  const clientId = Number(id);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: client, isLoading, error, refetch } = useQuery({
    queryKey: qk.clients.detail(clientId),
    queryFn: () => clientsApi.get(clientId),
    enabled: Number.isFinite(clientId),
  });

  const deleteMutation = useMutation({
    mutationFn: () => clientsApi.delete(clientId),
    onSuccess: () => {
      toast.success(t("customers.deleted") as string);
      qc.invalidateQueries({ queryKey: ["clients"] });
      navigate({ to: "/app/customers" });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const backLink = (
    <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground">
      <Link to="/app/customers"><ChevronLeft className="mr-1 h-4 w-4" /> {t("customers.title") as string}</Link>
    </Button>
  );

  if (isLoading) {
    return (
      <>
        {backLink}
        <Card className="mb-4 p-6 shadow-soft">
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-14 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
          </div>
        </Card>
      </>
    );
  }

  if (error || !client) {
    return (
      <>
        {backLink}
        <ApiErrorState error={error} onRetry={refetch} />
      </>
    );
  }

  const fullName = client.prenom ? `${client.name} ${client.prenom}` : client.name;
  const initials = fullName.split(" ").map((x) => x[0]).join("").toUpperCase().slice(0, 2);

  return (
    <>
      {backLink}
      <Card className="mb-4 p-6 shadow-soft">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4">
          <Avatar className="h-14 w-14"><AvatarFallback className="text-base font-semibold">{initials}</AvatarFallback></Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-semibold">{fullName}</h1>
              <Badge variant="secondary">
                {client.type_client === "entreprise"
                  ? (t("customers.type.entreprise") as string)
                  : (t("customers.type.particulier") as string)}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono">{client.code_client}</span>
              {client.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {client.email}</span>}
              {client.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {client.phone}</span>}
              {client.ville && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {client.ville}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>{t("common.edit") as string}</Button>
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
              {t("common.delete") as string}
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          label={t("customers.form.creditLimit") as string}
          value={`${Number(client.plafond_credit).toLocaleString("fr-FR")} GNF`}
          icon={<CreditCard className="h-5 w-5" />}
        />
        <KpiCard label={t("common.store") as string} value={client.store_id ? `#${client.store_id}` : "N/A"} icon={<Wallet className="h-5 w-5" />} />
      </div>

      <Tabs defaultValue="info" className="mt-6">
        <TabsList>
          <TabsTrigger value="info">{t("customers.detail.info") as string}</TabsTrigger>
          <TabsTrigger value="sales">{t("customers.detail.sales") as string}</TabsTrigger>
          <TabsTrigger value="debts">{t("customers.detail.debts") as string}</TabsTrigger>
          <TabsTrigger value="payments">{t("customers.detail.payments") as string}</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-4">
          <SectionCard title={t("customers.detail.info") as string}>
            <dl className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
              <Field label={t("customers.form.name") as string} value={client.name} />
              <Field label={t("customers.form.prenom") as string} value={client.prenom} />
              <Field label={t("common.phone") as string} value={client.phone} />
              <Field label={t("common.email") as string} value={client.email} />
              <Field label={t("common.address") as string} value={client.address} />
              <Field label={t("common.city") as string} value={client.ville} />
              {client.type_client === "entreprise" && (
                <Field label={t("customers.form.entreprise") as string} value={client.entreprise} />
              )}
              <Field label={t("customers.form.creditLimit") as string} value={`${Number(client.plafond_credit).toLocaleString("fr-FR")} GNF`} />
            </dl>
            {client.notes && (
              <div className="border-t px-5 py-4">
                <div className="text-xs font-medium text-muted-foreground">{t("customers.form.notes") as string}</div>
                <p className="mt-1 text-sm">{client.notes}</p>
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="sales" className="mt-4">
          <SectionCard>
            <EmptyState
              icon={<Receipt className="h-5 w-5" />}
              title={t("common.empty") as string}
              description={t("customers.detail.sales") as string}
            />
          </SectionCard>
        </TabsContent>

        <TabsContent value="debts" className="mt-4">
          <SectionCard>
            <EmptyState
              icon={<CreditCard className="h-5 w-5" />}
              title={t("common.empty") as string}
              description={t("customers.detail.debts") as string}
            />
          </SectionCard>
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <SectionCard>
            <EmptyState
              icon={<Wallet className="h-5 w-5" />}
              title={t("common.empty") as string}
              description={t("customers.detail.payments") as string}
            />
          </SectionCard>
        </TabsContent>
      </Tabs>

      <ClientFormDialog client={client} open={editOpen} onClose={() => setEditOpen(false)} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("customers.delete.title") as string}</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{fullName}</strong> ({client.code_client}). {t("customers.delete.description") as string}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel") as string}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending
                ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> {t("common.delete") as string}…</>
                : (t("common.delete") as string)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{value || ""}</dd>
    </div>
  );
}
