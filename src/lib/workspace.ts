// Workspace context — switch between HQ, a specific Store, or a Supplier
// (optionally scoped to one of its linked stores). Persists in localStorage,
// subscription-based so UI re-renders on switch. SSR-safe (no module-level
// localStorage reads).
//
// This module is intentionally dependency-free (no API calls, no mock data):
// it only tracks *which* workspace is selected, as plain ids. Resolving a
// "store" id into a real StoreRead (name, uuid, city…) is the job of
// work-context.ts, which joins this module's state with the real /stores
// API. Keeping workspace.ts this thin is what lets it stay a stable,
// independent source of truth as the rest of the app evolves around it.
//
// The "supplier" kind is the one exception still backed by mock data — see
// workspace-data.mock.ts — until a real supplier↔store relationship exists
// server-side (explicitly out of scope for now).

import { useEffect, useState } from "react";

export type WorkspaceKind = "hq" | "store" | "supplier";

export type Workspace = {
  kind: WorkspaceKind;
  id?: string; // store id (real backend id, stringified) or supplier id (mock)
  storeId?: string; // when kind === "supplier", optional scoped store id (mock)
};

const STORAGE_KEY = "retailux:workspace";
const DEFAULT: Workspace = { kind: "hq" };

let current: Workspace = DEFAULT;
const listeners = new Set<(w: Workspace) => void>();

// ───────────────── Workspace ─────────────────
export function getWorkspace(): Workspace {
  return current;
}

export function setWorkspace(next: Workspace) {
  current = next;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  listeners.forEach((l) => l(current));
}

export function hydrateWorkspaceFromStorage() {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Workspace;
      if (parsed && typeof parsed.kind === "string") {
        current = parsed;
        listeners.forEach((l) => l(current));
      }
    }
  } catch {
    /* ignore */
  }
}

export function useWorkspace() {
  const [w, setW] = useState<Workspace>(current);
  useEffect(() => {
    const l = (n: Workspace) => setW(n);
    listeners.add(l);
    setW(current);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return { workspace: w, setWorkspace };
}

// ───────────────── Label ─────────────────
// Pure formatting — callers resolve the actual store/supplier and pass the
// display fields in. Keeps this module free of any data-fetching concern.
export function getWorkspaceLabel(
  w: Workspace,
  resolved?: {
    store?: { name: string; city?: string | null } | null;
    supplierName?: string;
    supplierCity?: string;
    scopedStoreName?: string;
  },
): { title: string; subtitle?: string } {
  if (w.kind === "hq") return { title: "HQ", subtitle: "Siège · Vue globale" };
  if (w.kind === "store") {
    const s = resolved?.store;
    return s
      ? { title: s.name, subtitle: `Boutique · ${s.city ?? ""}` }
      : { title: "Boutique", subtitle: "" };
  }
  return resolved?.supplierName
    ? {
        title: resolved.supplierName,
        subtitle: resolved.scopedStoreName
          ? `Fournisseur · ${resolved.scopedStoreName}`
          : `Fournisseur · ${resolved.supplierCity ?? ""}`,
      }
    : { title: "Fournisseur", subtitle: "" };
}
