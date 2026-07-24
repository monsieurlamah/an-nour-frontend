import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, ArrowLeft, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useT } from "@/lib/i18n";
import { verifyEmail, resendOtp } from "@/lib/auth";
import { ApiError } from "@/lib/api-client";
import { AuthLayout } from "@/routes/login";

const OTP_LENGTH = 6;
const RESEND_COOLDOWN = 60;

export const Route = createFileRoute("/verify-email")({
  validateSearch: (search: Record<string, unknown>): { email: string } => ({
    email: typeof search.email === "string" ? search.email : "",
  }),
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const { email } = Route.useSearch();
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);

  useEffect(() => {
    if (!email) {
      navigate({ to: "/login" });
    }
  }, [email, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const verifyMutation = useMutation({
    mutationFn: () => verifyEmail(email, code),
    onSuccess: () => {
      toast.success(t("auth.otpVerified") as string);
      navigate({ to: "/app" });
    },
    onError: (err) => {
      setCode("");
      if (err instanceof ApiError) {
        toast.error(err.detail || (t("auth.otpInvalid") as string));
      } else {
        toast.error(t("auth.otpInvalid") as string);
      }
    },
  });

  const resendMutation = useMutation({
    mutationFn: () => resendOtp(email),
    onSuccess: () => {
      toast.success(t("auth.resendDone") as string);
      setCooldown(RESEND_COOLDOWN);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 429) {
        const match = err.detail.match(/(\d+)/);
        if (match) setCooldown(parseInt(match[1], 10));
        toast.info(err.detail);
        return;
      }
      toast.error(t("auth.genericError") as string);
    },
  });

  // Auto-submit once the code is fully entered.
  useEffect(() => {
    if (code.length === OTP_LENGTH && !verifyMutation.isPending) {
      verifyMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <AuthLayout eyebrow={t("auth.verifyEyebrow") as string} title={t("auth.verifyTitle") as string}>
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <MailCheck className="h-6 w-6" />
          </div>
          <p className="text-sm text-muted-foreground">
            {t("auth.verifySubtitle", { count: OTP_LENGTH }) as string}
            <br />
            <span className="font-semibold text-foreground">{email}</span>
          </p>
        </div>

        <div className="flex justify-center">
          <InputOTP
            maxLength={OTP_LENGTH}
            value={code}
            onChange={setCode}
            disabled={verifyMutation.isPending}
            autoFocus
          >
            <InputOTPGroup className="gap-2">
              {Array.from({ length: OTP_LENGTH }).map((_, i) => (
                <InputOTPSlot
                  key={i}
                  index={i}
                  className="h-12 w-11 rounded-md border text-lg first:rounded-l-md last:rounded-r-md"
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        <Button
          type="button"
          className="group h-11 w-full gap-2"
          disabled={verifyMutation.isPending || code.length !== OTP_LENGTH}
          onClick={() => verifyMutation.mutate()}
        >
          {verifyMutation.isPending
            ? (t("auth.verifying") as string)
            : (t("auth.verifyCta") as string)}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Button>

        <div className="text-center text-sm">
          <button
            type="button"
            disabled={cooldown > 0 || resendMutation.isPending}
            onClick={() => resendMutation.mutate()}
            className="font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
          >
            {cooldown > 0
              ? (t("auth.resendIn", { count: cooldown }) as string)
              : (t("auth.resend") as string)}
          </button>
        </div>

        <div className="border-t pt-4 text-center">
          <button
            type="button"
            onClick={() => navigate({ to: "/login" })}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> {t("auth.changeEmail") as string}
          </button>
        </div>
      </div>
    </AuthLayout>
  );
}
