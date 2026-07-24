import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ChevronLeft, Store } from "lucide-react";
import { storesApi, usersApi, catalogApi, qk } from "@/lib/api";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/app/stores/new")({ component: Page });

const TIMEZONES = [
  { value: "Africa/Conakry", label: "Africa/Conakry (GMT+0)" },
  { value: "Africa/Abidjan", label: "Africa/Abidjan (GMT+0)" },
  { value: "Africa/Dakar", label: "Africa/Dakar (GMT+0)" },
  { value: "Africa/Douala", label: "Africa/Douala (GMT+1)" },
  { value: "Africa/Lagos", label: "Africa/Lagos (GMT+1)" },
  { value: "Africa/Casablanca", label: "Africa/Casablanca (GMT+1)" },
  { value: "Europe/Paris", label: "Europe/Paris (GMT+1/2)" },
  { value: "UTC", label: "UTC" },
];

const CURRENCIES = [
  { value: "GNF", label: "GNF · Franc guinéen" },
  { value: "XAF", label: "XAF · Franc CFA (BEAC)" },
  { value: "XOF", label: "XOF · Franc CFA (UEMOA)" },
  { value: "EUR", label: "EUR · Euro" },
  { value: "USD", label: "USD · Dollar US" },
];

function Page() {
  const { t } = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("Conakry");
  const [timezone, setTimezone] = useState("Africa/Conakry");
  const [devise, setDevise] = useState("GNF");
  const [gerantId, setGerantId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");

  const { data: users = [] } = useQuery({
    queryKey: qk.users.list(),
    queryFn: () => usersApi.list({ limit: 200 }),
  });

  const { data: storeCategories = [] } = useQuery({
    queryKey: qk.catalog.storeCategories,
    queryFn: () => catalogApi.listStoreCategories(),
  });

  const mutation = useMutation({
    mutationFn: () =>
      storesApi.create({
        name: name.trim(),
        code: code.trim() || undefined,
        description: description.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        timezone,
        devise,
        gerant_id: gerantId ? Number(gerantId) : undefined,
        category_store_id: categoryId ? Number(categoryId) : undefined,
      }),
    onSuccess: (store) => {
      toast.success(`Boutique "${store.name}" créée : emplacement de stock STORE créé automatiquement.`);
      qc.invalidateQueries({ queryKey: ["stores"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      navigate({ to: "/app/stores/$id", params: { id: String(store.id) } });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur lors de la création"),
  });

  const canSubmit = name.trim().length > 0 && !mutation.isPending;

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground">
        <Link to="/app/stores">
          <ChevronLeft className="mr-1 h-4 w-4" /> {t("stores.title") as string}
        </Link>
      </Button>

      <PageHeader
        title={t("stores.new.title") as string}
        description={t("stores.new.subtitle") as string}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/app/stores">{t("common.cancel") as string}</Link>
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={!canSubmit}>
              {mutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t("common.create") as string}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ── Infos principales ── */}
        <Card className="shadow-soft lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Informations générales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("stores.col.name") as string} *</Label>
                <Input
                  placeholder="Boutique Elsag"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  Code <span className="text-muted-foreground text-xs">(unique, ex : ELS001)</span>
                </Label>
                <Input
                  placeholder="ELS001"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                rows={2}
                placeholder="Description optionnelle de la boutique…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Adresse</Label>
              <Input
                placeholder="Rue du Commerce, Quartier Madina…"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>{t("common.city") as string}</Label>
                <Input
                  placeholder="Conakry"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("setup.currency") as string}</Label>
                <Select value={devise} onValueChange={setDevise}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("setup.timezone") as string}</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Colonne droite ── */}
        <div className="space-y-4">
          {/* Gérant */}
          <Card className="shadow-soft">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">{t("stores.col.manager") as string}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>
                  Gérant <span className="text-muted-foreground text-xs">(optionnel)</span>
                </Label>
                <Select value={gerantId} onValueChange={setGerantId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Aucun gérant" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Aucun gérant</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.firstname} {u.lastname}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {storeCategories.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Catégorie boutique</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Aucune" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Aucune</SelectItem>
                      {storeCategories.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Info stock */}
          <Card className="shadow-soft bg-secondary/30">
            <CardContent className="p-4 text-sm">
              <div className="flex items-start gap-3">
                <Store className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="text-muted-foreground text-xs leading-relaxed">
                  À la création, un <strong className="text-foreground">emplacement de stock STORE</strong> est créé
                  automatiquement pour cette boutique. Le stock sera alimenté
                  par transferts depuis le Stock Central.
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
