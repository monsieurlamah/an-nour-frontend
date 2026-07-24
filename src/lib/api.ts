/**
 * API layer — typed wrappers around apiRequest for every backend resource.
 * All functions throw ApiError on failure (caught by React Query).
 */

import { apiRequest, uploadFile } from "./api-client";
import type {
  PaginationParams,
  StoreRead, StoreCreate, StoreUpdate, StoreUserRead, StoreUserCreate,
  CategoryProductRead, CategoryProductCreate, CategoryProductUpdate,
  CategoryStoreRead,
  ProductRead, ProductCreate, ProductUpdate,
  ClientRead, ClientCreate, ClientUpdate,
  CommandeRead, CommandeCreate, CommandeValidate, CommandeStatut,
  CommandeRefuse, CommandeLigneResolve, CommandeShip, CommandeReceptionCreate,
  CommandeEvenementRead, CommandeReceptionRead, CommandeAnomalieRead,
  VenteRead, VenteCreate, VenteStatut,
  VenteRetourCreate, VenteRetourRead,
  VenteRemboursementCreate, VenteRemboursementRead,
  CreanceRead, CreanceCreate, CreanceStatut,
  PaiementRead, PaiementCreate,
  SupplierRead, SupplierCreate, SupplierUpdate,
  PurchaseRead, PurchaseCreate, PurchaseStatut,
  StockLocationRead, StockLocationCreate,
  ProductStockRead, ProductStockUpdate,
  AddStockRequest, AdjustStockRequest, TransferStockRequest, TransferStockResult,
  StockMovementRead,
  MovementType, StockLocationType,
  CashSessionRead, CashSessionOpen, CashSessionClose, CashMovementRead, CashSessionStatus,
  UserRead, UserCreate, UserUpdate,
  RoleRead, GroupRead, PermissionRead,
  UserGroupRead, GroupPermissionRead,
  NotificationRead,
  ExpenseRead, ExpenseCreate, ExpenseUpdate,
  ExpenseCategoryRead, ExpenseCategoryCreate,
  SettingRead, SettingUpdate,
} from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

type ListParams = PaginationParams & Record<string, string | number | undefined | null>;

// ─── Stores ───────────────────────────────────────────────────────────────────

export const storesApi = {
  list: (p?: ListParams) =>
    apiRequest<StoreRead[]>(`/stores${qs({ skip: 0, limit: 100, ...p })}`),

  get: (id: number) =>
    apiRequest<StoreRead>(`/stores/${id}`),

  create: (body: StoreCreate) =>
    apiRequest<StoreRead>("/stores", { method: "POST", body }),

  update: (id: number, body: StoreUpdate) =>
    apiRequest<StoreRead>(`/stores/${id}`, { method: "PATCH", body }),

  delete: (id: number) =>
    apiRequest<void>(`/stores/${id}`, { method: "DELETE" }),

  getUsers: (storeId: number) =>
    apiRequest<StoreUserRead[]>(`/stores/${storeId}/users`),

  addUser: (storeId: number, body: Omit<StoreUserCreate, "store_id">) =>
    apiRequest<StoreUserRead>(`/stores/${storeId}/users`, {
      method: "POST",
      body: { ...body, store_id: storeId },
    }),

  removeUser: (linkId: number) =>
    apiRequest<void>(`/stores/users/${linkId}`, { method: "DELETE" }),
};

// ─── Catalog ──────────────────────────────────────────────────────────────────

