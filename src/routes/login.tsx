import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ShieldCheck,
  Globe,
  Check,
  ArrowRight,
  Mail,
  User,
  Phone,
  Loader2,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  PasswordInput,
  PasswordChecklist,
  PasswordStrengthMeter,
  PasswordMatchHint,
} from "@/components/auth/password";
import { passwordIsStrong } from "@/components/auth/password-rules";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { login as apiLogin, register as apiRegister, isAuthenticated } from "@/lib/auth";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

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
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  const [firstname, setFirstname] = useState("");
  const [lastname, setLastname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");

  const isSignup = mode === "signup";

  const loginMutation = useMutation({
    mutationFn: () => apiLogin(email.trim(), password),
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
        navigate({ to: "/verify-email", search: { email: email.trim() } });
        return;
      }
      if (err instanceof ApiError && err.status === 401) {
        toast.error(t("auth.loginError") as string);
        return;
      }
      toast.error(err instanceof ApiError ? err.detail : (t("auth.genericError") as string));
    },
  });

  const registerMutation = useMutation({
    mutationFn: () =>
      apiRegister({
        firstname: firstname.trim(),
        lastname: lastname.trim(),
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success(t("auth.registerSuccess") as string);
      navigate({ to: "/verify-email", search: { email: email.trim() } });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        const key = err.detail.toLowerCase().includes("phone")
          ? "auth.phoneTaken"
          : "auth.emailTaken";
        toast.error(t(key) as string);
        return;
      }
      toast.error(err instanceof ApiError ? err.detail : (t("auth.genericError") as string));
    },
  });

  const loading = loginMutation.isPending || registerMutation.isPending;

  const passwordStrong = passwordIsStrong(password);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (isSignup) {
      if (!passwordStrong) {
        toast.error(t("auth.pwdWeak") as string);
        return;
      }
      if (password !== confirmPassword) {
        toast.error(t("auth.pwdMismatch") as string);
        return;
      }
      registerMutation.mutate();
    } else {
      loginMutation.mutate();
    }
  };

  return (
    <AuthLayout
      eyebrow={isSignup ? (t("auth.eyebrowSignup") as string) : (t("auth.eyebrowSignin") as string)}
      title={isSignup ? (t("auth.signupTitle") as string) : (t("auth.welcome") as string)}
      subtitle={isSignup ? (t("auth.signupSubtitle") as string) : (t("auth.subtitle") as string)}
    >
      {/* Mode tabs */}
      <div className="mb-6 flex gap-1 rounded-xl bg-muted p-1">
        {(["signin", "signup"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
              mode === m
                ? "bg-background text-foreground shadow-soft ring-1 ring-border/40"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "signin" ? (t("auth.tabSignin") as string) : (t("auth.tabSignup") as string)}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {isSignup && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstname">{t("auth.firstname") as string}</Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="firstname"
                  value={firstname}
                  onChange={(e) => setFirstname(e.target.value)}
                  placeholder="Votre prénom"
                  autoComplete="given-name"
                  required
                  className="h-11 pl-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastname">{t("auth.lastname") as string}</Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="lastname"
                  value={lastname}
                  onChange={(e) => setLastname(e.target.value)}
                  placeholder="Votre nom"
                  autoComplete="family-name"
                  required
                  className="h-11 pl-9"
                />
              </div>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="email">{t("auth.email") as string}</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.com"
              autoComplete="email"
              required
              className="h-11 pl-9"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t("auth.password") as string}</Label>
            {!isSignup && (
              <Link
                to="/forgot-password"
                className="text-xs font-medium text-primary hover:underline"
              >
                {t("auth.forgot") as string}
              </Link>
            )}
          </div>
          <PasswordInput
            id="password"
            value={password}
            onChange={setPassword}
            autoComplete={isSignup ? "new-password" : "current-password"}
          />
          {isSignup && (
            <>
              <PasswordStrengthMeter password={password} />
              <PasswordChecklist password={password} />
            </>
          )}
        </div>

        {isSignup && (
          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">{t("auth.confirmPassword") as string}</Label>
            <PasswordInput
              id="confirmPassword"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              valid={passwordsMatch}
              invalid={passwordsMismatch}
            />
            <PasswordMatchHint password={password} confirm={confirmPassword} />
          </div>
        )}

        {isSignup && (
          <div className="space-y-1.5">
            <Label htmlFor="phone">{t("auth.phone") as string}</Label>
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+224 ..."
                autoComplete="tel"
                className="h-11 pl-9"
              />
            </div>
          </div>
        )}

        {!isSignup ? (
          <div className="flex items-center gap-2">
            <Checkbox id="remember" defaultChecked />
            <Label htmlFor="remember" className="cursor-pointer text-sm font-normal text-muted-foreground">
              {t("auth.remember") as string}
            </Label>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <Checkbox id="tos" required className="mt-0.5" />
            <Label
              htmlFor="tos"
              className="cursor-pointer text-xs font-normal leading-relaxed text-muted-foreground"
            >
              {t("auth.acceptTos") as string}
            </Label>
          </div>
        )}

        <Button
          type="submit"
          className="group h-11 w-full gap-2 font-semibold"
          disabled={loading || (isSignup && (!passwordStrong || passwordsMismatch || confirmPassword.length === 0))}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {isSignup ? (t("auth.creatingAccount") as string) : (t("auth.signingIn") as string)}
            </>
          ) : (
            <>
              {isSignup ? (t("auth.signupCta") as string) : (t("auth.signInCta") as string)}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </Button>

        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-card px-3 text-[11px] uppercase tracking-wider text-muted-foreground">
              {t("auth.or") as string}
            </span>
          </div>
        </div>

        {/* Google — seule option sociale */}
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full gap-2.5 font-medium"
          onClick={() => toast.info(t("auth.googleSoon") as string)}
        >
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          {t("auth.continueWithGoogle") as string}
        </Button>

        <p className="pt-1 text-center text-xs text-muted-foreground">
          {isSignup ? (
            <>
              {t("auth.haveAccount") as string}{" "}
              <button
                type="button"
                onClick={() => setMode("signin")}
                className="font-medium text-primary hover:underline"
              >
                {t("auth.signInCta") as string}
              </button>
            </>
          ) : (
            <>
              {t("auth.noAccount") as string}{" "}
              <button
                type="button"
                onClick={() => setMode("signup")}
                className="font-medium text-primary hover:underline"
              >
                {t("common.signUp") as string}
              </button>
            </>
          )}
        </p>
      </form>
    </AuthLayout>
  );
}
