import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { AuthLayout } from "./login";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { forgotPassword } from "@/lib/auth";
import { ApiError } from "@/lib/api-client";

export const Route = createFileRoute("/forgot-password")({ component: Page });

function Page() {
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      const message = err instanceof ApiError ? err.detail : "Erreur lors de l'envoi de l'e-mail.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout title={t("auth.forgotTitle") as string} subtitle={t("auth.forgotSubtitle") as string}>
      {sent ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-success/30 bg-success/10 p-4 text-sm">
            <p className="font-medium text-foreground">📩</p>
            <p className="mt-1 text-muted-foreground">
              Si un compte existe avec l'adresse <strong>{email}</strong>, un e-mail de
              réinitialisation vient de lui être envoyé.
            </p>
          </div>
          <Button asChild variant="outline" className="w-full"><Link to="/login">{t("auth.backToLogin") as string}</Link></Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">{t("common.email") as string}</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@retail.cm"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full h-10" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {t("auth.forgotCta") as string}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            <Link to="/login" className="font-medium text-primary hover:underline">{t("auth.backToLogin") as string}</Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