export const catalogApi = {
  // Product categories
  listProductCategories: (p?: ListParams) =>
    apiRequest<CategoryProductRead[]>(
      `/catalog/product-categories${qs({ skip: 0, limit: 200, ...p })}`,
    ),

  createProductCategory: (body: CategoryProductCreate) =>
    apiRequest<CategoryProductRead>("/catalog/product-categories", { method: "POST", body }),

  updateProductCategory: (id: number, body: CategoryProductUpdate) =>
    apiRequest<CategoryProductRead>(`/catalog/product-categories/${id}`, {
      method: "PATCH",
      body,
    }),

  deleteProductCategory: (id: number) =>
    apiRequest<void>(`/catalog/product-categories/${id}`, { method: "DELETE" }),

  // Products
  listProducts: (p?: ListParams & { category_product_id?: number }) =>
    apiRequest<ProductRead[]>(`/catalog/products${qs({ skip: 0, limit: 200, ...p })}`),

  getProduct: (id: number) =>
    apiRequest<ProductRead>(`/catalog/products/${id}`),

  getProductByUuid: (uuid: string) =>
    apiRequest<ProductRead>(`/catalog/products/by-uuid/${uuid}`),

  createProduct: (body: ProductCreate) =>
    apiRequest<ProductRead>("/catalog/products", { method: "POST", body }),

  updateProduct: (id: number, body: ProductUpdate) =>
    apiRequest<ProductRead>(`/catalog/products/${id}`, { method: "PATCH", body }),

  deleteProduct: (id: number) =>
    apiRequest<void>(`/catalog/products/${id}`, { method: "DELETE" }),

  // Store categories
  listStoreCategories: (p?: ListParams) =>
    apiRequest<CategoryStoreRead[]>(
      `/catalog/store-categories${qs({ skip: 0, limit: 200, ...p })}`,
    ),
};

// ─── Clients ──────────────────────────────────────────────────────────────────

export const clientsApi = {
  list: (p?: ListParams & { store_id?: number }) =>
    apiRequest<ClientRead[]>(`/clients${qs({ skip: 0, limit: 200, ...p })}`),

  get: (id: number) =>
    apiRequest<ClientRead>(`/clients/${id}`),

  create: (body: ClientCreate) =>
    apiRequest<ClientRead>("/clients", { method: "POST", body }),

  update: (id: number, body: ClientUpdate) =>
    apiRequest<ClientRead>(`/clients/${id}`, { method: "PATCH", body }),

  delete: (id: number) =>
    apiRequest<void>(`/clients/${id}`, { method: "DELETE" }),
};

// ─── Commandes ────────────────────────────────────────────────────────────────

export const commandesApi = {
  list: (p?: ListParams & { boutique_id?: number; statut?: CommandeStatut }) =>
    apiRequest<CommandeRead[]>(`/commandes${qs({ skip: 0, limit: 200, ...p })}`),

  queuePreparation: (p?: ListParams) =>
    apiRequest<CommandeRead[]>(`/commandes/queue/preparation${qs({ skip: 0, limit: 200, ...p })}`),

  queueLivraison: (p?: ListParams) =>
    apiRequest<CommandeRead[]>(`/commandes/queue/livraison${qs({ skip: 0, limit: 200, ...p })}`),

  get: (id: number) =>
    apiRequest<CommandeRead>(`/commandes/${id}`),

  listEvents: (id: number) =>
    apiRequest<CommandeEvenementRead[]>(`/commandes/${id}/events`),

  listReceptions: (id: number) =>
    apiRequest<CommandeReceptionRead[]>(`/commandes/${id}/receptions`),

  listAnomalies: (id: number) =>
    apiRequest<CommandeAnomalieRead[]>(`/commandes/${id}/anomalies`),

  create: (body: CommandeCreate) =>
    apiRequest<CommandeRead>("/commandes", { method: "POST", body }),

  submit: (id: number) =>
    apiRequest<CommandeRead>(`/commandes/${id}/submit`, { method: "POST" }),

  resolveLigne: (id: number, ligneId: number, body: CommandeLigneResolve) =>
    apiRequest<CommandeRead>(`/commandes/${id}/lignes/${ligneId}/resolve`, {
      method: "POST",
      body,
    }),

  validate: (id: number, body: CommandeValidate) =>
    apiRequest<CommandeRead>(`/commandes/${id}/validate`, { method: "POST", body }),

  refuse: (id: number, body: CommandeRefuse) =>
    apiRequest<CommandeRead>(`/commandes/${id}/refuse`, { method: "POST", body }),

  generateProforma: (id: number) =>
    apiRequest<CommandeRead>(`/commandes/${id}/proforma`, { method: "POST" }),

  // Gérant decision on a PROFORMA_GENEREE proforma — approving auto-generates
  // the facture, rejecting sends it back to the Boss (see resubmitProforma).
  approveProforma: (id: number) =>
    apiRequest<CommandeRead>(`/commandes/${id}/proforma/approve`, { method: "POST" }),

  rejectProforma: (id: number, body: { motif: string }) =>
    apiRequest<CommandeRead>(`/commandes/${id}/proforma/reject`, { method: "POST", body }),

  resubmitProforma: (
    id: number,
    body: { quantites?: Record<number, number>; prix?: Record<number, number>; commentaire?: string },
  ) => apiRequest<CommandeRead>(`/commandes/${id}/proforma/resubmit`, { method: "POST", body }),

  startPreparation: (id: number) =>
    apiRequest<CommandeRead>(`/commandes/${id}/prepare`, { method: "POST" }),

  confirmPreparation: (id: number) =>
    apiRequest<CommandeRead>(`/commandes/${id}/prepare/confirm`, { method: "POST" }),

  ship: (id: number, body: CommandeShip) =>
    apiRequest<CommandeRead>(`/commandes/${id}/ship`, { method: "POST", body }),

  markDelivered: (id: number) =>
    apiRequest<CommandeRead>(`/commandes/${id}/deliver`, { method: "POST" }),

  confirmReception: (id: number, body: CommandeReceptionCreate) =>
    apiRequest<CommandeRead>(`/commandes/${id}/reception`, { method: "POST", body }),

  cancel: (id: number, motif?: string) =>
    apiRequest<CommandeRead>(`/commandes/${id}/cancel${qs({ motif })}`, { method: "POST" }),

  delete: (id: number) =>
    apiRequest<void>(`/commandes/${id}`, { method: "DELETE" }),
};

