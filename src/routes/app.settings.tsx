import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader, useTheme, type ThemeMode } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { useCurrency, SUPPORTED_CURRENCIES } from "@/lib/currency";
import { useWorkContext } from "@/lib/work-context";
import { settingsApi, qk } from "@/lib/api";
import type { SettingRead } from "@/lib/types";

export const Route = createFileRoute("/app/settings")({ component: Page });

const TIMEZONES = [
  { value: "Africa/Conakry", label: "Africa/Conakry (GMT)" },
  { value: "Africa/Abidjan", label: "Africa/Abidjan (GMT)" },
  { value: "Africa/Bamako", label: "Africa/Bamako (GMT)" },
  { value: "Africa/Dakar", label: "Africa/Dakar (GMT)" },
  { value: "UTC", label: "UTC" },
];

type GeneralDraft = { name: string; fiscal_id: string; phone: string; email: string };
type LocalizationDraft = { timezone: string; tax_rate: string };

function Page() {
  const { t, lang, setLang } = useT();
  const { currency, setCurrency } = useCurrency();
  const { mode, setMode } = useTheme();
  const { has } = useWorkContext();
  const qc = useQueryClient();
  const canManage = has("settings.manage");

  const { data: settings = [], isLoading } = useQuery({
    queryKey: qk.settings.list("general"),
    queryFn: () => settingsApi.list("general"),
    enabled: canManage,
  });
  const byKey = Object.fromEntries(settings.map((s) => [s.key, s]));

  const [generalDraft, setGeneralDraft] = useState<GeneralDraft>({
    name: "", fiscal_id: "", phone: "", email: "",
  });
  const [localizationDraft, setLocalizationDraft] = useState<LocalizationDraft>({
    timezone: "Africa/Conakry", tax_rate: "0",
  });
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current || settings.length === 0) return;
    hydrated.current = true;
    setGeneralDraft({
      name: byKey["company.name"]?.value ?? "",
      fiscal_id: byKey["company.fiscal_id"]?.value ?? "",
      phone: byKey["company.phone"]?.value ?? "",
      email: byKey["company.email"]?.value ?? "",
    });
    setLocalizationDraft({
      timezone: byKey["company.timezone"]?.value ?? "Africa/Conakry",
      tax_rate: byKey["company.tax_rate"]?.value ?? "0",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  // Generic "diff against the loaded value, PATCH only what changed" saver —
  // shared by both tabs since they both edit a subset of the same key/value store.
  const saveMutation = useMutation({
    mutationFn: async (updates: Record<string, string>) => {
      const changed = Object.entries(updates).filter(
        ([key, value]) => byKey[key] && byKey[key].value !== value,
      );
      await Promise.all(
        changed.map(([key, value]) => settingsApi.update(byKey[key].id, { value })),
      );
      return changed.length;
    },
    onSuccess: (count) => {
      if (count === 0) {
        toast.message("Aucune modification à enregistrer");
      } else {
        toast.success(t("common.save") as string);
        qc.invalidateQueries({ queryKey: qk.settings.list("general") });
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  if (!canManage) {
    return (
      <>
        <PageHeader title={t("settings.title") as string} description={t("settings.subtitle") as string} />
        <Card className="flex flex-col items-center gap-3 p-10 text-center shadow-soft">
          <Lock className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="font-medium">Accès réservé</p>
            <p className="text-sm text-muted-foreground">
              Les paramètres de l'entreprise sont réservés au Boss.
            </p>
          </div>
          <Link to="/app" className="text-sm text-primary hover:underline">
            Retour à l'accueil →
          </Link>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("settings.title") as string} description={t("settings.subtitle") as string} />
      <Tabs defaultValue="company">
        <TabsList className="flex-wrap">
          <TabsTrigger value="company">{t("settings.sec.general") as string}</TabsTrigger>
          <TabsTrigger value="localization">{t("settings.sec.localization") as string}</TabsTrigger>
          <TabsTrigger value="appearance">{t("settings.sec.appearance") as string}</TabsTrigger>
          <TabsTrigger value="notifications">{t("settings.sec.notifications") as string}</TabsTrigger>
          <TabsTrigger value="security">{t("settings.sec.security") as string}</TabsTrigger>
          <TabsTrigger value="billing">{t("settings.sec.billing") as string}</TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="mt-4">
          <Card className="shadow-soft">
            <CardHeader><CardTitle className="text-base">{t("settings.sec.general") as string}</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {isLoading ? (
                <div className="col-span-2 flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label>{t("settings.legalName") as string}</Label>
                    <Input value={generalDraft.name}
                      onChange={(e) => setGeneralDraft((d) => ({ ...d, name: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>ID fiscal</Label>
                    <Input value={generalDraft.fiscal_id}
                      onChange={(e) => setGeneralDraft((d) => ({ ...d, fiscal_id: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("common.phone") as string}</Label>
                    <Input value={generalDraft.phone}
                      onChange={(e) => setGeneralDraft((d) => ({ ...d, phone: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("common.email") as string}</Label>
                    <Input type="email" value={generalDraft.email}
                      onChange={(e) => setGeneralDraft((d) => ({ ...d, email: e.target.value }))} />
                  </div>
                  <div className="sm:col-span-2">
                    <Button
                      disabled={saveMutation.isPending}
                      onClick={() => saveMutation.mutate({
                        "company.name": generalDraft.name,
                        "company.fiscal_id": generalDraft.fiscal_id,
                        "company.phone": generalDraft.phone,
                        "company.email": generalDraft.email,
                      })}
                    >
                      {saveMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                      {t("common.save") as string}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="localization" className="mt-4">
          <Card className="shadow-soft">
            <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
              {/* Language and currency are per-device display preferences
                  (stored in this browser only) — deliberately not part of
                  the company-wide Settings store below. */}
              <div className="space-y-1.5">
                <Label>{t("settings.language") as string}</Label>
                <Select value={lang} onValueChange={(v) => setLang(v as "fr" | "en")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fr">🇫🇷 Français</SelectItem>
                    <SelectItem value="en">🇬🇧 English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("settings.currency") as string}</Label>
                <Select value={currency} onValueChange={(v) => { setCurrency(v); toast.success(t("common.save") as string); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("settings.timezone") as string}</Label>
                <Select value={localizationDraft.timezone}
                  onValueChange={(v) => setLocalizationDraft((d) => ({ ...d, timezone: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((z) => (
                      <SelectItem key={z.value} value={z.value}>{z.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("common.tax") as string} par défaut (%)</Label>
                <Input type="number" min={0} step={0.25} value={localizationDraft.tax_rate}
                  onChange={(e) => setLocalizationDraft((d) => ({ ...d, tax_rate: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <Button
                  disabled={saveMutation.isPending}
                  onClick={() => saveMutation.mutate({
                    "company.timezone": localizationDraft.timezone,
                    "company.tax_rate": localizationDraft.tax_rate,
                  })}
                >
                  {saveMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  {t("common.save") as string}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="mt-4">
          <Card className="shadow-soft"><CardContent className="space-y-4 p-6">
            <div className="space-y-1.5">
              <Label>{t("settings.theme") as string}</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as ThemeMode)}>
                <SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">{t("common.themeLight") as string}</SelectItem>
                  <SelectItem value="dark">{t("common.themeDark") as string}</SelectItem>
                  <SelectItem value="auto">{t("settings.themeAuto") as string}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          <Card className="shadow-soft p-8 text-center text-sm text-muted-foreground">
            Préférences de notification par type — bientôt disponible.
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-4">
          <Card className="shadow-soft"><CardContent className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{t("settings.2fa") as string}</div>
                <div className="text-xs text-muted-foreground">Bientôt disponible.</div>
              </div>
            </div>
            <div className="pt-2">
              <Button variant="outline" asChild>
                <Link to="/app/profile">{t("profile.changePassword") as string}</Link>
              </Button>
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="billing" className="mt-4">
          <Card className="shadow-soft p-8 text-center text-sm text-muted-foreground">{t("settings.sec.billing") as string}</Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
