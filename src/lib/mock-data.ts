// Deterministic mock data — fully seeded, SSR-safe (no Math.random / Date.now at module scope).
// Status fields are stored as machine keys; UI translates via i18n dictionaries.

export type Role = "boss" | "manager" | "cashier";

export type Store = {
  id: string;
  name: string;
  city: string;
  manager: string;
  status: "active" | "inactive";
  revenue: number;
  stockValue: number;
  debt: number;
  staff: number;
  currency: string;
};

export type Product = {
  id: string;
  sku: string;
  name: string;
  category: string;
  purchasePrice: number;
  price: number;
  stock: number;
  reorderLevel: number;
  status: "active" | "draft" | "archived";
  image: string;
};


export type Order = {
  id: string;
  reference: string;
  store: string;
  storeId: string;
  items: number;
  total: number;
  status: "draft" | "pending" | "approved" | "rejected" | "preparing" | "delivered";
  createdAt: string; // ISO
};

export type Sale = {
  id: string;
  reference: string;
  store: string;
  cashier: string;
  customer: string;
  total: number;
  payment: "cash" | "mobile" | "credit" | "card";
  status: "completed" | "refunded" | "held";
  createdAt: string;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  purchases: number;
  balance: number;
  joined: string;
};

export type Debt = {
  id: string;
  customer: string;
  store: string;
  amount: number;
  paid: number;
  due: string;
  status: "active" | "due-soon" | "overdue" | "paid";
};

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  store: string;
  status: "active" | "suspended" | "invited";
  lastLogin: string;
};

export type Notif = {
  id: string;
  titleKey: string;
  bodyKey: string;
  params?: Record<string, string | number>;
  type: "stock" | "debt" | "order" | "system";
  unread: boolean;
  minutesAgo: number;
};

// --- Seeded PRNG (mulberry32) — deterministic across server/client. ---
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = rng(20260101);
const rand = (min: number, max: number) => Math.round(min + r() * (max - min));

// Fixed "now" so dates are deterministic between SSR and hydration.
const NOW = Date.UTC(2026, 0, 15, 9, 30, 0);
const isoBack = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const isoFwd = (msAhead: number) => new Date(NOW + msAhead).toISOString();

const cities = ["Douala", "Yaoundé", "Bafoussam", "Garoua", "Bamenda", "Limbe", "Kribi", "Dschang"];
const firstNames = ["Aïcha", "Jean", "Marie", "Samuel", "Awa", "Paul", "Esther", "Thomas", "Laure", "Eric", "Sarah", "Daniel", "Joy", "Patrick", "Mireille", "Hassan"];
const lastNames = ["Mbarga", "Nkomo", "Foka", "Tchamba", "Ndongo", "Eyenga", "Kana", "Soh", "Owona", "Bekolo", "Ngassa", "Manga", "Ze"];

const fullName = (i: number) =>
  `${firstNames[i % firstNames.length]} ${lastNames[(i * 3) % lastNames.length]}`;

const storeNames = ["Akwa Flagship", "Bonanjo Express", "Marché Central", "Bastos Boutique", "Mvog-Mbi Hub", "Riviera Outlet", "Mokolo Depot", "Bonapriso Premium"];

export const stores: Store[] = storeNames.map((name, i) => ({
  id: `st_${i + 1}`,
  name,
  city: cities[i % cities.length],
  manager: fullName(i + 2),
  status: i === 6 ? "inactive" : "active",
  revenue: 4_200_000 + rand(0, 18_000_000),
  stockValue: 8_500_000 + rand(0, 25_000_000),
  debt: rand(0, 3_500_000),
  staff: 4 + (i % 7),
  currency: "GNF",
}));

const categories = ["Beverages", "Snacks", "Hygiene", "Electronics", "Stationery", "Household", "Apparel", "Cosmetics"];
const productNames = [
  "Sprite 1.5L", "Coca-Cola 50cl", "Nestlé Cerelac 400g", "Maggi Cube 50pcs", "Indomie Chicken",
  "Top Pamplemousse", "Bingo Biscuits", "Plantain Chips 200g", "Pampers M Pack", "Always Ultra",
  "Lifebuoy Soap", "Omo Detergent 1kg", "Samsung A15", "Tecno Spark 20", "Itel Power Bank",
  "Bic Cristal Pen", "School Notebook 200p", "Stapler Heavy", "Coton-Tige x100", "Vaseline 100ml",
  "Nivea Body Lotion", "Dove Shampoo 250ml", "Palmolive Gel", "Colgate Total", "Sensodyne 75ml",
];

