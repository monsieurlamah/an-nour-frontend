import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { FieldError } from "@/components/primitives";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { achatsApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/app/suppliers/new")({ component: Page });

function Page() {
  const { t } = useT();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [errors, setErrors] = useState<{ name?: string }>({});

  const mutation = useMutation({
    mutationFn: () => {
      if (!name.trim()) {
        setErrors({ name: t("common.required") as string });
        throw new Error("validation");
      }
      setErrors({});
      return achatsApi.createSupplier({
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
      });
    },
    onSuccess: (supplier) => {
      toast.success(t("suppliers.created") as string);
      navigate({ to: "/app/suppliers/$id", params: { id: String(supplier.id) } });
    },
    onError: (err) => {
      if (err instanceof Error && err.message === "validation") return;
      const msg = err instanceof ApiError ? err.detail : err instanceof Error ? err.message : "Erreur";
      toast.error(msg);
    },
  });

  return (
    <>
      <PageHeader
        title={t("suppliers.new.title") as string}
        description={t("suppliers.new.subtitle") as string}
        breadcrumbs={[
          { label: t("suppliers.title") as string, to: "/app/suppliers" },
          { label: t("common.new") as string },
        ]}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/app/suppliers">{t("common.cancel") as string}</Link>
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t("common.create") as string}
            </Button>
          </>
        }
      />
      <div className="max-w-xl">
        <Card className="shadow-soft">
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1.5">
              <Label>{t("suppliers.col.name") as string} *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                className={errors.name ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              <FieldError>{errors.name}</FieldError>
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
          </CardContent>
        </Card>
      </div>
    </>
  );
}
