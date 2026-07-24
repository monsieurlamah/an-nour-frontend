// Authentication state + API calls wired to the FastAPI backend.
// Tokens live in localStorage (see api-client). A tiny pub/sub keeps React in
// sync after login/logout. SSR-safe: no module-level localStorage reads.

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, clearTokens, getAccessToken, setTokens } from "@/lib/api-client";
import { getWorkspace, setWorkspace } from "@/lib/workspace";

export type AuthUser = {
  id: number;
  uuid: string;
  firstname: string;
  lastname: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  status: string;
  is_activated: boolean;
  email_verified: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  // RBAC state returned by GET /auth/me (enriched contract).
  groups: string[];
  permissions: string[];
  is_super_admin: boolean;
};

// Group slug → display label (used in ProfileMenu header and admin user screens)
export const GROUP_SLUG_LABEL: Record<string, string> = {
  "super-admin": "Super Admin",
  fournisseur: "Propriétaire",
  "gerant-boutique": "Gérant",
  "vendeur-boutique": "Vendeur",
  caissier: "Caissier",
  comptable: "Comptable",
  observateur: "Observateur",
};

// Group slug → badge color classes (bg + text + border), used for chip-style group tags.
export const GROUP_SLUG_BADGE_COLOR: Record<string, string> = {
  "super-admin": "bg-purple-100 text-purple-700 border-purple-200",
  fournisseur: "bg-blue-100 text-blue-700 border-blue-200",
  "gerant-boutique": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "vendeur-boutique": "bg-amber-100 text-amber-700 border-amber-200",
  caissier: "bg-orange-100 text-orange-700 border-orange-200",
  comptable: "bg-cyan-100 text-cyan-700 border-cyan-200",
  observateur: "bg-slate-100 text-slate-600 border-slate-200",
};

// Group slug → text-only color class, used in dense table headers (permissions matrix).
export const GROUP_SLUG_TEXT_COLOR: Record<string, string> = {
  "super-admin": "text-purple-700",
  fournisseur: "text-blue-700",
  "gerant-boutique": "text-emerald-700",
  "vendeur-boutique": "text-amber-700",
  caissier: "text-orange-700",
  comptable: "text-cyan-700",
  observateur: "text-slate-600",
};

// Whether a user is allowed to sit at the HQ (global) workspace. Super-admin
// always; otherwise any HQ-indicator permission grants it. Mirrors the
// backend's `_HQ_INDICATOR_SLUGS` (app/core/authz.py) and the canonical
// frontend copy in work-context.ts::canViewHQ — duplicated here (rather than
// imported) only because work-context.ts itself imports from this module,
// and importing back would create a cycle. Keep both lists in sync.
function canViewHQ(user: AuthUser): boolean {
  return (
    user.is_super_admin ||
    user.permissions.includes("dashboard.global.view") ||
    user.permissions.includes("stores.manage")
  );
}

// Reset the workspace to the canonical home on a fresh login so a previous
// user's workspace never bleeds through. HQ-capable users land on HQ; others
// are left for the shell to coerce into their store workspace.
function resetWorkspaceForUser(user: AuthUser) {
  if (canViewHQ(user)) {
    setWorkspace({ kind: "hq" });
  }
}

type TokenResponse = { access_token: string; refresh_token: string; token_type: string };
type RegisterResponse = { message: string; email: string; verification_required: boolean };
type MessageResponse = { message: string };

let currentUser: AuthUser | null = null;
const listeners = new Set<(u: AuthUser | null) => void>();

function emit() {
  listeners.forEach((l) => l(currentUser));
}

export function isAuthenticated(): boolean {
  return Boolean(getAccessToken());
}

export function getCurrentUser(): AuthUser | null {
  return currentUser;
}

// ───────────────── Permissions (RBAC) ─────────────────
export function isSuperAdmin(): boolean {
  return currentUser?.is_super_admin ?? false;
}