// ─── Ventes ───────────────────────────────────────────────────────────────────

export type VenteListParams = ListParams & {
  boutique_id?: number;
  client_id?: number;
  vendeur_id?: number;
  statut?: VenteStatut;
  type_vente?: string;
  search?: string;
  date_debut?: string; // ISO date YYYY-MM-DD
  date_fin?: string;
};

export const ventesApi = {
  list: (p?: VenteListParams) =>
    apiRequest<VenteRead[]>(`/ventes${qs({ limit: 50, ...p })}`),

  count: (p?: Omit<VenteListParams, "skip" | "limit">) =>
    apiRequest<{ total: number }>(`/ventes/count${qs(p ?? {})}`),

  get: (id: number) =>
    apiRequest<VenteRead>(`/ventes/${id}`),

  create: (body: VenteCreate) =>
    apiRequest<VenteRead>("/ventes", { method: "POST", body }),

  void: (id: number) =>
    apiRequest<VenteRead>(`/ventes/${id}/void`, { method: "POST" }),

  // Confirm delivery of a sale rung up as non_livre — the only place stock
  // actually moves for that sale; generates the bon de livraison.
  confirmLivraison: (id: number) =>
    apiRequest<VenteRead>(`/ventes/${id}/confirm-livraison`, { method: "POST" }),

  delete: (id: number) =>
    apiRequest<void>(`/ventes/${id}`, { method: "DELETE" }),

  // ── Returns ──────────────────────────────────────────────────────────────
  getRetours: (id: number) =>
    apiRequest<VenteRetourRead[]>(`/ventes/${id}/retours`),

  createRetour: (id: number, body: VenteRetourCreate) =>
    apiRequest<VenteRetourRead>(`/ventes/${id}/return`, { method: "POST", body }),

  // ── Refunds ──────────────────────────────────────────────────────────────
  getRemboursements: (id: number) =>
    apiRequest<VenteRemboursementRead[]>(`/ventes/${id}/remboursements`),

  createRemboursement: (id: number, body: VenteRemboursementCreate) =>
    apiRequest<VenteRemboursementRead>(`/ventes/${id}/refund`, { method: "POST", body }),
};

// ─── Créances ─────────────────────────────────────────────────────────────────

