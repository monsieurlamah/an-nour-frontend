// Lets an admin (users.manage) define a brand new password for another
// user directly — distinct from "Envoyer les accès" (which generates a
// random password and emails it). Same backend call either way: PATCH
// /users/{id} with `password` + `must_change_password` already supports
// this (UserService.update hashes it) — no backend change needed here.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dice5, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  PasswordInput, PasswordChecklist, PasswordStrengthMeter, PasswordMatchHint,
} from "@/components/auth/password";
import { passwordIsStrong } from "@/components/auth/password-rules";
import { usersApi, qk } from "@/lib/api";

/** A random password guaranteed to satisfy the strength policy (one of each
 * character class) — offered as a one-click starting point, editable after. */
function generateStrongPassword(length = 14): string {
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%^&*-_+=";
  const all = lower + upper + digits + symbols;
  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];
  const required = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  const rest = Array.from({ length: Math.max(0, length - required.length) }, () => pick(all));
  const chars = [...required, ...rest];
  // Fisher-Yates shuffle so the required chars aren't always in the same slot.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function SetPasswordDialog({
  userId,
  userName,
  open,
  onClose,
}: {
  userId: number;
  userName?: string;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [forceChange, setForceChange] = useState(true);

  const strong = passwordIsStrong(password);
  const match = confirm.length > 0 && password === confirm;
  const mismatch = confirm.length > 0 && password !== confirm;

  const reset = () => {
    setPassword("");
    setConfirm("");
    setForceChange(true);
  };

  const mutation = useMutation({
    mutationFn: () =>
      usersApi.update(userId, { password, must_change_password: forceChange }),
    onSuccess: () => {
      toast.success("Nouveau mot de passe défini.");
      qc.invalidateQueries({ queryKey: qk.users.detail(userId) });
      qc.invalidateQueries({ queryKey: ["users"] });
      reset();
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const handleGenerate = () => {
    const pwd = generateStrongPassword();
    setPassword(pwd);
    setConfirm(pwd);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!strong || password !== confirm) return;
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
          <DialogDescription>
            {userName ? `Définir un nouveau mot de passe pour ${userName}.` : "Définir un nouveau mot de passe."}
            {" "}L'ancien mot de passe n'est pas requis.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="new-user-password">Nouveau mot de passe</Label>
              <button
                type="button"
                onClick={handleGenerate}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Dice5 className="h-3 w-3" /> Générer
              </button>
            </div>
            <PasswordInput id="new-user-password" value={password} onChange={setPassword} />
            <PasswordStrengthMeter password={password} />
            <PasswordChecklist password={password} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-user-password-confirm">Confirmer le mot de passe</Label>
            <PasswordInput
              id="new-user-password-confirm"
              value={confirm}
              onChange={setConfirm}
              valid={match}
              invalid={mismatch}
            />
            <PasswordMatchHint password={password} confirm={confirm} />
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="force-change"
              checked={forceChange}
              onCheckedChange={(v) => setForceChange(v === true)}
              className="mt-0.5"
            />
            <Label htmlFor="force-change" className="cursor-pointer text-xs font-normal leading-relaxed text-muted-foreground">
              Demander à l'utilisateur de définir son propre mot de passe à la prochaine connexion
              (recommandé).
            </Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending || !strong || mismatch || confirm.length === 0}
            >
              {mutation.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-1.5 h-4 w-4" />
              )}
              Définir le mot de passe
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