const productKeywords: Record<string, string> = {
  "Sprite 1.5L": "soda,bottle",
  "Coca-Cola 50cl": "cola,bottle",
  "Nestlé Cerelac 400g": "baby,cereal",
  "Maggi Cube 50pcs": "bouillon,cube",
  "Indomie Chicken": "instant,noodles",
  "Top Pamplemousse": "grapefruit,soda",
  "Bingo Biscuits": "biscuits,cookies",
  "Plantain Chips 200g": "plantain,chips",
  "Pampers M Pack": "diapers,baby",
  "Always Ultra": "hygiene,pads",
  "Lifebuoy Soap": "soap,bar",
  "Omo Detergent 1kg": "detergent,laundry",
  "Samsung A15": "smartphone,android",
  "Tecno Spark 20": "smartphone,phone",
  "Itel Power Bank": "powerbank,charger",
  "Bic Cristal Pen": "pen,stationery",
  "School Notebook 200p": "notebook,school",
  "Stapler Heavy": "stapler,office",
  "Coton-Tige x100": "cotton,swab",
  "Vaseline 100ml": "vaseline,cream",
  "Nivea Body Lotion": "lotion,bottle",
  "Dove Shampoo 250ml": "shampoo,bottle",
  "Palmolive Gel": "shower,gel",
  "Colgate Total": "toothpaste,tube",
  "Sensodyne 75ml": "toothpaste,dental",
};

export const products: Product[] = productNames.map((name, i) => {
  const purchase = 250 + rand(0, 15_000);
  const kw = productKeywords[name] ?? "product";
  return {
    id: `pr_${i + 1}`,
    sku: `SKU-${(1000 + i).toString()}`,
    name,
    category: categories[i % categories.length],
    purchasePrice: purchase,
    price: Math.round(purchase * (1.18 + r() * 0.4)),
    stock: rand(0, 320),
    reorderLevel: 30,
    status: i % 11 === 0 ? "draft" : "active",
    image: `https://loremflickr.com/400/400/${encodeURIComponent(kw)}?lock=${i + 1}`,
  };
});


export const orders: Order[] = Array.from({ length: 18 }, (_, i) => {
  const statuses: Order["status"][] = ["pending", "approved", "preparing", "delivered", "rejected", "draft"];
  const store = stores[i % stores.length];
  return {
    id: `or_${i + 1}`,
    reference: `PO-2025-${(2400 + i).toString()}`,
    store: store.name,
    storeId: store.id,
    items: 3 + (i % 14),
    total: 180_000 + rand(0, 3_400_000),
    status: statuses[i % statuses.length],
    createdAt: isoBack(i * 86400_000 * 1.3),
  };
});

export const sales: Sale[] = Array.from({ length: 24 }, (_, i) => {
  const payments: Sale["payment"][] = ["cash", "mobile", "credit", "card"];
  const store = stores[i % stores.length];
  return {
    id: `sa_${i + 1}`,
    reference: `RC-${(98_300 + i).toString()}`,
    store: store.name,
    cashier: fullName(i),
    customer: i % 3 === 0 ? "__walkin__" : fullName(i + 5),
    total: 2_400 + rand(0, 145_000),
    payment: payments[i % payments.length],
    status: i % 17 === 0 ? "refunded" : "completed",
    createdAt: isoBack(i * 3600_000 * 4),
  };
});

export const customers: Customer[] = Array.from({ length: 14 }, (_, i) => ({
  id: `cu_${i + 1}`,
  name: fullName(i),
  phone: `+237 6${(80_000_000 + i * 314_159).toString().slice(0, 8)}`,
  email: `${firstNames[i % firstNames.length].toLowerCase()}@mail.cm`,
  city: cities[i % cities.length],
  purchases: 2 + (i % 22),
  balance: rand(-200_000, 650_000),
  joined: isoBack(i * 86400_000 * 23),
}));

export const debts: Debt[] = Array.from({ length: 12 }, (_, i) => {
  const statuses: Debt["status"][] = ["active", "due-soon", "overdue", "paid", "active", "overdue"];
  const amount = 50_000 + rand(0, 720_000);
  return {
    id: `de_${i + 1}`,
    customer: customers[i % customers.length].name,
    store: stores[i % stores.length].name,
    amount,
    paid: Math.round(amount * (r() * 0.7)),
    due: new Date(NOW + (i - 4) * 86400_000 * 6).toISOString(),
    status: statuses[i % statuses.length],
  };
});

