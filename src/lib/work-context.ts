// WorkContext — a single composition point over the app's independent state
// sources (auth, permissions, workspace, currency, language). It does NOT
// own any state itself and does NOT replace its sources: auth.ts,
// workspace.ts, currency.ts and i18n.ts remain the sources of truth, each
// with their own hook, persistence and subscribers, exactly as before.
//
// Deliberately NOT a React Context/Provider: a single provider wrapping all
// of this would re-render every consumer on every change to any field (e.g.
// switching language would re-render components that only care about the
// active store). useWorkContext() is a plain hook — each consumer only
// re-renders when a source it actually reads from changes, same cost as
// calling the individual hooks directly.
//
// Fields not wired yet (cashSession, company) are explicit `null` — never a
// mock value — until their real data source exists.

import { useQuery } from "@tanstack/react-query";
import { useAuth, usePermissions, type AuthUser } from "@/lib/auth";
import { useWorkspace, type Workspace } from "@/lib/workspace";
import { useCurrency } from "@/lib/currency";
import { useT } from "@/lib/i18n";
import { storesApi, usersApi, qk } from "@/lib/api";
import type { StoreRead } from "@/lib/types";

// Mirrors the backend's `_HQ_INDICATOR_SLUGS` (app/core/authz.py) exactly —
// any permission in this set resolves a user's *backend* store scope to
// "hq" (network-wide), regardless of group membership (an individual
// permission override is enough). The frontend's notion of "can this user
// see network-wide data" must use the same set, or the two can silently
// disagree the moment someone is granted one of these slugs outside the
// usual group baseline (e.g. a one-off `stores.manage` grant).
const HQ_INDICATOR_SLUGS = ["stores.manage", "dashboard.global.view"];

export function canViewHQ(isSuperAdmin: boolean, has: (slug: string) => boolean): boolean {
  return isSuperAdmin || HQ_INDICATOR_SLUGS.some((slug) => has(slug));
}

// ───────────────── Authorized stores ─────────────────
// Stores the current user may switch the workspace into: every store for an
// HQ-capable user (super-admin or any HQ-indicator permission), otherwise
// only the stores they're actually assigned to via StoreUser.
export function useAuthorizedStores() {
  const { isSuperAdmin, has } = usePermissions();
  const { user } = useAuth();
  const canView = canViewHQ(isSuperAdmin, has);

  const allStores = useQuery({
    queryKey: qk.stores.list(),
    queryFn: () => storesApi.list({ limit: 200 }),
  });

  const myLinks = useQuery({
    queryKey: qk.users.stores(user?.id ?? 0),
    queryFn: () => usersApi.listStores(user!.id),
    enabled: !!user && !canView,
  });

  const isLoading = allStores.isLoading || (!canView && myLinks.isLoading);

  if (canView) {
    return { stores: allStores.data ?? [], isLoading };
  }

  const myStoreIds = new Set((myLinks.data ?? []).map((l) => l.store_id));
  const stores = (allStores.data ?? []).filter((s) => myStoreIds.has(s.id));
  return { stores, isLoading };
}

// ───────────────── WorkContext ─────────────────
export type WorkContext = {
  user: AuthUser | null;
  permissions: string[];
  isSuperAdmin: boolean;
  has: (slug: string) => boolean;
  hasAny: (slugs: string[]) => boolean;

  workspace: Workspace;
  setWorkspace: (w: Workspace) => void;
  store: StoreRead | null;
  authorizedStores: StoreRead[];
  storesLoading: boolean;

  cashSession: null; // not wired yet — see docs/SALES_TRANSACTION_ENGINE.md "Caisse"
  company: null; // not wired yet — single company profile lives in backend Settings,
  // not yet exposed via a frontend API wrapper

  currency: string;
  setCurrency: (code: string) => void;
  timezone: string;
  language: "fr" | "en";
};

export function useWorkContext(): WorkContext {
  const { user } = useAuth();
  const { permissions, isSuperAdmin, has, hasAny } = usePermissions();
  const { workspace: rawWorkspace, setWorkspace } = useWorkspace();
  const { stores: authorizedStores, isLoading: storesLoading } = useAuthorizedStores();
  const { currency, setCurrency } = useCurrency();
  const { lang } = useT();

  // Never trust a persisted "hq" (or storeless "store") workspace for a user
  // who isn't actually allowed to view HQ — always re-derive a safe workspace
  // from their real permissions here, in the one hook every consumer goes
  // through. A stale localStorage value (e.g. left over from before a
  // permission change, or from switching accounts on the same browser) must
  // never let a store-scoped user's pages fetch/render network-wide data,
  // even if a sidebar elsewhere already hides the HQ option from being picked.
  const canView = canViewHQ(isSuperAdmin, has);
  const fallbackStoreId =
    !storesLoading && authorizedStores[0] ? String(authorizedStores[0].id) : undefined;
  const workspace: Workspace =
    !canView && rawWorkspace.kind === "hq"
      ? fallbackStoreId
        ? { kind: "store", id: fallbackStoreId }
        : { kind: "hq" }
      : rawWorkspace.kind === "store" && !rawWorkspace.id
        ? fallbackStoreId
          ? { kind: "store", id: fallbackStoreId }
          : { kind: "hq" }
        : rawWorkspace;

  const store =
    workspace.kind === "store" && workspace.id
      ? authorizedStores.find((s) => String(s.id) === workspace.id) ?? null
      : null;

  return {
    user,
    permissions,
    isSuperAdmin,
    has,
    hasAny,
    workspace,
    setWorkspace,
    store,
    authorizedStores,
    storesLoading,
    cashSession: null,
    company: null,
    currency,
    setCurrency,
    timezone: store?.timezone ?? "Africa/Conakry",
    language: lang,
  };
}
