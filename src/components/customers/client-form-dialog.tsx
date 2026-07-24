import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FieldError } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { clientsApi, storesApi, qk } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { ApiError } from "@/lib/api-client";
import type { ClientRead, ClientType } from "@/lib/types";
import { toast } from "sonner";

export function ClientFormDialog({
  client,
  open,
  onClose,
}: {
  client?: ClientRead;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useT();
  const qc = useQueryClient();
  const isEdit = !!client;

  const [name, setName] = useState(client?.name ?? "");
  const [prenom, setPrenom] = useState(client?.prenom ?? "");
  const [phone, setPhone] = useState(client?.phone ?? "");
  const [email, setEmail] = useState(client?.email ?? "");
  const [address, setAddress] = useState(client?.address ?? "");
  const [ville, setVille] = useState(client?.ville ?? "");
  const [typeClient, setTypeClient] = useState<ClientType>(client?.type_client ?? "particulier");
  const [entreprise, setEntreprise] = useState(client?.entreprise ?? "");
  const [notes, setNotes] = useState(client?.notes ?? "");
  const [plafondCredit, setPlafondCredit] = useState(client?.plafond_credit ?? "0");
  const [storeId, setStoreId] = useState<string>(client?.store_id ? String(client.store_id) : "");

  const [errors, setErrors] = useState<{ name?: string; phone?: string; email?: string }>({});

  const { data: stores = [] } = useQuery({
    queryKey: qk.stores.list(),
    queryFn: () => storesApi.list({ limit: 200 }),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: () => {
      const fieldErrors: typeof errors = {};
      if (!name.trim()) fieldErrors.name = t("common.required") as string;
      if (!phone.trim() && !email.trim()) {
        fieldErrors.phone = t("customers.contactRequired") as string;
        fieldErrors.email = t("customers.contactRequired") as string;
      }
      if (Object.keys(fieldErrors).length > 0) throw { fieldErrors };

      const body = {
        name: name.trim(),
        prenom: prenom.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        ville: ville.trim() || undefined,
        type_client: typeClient,
        entreprise: typeClient === "entreprise" ? (entreprise.trim() || undefined) : undefined,
        notes: notes.trim() || undefined,
        plafond_credit: Number(plafondCredit) || 0,
        store_id: storeId ? Number(storeId) : undefined,
      };

      return isEdit ? clientsApi.update(client!.id, body) : clientsApi.create(body);
    },
    onMutate: () => setErrors({}),
    onSuccess: () => {
      toast.success((isEdit ? t("customers.updated") : t("customers.created")) as string);
      qc.invalidateQueries({ queryKey: ["clients"] });
      onClose();
    },
    onError: (err) => {
      if (err && typeof err === "object" && "fieldErrors" in err) {
        setErrors((err as { fieldErrors: typeof errors }).fieldErrors);
        return;
      }
      const msg = err instanceof ApiError ? err.detail : err instanceof Error ? err.message : "Erreur";
      if (/téléphone/i.test(msg)) setErrors({ phone: msg });
      else if (/e-mail/i.test(msg)) setErrors({ email: msg });
      else if (/requis/i.test(msg)) setErrors({ phone: msg, email: msg });
      else toast.error(msg);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{(isEdit ? t("customers.edit.title") : t("customers.new.title")) as string}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("customers.form.name") as string} *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                className={errors.name ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              <FieldError>{errors.name}</FieldError>
            </div>
            <div className="space-y-1.5">
              <Label>{t("customers.form.prenom") as string}</Label>
              <Input value={prenom} onChange={(e) => setPrenom(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("common.phone") as string}</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={errors.phone ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              <FieldError>{errors.phone}</FieldError>
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.email") as string}</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={errors.email ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              <FieldError>{errors.email}</FieldError>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("common.address") as string}</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.city") as string}</Label>
              <Input value={ville} onChange={(e) => setVille(e.target.value)} />
            </div>
          </div>
          <div className={typeClient === "entreprise" ? "grid grid-cols-2 gap-3" : ""}>
            <div className="space-y-1.5">
              <Label>{t("customers.col.type") as string}</Label>
              <Select value={typeClient} onValueChange={(v) => setTypeClient(v as ClientType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="particulier">{t("customers.type.particulier") as string}</SelectItem>
                  <SelectItem value="entreprise">{t("customers.type.entreprise") as string}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {typeClient === "entreprise" && (
              <div className="space-y-1.5">
                <Label>{t("customers.form.entreprise") as string}</Label>
                <Input value={entreprise} onChange={(e) => setEntreprise(e.target.value)} />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("customers.form.creditLimit") as string}</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={plafondCredit}
                onChange={(e) => setPlafondCredit(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.store") as string}</Label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("common.all") as string} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t("common.all") as string}</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("customers.form.notes") as string}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("common.cancel") as string}</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {t(isEdit ? "common.save" : "common.create") as string}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
