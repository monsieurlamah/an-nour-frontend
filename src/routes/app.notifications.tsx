import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader, NOTIF_TYPE_ICON } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Archive, Search, Check, Bell } from "lucide-react";
import { notificationsApi, qk } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useT, relativeFromMinutes, minutesSince } from "@/lib/i18n";
import { toast } from "sonner";
import type { NotificationRead, NotificationType } from "@/lib/types";

export const Route = createFileRoute("/app/notifications")({ component: Page });

type TabValue = "all" | "stock" | "debt" | "order" | "system";

const TAB_TYPE: Record<TabValue, NotificationType | null> = {
  all: null,
  stock: "stock",
  debt: "creance",
  order: "commande",
  system: "systeme",
};

function Page() {
  const { t } = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabValue>("all");
  const [search, setSearch] = useState("");

  // Self-scoped by construction on the backend (user_id = caller) — a
  // Gérant only ever sees notifications addressed to them (their boutique's
  // events), a Boss only theirs. No client-side filtering needed for that.
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: qk.notifications.list({ limit: 200 }),
    queryFn: () => notificationsApi.list({ limit: 200 }),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: (r) => {
      toast.success(`${r.updated} notification(s) marquée(s) comme lue(s)`);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erreur"),
  });

  const filtered = useMemo(() => {
    const wantType = TAB_TYPE[tab];
    const q = search.trim().toLowerCase();
    return notifications.filter((n) => {
      if (wantType && n.type !== wantType) return false;
      if (q && !n.title.toLowerCase().includes(q) && !(n.message ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [notifications, tab, search]);

  const exportCsv = () => {
    const header = ["Date", "Type", "Titre", "Message", "Lu"];
    const rows = filtered.map((n) => [
      new Date(n.created_at).toLocaleString("fr-FR"),
      n.type,
      n.title,
      n.message ?? "",
      n.is_read ? "Oui" : "Non",
    ]);
    const csv = [header, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "notifications.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const openNotification = (n: NotificationRead) => {
    if (!n.is_read) markReadMutation.mutate(n.id);
    if (n.link) navigate({ to: n.link });
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <>
      <PageHeader
        title={t("notifications.title") as string}
        description={t("notifications.subtitle") as string}
        actions={<>
          <Button variant="outline" size="sm" disabled={unreadCount === 0 || markAllMutation.isPending}
            onClick={() => markAllMutation.mutate()}>
            <Check className="mr-1.5 h-3.5 w-3.5" /> {t("notifications.markAll") as string}
          </Button>
          <Button variant="outline" size="sm" disabled={filtered.length === 0} onClick={exportCsv}>
            <Archive className="mr-1.5 h-3.5 w-3.5" /> {t("common.export") as string}
          </Button>
        </>}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}><TabsList>
          <TabsTrigger value="all">{t("common.all") as string}</TabsTrigger>
          <TabsTrigger value="stock">{t("nav.inventory") as string}</TabsTrigger>
          <TabsTrigger value="debt">{t("nav.debts") as string}</TabsTrigger>
          <TabsTrigger value="order">{t("nav.orders") as string}</TabsTrigger>
          <TabsTrigger value="system">{t("nav.system") as string}</TabsTrigger>
        </TabsList></Tabs>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder={t("common.searchShort") as string} className="h-9 pl-8"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <Card className="shadow-soft">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            <Bell className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm font-medium">{t("notifications.empty") as string}</p>
          </div>
        ) : (
          <ul className="divide-y">
            {filtered.map((n) => {
              const Icon = NOTIF_TYPE_ICON[n.type] ?? Bell;
              return (
                <li key={n.id}>
                  <button
                    onClick={() => openNotification(n)}
                    className={cn(
                      "flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-accent/30",
                      !n.is_read && "bg-primary/[0.03]",
                    )}
                  >
                    <div className="relative mt-0.5 shrink-0">
                      <div className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-muted-foreground">
                        <Icon className="h-4 w-4" />
                      </div>
                      {!n.is_read && (
                        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{n.title}</p>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {relativeFromMinutes(minutesSince(n.created_at), t as any)}
                        </span>
                      </div>
                      {n.message && (
                        <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
