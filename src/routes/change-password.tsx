import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "./login";
import { toast } from "sonner";
import { Check, X, Eye, EyeOff, Lock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { isAuthenticated, getCurrentUser, fetchMe, hydrateAuth, useAuth } from "@/lib/auth";
import { usersApi } from "@/lib/api";

export const Route = createFileRoute("/change-password")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!isAuthenticated()) throw redirect({ to: "/login" });
    const user = getCurrentUser();
    if (user && !user.must_change_password) throw redirect({ to: "/app" });
  },
  component: ChangePasswordPage,
});

const PWD_RULES = [
  { label: "8 caractères minimum", ok: (p: string) => p.length >= 8 },
  { label: "Une minuscule", ok: (p: string) => /[a-z]/.test(p) },
  { label: "Une majuscule", ok: (p: string) => /[A-Z]/.test(p) },
  { label: "Un chiffre", ok: (p: string) => /[0-9]/.test(p) },
  { label: "Un symbole", ok: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

function ChangePasswordPage() {
  const navigate = useNavigate();
  const { user } = useAuth(); // reactive — updated when hydrateAuth/fetchMe is called
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Populate currentUser if landing here directly (not via login flow)
  useEffect(() => {
    if (!getCurrentUser()) void hydrateAuth();
  }, []);

  const rules = PWD_RULES.map((r) => ({ ...r, passed: r.ok(password) }));
  const strong = rules.every((r) => r.passed) && !/\s/.test(password);
  const match = confirm.length > 0 && password === confirm;
  const mismatch = confirm.length > 0 && password !== confirm;

  const mutation = useMutation({
    mutationFn: async () => {
      const currentUser = getCurrentUser();
      if (!currentUser) throw new Error("Session non chargée. Rechargez la page.");
      await usersApi.update(currentUser.id, { password, must_change_password: false });
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
    if (!strong) { toast.error("Le mot de passe ne respecte pas les règles."); return; }
    if (password !== confirm) { toast.error("Les mots de passe ne correspondent pas."); return; }
    mutation.mutate();
  };

  return (
    <AuthLayout
      eyebrow="Première connexion"
      title="Définissez votre mot de passe"
      subtitle="Choisissez un mot de passe personnel sécurisé pour accéder à votre espace."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* New password */}
        <div className="space-y-1.5">
          <Label htmlFor="pwd">Nouveau mot de passe</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="pwd"
              type={showPwd ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              required
              className="h-11 pl-9 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
              aria-label="Afficher/masquer"
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {/* Strength rules */}
          {password.length > 0 && (
            <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
              {rules.map((r) => (
                <li
                  key={r.label}
                  className={cn(
                    "flex items-center gap-1.5 text-[11px] transition-colors",
                    r.passed ? "text-success" : "text-muted-foreground",
                  )}
                >
                  {r.passed
                    ? <Check className="h-3 w-3 shrink-0" />
                    : <X className="h-3 w-3 shrink-0 opacity-40" />}
                  {r.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Confirm */}
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirmer le mot de passe</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="confirm"
              type={showConfirm ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              required
              className={cn(
                "h-11 pl-9 pr-10 transition-colors",
                match && "border-success ring-1 ring-success/30",
                mismatch && "border-destructive ring-1 ring-destructive/30",
              )}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
              aria-label="Afficher/masquer"
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {confirm.length > 0 && (
            <p className={cn("flex items-center gap-1.5 text-[11px]", match ? "text-success" : "text-destructive")}>
              {match ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
              {match ? "Les mots de passe correspondent" : "Les mots de passe ne correspondent pas"}
            </p>
          )}
        </div>

        <Button
          type="submit"
          className="h-11 w-full font-semibold"
          disabled={!user || mutation.isPending || !strong || mismatch || confirm.length === 0}
        >
          {mutation.isPending
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enregistrement…</>
            : "Définir mon mot de passe"}
        </Button>
      </form>
    </AuthLayout>
  );
}
