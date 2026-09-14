/**
 * TypeScript types mirroring the FastAPI backend Pydantic schemas.
 * Source of truth: backend/app/modules/{module}/schemas.py + database/enums.py
 */

// ─── Shared ──────────────────────────────────────────────────────────────────

export type RecordStatus = "active" | "inactive" | "archived";
export type UserStatus = "active" | "inactive" | "suspended" | "invited";

export interface EntityRead {
  id: number;
  uuid: string;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
}

export interface PaginationParams {
  skip?: number;
  limit?: number;
}

// ─── Auth / Users ─────────────────────────────────────────────────────────────

export interface UserRead {
  id: number;
  uuid: string;
  firstname: string;
  lastname: string;
  email: string;
  phone: string | null;
  address: string | null;
  avatar: string | null;
  status: UserStatus;
  is_activated: boolean;
  email_verified: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserCreate {
  firstname: string;
  lastname: string;
  email: string;
  phone?: string;
  address?: string;
  avatar?: string;
  password: string;
  status?: UserStatus;
  is_activated?: boolean;
  send_credentials?: boolean;
}

export interface UserUpdate {
  firstname?: string;
  lastname?: string;
  email?: string;
  phone?: string;
  address?: string;
  avatar?: string;
  password?: string;
  status?: UserStatus;
  is_activated?: boolean;
  must_change_password?: boolean;
}

// ─── Stores ───────────────────────────────────────────────────────────────────

export interface StoreRead extends EntityRead {
  name: string;
  slug: string;
  code: string | null;
  description: string | null;
  logo: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  timezone: string;
  devise: string;
  /** Cahier des charges §6.1/§9.2 — taux de remise max autorisé pour les
   * gérants de cette boutique. null = pas de plafond configuré. */
  remise_max_percent: number | null;
  gerant_id: number | null;
  category_store_id: number | null;
  created_by: number | null;
}

export interface StoreCreate {
  name: string;
  slug?: string;
  code?: string;
  description?: string;
  logo?: string;
  address?: string;
  city?: string;
  phone?: string;
  timezone?: string;
  devise?: string;
  remise_max_percent?: number | null;
  gerant_id?: number;
  category_store_id?: number;
}

export interface StoreUpdate extends Partial<StoreCreate> {}

export interface StoreUserRead extends EntityRead {
  store_id: number;
  user_id: number;
  role_id: number | null;
}

export interface StoreUserCreate {
  store_id: number;
  user_id: number;
  role_id?: number;
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

export interface CategoryProductRead extends EntityRead {
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  created_by: number | null;
}

export interface CategoryProductCreate {
  name: string;
  slug?: string;
  description?: string;
  image?: string;
}

export interface CategoryProductUpdate extends Partial<CategoryProductCreate> {}

export interface ProductRead extends EntityRead {
  name: string;
  slug: string;
  sku: string | null;
  barcode: string | null;
  brand: string | null;
  unit_of_measure: string | null;
  tva: number;
  description: string | null;
  images: string[] | null;
  prix_vente: number;
  prix_achat: number;
  category_product_id: number | null;
  created_by: number | null;
}

export interface ProductCreate {
  name: string;
  slug?: string;
  sku?: string;
  barcode?: string;
  brand?: string;
  unit_of_measure?: string;
  tva?: number;
  description?: string;
  images?: string[];
  prix_vente: number;
  prix_achat: number;
  category_product_id?: number;
}

export interface ProductUpdate extends Partial<ProductCreate> {}

export interface CategoryStoreRead extends EntityRead {
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  created_by: number | null;
}

// ─── Clients ──────────────────────────────────────────────────────────────────

export type ClientType = "particulier" | "entreprise";

export interface ClientRead extends EntityRead {
  code_client: string;
  name: string;
  prenom: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  ville: string | null;
  type_client: ClientType;
  entreprise: string | null;
  notes: string | null;
  /** Decimal serialized as string by Pydantic v2 */
  plafond_credit: string;
  store_id: number | null;
  created_by: number | null;
  // Denormalized at read time — the Boss must see which boutique a client
  // belongs to without a second lookup.
  store_name?: string | null;
}

export interface ClientCreate {
  name: string;
  prenom?: string;
  /** At least phone or email is required */
  phone?: string;
  email?: string;
  address?: string;
  ville?: string;
  type_client?: ClientType;
  entreprise?: string;
  notes?: string;
  plafond_credit?: number;
  store_id?: number;
}

export interface ClientUpdate extends Partial<ClientCreate> {}

// ─── Commandes (internal réappro: Boutique → Central stock) ───────────────────

export type CommandeStatut =
  | "brouillon"
  | "en_attente"
  | "validee"
  | "rejetee"
  | "proforma_generee"
  | "proforma_rejetee"
  | "facture_generee"
  | "en_preparation"
  | "pret_a_expedier"
  | "expedie"
  | "livree"
  | "reception_confirmee"
  | "partiellement_recu"
  | "annulee";

export type CommandeEvenementType =
  | "creation"
  | "soumission"
  | "validation"
  | "refus"
  | "proforma"
  | "proforma_acceptee"
  | "proforma_rejetee"
  | "proforma_resoumise"
  | "facture"
  | "preparation"
  | "expedition"
  | "livraison"
  | "reception"
  | "anomalie"
  | "quantites_modifiees"
  | "produit_resolu"
  | "commentaire"
  | "annulation";

export type CommandeReceptionStatut = "accepte" | "refuse" | "partiel";

export type CommandeAnomalieType =
  | "quantite_manquante"
  | "produit_casse"
  | "erreur_preparation"
  | "autre";

export interface CommandeLigneRead extends EntityRead {
  commande_id: number;
  produit_id: number | null;
  nom_libre: string | null;
  quantite_demandee: number;
  quantite_validee: number;
  quantite_livree: number;
  quantite_recue: number;
  prix_unitaire: number;
  total_ligne: number;
  observation: string | null;
}

export interface CommandeLivraisonRead extends EntityRead {
  commande_id: number;
  numero_bon_preparation: string | null;
  preparateur_id: number | null;
  prepared_at: string | null;
  transporteur: string | null;
  livreur_id: number | null;
  livreur_nom: string | null;
  numero_bon_livraison: string | null;
  date_expedition: string | null;
  date_livraison: string | null;
  qr_content: string | null;
  code_barre: string | null;
  signature_hq_by: number | null;
  signature_hq_at: string | null;
  signature_boutique_by: number | null;
  signature_boutique_at: string | null;
}

export interface CommandeRead extends EntityRead {
  boutique_id: number;
  created_by: number | null;
  validated_by: number | null;
  statut: CommandeStatut;
  numero: string | null;
  montant_total: number;
  montant_ht: number;
  tva_taux: number;
  montant_tva: number;
  montant_ttc: number;
  numero_proforma: string | null;
  numero_facture: string | null;
  refus_motif: string | null;
  refused_by: number | null;
  refused_at: string | null;
  proforma_refus_motif: string | null;
  proforma_refused_by: number | null;
  proforma_refused_at: string | null;
  validated_at: string | null;
  delivered_at: string | null;
  lignes: CommandeLigneRead[];
  livraison: CommandeLivraisonRead | null;
}

export interface CommandeEvenementRead {
  id: number;
  uuid: string;
  created_at: string;
  commande_id: number;
  type_evenement: CommandeEvenementType;
  acteur_id: number | null;
  commentaire: string | null;
  ip_address: string | null;
  metadata: Record<string, unknown> | null;
}

export interface CommandeReceptionRead extends EntityRead {
  commande_id: number;
  recu_par: number | null;
  date_reception: string | null;
  statut_reception: CommandeReceptionStatut;
  commentaire: string | null;
}

export interface CommandeAnomalieRead extends EntityRead {
  commande_id: number;
  reception_id: number | null;
  ligne_id: number | null;
  type_anomalie: CommandeAnomalieType;
  quantite_ecart: number;
  description: string | null;
  created_by: number | null;
  resolved: boolean;
}

/** Exactly one of `produit_id` (real catalog product) or `nom_libre` (not yet
 * in the catalog — the Boss must resolve it via `commandesApi.resolveLigne`
 * before the commande can be validated) must be set. */
export interface CommandeLigneCreate {
  produit_id?: number;
  nom_libre?: string;
  quantite_demandee: number;
  prix_unitaire?: number;
  observation?: string;
}

export interface CommandeCreate {
  boutique_id: number;
  lignes: CommandeLigneCreate[];
}

export interface CommandeValidate {
  quantites_validees?: Record<number, number>;
  commentaire?: string;
}

export interface CommandeRefuse {
  motif: string;
}

export interface CommandeLigneResolve {
  produit_id: number;
}

export interface CommandeShip {
  transporteur: string;
  livreur_id?: number;
  livreur_nom?: string;
}

export interface CommandeAnomalieCreate {
  ligne_id?: number;
  type_anomalie: CommandeAnomalieType;
  quantite_ecart?: number;
  description?: string;
}

export interface CommandeReceptionCreate {
  statut_reception: CommandeReceptionStatut;
  commentaire?: string;
  lignes: Record<number, number>;
  anomalies?: CommandeAnomalieCreate[];
}

// ─── Ventes ───────────────────────────────────────────────────────────────────

export type VenteType = "directe" | "credit";
export type VenteStatut =
  // Devis (cahier des charges §9.1-§9.3) — no stock/payment impact yet.
  | "proforma"
  | "proforma_expiree"
  | "proforma_rejetee"
  | "en_cours"
  | "completee"
  | "partiellement_payee"
  | "impayee"
  | "annulee"
  | "partiellement_retournee"
  | "retournee"
  | "partiellement_remboursee"
  | "remboursee";

/** Whether the goods have physically left the boutique — entirely
 * independent from VenteStatut (payment). A credit sale with an
 * outstanding balance can still be `livre` the moment the goods are
 * handed over; a fully-paid sale can stay `non_livre` until collected. */
export type VenteLivraisonStatut = "livre" | "non_livre";

export interface VenteLigneRead extends EntityRead {
  vente_id: number;
  produit_id: number;
  quantite: number;
  prix_unitaire: number;
  remise: number;
  total_ligne: number;
}

export interface VenteRead extends EntityRead {
  boutique_id: number;
  vendeur_id: number | null;
  client_id: number | null;
  type_vente: VenteType;
  remise: number;
  statut: VenteStatut;
  montant_total: number;
  /** Computed by the backend — sum of `paiements`. */
  montant_paye: number;
  /** Computed by the backend — montant_total - montant_paye, floored at 0. */
  montant_restant: number;
  numero_proforma: string | null;
  numero_facture: string | null;
  proforma_valide_jusquau: string | null;
  proforma_refus_motif: string | null;
  proforma_refused_by: number | null;
  proforma_refused_at: string | null;
  facture_by: number | null;
  facture_at: string | null;
  livraison_statut: VenteLivraisonStatut;
  numero_bon_livraison: string | null;
  livree_at: string | null;
  livree_by: number | null;
  lignes: VenteLigneRead[];
  paiements: PaiementRead[];
  creance: CreanceRead | null;
  // Denormalized at read time — only set on the list endpoint (see backend
  // VenteService.list_enriched); unset on get/create/void, where the
  // frontend already resolves the store name itself.
  store_name?: string | null;
}

export interface VenteLigneCreate {
  produit_id: number;
  quantite: number;
  prix_unitaire: number;
  remise?: number;
}

/** One actually-received payment at sale time — never the unpaid remainder,
 * which becomes a Creance automatically server-side instead. */
export interface VentePaiementCreate {
  mode: PaiementMode;
  montant: number;
  reference?: string;
}

export interface VenteCreate {
  boutique_id: number;
  client_id?: number;
  type_vente?: VenteType;
  remise?: number;
  lignes: VenteLigneCreate[];
  paiements: VentePaiementCreate[];
  /** Defaults to "livre" (goods leave right away) server-side if omitted. */
  livraison_statut?: VenteLivraisonStatut;
}

// ── Proforma (devis) — cahier des charges §9.1-§9.3 ─────────────────────────
// A proforma never carries paiements: "la proforma n'impacte pas le stock"
// (§9.1), and no payment is ever taken against a mere quote either.

export interface VenteProformaCreate {
  boutique_id: number;
  client_id?: number;
  remise?: number;
  lignes: VenteLigneCreate[];
  /** Validity window in days (§9.1) — defaults to 7 server-side. */
  validite_jours?: number;
}

/** Re-price a still-open proforma after client negotiation (§9.2) —
 * replaces the lines and/or the global remise wholesale. */
export interface VenteProformaUpdate {
  remise?: number;
  lignes?: VenteLigneCreate[];
}

export interface VenteProformaReject {
  motif: string;
}

/** Turns an open proforma into the facture définitive (§9.3). Payment is
 * optional — an empty list just leaves the whole amount as a créance. */
export interface VenteTransformRequest {
  paiements: VentePaiementCreate[];
  livraison_statut?: VenteLivraisonStatut;
}

// ─── Retours ──────────────────────────────────────────────────────────────────

export interface VenteRetourLigneCreate {
  vente_ligne_id: number;
  quantite: number;
}

export interface VenteRetourLigneRead {
  id: number;
  vente_ligne_id: number;
  produit_id: number;
  quantite: number;
  prix_unitaire: number;
  total_ligne: number;
}

export interface VenteRetourCreate {
  lignes: VenteRetourLigneCreate[];
  motif: string;
  notes?: string;
}

export interface VenteRetourRead extends EntityRead {
  vente_id: number;
  vendeur_id: number | null;
  motif: string;
  notes: string | null;
  total_retourne: number;
  lignes: VenteRetourLigneRead[];
}

// ─── Remboursements ───────────────────────────────────────────────────────────

export interface VenteRemboursementCreate {
  montant: number;
  mode: PaiementMode;
  reference?: string;
  motif: string;
  notes?: string;
  retour_id?: number;
}

export interface VenteRemboursementRead extends EntityRead {
  vente_id: number;
  retour_id: number | null;
  vendeur_id: number | null;
  montant: number;
  mode: PaiementMode;
  reference: string | null;
  motif: string;
  notes: string | null;
}

// ─── Créances ─────────────────────────────────────────────────────────────────

export type CreanceStatut = "active" | "partiellement_payee" | "soldee" | "en_retard" | "annulee";

export type PaiementMode = "especes" | "mobile_money" | "carte" | "virement" | "cheque";

export interface CreanceRead extends EntityRead {
  vente_id: number | null;
  client_id: number;
  boutique_id: number;
  montant_initial: number;
  montant_restant: number;
  date_echeance: string | null;
  statut: CreanceStatut;
  derniere_relance_at: string | null;
  nombre_relances: number;
  // Denormalized at read time — absent (undefined) when nested under
  // VenteRead.creance (that path never enriches), always present when read
  // from GET/POST/PATCH /creances directly.
  client_name?: string | null;
  client_phone?: string | null;
  store_name?: string | null;
}

export interface RelanceCreate {
  moyen?: string;
  notes?: string;
}

export interface AgedBalanceBucket {
  tranche: "0-30" | "31-60" | "61-90" | "90+";
  montant: number;
}

export interface CreanceCreate {
  client_id: number;
  boutique_id: number;
  montant_initial: number;
  vente_id?: number;
  montant_restant?: number;
  date_echeance?: string;
}

export interface PaiementRead extends EntityRead {
  vente_id: number | null;
  creance_id: number | null;
  montant: number;
  mode: PaiementMode;
  reference: string | null;
}

export interface PaiementCreate {
  montant: number;
  mode?: PaiementMode;
  reference?: string;
  vente_id?: number;
  creance_id?: number;
}

// ─── Stock ────────────────────────────────────────────────────────────────────

export type StockLocationType = "CENTRAL" | "STORE" | "WAREHOUSE";

export type MovementType = "IN" | "OUT" | "TRANSFER" | "ADJUSTMENT";

export type MovementReason =
  | "STOCK_INITIAL"
  | "PURCHASE"
  | "SALE"
  | "RETURN"
  | "DAMAGE"
  | "LOSS"
  | "THEFT"
  | "INVENTORY"
  | "REAPPRO"
  | "OTHER";

export interface StockLocationRead extends EntityRead {
  name: string;
  type: StockLocationType;
  store_id: number | null;
  created_by: number | null;
}

// ─── Caisse ────────────────────────────────────────────────────────────────────

export type CashSessionStatus = "ouverte" | "fermee";
export type CashMovementType = "entree" | "sortie";

export interface CashSessionRead {
  id: number;
  uuid: string;
  store_id: number;
  opened_by: number | null;
  closed_by: number | null;
  opening_amount: number;
  closing_amount: number | null;
  expected_amount: number | null;
  difference_amount: number | null;
  status: CashSessionStatus;
  opened_at: string;
  closed_at: string | null;
}

export interface CashSessionOpen {
  store_id: number;
  opening_amount?: number;
}

export interface CashSessionClose {
  closing_amount: number;
}

export interface CashMovementRead {
  id: number;
  uuid: string;
  created_at: string;
  cash_session_id: number;
  type: CashMovementType;
  amount: number;
  reason: string | null;
  reference_type: string | null;
  reference_id: number | null;
  created_by: number | null;
  cancelled_at: string | null;
  cancelled_by: number | null;
  cancel_reason: string | null;
  reverses_movement_id: number | null;
}

export interface CashMovementCancel {
  motif: string;
}

export interface StockLocationCreate {
  name: string;
  type: StockLocationType;
  store_id?: number;
}

export interface ProductStockRead extends EntityRead {
  product_id: number;
  location_id: number;
  quantity: number;
  alert_threshold: number;
}

export interface ProductStockUpdate {
  alert_threshold?: number;
}

export interface AddStockRequest {
  product_id: number;
  location_id: number;
  quantity: number;
  alert_threshold?: number;
  reason?: MovementReason;
  unit_cost?: number;
  reference?: string;
  notes?: string;
}

export interface AdjustStockRequest {
  product_id: number;
  location_id: number;
  physical_count: number;
  alert_threshold?: number;
  reason?: MovementReason;
  notes?: string;
}

export interface TransferStockRequest {
  product_id: number;
  from_location_id: number;
  to_location_id: number;
  quantity: number;
  dest_alert_threshold?: number;
  notes?: string;
}

export interface TransferStockResult {
  from_stock: ProductStockRead;
  to_stock: ProductStockRead;
}

export interface StockMovementRead {
  id: number;
  uuid: string;
  product_id: number;
  from_location_id: number | null;
  to_location_id: number | null;
  movement_type: MovementType;
  reason: MovementReason | null;
  quantity: number;
  quantity_before: number;
  quantity_after: number;
  unit_cost: number | null;
  total_cost: number | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
  created_by: number | null;
}

// ─── Access / RBAC ────────────────────────────────────────────────────────────

export interface RoleRead extends EntityRead {
  name: string;
  description: string | null;
}

export interface GroupRead extends EntityRead {
  name: string;
  slug: string;
  description: string | null;
}

export interface PermissionRead extends EntityRead {
  name: string;
  slug: string;
  module: string;
  description: string | null;
}

export interface UserGroupRead extends EntityRead {
  user_id: number;
  group_id: number;
}

export interface GroupPermissionRead extends EntityRead {
  group_id: number;
  permission_id: number;
  allowed: boolean;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationType = "stock" | "commande" | "vente" | "creance" | "paiement" | "systeme";

// A LogRead resource (append-only), not an EntityRead — no status/updated_at.
export interface NotificationRead {
  id: number;
  uuid: string;
  created_at: string;
  user_id: number;
  title: string;
  message: string | null;
  type: NotificationType;
  is_read: boolean;
  read_at: string | null;
  link: string | null;
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

export interface ExpenseCategoryRead extends EntityRead {
  name: string;
  slug: string;
  description: string | null;
}

export interface ExpenseCategoryCreate {
  name: string;
  slug?: string;
  description?: string;
}

export interface ExpenseRead extends EntityRead {
  store_id: number | null;
  category_id: number | null;
  category_label: string | null;
  montant: number;
  description: string | null;
  payment_mode: PaiementMode;
  receipt_url: string | null;
  created_by: number | null;
  // Denormalized at read time — the Boss must see which boutique spent what
  // without a second lookup.
  store_name?: string | null;
}

export interface ExpenseCreate {
  montant: number;
  category_id?: number;
  category_label?: string;
  store_id?: number;
  description: string;
  payment_mode?: PaiementMode;
  receipt_url?: string;
}

export interface ExpenseUpdate {
  montant?: number;
  category_id?: number;
  category_label?: string;
  store_id?: number;
  description?: string;
  payment_mode?: PaiementMode;
  receipt_url?: string;
}

// ─── System settings ──────────────────────────────────────────────────────────

export type SettingType = "string" | "number" | "boolean" | "json";

export interface SettingRead {
  id: number;
  uuid: string;
  key: string;
  value: string | null;
  value_type: SettingType;
  group_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface SettingUpdate {
  value?: string;
  value_type?: SettingType;
  group_name?: string;
}

// ─── Activity log (journal d'activité — cahier des charges §14) ──────────────

export interface ActivityLogRead {
  id: number;
  uuid: string;
  created_at: string;
  user_id: number | null;
  action: string;
  module: string | null;
  reference_type: string | null;
  reference_id: number | null;
  boutique_id: number | null;
  ip_address: string | null;
  user_agent: string | null;
  user_name: string | null;
}

// ─── Transferts inter-boutiques (cahier des charges §7.4/§12) ────────────────

export type TransfertStatut = "en_transit" | "receptionne" | "receptionne_avec_ecart" | "annule";

export interface TransfertLigneRead extends EntityRead {
  transfert_id: number;
  produit_id: number;
  quantite_envoyee: number;
  quantite_recue: number;
  observation: string | null;
}

export interface TransfertRead extends EntityRead {
  boutique_source_id: number | null;
  boutique_destination_id: number | null;
  created_by: number | null;
  receptionne_par: number | null;
  annule_par: number | null;
  numero: string;
  statut: TransfertStatut;
  motif: string | null;
  annule_motif: string | null;
  expedie_at: string | null;
  receptionne_at: string | null;
  annule_at: string | null;
  lignes: TransfertLigneRead[];
  boutique_source_name: string | null;
  boutique_destination_name: string | null;
}

export interface TransfertLigneCreate {
  produit_id: number;
  quantite: number;
}

export interface TransfertCreate {
  boutique_source_id?: number | null;
  source_est_principale?: boolean;
  boutique_destination_id?: number | null;
  destination_est_principale?: boolean;
  motif?: string;
  lignes: TransfertLigneCreate[];
}

export interface TransfertReceptionLigne {
  ligne_id: number;
  quantite_recue: number;
  observation?: string;
}

export interface TransfertReceive {
  lignes: TransfertReceptionLigne[];
}

export interface TransfertCancel {
  motif: string;
}