export const creancesApi = {
  list: (
    p?: ListParams & {
      client_id?: number;
      boutique_id?: number;
      statut?: CreanceStatut;
    },
  ) => apiRequest<CreanceRead[]>(`/creances${qs({ skip: 0, limit: 200, ...p })}`),

  get: (id: number) =>
    apiRequest<CreanceRead>(`/creances/${id}`),

  create: (body: CreanceCreate) =>
    apiRequest<CreanceRead>("/creances", { method: "POST", body }),

  update: (id: number, body: Partial<{ date_echeance: string; statut: CreanceStatut }>) =>
    apiRequest<CreanceRead>(`/creances/${id}`, { method: "PATCH", body }),

  // Payments
  listPayments: (p?: ListParams & { creance_id?: number; vente_id?: number }) =>
    apiRequest<PaiementRead[]>(`/creances/payments/list${qs({ skip: 0, limit: 200, ...p })}`),

  createPayment: (body: PaiementCreate) =>
    apiRequest<PaiementRead>("/creances/payments", { method: "POST", body }),
};

// ─── Dépenses ─────────────────────────────────────────────────────────────────

export type ExpenseListParams = ListParams & {
  store_id?: number;
  category_id?: number;
  date_from?: string; // ISO date YYYY-MM-DD
  date_to?: string;
};

export const expensesApi = {
  list: (p?: ExpenseListParams) =>
    apiRequest<ExpenseRead[]>(`/expenses${qs({ skip: 0, limit: 200, ...p })}`),

  count: (p?: Omit<ExpenseListParams, "skip" | "limit">) =>
    apiRequest<{ total: number }>(`/expenses/count${qs(p ?? {})}`),

  get: (id: number) =>
    apiRequest<ExpenseRead>(`/expenses/${id}`),

  create: (body: ExpenseCreate) =>
    apiRequest<ExpenseRead>("/expenses", { method: "POST", body }),

  update: (id: number, body: ExpenseUpdate) =>
    apiRequest<ExpenseRead>(`/expenses/${id}`, { method: "PATCH", body }),

  delete: (id: number) =>
    apiRequest<void>(`/expenses/${id}`, { method: "DELETE" }),

  listCategories: (p?: ListParams) =>
    apiRequest<ExpenseCategoryRead[]>(`/expenses/categories${qs({ skip: 0, limit: 200, ...p })}`),

  createCategory: (body: ExpenseCategoryCreate) =>
    apiRequest<ExpenseCategoryRead>("/expenses/categories", { method: "POST", body }),
};

// ─── Fournisseurs / Achats ────────────────────────────────────────────────────

export const achatsApi = {
  // Suppliers
  listSuppliers: (p?: ListParams) =>
    apiRequest<SupplierRead[]>(`/achats/suppliers${qs({ skip: 0, limit: 200, ...p })}`),

  getSupplier: (id: number) =>
    apiRequest<SupplierRead>(`/achats/suppliers/${id}`),

  createSupplier: (body: SupplierCreate) =>
    apiRequest<SupplierRead>("/achats/suppliers", { method: "POST", body }),

  updateSupplier: (id: number, body: SupplierUpdate) =>
    apiRequest<SupplierRead>(`/achats/suppliers/${id}`, { method: "PATCH", body }),

  deleteSupplier: (id: number) =>
    apiRequest<void>(`/achats/suppliers/${id}`, { method: "DELETE" }),

  // Purchases
  listPurchases: (p?: ListParams & { supplier_id?: number; statut?: PurchaseStatut }) =>
    apiRequest<PurchaseRead[]>(`/achats${qs({ skip: 0, limit: 200, ...p })}`),

  getPurchase: (id: number) =>
    apiRequest<PurchaseRead>(`/achats/${id}`),

  createPurchase: (body: PurchaseCreate) =>
    apiRequest<PurchaseRead>("/achats", { method: "POST", body }),

  updatePurchaseStatus: (id: number, statut: PurchaseStatut) =>
    apiRequest<PurchaseRead>(`/achats/${id}/status`, {
      method: "PATCH",
      body: { statut },
    }),

  deletePurchase: (id: number) =>
    apiRequest<void>(`/achats/${id}`, { method: "DELETE" }),
};

// ─── Stock ────────────────────────────────────────────────────────────────────

