import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "./login";
import { useT } from "@/lib/i18n";
import { resetPassword } from "@/lib/auth";
import { ApiError } from "@/lib/api-client";
import {
  PasswordInput,
  PasswordChecklist,
  PasswordStrengthMeter,
  PasswordMatchHint,
} from "@/components/auth/password";
import { passwordIsStrong } from "@/components/auth/password-rules";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): { token: string } => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  component: Page,
});

function Page() {
  const { t } = useT();
  const navigate = useNavigate();
  const { token } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const strong = passwordIsStrong(password);
  const match = confirm.length > 0 && password === confirm;
  const mismatch = confirm.length > 0 && password !== confirm;

  const resetMutation = useMutation({
    mutationFn: () => resetPassword(token, password),
    onSuccess: () => {
      toast.success(t("auth.resetCta") as string);
      navigate({ to: "/login" });
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.detail : "Erreur lors de la réinitialisation.");
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!strong) {
      toast.error(t("auth.pwdWeak") as string);
      return;
    }
    if (password !== confirm) {
      toast.error(t("auth.pwdMismatch") as string);
      return;
    }
    resetMutation.mutate();
  };

  if (!token) {
    return (
      <AuthLayout
        title={t("auth.resetTitle") as string}
        subtitle={t("auth.resetSubtitle") as string}
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            Ce lien de réinitialisation est invalide ou a expiré. Merci d'en demander un nouveau.
          </div>
          <Button asChild variant="outline" className="h-11 w-full">
            <Link to="/forgot-password">{t("auth.forgotCta") as string}</Link>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow={t("auth.resetTitle") as string}
      title={t("auth.newPassword") as string}
      subtitle={t("auth.resetSubtitle") as string}
    >
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="p1">{t("auth.newPassword") as string}</Label>
          <PasswordInput
            id="p1"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
          />
          <PasswordStrengthMeter password={password} />
          <PasswordChecklist password={password} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p2">{t("auth.confirmPassword") as string}</Label>
          <PasswordInput
            id="p2"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            valid={match}
            invalid={mismatch}
          />
          <PasswordMatchHint password={password} confirm={confirm} />
        </div>
        <Button
          type="submit"
          className="h-11 w-full gap-2 font-semibold"
          disabled={resetMutation.isPending || !strong || mismatch || confirm.length === 0}
        >
          {resetMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading") as string}
            </>
          ) : (
            <>
              <ShieldCheck className="h-4 w-4" /> {t("auth.resetCta") as string}
            </>
          )}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          <Link to="/login" className="font-medium text-primary hover:underline">
            {t("auth.backToLogin") as string}
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
