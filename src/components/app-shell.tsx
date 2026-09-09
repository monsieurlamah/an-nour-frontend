import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Store,
  Users,
  Package,
  Warehouse,
  ShoppingCart,
  ScanLine,
  Receipt,
  UserRound,
  CreditCard,
  Bell,
  BarChart3,
  Settings,
  LifeBuoy,
  Truck,
  Tag,
  Wallet,
  Search,
  Sun,
  Moon,
  Globe,
  Menu,
  X,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  Check,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useT, relativeFromMinutes, minutesSince, hydrateLanguageFromStorage } from "@/lib/i18n";
import { hydrateCurrencyFromStorage } from "@/lib/currency";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { notificationsApi, qk } from "@/lib/api";
import type { NotificationType, NotificationRead } from "@/lib/types";
import {
  hydrateWorkspaceFromStorage, getWorkspaceLabel, type Workspace, type WorkspaceKind,
} from "@/lib/workspace";
import { useWorkContext, canViewHQ } from "@/lib/work-context";
import { useAuth, hydrateAuth, GROUP_SLUG_LABEL } from "@/lib/auth";

type NavItem = {
  to: string;
  key: string;
  icon: LucideIcon;
  exact?: boolean;
  params?: Record<string, string>;
  hash?: string;
  excludePaths?: string[];
  // RBAC gating: a permission slug, a list (any-of), or null = always visible.
  // Super-admin bypasses all checks (see usePermissions).
  requiredPermission?: string | string[] | null;
};
type NavGroup = { groupKey: string; items: NavItem[] };

const HQ_NAV: NavGroup[] = [
  {
    groupKey: "nav.overview",
    items: [
      {
        to: "/app",
        key: "nav.dashboard",
        icon: LayoutDashboard,
        exact: true,
        requiredPermission: "dashboard.global.view",
      },
      {
        to: "/app/reports",
        key: "nav.reports",
        icon: BarChart3,
        requiredPermission: "reports.view",
      },
    ],
  },
  {
    groupKey: "nav.operations",
    items: [
      { to: "/app/pos", key: "nav.pos", icon: ScanLine, requiredPermission: "ventes.create" },
      { to: "/app/sales", key: "nav.sales", icon: Receipt, requiredPermission: "ventes.view" },
      {
        to: "/app/orders",
        key: "nav.procurement",
        icon: ShoppingCart,
        requiredPermission: "commandes.view",
      },
      {
        to: "/app/suppliers",
        key: "nav.suppliers",
        icon: Truck,
        requiredPermission: "suppliers.view",
      },
    ],
  },
  {
    groupKey: "nav.catalog",
    items: [
      {
        to: "/app/products",
        key: "nav.products",
        icon: Package,
        excludePaths: ["/app/products/categories"],
        requiredPermission: "products.view",
      },
      {
        to: "/app/products/categories",
        key: "nav.categories",
        icon: Tag,
        exact: true,
        requiredPermission: "categories.manage",
      },
      {
        to: "/app/inventory",
        key: "nav.inventory",
        icon: Warehouse,
        requiredPermission: "stock.view",
      },
    ],
  },
  {
    groupKey: "nav.network",
    items: [
      { to: "/app/stores", key: "nav.stores", icon: Store, requiredPermission: "stores.view" },
      { to: "/app/users", key: "nav.users", icon: Users, requiredPermission: "users.view" },
      {
        to: "/app/customers",
        key: "nav.customers",
        icon: UserRound,
        requiredPermission: "clients.view",
      },
      { to: "/app/debts", key: "nav.debts", icon: CreditCard, requiredPermission: "creances.view" },
      { to: "/app/expenses", key: "nav.expenses", icon: Wallet, requiredPermission: "expenses.view" },
    ],
  },
  {
    groupKey: "nav.system",
    items: [
      {
        to: "/app/notifications",
        key: "nav.notifications",
        icon: Bell,
        requiredPermission: "notifications.view",
      },
      {
        to: "/app/settings",
        key: "nav.settings",
        icon: Settings,
        requiredPermission: "settings.manage",
      },
      { to: "/app/help", key: "nav.help", icon: LifeBuoy, requiredPermission: null },
    ],
  },
];