export const stockApi = {
  // Locations
  listLocations: (p?: ListParams & { type?: StockLocationType; store_id?: number }) =>
    apiRequest<StockLocationRead[]>(`/stock/locations${qs({ skip: 0, limit: 200, ...p })}`),

  createLocation: (body: StockLocationCreate) =>
    apiRequest<StockLocationRead>("/stock/locations", { method: "POST", body }),

  // Product stocks
  listProductStocks: (p?: ListParams & { product_id?: number; location_id?: number }) =>
    apiRequest<ProductStockRead[]>(`/stock/product-stocks${qs({ skip: 0, limit: 500, ...p })}`),

  updateProductStock: (id: number, body: ProductStockUpdate) =>
    apiRequest<ProductStockRead>(`/stock/product-stocks/${id}`, { method: "PATCH", body }),

  // Atomic operations
  addStock: (body: AddStockRequest) =>
    apiRequest<ProductStockRead>("/stock/add", { method: "POST", body }),

  adjustStock: (body: AdjustStockRequest) =>
    apiRequest<ProductStockRead>("/stock/adjust", { method: "POST", body }),

  transferStock: (body: TransferStockRequest) =>
    apiRequest<TransferStockResult>("/stock/transfer", { method: "POST", body }),

  // Movements (read-only audit log)
  listMovements: (p?: ListParams & { product_id?: number; movement_type?: MovementType }) =>
    apiRequest<StockMovementRead[]>(`/stock/movements${qs({ skip: 0, limit: 500, ...p })}`),
};