export const users: User[] = [
  { id: "u_1", name: "Hassan Mbarga", email: "boss@retail.cm", role: "boss", store: "HQ", status: "active", lastLogin: isoBack(60_000) },
  ...stores.flatMap((s, i) => [
    { id: `u_m${i}`, name: s.manager, email: `manager${i}@retail.cm`, role: "manager" as Role, store: s.name, status: "active" as const, lastLogin: isoBack(i * 3600_000) },
    { id: `u_c${i}a`, name: fullName(i + 1), email: `cashier${i}a@retail.cm`, role: "cashier" as Role, store: s.name, status: "active" as const, lastLogin: isoBack(i * 7200_000) },
    { id: `u_c${i}b`, name: fullName(i + 6), email: `cashier${i}b@retail.cm`, role: "cashier" as Role, store: s.name, status: i === 3 ? ("suspended" as const) : ("active" as const), lastLogin: isoBack(i * 9600_000) },
  ]),
];

export const notifications: Notif[] = [
  { id: "n1", titleKey: "notif.lowStock.title", bodyKey: "notif.lowStock.body", params: { product: "Indomie Chicken", store: "Bonanjo Express", units: 12 }, type: "stock", unread: true, minutesAgo: 12 },
  { id: "n2", titleKey: "notif.orderApproved.title", bodyKey: "notif.orderApproved.body", params: { ref: "PO-2025-2407", store: "Akwa Flagship" }, type: "order", unread: true, minutesAgo: 34 },
  { id: "n3", titleKey: "notif.overdueDebt.title", bodyKey: "notif.overdueDebt.body", params: { customer: "Marie Foka", amount: "184 500 GNF", days: 6 }, type: "debt", unread: true, minutesAgo: 62 },
  { id: "n4", titleKey: "notif.newOrder.title", bodyKey: "notif.newOrder.body", params: { store: "Mvog-Mbi Hub" }, type: "order", unread: false, minutesAgo: 180 },
  { id: "n5", titleKey: "notif.outOfStock.title", bodyKey: "notif.outOfStock.body", params: { product: "Pampers M Pack", store: "Riviera Outlet" }, type: "stock", unread: false, minutesAgo: 1440 },
  { id: "n6", titleKey: "notif.backup.title", bodyKey: "notif.backup.body", type: "system", unread: false, minutesAgo: 1500 },
];

// Revenue time-series (last 12 months) — month is a translation key.
export const revenueSeries = [
  { mKey: "month.jan", revenue: 18.2, sales: 12.4 },
  { mKey: "month.feb", revenue: 21.4, sales: 14.1 },
  { mKey: "month.mar", revenue: 19.8, sales: 13.2 },
  { mKey: "month.apr", revenue: 23.7, sales: 15.8 },
  { mKey: "month.may", revenue: 26.1, sales: 17.2 },
  { mKey: "month.jun", revenue: 24.5, sales: 16.4 },
  { mKey: "month.jul", revenue: 28.3, sales: 18.7 },
  { mKey: "month.aug", revenue: 31.6, sales: 20.9 },
  { mKey: "month.sep", revenue: 29.8, sales: 19.6 },
  { mKey: "month.oct", revenue: 33.4, sales: 22.1 },
  { mKey: "month.nov", revenue: 36.2, sales: 24.3 },
  { mKey: "month.dec", revenue: 41.7, sales: 28.6 },
];

export const inventoryByCategory = categories.slice(0, 6).map((c, i) => ({
  category: c,
  value: 12 + rand(0, 38),
  units: 200 + rand(0, 1400),
  _i: i,
}));

export const collectionSeries = [
  { week: "S1", collected: 62, outstanding: 38 },
  { week: "S2", collected: 71, outstanding: 29 },
  { week: "S3", collected: 58, outstanding: 42 },
  { week: "S4", collected: 78, outstanding: 22 },
  { week: "S5", collected: 84, outstanding: 16 },
  { week: "S6", collected: 76, outstanding: 24 },
];

// Currency-aware formatters. Number formatting is locale-stable (fr-FR) to
// keep SSR output deterministic; the currency suffix reads the active code
// at call time (see src/lib/currency.ts).
import { getCurrency } from "./currency";
const xafFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
export const fmtXAF = (n: number) => `${xafFmt.format(n)} ${getCurrency()}`;
export const fmtMoney = fmtXAF;

const compactFmt = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
export const fmtCompact = (n: number) => compactFmt.format(n);
export const fmtCompactCur = (n: number) => `${compactFmt.format(n)} ${getCurrency()}`;

