import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Globe, Check, ArrowRight, Mail, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { PasswordInput } from "@/components/auth/password";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { login as apiLogin, isAuthenticated } from "@/lib/auth";
import { ApiError } from "@/lib/api-client";

export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && isAuthenticated()) {
      throw redirect({ to: "/app" });
    }
  },
  component: LoginPage,
});

function LangBtn() {
  const { lang, setLang } = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-full">
          <Globe className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold uppercase">{lang}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setLang("fr")} className="justify-between">
          🇫🇷 Français {lang === "fr" && <Check className="ml-2 h-4 w-4 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setLang("en")} className="justify-between">
          🇬🇧 English {lang === "en" && <Check className="ml-2 h-4 w-4 text-primary" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AuthLayout({
  children,
  title,
  subtitle,
  eyebrow,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  eyebrow?: string;
}) {
  const { t } = useT();
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-5 py-12 sm:px-8">
      {/* Soft brand-colored glow, navy + gold — depth without a photo. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-0 h-[560px] w-[560px] -translate-x-1/2 -translate-y-2/5 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 right-1/2 h-[420px] w-[420px] translate-x-2/3 translate-y-1/3 rounded-full bg-warning/10 blur-3xl" />
      </div>

      <div className="absolute right-5 top-5 z-10 sm:right-8 sm:top-8">
        <LangBtn />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <Link to="/login" className="mb-8 flex justify-center">
          <img
            src="/logoGroup.jpeg"
            alt="AN-NOUR Group"
            className="h-20 w-auto rounded-2xl object-contain shadow-elevated"
          />
        </Link>

        <div className="rounded-3xl border bg-card p-6 shadow-elevated sm:p-8">
          {eyebrow && (
            <div className="mx-auto mb-3 flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
              {eyebrow}
            </div>
          )}
          <h1 className="text-pretty text-center text-[26px] font-semibold leading-tight tracking-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-center text-sm leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          )}
          <div className="mt-7">{children}</div>
        </div>

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          {t("auth.legal") as string}
        </p>
      </div>
    </div>
  );
}

function LoginPage() {
  const { t } = useT();
  const navigate = useNavigate();

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");

  const loginMutation = useMutation({
    mutationFn: () => apiLogin(loginId.trim(), password),
    onSuccess: (user) => {
      if (user.must_change_password) {
        navigate({ to: "/change-password" });
      } else {
        navigate({ to: "/app" });
      }
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 403 && err.detail === "EMAIL_NOT_VERIFIED") {
        toast.info(t("auth.notVerified") as string);
        navigate({ to: "/verify-email", search: { email: loginId.trim() } });
        return;
      }
      if (err instanceof ApiError && err.status === 401) {
        toast.error(t("auth.loginError") as string);
        return;
      }
      toast.error(err instanceof ApiError ? err.detail : (t("auth.genericError") as string));
    },
  });

  const loading = loginMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    loginMutation.mutate();
  };

  return (
    <AuthLayout
      eyebrow={t("auth.eyebrowSignin") as string}
      title={t("auth.welcome") as string}
      subtitle={t("auth.subtitle") as string}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="login-id">{t("auth.loginId") as string}</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="login-id"
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder={t("auth.loginIdPlaceholder") as string}
              autoComplete="username"
              required
              className="h-11 pl-9"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t("auth.password") as string}</Label>
            <Link
              to="/forgot-password"
              className="text-xs font-medium text-primary hover:underline"
            >
              {t("auth.forgot") as string}
            </Link>
          </div>
          <PasswordInput
            id="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox id="remember" defaultChecked />
          <Label htmlFor="remember" className="cursor-pointer text-sm font-normal text-muted-foreground">
            {t("auth.remember") as string}
          </Label>
        </div>

        <Button type="submit" className="group h-11 w-full gap-2 font-semibold" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("auth.signingIn") as string}
            </>
          ) : (
            <>
              {t("auth.signInCta") as string}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
