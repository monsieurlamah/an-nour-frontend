// ISOLATED MOCK — supplier ↔ store linking has no backend equivalent yet.
// Kept out of workspace.ts on purpose: the "store" and "hq" workspace kinds
// are now backed by real data (see work-context.ts); "supplier" stays mock
// until a real supplier↔store relationship exists server-side (see
// WorkContext architecture notes — explicitly out of scope for now).

import { stores, suppliers } from "./mock-data";

export const supplierStoreLinks: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {};
  const n = stores.length;
  suppliers.forEach((s, i) => {
    const set = new Set<string>();
    // First supplier intentionally has no link so we can demo the empty state
    // for "supplier connecté n'est lié à aucune boutique".
    if (i === suppliers.length - 1) {
      map[s.id] = [];
      return;
    }
    const count = 2 + (i % 3); // 2..4
    for (let k = 0; k < count; k++) {
      set.add(stores[(i * 2 + k * 3) % n].id);
    }
    map[s.id] = Array.from(set);
  });
  return map;
})();

export function getLinkedStores(supplierId: string) {
  const ids = supplierStoreLinks[supplierId] ?? [];
  return stores.filter((s) => ids.includes(s.id));
}

// Mutators (mock CRUD on the in-memory link map; survives within a session).
export function addStoreLink(supplierId: string, storeId: string) {
  const list = supplierStoreLinks[supplierId] ?? (supplierStoreLinks[supplierId] = []);
  if (!list.includes(storeId)) list.push(storeId);
}
export function removeStoreLink(supplierId: string, storeId: string) {
  const list = supplierStoreLinks[supplierId] ?? [];
  supplierStoreLinks[supplierId] = list.filter((s) => s !== storeId);
}
