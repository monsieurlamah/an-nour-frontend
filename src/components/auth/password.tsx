// Shared password UI for every auth flow (login/signup, first-login
// "définir mon mot de passe", reset-password). Before this, the show/hide
// toggle, the 5-rule checklist and the match indicator were copy-pasted into
// three routes and had already drifted (reset-password had none of them).

import { useState } from "react";
import { Check, X, Eye, EyeOff, Lock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { PASSWORD_RULES, passwordScore } from "./password-rules";

// ── Password input with a show/hide toggle ──────────────────────────────────

export function PasswordInput({
  id,
  value,
  onChange,
  placeholder = "••••••••",
  autoComplete = "new-password",
  required = true,
  invalid = false,
  valid = false,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  invalid?: boolean;
  valid?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className={cn(
          "h-11 pl-9 pr-10 transition-colors",
          valid && "border-success ring-1 ring-success/30",
          invalid && "border-destructive ring-1 ring-destructive/30",
        )}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

// ── Strength meter (4 segments) ────────────────────────────────────────────

export function PasswordStrengthMeter({ password }: { password: string }) {
  const { t } = useT();
  if (!password) return null;
  const score = passwordScore(password);
  const key = score <= 2 ? "weak" : score === 3 ? "fair" : score === 4 ? "good" : "strong";
  const tone = score <= 2 ? "bg-destructive" : score === 3 ? "bg-amber-500" : "bg-success";
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i < Math.max(1, score - 1) ? tone : "bg-muted",
            )}
          />
        ))}
      </div>
      <span className="text-[10px] font-medium capitalize text-muted-foreground">
        {t(`auth.pwdStrength.${key}`) as string}
      </span>
    </div>
  );
}

// ── Rule checklist ─────────────────────────────────────────────────────────

export function PasswordChecklist({ password }: { password: string }) {
  const { t } = useT();
  if (!password) return null;
  return (
    <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
      {PASSWORD_RULES.map((r) => {
        const ok = r.ok(password);
        return (
          <li
            key={r.key}
            className={cn(
              "flex items-center gap-1.5 text-[11px] transition-colors",
              ok ? "text-success" : "text-muted-foreground",
            )}
          >
            {ok ? (
              <Check className="h-3 w-3 shrink-0" />
            ) : (
              <X className="h-3 w-3 shrink-0 opacity-40" />
            )}
            {t(r.key) as string}
          </li>
        );
      })}
    </ul>
  );
}

// ── Match indicator ────────────────────────────────────────────────────────

export function PasswordMatchHint({ password, confirm }: { password: string; confirm: string }) {
  const { t } = useT();
  if (confirm.length === 0) return null;
  const match = password === confirm;
  return (
    <p
      className={cn(
        "flex items-center gap-1.5 text-[11px] transition-colors",
        match ? "text-success" : "text-destructive",
      )}
    >
      {match ? <Check className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
      {match ? (t("auth.pwdMatch") as string) : (t("auth.pwdMismatch") as string)}
    </p>
  );
}

// Convenience: a labelled password field wrapping the input.
export function PasswordField({
  id,
  label,
  ...rest
}: React.ComponentProps<typeof PasswordInput> & { label: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <PasswordInput id={id} {...rest} />
    </div>
  );
}
