import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "./login";
import { toast } from "sonner";
import { ShieldCheck, Loader2 } from "lucide-react";
import { isAuthenticated, getCurrentUser, fetchMe, hydrateAuth, useAuth } from "@/lib/auth";
import { usersApi } from "@/lib/api";
import {
  PasswordInput,
  PasswordChecklist,
  PasswordStrengthMeter,
  PasswordMatchHint,
} from "@/components/auth/password";
import { passwordIsStrong } from "@/components/auth/password-rules";

export const Route = createFileRoute("/change-password")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!isAuthenticated()) throw redirect({ to: "/login" });
    const user = getCurrentUser();
    if (user && !user.must_change_password) throw redirect({ to: "/app" });
  },
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const navigate = useNavigate();
  const { user } = useAuth(); // reactive — updated when hydrateAuth/fetchMe is called
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // Populate currentUser if landing here directly (not via login flow)
  useEffect(() => {
    if (!getCurrentUser()) void hydrateAuth();
  }, []);

  const strong = passwordIsStrong(password);
  const match = confirm.length > 0 && password === confirm;
  const mismatch = confirm.length > 0 && password !== confirm;

  const mutation = useMutation({
    mutationFn: async () => {
      const currentUser = getCurrentUser();
      if (!currentUser) throw new Error("Session non chargée. Rechargez la page.");
      // Self-service endpoint — no `users.manage` permission needed. On the
      // first-login flow the backend skips the current-password check and
      // clears the must_change_password flag.
      await usersApi.changeMyPassword({ new_password: password });
      await fetchMe(); // refresh in-memory user so must_change_password becomes false
    },
    onSuccess: () => {
      toast.success("Mot de passe défini. Bienvenue !");
      navigate({ to: "/app" });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Erreur lors du changement");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!strong) {
      toast.error("Le mot de passe ne respecte pas les règles.");
      return;
    }
    if (password !== confirm) {
      toast.error("Les mots de passe ne correspondent pas.");
      return;
    }
    mutation.mutate();
  };

  return (
    <AuthLayout
      eyebrow="Première connexion"
      title="Définissez votre mot de passe"
      subtitle="Choisissez un mot de passe personnel et sécurisé pour accéder à votre espace."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="pwd">Nouveau mot de passe</Label>
          <PasswordInput
            id="pwd"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
          />
          <PasswordStrengthMeter password={password} />
          <PasswordChecklist password={password} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirmer le mot de passe</Label>
          <PasswordInput
            id="confirm"
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
          disabled={!user || mutation.isPending || !strong || mismatch || confirm.length === 0}
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Enregistrement…
            </>
          ) : (
            <>
              <ShieldCheck className="h-4 w-4" /> Définir mon mot de passe
            </>
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