function buildStoreNav(storeId: string): NavGroup[] {
  return [
    {
      groupKey: "workspace.nav.storeArea",
      items: [
        {
          to: "/app",
          key: "nav.dashboard",
          icon: LayoutDashboard,
          exact: true,
          requiredPermission: "dashboard.store.view",
        },
        {
          to: "/app/stores/$id",
          key: "workspace.nav.overview",
          icon: Store,
          params: { id: storeId },
          requiredPermission: "dashboard.store.view",
        },
        { to: "/app/pos", key: "nav.pos", icon: ScanLine, requiredPermission: "ventes.create" },
        { to: "/app/sales", key: "nav.sales", icon: Receipt, requiredPermission: "ventes.view" },
        {
          to: "/app/inventory",
          key: "nav.inventory",
          icon: Warehouse,
          requiredPermission: "stock.view",
        },
      ],
    },
    {
      groupKey: "nav.network",
      items: [
        {
          to: "/app/orders",
          key: "nav.procurement",
          icon: ShoppingCart,
          requiredPermission: "commandes.view",
        },
        {
          to: "/app/customers",
          key: "nav.customers",
          icon: UserRound,
          requiredPermission: "clients.view",
        },
        {
          to: "/app/debts",
          key: "nav.debts",
          icon: CreditCard,
          requiredPermission: "creances.view",
        },
        {
          to: "/app/expenses",
          key: "nav.expenses",
          icon: Wallet,
          requiredPermission: "expenses.view",
        },
        {
          to: "/app/users",
          key: "workspace.nav.team",
          icon: Users,
          requiredPermission: "users.view",
        },
      ],
    },
    {
      groupKey: "nav.system",
      items: [
        {
          to: "/app/notifications",
          key: "nav.notifications",
          icon: Bell,
          requiredPermission: "notifications.view",
        },
        { to: "/app/help", key: "nav.help", icon: LifeBuoy, requiredPermission: null },
      ],
    },
  ];
}

// Permission-based menu filter (RBAC). `has` already bypasses for super-admin.
function navItemAllowed(item: NavItem, has: (slug: string) => boolean): boolean {
  const req = item.requiredPermission;
  if (req == null) return true; // always visible (e.g. help)
  if (Array.isArray(req)) return req.some((slug) => has(slug));
  return has(req);
}

function filterNavByPermission(groups: NavGroup[], has: (slug: string) => boolean): NavGroup[] {
  return groups
    .map((g) => ({ ...g, items: g.items.filter((it) => navItemAllowed(it, has)) }))
    .filter((g) => g.items.length > 0);
}

export type ThemeMode = "light" | "dark" | "auto";

// Exported so the Settings page's Apparence tab can share the exact same
// state as the header's sun/moon toggle — previously that tab had its own
// disconnected, non-persisted <Select defaultValue="auto">.
export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    return (localStorage.getItem("theme") as ThemeMode | null) ?? "auto";
  });
  const [theme, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const isDark = mode === "auto" ? mq.matches : mode === "dark";
      setResolved(isDark ? "dark" : "light");
      document.documentElement.classList.toggle("dark", isDark);
    };
    apply();
    if (mode === "auto") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [mode]);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    localStorage.setItem("theme", next);
  };
  // Binary toggle used by the header icon — jumps straight to the opposite
  // of whatever is currently resolved, dropping out of "auto" if it was set.
  const toggle = () => setMode(theme === "dark" ? "light" : "dark");

  return { mode, theme, setMode, toggle };
}

// AN-NOUR Group's own logo when in HQ/supplier context; the individual
// boutique's logo when scoped to a store — the two static brand assets in
// public/, never mixed.
function Brand({ collapsed, kind }: { collapsed?: boolean; kind: WorkspaceKind }) {
  const logoSrc = kind === "store" ? "/logoBoutique.jpeg" : "/logoGroup.jpeg";
  if (collapsed) {
    return (
      <Link to="/app" className="flex items-center justify-center px-2 py-1">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl gradient-brand text-white shadow-glow">
          <span className="text-xs font-black tracking-tight">AN</span>
        </div>
      </Link>
    );
  }
  return (
    <Link to="/app" className="flex min-w-0 items-center px-2 py-1">
      <img src={logoSrc} alt="AN-NOUR" className="h-12 w-auto max-w-[200px] object-contain" />
    </Link>
  );
}