export const cashApi = {
  listSessions: (p?: ListParams & { store_id?: number; session_status?: CashSessionStatus }) =>
    apiRequest<CashSessionRead[]>(`/cash/sessions${qs({ skip: 0, limit: 100, ...p })}`),

  openSession: (body: CashSessionOpen) =>
    apiRequest<CashSessionRead>("/cash/sessions", { method: "POST", body }),

  closeSession: (id: number, body: CashSessionClose) =>
    apiRequest<CashSessionRead>(`/cash/sessions/${id}/close`, { method: "POST", body }),

  listMovements: (p?: ListParams & { cash_session_id?: number }) =>
    apiRequest<CashMovementRead[]>(`/cash/movements${qs({ skip: 0, limit: 100, ...p })}`),
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const usersApi = {
  list: (p?: ListParams & { group_id?: number; search?: string }) =>
    apiRequest<UserRead[]>(`/users${qs({ skip: 0, limit: 200, ...p })}`),

  get: (id: number) =>
    apiRequest<UserRead>(`/users/${id}`),

  create: (body: UserCreate) =>
    apiRequest<UserRead>("/users", { method: "POST", body }),

  update: (id: number, body: UserUpdate) =>
    apiRequest<UserRead>(`/users/${id}`, { method: "PATCH", body }),

  delete: (id: number) =>
    apiRequest<void>(`/users/${id}`, { method: "DELETE" }),

  listGroups: (userId: number) =>
    apiRequest<UserGroupRead[]>(`/users/${userId}/groups`),

  assignGroup: (userId: number, groupId: number) =>
    apiRequest<UserGroupRead>(`/users/${userId}/groups?group_id=${groupId}`, { method: "POST" }),

  removeGroup: (userId: number, linkId: number) =>
    apiRequest<void>(`/users/${userId}/groups/${linkId}`, { method: "DELETE" }),

  listStores: (userId: number) =>
    apiRequest<StoreUserRead[]>(`/users/${userId}/stores`),

  sendCredentials: (userId: number) =>
    apiRequest<void>(`/users/${userId}/send-credentials`, { method: "POST" }),

  changeMyPassword: (body: { current_password: string; new_password: string }) =>
    apiRequest<void>("/users/me/change-password", { method: "POST", body }),
};

// ─── Access / RBAC ────────────────────────────────────────────────────────────

export const accessApi = {
  listRoles: () => apiRequest<RoleRead[]>("/access/roles"),
  listGroups: () => apiRequest<GroupRead[]>("/access/groups"),
  listPermissions: (module?: string) =>
    apiRequest<PermissionRead[]>(`/access/permissions${qs({ module, limit: 200 })}`),

  // User ↔ Group
  listUserGroups: (p?: { user_id?: number; group_id?: number }) =>
    apiRequest<UserGroupRead[]>(`/access/user-groups${qs({ limit: 500, ...p })}`),
  assignUserGroup: (body: { user_id: number; group_id: number }) =>
    apiRequest<UserGroupRead>("/access/user-groups", { method: "POST", body }),
  removeUserGroup: (linkId: number) =>
    apiRequest<void>(`/access/user-groups/${linkId}`, { method: "DELETE" }),

  // Group ↔ Permission
  listGroupPermissions: (groupId?: number) =>
    apiRequest<GroupPermissionRead[]>(`/access/group-permissions${qs({ group_id: groupId, limit: 500 })}`),
  assignGroupPermission: (body: { group_id: number; permission_id: number; allowed: boolean }) =>
    apiRequest<GroupPermissionRead>("/access/group-permissions", { method: "POST", body }),
  removeGroupPermission: (linkId: number) =>
    apiRequest<void>(`/access/group-permissions/${linkId}`, { method: "DELETE" }),
};

// ─── Notifications ────────────────────────────────────────────────────────────

export const notificationsApi = {
  list: (p?: PaginationParams & { is_read?: boolean }) =>
    apiRequest<NotificationRead[]>(`/notifications${qs({ skip: 0, limit: 50, ...p })}`),

  markRead: (id: number) =>
    apiRequest<NotificationRead>(`/notifications/${id}/read`, { method: "POST" }),

  markAllRead: () =>
    apiRequest<{ updated: number }>("/notifications/read-all", { method: "POST" }),
};

// ─── System settings ──────────────────────────────────────────────────────────

export const settingsApi = {
  list: (group_name?: string) =>
    apiRequest<SettingRead[]>(`/system/settings${qs({ group_name })}`),

  update: (id: number, body: SettingUpdate) =>
    apiRequest<SettingRead>(`/system/settings/${id}`, { method: "PATCH", body }),
};

// ─── Query keys (React Query cache identifiers) ───────────────────────────────

export const qk = {
  stores: {
    all: ["stores"] as const,
    list: (p?: object) => ["stores", "list", p] as const,
    detail: (id: number) => ["stores", id] as const,
    users: (id: number) => ["stores", id, "users"] as const,
  },
  catalog: {
    productCategories: ["catalog", "product-categories"] as const,
    products: (p?: object) => ["catalog", "products", p] as const,
    product: (id: number) => ["catalog", "products", id] as const,
    productByUuid: (uuid: string) => ["catalog", "products", "uuid", uuid] as const,
    storeCategories: ["catalog", "store-categories"] as const,
  },
  clients: {
    list: (p?: object) => ["clients", p] as const,
    detail: (id: number) => ["clients", id] as const,
  },
  commandes: {
    list: (p?: object) => ["commandes", p] as const,
    detail: (id: number) => ["commandes", id] as const,
    events: (id: number) => ["commandes", id, "events"] as const,
    receptions: (id: number) => ["commandes", id, "receptions"] as const,
    anomalies: (id: number) => ["commandes", id, "anomalies"] as const,
    queuePreparation: (p?: object) => ["commandes", "queue", "preparation", p] as const,
    queueLivraison: (p?: object) => ["commandes", "queue", "livraison", p] as const,
  },
  ventes: {
    list: (p?: object) => ["ventes", p] as const,
    detail: (id: number) => ["ventes", id] as const,
  },
  creances: {
    list: (p?: object) => ["creances", p] as const,
    detail: (id: number) => ["creances", id] as const,
    payments: (creanceId?: number) => ["creances", "payments", creanceId] as const,
  },
  expenses: {
    list: (p?: object) => ["expenses", p] as const,
    detail: (id: number) => ["expenses", id] as const,
    categories: ["expenses", "categories"] as const,
  },
  settings: {
    list: (group_name?: string) => ["settings", group_name] as const,
  },
  suppliers: {
    list: (p?: object) => ["suppliers", p] as const,
    detail: (id: number) => ["suppliers", id] as const,
  },
  purchases: {
    list: (p?: object) => ["purchases", p] as const,
    detail: (id: number) => ["purchases", id] as const,
  },
  stock: {
    locations: (p?: object) => ["stock", "locations", p] as const,
    productStocks: (p?: object) => ["stock", "product-stocks", p] as const,
    movements: (p?: object) => ["stock", "movements", p] as const,
  },
  cash: {
    sessions: (p?: object) => ["cash", "sessions", p] as const,
    movements: (p?: object) => ["cash", "movements", p] as const,
  },
  users: {
    list: (p?: object) => ["users", p] as const,
    detail: (id: number) => ["users", id] as const,
    groups: (id: number) => ["users", id, "groups"] as const,
    stores: (id: number) => ["users", id, "stores"] as const,
  },
  access: {
    groups: ["access", "groups"] as const,
    permissions: (module?: string) => ["access", "permissions", module] as const,
    userGroups: (p?: object) => ["access", "user-groups", p] as const,
    groupPermissions: (groupId?: number) => ["access", "group-permissions", groupId] as const,
  },
  notifications: {
    list: (p?: object) => ["notifications", p] as const,
    unreadCount: ["notifications", "unread-count"] as const,
  },
};

// ─── Upload ───────────────────────────────────────────────────────────────────

export interface UploadResponse {
  url: string;
  public_id: string;
  width?: number;
  height?: number;
  format?: string;
  size_bytes?: number;
}

export const uploadApi = {
  image: (file: File, onProgress?: (pct: number) => void) =>
    uploadFile<UploadResponse>("/upload/image", file, "file", onProgress),
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardKpi {
  ca_jour: number; ca_mois: number; ca_mois_precedent: number;
  ventes_jour: number; ventes_mois: number; ventes_mois_precedent: number;
  produits_vendus: number;
  clients_total: number; clients_mois: number;
  stock_valeur: number; stock_rupture: number; stock_alerte: number;
  creances_actives: number; creances_montant: number;
  encaissements_jour: number; remboursements_jour: number;
  total_decaissement: number;
  caisse_solde: number | null; caisse_ouverte: boolean;
  boutiques_total: number; boutiques_actives: number;
}
export interface DashboardVenteEvolution { date: string; count: number; ca: number; }
export interface DashboardTopProduit { produit_id: number; nom: string; quantite: number; ca: number; }
export interface DashboardTopClient { client_id: number; nom: string; nb_ventes: number; ca: number; }
export interface DashboardTopBoutique { boutique_id: number; nom: string; nb_ventes: number; ca: number; }
export interface DashboardModePaiement { mode: string; label: string; montant: number; count: number; }
export interface DashboardAlerte { type: string; severity: string; message: string; count: number; link: string | null; }
export interface DashboardActivite { type: string; reference: string; montant: number | null; date: string; link: string | null; }
export interface DashboardStats {
  kpi: DashboardKpi;
  evolution_ventes: DashboardVenteEvolution[];
  top_produits: DashboardTopProduit[];
  top_clients: DashboardTopClient[];
  // Only populated for the HQ (aggregated) view — empty for a single-store
  // view (see backend DashboardService._top_boutiques).
  top_boutiques: DashboardTopBoutique[];
  modes_paiement: DashboardModePaiement[];
  alertes: DashboardAlerte[];
  activite_recente: DashboardActivite[];
}

export const dashboardApi = {
  getStats: (boutique_id?: number, period?: { date_from: string; date_to: string }) =>
    apiRequest<DashboardStats>(
      `/dashboard/stats${qs({ boutique_id, date_from: period?.date_from, date_to: period?.date_to })}`
    ),
};

// ─── Reports ──────────────────────────────────────────────────────────────────

export interface ReportsKpi {
  ca_mois: number; ca_mois_precedent: number;
  ventes_mois: number; ventes_mois_precedent: number;
  marge_pct: number; marge_pct_precedent: number;
  recouvrement_pct: number;
}
export interface RevenueMonthPoint { month: string; label: string; ca: number; ventes: number; }
export interface StockCategoryValue { category: string; valeur: number; }
export interface CollectionWeekPoint { week: string; collected: number; outstanding: number; }
export interface StoreRevenue { store_id: number; nom: string; ca: number; }
export interface SellerRevenue { vendeur_id: number; nom: string; ventes: number; ca: number; }
export interface ReportsData {
  kpi: ReportsKpi;
  revenue_trend: RevenueMonthPoint[];
  stock_by_category: StockCategoryValue[];
  collection_trend: CollectionWeekPoint[];
  store_revenue: StoreRevenue[];
  seller_revenue: SellerRevenue[];
}

export const reportsApi = {
  getData: (boutique_id?: number) =>
    apiRequest<ReportsData>(
      `/reports/data${boutique_id ? `?boutique_id=${boutique_id}` : ""}`
    ),
};
