// Workspace context — switch between HQ and a specific Store. Persists in
// localStorage, subscription-based so UI re-renders on switch. SSR-safe (no
// module-level localStorage reads).
//
// This module is intentionally dependency-free (no API calls, no mock data):
// it only tracks *which* workspace is selected, as plain ids. Resolving a
// "store" id into a real StoreRead (name, uuid, city…) is the job of
// work-context.ts, which joins this module's state with the real /stores
// API. Keeping workspace.ts this thin is what lets it stay a stable,
// independent source of truth as the rest of the app evolves around it.

import { useEffect, useState } from "react";

export type WorkspaceKind = "hq" | "store";

export type Workspace = {
  kind: WorkspaceKind;
  id?: string; // store id (real backend id, stringified)
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
      // Defensive: a browser may still hold a pre-existing "supplier"
      // workspace from before that kind was retired (no external-supplier
      // concept exists in this app) — fall back to HQ rather than restore it.
      if (parsed && (parsed.kind === "hq" || parsed.kind === "store")) {
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
// Pure formatting — callers resolve the actual store and pass the display
// fields in. Keeps this module free of any data-fetching concern.
export function getWorkspaceLabel(
  w: Workspace,
  resolved?: {
    store?: { name: string; city?: string | null } | null;
  },
): { title: string; subtitle?: string } {
  if (w.kind === "hq") return { title: "HQ", subtitle: "Siège · Vue globale" };
  const s = resolved?.store;
  return s
    ? { title: s.name, subtitle: `Boutique · ${s.city ?? ""}` }
    : { title: "Boutique", subtitle: "" };
}
