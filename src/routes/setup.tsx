import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthLayout } from "./login";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/setup")({ component: Page });

function Page() {
  const { t } = useT();
  const STEPS = [t("profile.personal") as string, t("setup.title") as string, t("auth.password") as string];
  const [step, setStep] = useState(0);
  const nav = useNavigate();
  return (
    <AuthLayout title={t("setup.welcomeUser") as string} subtitle={t("setup.subtitle") as string}>
      <div className="mb-6 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={i} className="flex flex-1 items-center gap-2">
            <div className={cn(
              "grid h-7 w-7 place-items-center rounded-full text-xs font-semibold transition-all",
              i < step ? "bg-success text-success-foreground" : i === step ? "gradient-brand text-white shadow-glow" : "bg-muted text-muted-foreground"
            )}>
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={cn("hidden truncate text-xs font-medium sm:inline", i === step ? "text-foreground" : "text-muted-foreground")}>{s}</span>
            {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border" />}
          </div>
        ))}
      </div>
      {step === 0 && (
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>{t("common.name") as string}</Label><Input defaultValue="Hassan Mbarga" /></div>
          <div className="space-y-1.5"><Label>{t("common.phone") as string}</Label><Input defaultValue="+237 690 000 000" /></div>
        </div>
      )}
      {step === 1 && (
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>{t("setup.companyName") as string}</Label><Input defaultValue="Mbarga Retail Group" /></div>
          <div className="space-y-1.5"><Label>{t("setup.currency") as string}</Label><Input defaultValue="GNF" /></div>
          <div className="space-y-1.5"><Label>{t("setup.storeName") as string}</Label><Input defaultValue="Akwa Flagship" /></div>
        </div>
      )}
      {step === 2 && (
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>{t("auth.newPassword") as string}</Label><Input type="password" /></div>
          <div className="space-y-1.5"><Label>{t("auth.confirmPassword") as string}</Label><Input type="password" /></div>
        </div>
      )}
      <div className="mt-6 flex justify-between gap-2">
        <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>{t("common.previous") as string}</Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)}>{t("common.continue") as string}</Button>
        ) : (
          <Button onClick={() => nav({ to: "/app" })}>{t("setup.finish") as string}</Button>
        )}
      </div>
    </AuthLayout>
  );
}
