import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Building2, Store as StoreIcon, ChevronDown, Check, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getWorkspaceLabel, type Workspace } from "@/lib/workspace";
import { useWorkContext, canViewHQ } from "@/lib/work-context";
import { useT } from "@/lib/i18n";

export function WorkspaceSwitcher() {
  const { workspace, setWorkspace, store, authorizedStores, storesLoading, isSuperAdmin, has } =
    useWorkContext();
  // Same rule as useAuthorizedStores() — a store-scoped user (e.g.
  // gérant-boutique) never gets an HQ workspace option, only their own store(s).
  const canView = canViewHQ(isSuperAdmin, has);
  const { t } = useT();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const label = getWorkspaceLabel(workspace, { store });

  const filteredStores = useMemo(() => {
    const q = query.trim().toLowerCase();
    return authorizedStores.filter(
      (s) => !q || s.name.toLowerCase().includes(q) || (s.city ?? "").toLowerCase().includes(q),
    );
  }, [authorizedStores, query]);

  function commit(next: Workspace, dest: string) {
    setWorkspace(next);
    setOpen(false);
    setQuery("");
    navigate({ to: dest });
  }

  function pickStore(s: Workspace) {
    commit(s, `/app/stores/${s.id}`);
  }

  const Icon = workspace.kind === "store" ? StoreIcon : Building2;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className="h-9 max-w-[260px] gap-2 px-2.5 hover:bg-accent"
          aria-label={t("workspace.switch") as string}
        >
          <span className={cn(
            "grid h-7 w-7 shrink-0 place-items-center rounded-md",
            workspace.kind === "hq" && "bg-primary/10 text-primary",
            workspace.kind === "store" && "bg-info/10 text-info",
          )}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="hidden min-w-0 flex-col items-start leading-tight sm:flex">
            <span className="max-w-[160px] truncate text-xs font-semibold">{label.title}</span>
            {label.subtitle && (
              <span className="max-w-[160px] truncate text-[10px] text-muted-foreground">{label.subtitle}</span>
            )}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[320px] p-0">
        <div>
          <div className="border-b p-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                placeholder={t("workspace.searchPlaceholder")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 pl-7 text-xs"
              />
            </div>
          </div>

          <ScrollArea className="max-h-[400px]">
            <div className="p-1">
              {/* Siège (HQ) — only for network-wide roles */}
              {canView && (
                <button
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left hover:bg-accent"
                  onClick={() => commit({ kind: "hq" }, "/app")}
                >
                  <span className="flex items-center gap-2.5">
                    <span className="grid h-7 w-7 place-items-center rounded-md bg-primary/10 text-primary">
                      <Building2 className="h-3.5 w-3.5" />
                    </span>
                    <span className="leading-tight">
                      <span className="block text-sm font-semibold">{t("workspace.hq")}</span>
                      <span className="block text-[11px] text-muted-foreground">{t("workspace.hqSubtitle")}</span>
                    </span>
                  </span>
                  {workspace.kind === "hq" && <Check className="h-4 w-4 text-primary" />}
                </button>
              )}

              {/* Boutiques réelles */}
              <div className="mt-2 px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("workspace.section.stores")}
              </div>
              {storesLoading && (
                <div className="px-3 py-3 text-xs text-muted-foreground">
                  {t("common.loading") as string}
                </div>
              )}
              {filteredStores.map((s) => {
                const active = workspace.kind === "store" && workspace.id === String(s.id);
                return (
                  <button
                    key={s.id}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left hover:bg-accent",
                      active && "bg-accent",
                    )}
                    onClick={() => pickStore({ kind: "store", id: String(s.id) })}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="grid h-7 w-7 place-items-center rounded-md bg-info/10 text-info">
                        <StoreIcon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 leading-tight">
                        <span className="block truncate text-sm font-medium">{s.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{s.city ?? ""}</span>
                      </span>
                    </span>
                    {active && <Check className="h-4 w-4 text-primary" />}
                  </button>
                );
              })}

              {!storesLoading && filteredStores.length === 0 && (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {t("workspace.noResults")}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}