function NavList({
  collapsed,
  onNavigate,
  groups,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
  groups: NavGroup[];
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const currentHash = useRouterState({ select: (s) => s.location.hash });
  const { t } = useT();
  return (
    <nav className="flex flex-col gap-5 px-3 py-3">
      {groups.map((group) => (
        <div key={group.groupKey}>
          {!collapsed && (
            <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
              {t(group.groupKey)}
            </div>
          )}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item, idx) => {
              const resolved = item.params
                ? Object.entries(item.params).reduce(
                    (acc, [k, v]) => acc.replace(`$${k}`, v),
                    item.to,
                  )
                : item.to;
              const pathActive = (() => {
                const base = item.exact
                  ? pathname === resolved
                  : pathname === resolved || pathname.startsWith(resolved + "/");
                if (!base) return false;
                return !(item.excludePaths ?? []).some((p) => pathname.startsWith(p));
              })();
              const active = item.hash
                ? pathActive &&
                  (currentHash === item.hash || (!currentHash && item.hash === "overview"))
                : pathActive &&
                  (!currentHash || !group.items.some((g) => g.to === item.to && g.hash));
              const Icon = item.icon;
              return (
                <li key={`${item.to}-${item.hash ?? ""}-${idx}`}>
                  <Link
                    to={item.to}
                    params={item.params as never}
                    hash={item.hash}
                    onClick={onNavigate}
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-all",
                      active
                        ? "bg-accent text-accent-foreground shadow-sog"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                      collapsed && "justify-center px-2",
                    )}
                  >
                    {active && (
                      <span className="absolute inset-y-1 left-0 w-0.5 rounded-r bg-primary" />
                    )}
                    <Icon
                      className={cn("h-4 w-4 shrink-0 transition-colors", active && "text-primary")}
                    />
                    {!collapsed && <span className="truncate">{t(item.key)}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export const NOTIF_TYPE_ICON: Record<NotificationType, LucideIcon> = {
  stock: Package,
  commande: ShoppingCart,
  vente: Receipt,
  creance: CreditCard,
  paiement: Wallet,
  systeme: Bell,
};

function NotificationsButton() {
  const { t } = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Self-scoped by construction on the backend (user_id = caller) — every
  // user, Boss or Gérant, only ever sees their own notifications.
  const { data: recent = [] } = useQuery({
    queryKey: qk.notifications.list({ limit: 8 }),
    queryFn: () => notificationsApi.list({ limit: 8 }),
    refetchInterval: 60_000,
  });
  const { data: unreadCount = 0 } = useQuery({
    queryKey: qk.notifications.unreadCount,
    queryFn: async () => (await notificationsApi.list({ is_read: false, limit: 500 })).length,
    refetchInterval: 60_000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const openNotification = (n: NotificationRead) => {
    if (!n.is_read) markReadMutation.mutate(n.id);
    if (n.link) navigate({ to: n.link });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-background">
              {unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <div className="text-sm font-semibold">{t("notifications.title")}</div>
            <div className="text-xs text-muted-foreground">
              {t("notifications.unreadCount", { count: unreadCount })}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button
                onClick={() => markAllMutation.mutate()}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {t("notifications.markAll") as string}
              </button>
            )}
            <Link
              to="/app/notifications"
              className="text-xs font-medium text-primary hover:underline"
            >
              {t("common.viewAll")}
            </Link>
          </div>
        </div>
        <ScrollArea className="max-h-96">
          {recent.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-muted-foreground">
              {t("notifications.empty") as string}
            </p>
          ) : (
            <ul className="divide-y">
              {recent.map((n) => {
                const Icon = NOTIF_TYPE_ICON[n.type] ?? Bell;
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => openNotification(n)}
                      className="flex w-full gap-3 px-4 py-3 text-left hover:bg-accent/30"
                    >
                      <div className="relative mt-0.5 shrink-0">
                        <div className="grid h-7 w-7 place-items-center rounded-full bg-secondary text-muted-foreground">
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        {!n.is_read && (
                          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-sm font-medium">{n.title}</p>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {relativeFromMinutes(minutesSince(n.created_at), t as any)}
                          </span>
                        </div>
                        {n.message && (
                          <p className="line-clamp-2 text-xs text-muted-foreground">{n.message}</p>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function LanguageSwitcher() {
  const { lang, setLang, t } = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="hidden h-9 gap-1.5 px-2.5 sm:flex"
          title={t("common.language")}
        >
          <Globe className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase">{lang}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{t("common.language")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setLang("fr")} className="justify-between">
          <span>🇫🇷 Français</span>
          {lang === "fr" && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setLang("en")} className="justify-between">
          <span>🇬🇧 English</span>
          {lang === "en" && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProfileMenu() {
  const { t } = useT();
  const navigate = useNavigate();
  // Coerced workspace (useWorkContext), not the raw persisted one — a
  // store-scoped user must never see "HQ" here just because localStorage
  // still holds a stale/leftover "hq" value from a previous session.
  const { workspace, has, isUnassigned } = useWorkContext();
  const { user, logout } = useAuth();
  const ctx = isUnassigned
    ? (t("workspace.banner.unassigned") as string)
    : workspace.kind === "hq"
      ? "HQ"
      : workspace.kind === "store"
        ? (t("workspace.banner.store") as string)
        : (t("workspace.banner.supplier") as string);
  const fullName = user ? `${user.firstname} ${user.lastname}`.trim() : "…";
  const initials = user
    ? `${user.firstname?.[0] ?? ""}${user.lastname?.[0] ?? ""}`.toUpperCase() || "?"
    : "?";
  // Show the actual group label (e.g. "Propriétaire", "Gérant") instead of a hardcoded fallback
  const primarySlug = user?.groups?.[0];
  const roleLabel = primarySlug ? (GROUP_SLUG_LABEL[primarySlug] ?? primarySlug) : "…";

  const handleLogout = () => {
    logout();
    navigate({ to: "/login" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2.5 rounded-lg p-1 pr-2.5 transition-colors hover:bg-accent">
          <Avatar className="h-8 w-8 ring-2 ring-background">
            {user?.avatar && <AvatarImage src={user.avatar} alt={fullName} />}
            <AvatarFallback className="bg-gradient-to-br from-primary to-info text-xs font-semibold text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="hidden text-left leading-tight md:block">
            <div className="text-xs font-semibold">{fullName}</div>
            <div className="text-[10px] text-muted-foreground">
              {roleLabel} · {ctx}
            </div>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{user?.email ?? (t("common.myAccount") as string)}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/app/profile">{t("nav.profile")}</Link>
        </DropdownMenuItem>
        {has("settings.manage") && (
          <DropdownMenuItem asChild>
            <Link to="/app/settings">{t("nav.settings")}</Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link to="/app/help">{t("nav.help")}</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={handleLogout}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" /> {t("common.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const { t } = useT();
  const work = useWorkContext();
  const { workspace, setWorkspace, has, isSuperAdmin, authorizedStores, storesLoading } = work;

  // Apply saved language, currency & workspace on the client only — after hydration — to avoid SSR mismatch.
  useEffect(() => {
    hydrateLanguageFromStorage();
    hydrateCurrencyFromStorage();
    hydrateWorkspaceFromStorage();
    void hydrateAuth();
  }, []);

  // Permission-based workspace coercion: a user who cannot see the global (HQ)
  // dashboard is confined to a store workspace. Store workspaces always resolve
  // to a concrete store id so the store navigation can be built. While the
  // authorized-stores list is still loading, fall through to HQ_NAV (filtered
  // down to almost nothing for a non-HQ user) rather than guessing — it
  // resolves to the right store nav the instant the list arrives.
  const canView = canViewHQ(isSuperAdmin, has);
  const fallbackStoreId =
    !storesLoading && authorizedStores[0] ? String(authorizedStores[0].id) : undefined;
  const effectiveWs: Workspace =
    !canView && workspace.kind === "hq"
      ? fallbackStoreId
        ? { kind: "store", id: fallbackStoreId }
        : { kind: "hq" }
      : workspace.kind === "store" && !workspace.id
        ? fallbackStoreId
          ? { kind: "store", id: fallbackStoreId }
          : { kind: "hq" }
        : workspace;

  const rawGroups: NavGroup[] =
    effectiveWs.kind === "store" && effectiveWs.id
      ? buildStoreNav(effectiveWs.id)
      : HQ_NAV;
  // RBAC: menus are now decided by the user's real permissions (super-admin bypasses).
  const navGroups = filterNavByPermission(rawGroups, has);

  const activeStore =
    effectiveWs.kind === "store"
      ? authorizedStores.find((s) => String(s.id) === effectiveWs.id) ?? null
      : null;

  const wsLabel = getWorkspaceLabel(effectiveWs, { store: activeStore });
  const wsContext = effectiveWs.kind === "store" ? activeStore : null;

  return (
    <div className="flex min-h-dvh w-full bg-secondary/40">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-300 lg:flex lg:flex-col",
          collapsed ? "w-[72px]" : "w-64",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-3">
          <Brand collapsed={collapsed} kind={effectiveWs.kind} />
        </div>
        <ScrollArea className="flex-1">
          <NavList collapsed={collapsed} groups={navGroups} />
        </ScrollArea>
        <div className="border-t border-sidebar-border p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed((v) => !v)}
            className="w-full justify-center text-muted-foreground"
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <ChevronsLeft className="h-4 w-4" />
            )}
            {!collapsed && <span className="ml-1.5 text-xs">{t("common.collapse")}</span>}
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-40 flex h-16 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur-md sm:px-5">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <div className="flex h-16 items-center border-b px-4">
                <Brand kind={effectiveWs.kind} />
              </div>
              <ScrollArea className="h-[calc(100dvh-4rem)]">
                <NavList groups={navGroups} onNavigate={() => setMobileOpen(false)} />
              </ScrollArea>
            </SheetContent>
          </Sheet>

          <WorkspaceSwitcher />

          <div className="relative ml-1 hidden max-w-sm flex-1 md:block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("common.search")}
              className="h-9 border-transparent bg-secondary pl-8 focus-visible:bg-background"
            />
            <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
              ⌘K
            </kbd>
          </div>

          <div className="ml-auto flex items-center gap-1">
            <LanguageSwitcher />
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              className="h-9 w-9"
              title={t("common.theme")}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <NotificationsButton />
            <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
            <ProfileMenu />
          </div>
        </header>

        {effectiveWs.kind === "store" && wsContext && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-info/5 px-4 py-2.5 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-info/15 text-info">
                <Store className="h-4 w-4" />
              </span>
              <div className="min-w-0 leading-tight">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("workspace.banner.store")}
                </span>
                <div className="truncate text-sm font-semibold">{wsLabel.title}</div>
              </div>
            </div>
            {canView && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setWorkspace({ kind: "hq" });
                }}
                className="h-8 gap-1.5 text-xs"
              >
                <LogOut className="h-3.5 w-3.5" />
                {t("workspace.exit")}
              </Button>
            )}
          </div>
        )}

        <main className="flex-1">
          <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="sticky bottom-0 z-30 flex items-center justify-around border-t bg-background/95 px-2 py-1.5 backdrop-blur lg:hidden">
          {(
            [
              {
                to: "/app",
                key: "nav.home",
                icon: LayoutDashboard,
                exact: true,
                requiredPermission: null,
              },
              {
                to: "/app/pos",
                key: "nav.pos",
                icon: ScanLine,
                requiredPermission: "ventes.create",
              },
              {
                to: "/app/orders",
                key: "nav.orders",
                icon: ShoppingCart,
                requiredPermission: "commandes.view",
              },
              {
                to: "/app/inventory",
                key: "nav.inventory",
                icon: Warehouse,
                requiredPermission: "stock.view",
              },
              {
                to: "/app/notifications",
                key: "nav.alerts",
                icon: Bell,
                requiredPermission: "notifications.view",
              },
            ] satisfies NavItem[]
          )
            .filter((i) => navItemAllowed(i, has))
            .map((i) => (
              <Link
                key={i.to}
                to={i.to}
                className="flex flex-col items-center gap-0.5 rounded-md px-3 py-1 text-[10px] font-medium text-muted-foreground [&.active]:text-primary"
                activeOptions={{ exact: i.exact }}
                activeProps={{ className: "active" }}
              >
                <i.icon className="h-4 w-4" />
                {t(i.key)}
              </Link>
            ))}
        </nav>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  badge,
  breadcrumbs,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  badge?: ReactNode;
  breadcrumbs?: { label: string; to?: string }[];
}) {
  return (
    <div className="mb-6 space-y-2">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {b.to ? (
                <Link to={b.to} className="hover:text-foreground">
                  {b.label}
                </Link>
              ) : (
                <span>{b.label}</span>
              )}
              {i < breadcrumbs.length - 1 && <span className="text-muted-foreground/40">/</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:flex sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
            {badge}
          </div>
          {description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
