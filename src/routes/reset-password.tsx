import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "./login";
import { useT } from "@/lib/i18n";
import { resetPassword } from "@/lib/auth";
import { ApiError } from "@/lib/api-client";

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

  const resetMutation = useMutation({
    mutationFn: () => resetPassword(token, password),
    onSuccess: () => {
      toast.success(t("auth.resetCta") as string);
      navigate({ to: "/login" });
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.detail : "Erreur lors de la réinitialisation.";
      toast.error(message);
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Les deux mots de passe ne correspondent pas.");
      return;
    }
    resetMutation.mutate();
  };

  if (!token) {
    return (
      <AuthLayout title={t("auth.resetTitle") as string} subtitle={t("auth.resetSubtitle") as string}>
        <div className="space-y-4">
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            Ce lien de réinitialisation est invalide. Merci d'en demander un nouveau.
          </div>
          <Button asChild variant="outline" className="w-full">
            <a href="/forgot-password">{t("auth.forgotCta") as string}</a>
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t("auth.resetTitle") as string} subtitle={t("auth.resetSubtitle") as string}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="p1">{t("auth.newPassword") as string}</Label>
          <Input
            id="p1"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p2">{t("auth.confirmPassword") as string}</Label>
          <Input
            id="p2"
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <Button type="submit" className="h-10 w-full" disabled={resetMutation.isPending}>
          {resetMutation.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {t("auth.resetCta") as string}
        </Button>
      </form>
    </AuthLayout>
  );
}
