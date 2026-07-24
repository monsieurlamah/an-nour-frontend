import { type ComponentProps, type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownRight, ArrowUpRight, AlertCircle, RefreshCw, Eye, EyeOff } from "lucide-react";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Inline error message shown directly under a form field — pair with every
// field that can fail validation, instead of relying on the toast alone.
export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="mt-1 text-xs text-destructive">{children}</p>;
}

export function PasswordInput({ className, error, ...props }: ComponentProps<"input"> & { error?: ReactNode }) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <div className="relative">
        <Input
          type={visible ? "text" : "password"}
          className={cn("pr-10", error && "border-destructive focus-visible:ring-destructive", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          tabIndex={-1}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}

export function KpiCard({
  label, value, delta, icon, tone = "default", hint, valueClassName,
}: {
  label: string;
  value: ReactNode;
  delta?: number;
  icon?: ReactNode;
  tone?: "default" | "primary" | "success" | "warning" | "destructive";
  hint?: string;
  /** Override the value's text size — e.g. for fully-written-out amounts
   * that would otherwise overflow/wrap at the default text-xl/2xl. */
  valueClassName?: string;
}) {
  const up = (delta ?? 0) >= 0;
  // Intl's fr-FR grouping separator is a narrow no-break space (U+202F) —
  // it glues the whole number into one unbreakable "word". Fine in a wide
  // table cell, but in a narrow KPI card it forces `break-words` to split
  // the number mid-digit instead of wrapping at a natural boundary. Swap in
  // a regular breakable space here only — table cells elsewhere still want
  // the non-breaking version.
  const displayValue =
    typeof value === "string" ? value.replace(/[\u00A0\u202F]/g, " ") : value;
  return (
    <Card className="group relative overflow-hidden p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-elevated">
      <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p
            className={cn(
              "mt-2 break-words font-semibold leading-tight tracking-tight tabular-nums",
              valueClassName ?? "text-xl sm:text-2xl",
            )}
            title={typeof value === "string" ? value : undefined}
          >
            {displayValue}
          </p>
          {(delta !== undefined || hint) && (
            <div className="mt-2 flex items-center gap-1.5 text-xs">
              {delta !== undefined && (
                <span className={cn(
                  "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold tabular-nums",
                  up ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                )}>
                  {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {Math.abs(delta).toFixed(1)}%
                </span>
              )}
              {hint && <span className="truncate text-muted-foreground">{hint}</span>}
            </div>
          )}
        </div>
        {icon && (
          <div className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset",
            tone === "primary" && "bg-primary/10 text-primary ring-primary/20",
            tone === "success" && "bg-success/10 text-success ring-success/20",
            tone === "warning" && "bg-warning/15 text-warning-foreground ring-warning/30",
            tone === "destructive" && "bg-destructive/10 text-destructive ring-destructive/20",
            tone === "default" && "bg-secondary text-foreground ring-border",
          )}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

// Maps backend French enum values → canonical English keys used in i18n + color map
const BACKEND_STATUS_ALIAS: Record<string, string> = {
  // CommandeStatut
  brouillon: "draft",
  en_attente: "pending",
  validee: "approved",
  rejetee: "rejected",
  proforma_generee: "proforma",
  proforma_rejetee: "proforma_rejected",
  facture_generee: "invoiced",
  en_preparation: "preparing",
  pret_a_expedier: "ready_to_ship",
  expedie: "shipped",
  livree: "delivered",
  reception_confirmee: "received",
  partiellement_recu: "partial",
  annulee: "cancelled",
  // VenteStatut
  en_cours: "held",
  completee: "completed",
  partiellement_payee: "partial",
  impayee: "overdue",
  remboursee: "refunded",
  // CreanceStatut
  soldee: "paid",
  en_retard: "overdue",
  // PurchaseStatut
  commandee: "sent",
  partiellement_recue: "partial",
  recue: "received",
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useT();
  const canonical = BACKEND_STATUS_ALIAS[status] ?? status;

  const colorMap: Record<string, string> = {
    active: "bg-success/10 text-success ring-success/20",
    completed: "bg-success/10 text-success ring-success/20",
    approved: "bg-success/10 text-success ring-success/20",
    delivered: "bg-success/10 text-success ring-success/20",
    received: "bg-success/10 text-success ring-success/20",
    confirmed: "bg-success/10 text-success ring-success/20",
    paid: "bg-success/10 text-success ring-success/20",
    pending: "bg-warning/15 text-warning-foreground ring-warning/30",
    "due-soon": "bg-warning/15 text-warning-foreground ring-warning/30",
    partial: "bg-warning/15 text-warning-foreground ring-warning/30",
    expiring: "bg-warning/15 text-warning-foreground ring-warning/30",
    scheduled: "bg-info/10 text-info ring-info/20",
    sent: "bg-info/10 text-info ring-info/20",
    preparing: "bg-info/10 text-info ring-info/20",
    held: "bg-info/10 text-info ring-info/20",
    invited: "bg-info/10 text-info ring-info/20",
    proforma: "bg-info/10 text-info ring-info/20",
    invoiced: "bg-info/10 text-info ring-info/20",
    ready_to_ship: "bg-info/10 text-info ring-info/20",
    shipped: "bg-info/10 text-info ring-info/20",
    draft: "bg-muted text-muted-foreground ring-border",
    inactive: "bg-muted text-muted-foreground ring-border",
    expired: "bg-muted text-muted-foreground ring-border",
    cancelled: "bg-muted text-muted-foreground ring-border",
    archived: "bg-muted text-muted-foreground ring-border",
    rejected: "bg-destructive/10 text-destructive ring-destructive/20",
    proforma_rejected: "bg-destructive/10 text-destructive ring-destructive/20",
    overdue: "bg-destructive/10 text-destructive ring-destructive/20",
    suspended: "bg-destructive/10 text-destructive ring-destructive/20",
    refunded: "bg-destructive/10 text-destructive ring-destructive/20",
    voided: "bg-destructive/10 text-destructive ring-destructive/20",
    failed: "bg-destructive/10 text-destructive ring-destructive/20",
  };

  const i18nOverride: Record<string, string> = { "due-soon": "status.dueSoon" };
  const tKey = i18nOverride[canonical] ?? `status.${canonical}`;

  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
      colorMap[canonical] ?? "bg-muted text-muted-foreground ring-border",
    )}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {t(tKey)}
    </span>
  );
}

// ─── Shared loading / error primitives ───────────────────────────────────────

export function TableRowSkeleton({ cols }: { cols: number }) {
  return (
    <tr className="border-b">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-full" style={{ maxWidth: i === 0 ? 160 : 100 }} />
        </td>
      ))}
    </tr>
  );
}

export function TableSkeleton({ cols, rows = 7 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRowSkeleton key={i} cols={cols} />
      ))}
    </>
  );
}

export function ApiErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const msg =
    error instanceof Error ? error.message : "Une erreur inattendue est survenue.";
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <AlertCircle className="h-10 w-10 text-destructive/60" />
      <p className="text-sm font-medium text-destructive">{msg}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Réessayer
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  icon, title, description, action,
}: { icon: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-secondary/30 px-6 py-16 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-xl bg-background text-muted-foreground shadow-soft">
        {icon}
      </div>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SectionCard({
  title, description, action, children, className,
}: { title?: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("overflow-hidden shadow-soft", className)}>
      {(title || description || action) && (
        <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-3.5">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold tracking-tight">{title}</h3>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div>{children}</div>
    </Card>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-soft">
      {children}
    </div>
  );
}
