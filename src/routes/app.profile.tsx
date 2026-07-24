import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { PasswordInput, FieldError } from "@/components/primitives";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Camera, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAuth, fetchMe, GROUP_SLUG_LABEL } from "@/lib/auth";
import { usersApi, uploadApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { toast } from "sonner";

export const Route = createFileRoute("/app/profile")({ component: Page });

function initials(firstname: string, lastname: string) {
  return `${firstname[0] ?? ""}${lastname[0] ?? ""}`.toUpperCase();
}

function roleLabel(user: { is_super_admin: boolean; groups: string[] }) {
  if (user.is_super_admin) return "Super Admin";
  return user.groups.map((g) => GROUP_SLUG_LABEL[g] ?? g).join(", ") || "Aucun rôle";
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Erreur";
}

function Page() {
  const { t } = useT();
  const { user } = useAuth();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // ───────────────── Avatar ─────────────────
  const avatarMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!user) throw new Error("Utilisateur introuvable");
      const uploaded = await uploadApi.image(file);
      return usersApi.update(user.id, { avatar: uploaded.url });
    },
    onSuccess: async () => {
      await fetchMe();
      toast.success("Photo de profil mise à jour");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  // ───────────────── Account info ─────────────────
  const [firstname, setFirstname] = useState("");
  const [lastname, setLastname] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [accountErrors, setAccountErrors] = useState<{ firstname?: string; lastname?: string; email?: string; phone?: string }>({});

  useEffect(() => {
    if (!user) return;
    setFirstname(user.firstname);
    setLastname(user.lastname);
    setEmail(user.email);
    setPhone(user.phone ?? "");
  }, [user]);

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!user) throw new Error("Utilisateur introuvable");
      return usersApi.update(user.id, { firstname, lastname, email, phone: phone || undefined });
    },
    onMutate: () => setAccountErrors({}),
    onSuccess: async () => {
      await fetchMe();
      toast.success("Profil mis à jour");
    },
    onError: (err) => {
      const msg = errorMessage(err);
      if (/e-mail/i.test(msg)) setAccountErrors((p) => ({ ...p, email: msg }));
      else if (/téléphone/i.test(msg)) setAccountErrors((p) => ({ ...p, phone: msg }));
      else toast.error(msg);
    },
  });

  // ───────────────── Password ─────────────────
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});

  const passwordMutation = useMutation({
    mutationFn: () => {
      if (!currentPassword) throw { current: "Veuillez saisir votre mot de passe actuel" };
      if (newPassword.length < 8) throw { next: "Le mot de passe doit contenir au moins 8 caractères" };
      if (newPassword !== confirmPassword) throw { confirm: "Les mots de passe ne correspondent pas" };
      return usersApi.changeMyPassword({ current_password: currentPassword, new_password: newPassword });
    },
    onMutate: () => setPasswordErrors({}),
    onSuccess: () => {
      toast.success("Mot de passe changé");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (err) => {
      if (err && typeof err === "object" && ("current" in err || "next" in err || "confirm" in err)) {
        setPasswordErrors(err as { current?: string; next?: string; confirm?: string });
        return;
      }
      const msg = err instanceof ApiError ? err.detail : errorMessage(err);
      if (/actuel/i.test(msg)) setPasswordErrors({ current: msg });
      else setPasswordErrors({ next: msg });
    },
  });

  if (!user) {
    return <PageHeader title={t("profile.title") as string} description={t("profile.subtitle") as string} />;
  }

  return (
    <>
      <PageHeader title={t("profile.title") as string} description={t("profile.subtitle") as string} />
      <Card className="mb-4 shadow-soft">
        <CardContent className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 p-6">
          <div className="relative">
            <Avatar className="h-16 w-16">
              {user.avatar && <AvatarImage src={user.avatar} alt={`${user.firstname} ${user.lastname}`} />}
              <AvatarFallback className="bg-gradient-to-br from-primary to-info text-base font-semibold text-primary-foreground">
                {initials(user.firstname, user.lastname)}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarMutation.isPending}
              className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:text-foreground"
              aria-label="Changer la photo de profil"
            >
              {avatarMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) avatarMutation.mutate(file);
                e.target.value = "";
              }}
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{user.firstname} {user.lastname}</h2>
              <Badge variant="secondary">{roleLabel(user)}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
        </CardContent>
      </Card>
      <Tabs defaultValue="account">
        <TabsList>
          <TabsTrigger value="account">{t("profile.personal") as string}</TabsTrigger>
          <TabsTrigger value="security">{t("profile.security") as string}</TabsTrigger>
        </TabsList>
        <TabsContent value="account" className="mt-4">
          <Card className="shadow-soft"><CardContent className="grid gap-4 p-6 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Prénom</Label>
              <Input
                value={firstname}
                onChange={(e) => setFirstname(e.target.value)}
                className={accountErrors.firstname ? "border-destructive focus-visible:ring-destructive" : undefined}
              />
              <FieldError>{accountErrors.firstname}</FieldError>
            </div>
            <div className="space-y-1.5">
              <Label>Nom</Label>
              <Input
                value={lastname}
                onChange={(e) => setLastname(e.target.value)}
                className={accountErrors.lastname ? "border-destructive focus-visible:ring-destructive" : undefined}
              />
              <FieldError>{accountErrors.lastname}</FieldError>
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.email") as string}</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={accountErrors.email ? "border-destructive focus-visible:ring-destructive" : undefined}
              />
              <FieldError>{accountErrors.email}</FieldError>
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.phone") as string}</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={accountErrors.phone ? "border-destructive focus-visible:ring-destructive" : undefined}
              />
              <FieldError>{accountErrors.phone}</FieldError>
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.role") as string}</Label>
              <Input value={roleLabel(user)} disabled />
            </div>
            <div className="sm:col-span-2">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {t("common.save") as string}
              </Button>
            </div>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="security" className="mt-4">
          <Card className="shadow-soft"><CardContent className="grid gap-4 p-6 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t("profile.currentPassword") as string}</Label>
              <PasswordInput
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                error={passwordErrors.current}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("auth.newPassword") as string}</Label>
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                error={passwordErrors.next}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("auth.confirmPassword") as string}</Label>
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                error={passwordErrors.confirm}
              />
            </div>
            <div className="sm:col-span-2">
              <Button onClick={() => passwordMutation.mutate()} disabled={passwordMutation.isPending}>
                {t("profile.changePassword") as string}
              </Button>
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