export function hasPermission(slug: string): boolean {
  if (!currentUser) return false;
  if (currentUser.is_super_admin) return true;
  return currentUser.permissions.includes(slug);
}

export function hasAnyPermission(slugs: string[]): boolean {
  if (!currentUser) return false;
  if (currentUser.is_super_admin) return true;
  return slugs.some((s) => currentUser!.permissions.includes(s));
}

// ───────────────── API calls ─────────────────
export async function register(input: {
  firstname: string;
  lastname: string;
  email: string;
  password: string;
  phone?: string;
}): Promise<RegisterResponse> {
  return apiRequest<RegisterResponse>("/auth/register", {
    method: "POST",
    auth: false,
    body: input,
  });
}

export async function verifyEmail(email: string, code: string): Promise<AuthUser> {
  const tokens = await apiRequest<TokenResponse>("/auth/verify-email", {
    method: "POST",
    auth: false,
    body: { email, code },
  });
  setTokens(tokens.access_token, tokens.refresh_token);
  const user = await fetchMe();
  resetWorkspaceForUser(user);
  return user;
}

export async function resendOtp(email: string): Promise<MessageResponse> {
  return apiRequest<MessageResponse>("/auth/resend-otp", {
    method: "POST",
    auth: false,
    body: { email },
  });
}

export async function forgotPassword(email: string): Promise<MessageResponse> {
  return apiRequest<MessageResponse>("/auth/forgot-password", {
    method: "POST",
    auth: false,
    body: { email },
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await apiRequest<void>("/auth/reset-password", {
    method: "POST",
    auth: false,
    body: { token, new_password: newPassword },
  });
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const tokens = await apiRequest<TokenResponse>("/auth/login", {
    method: "POST",
    auth: false,
    form: { username: email, password },
  });
  setTokens(tokens.access_token, tokens.refresh_token);
  const user = await fetchMe();
  // Always reset workspace on fresh login — prevents the previous user's
  // workspace from contaminating the new session.
  resetWorkspaceForUser(user);
  return user;
}

export async function fetchMe(): Promise<AuthUser> {
  const user = await apiRequest<AuthUser>("/auth/me");
  // Normalise optional fields for resilience against older backends.
  user.groups = user.groups ?? [];
  user.permissions = user.permissions ?? [];
  user.is_super_admin = user.is_super_admin ?? false;
  currentUser = user;
  emit();

  // Sanitise stale workspace on page reload: an HQ-capable user stuck on an
  // empty-id supplier workspace (legacy artifact) is sent back to HQ.
  const ws = getWorkspace();
  if (canViewHQ(user) && ws.kind === "supplier" && !ws.id) {
    setWorkspace({ kind: "hq" });
  }

  return user;
}

export function logout() {
  clearTokens();
  currentUser = null;
  // Reset workspace so the next user starts from a clean state.
  setWorkspace({ kind: "hq" });
  emit();
}

// Hydrate the current user from a stored token (call once on app mount).
export async function hydrateAuth(): Promise<void> {
  if (!isAuthenticated()) return;
  try {
    await fetchMe();
  } catch {
    logout();
  }
}

// ───────────────── React hook ─────────────────
export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(currentUser);
  useEffect(() => {
    const l = (u: AuthUser | null) => setUser(u);
    listeners.add(l);
    setUser(currentUser);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return {
    user,
    isAuthenticated: Boolean(user) || isAuthenticated(),
    logout,
  };
}

// Reactive permission checks bound to the current user. Super-admin bypasses all.
export function usePermissions() {
  const { user } = useAuth();
  const permissions = useMemo(() => user?.permissions ?? [], [user]);
  const superAdmin = user?.is_super_admin ?? false;

  const has = useCallback(
    (slug: string) => superAdmin || permissions.includes(slug),
    [permissions, superAdmin],
  );
  const hasAny = useCallback(
    (slugs: string[]) => superAdmin || slugs.some((s) => permissions.includes(s)),
    [permissions, superAdmin],
  );

  return { permissions, isSuperAdmin: superAdmin, has, hasAny };
}
