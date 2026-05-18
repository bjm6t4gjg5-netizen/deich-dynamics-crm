/**
 * types.ts — Domain types shared across the frontend.
 *
 * These mirror the SQLite schema in server/db/init.js. They are kept here as
 * a single point of reference so changes to API responses flow through one
 * file. Strictness is deliberately mild — fields are optional/nullable where
 * the SQL schema allows NULL, so callers must narrow before use.
 */

export type Role = 'superadmin' | 'steuerberater' | 'unternehmen';

export type CustomerType = 'Kunde' | 'Interessent' | 'Partner' | 'Lieferant' | 'Inaktiv';
export type InvoiceStatus = 'Entwurf' | 'Offen' | 'Bezahlt' | 'Überfällig' | 'Storniert';
export type ExpenseStatus = 'Offen' | 'Gebucht' | 'Storniert';
export type DealStage =
  | 'Erstgespräch' | 'Bedarfsanalyse' | 'Angebot gesendet'
  | 'Verhandlung'  | 'Abschluss nah'  | 'Gewonnen' | 'Verloren';
export type MoveType = 'Eingang' | 'Ausgang' | 'Korrektur';
export type Lang = 'de' | 'en';

export interface User {
  id: string;
  email: string;
  role: Role;
  name: string;
  is_active?: number;
  created_at?: string;
  last_login?: string | null;
}

/** Module flags an Unternehmen can have enabled by its Steuerberater. */
export interface Modules {
  contacts?:  boolean;
  pipeline?:  boolean;
  invoices?:  boolean;
  expenses?:  boolean;
  inventory?: boolean;
  ai?:        boolean;
}

/** A Steuerberater's feature flags, set by superadmin. */
export interface Features {
  ai?:         boolean;
  datev?:      boolean;
  invoices?:   boolean;
  commission?: boolean;
}

/** Profile shape returned by /api/auth/me — varies by role.
 *  Steuerberater rows are extended with mail config; Unternehmen rows are
 *  decorated with their bound Steuerberater's theming when present. */
export interface Profile {
  id: string;
  firm_name: string;
  theme_color?: string;
  theme_accent?: string;
  theme_mode?: 'light' | 'dark';
  logo_url?: string | null;

  // Unternehmen-only
  legal_form?: string;
  address?: string;
  city?: string;
  plz?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  ust_id?: string;
  steuernummer?: string;
  iban?: string;
  bic?: string;
  bank_name?: string;
  modules?: string;       // JSON-encoded Modules
  vat_rate?: number;
  payment_days?: number;
  invoice_prefix?: string;
  invoice_counter?: number;
  stb_id?: string | null;
  stb_firm?: string;
  stb_color?: string;
  stb_accent?: string;
  stb_logo?: string;

  // Steuerberater-only
  commission_rate?: number;
  mail_provider?: 'smtp' | 'sendgrid' | 'resend';
  mail_host?: string;
  mail_port?: number;
  mail_user?: string;
  mail_from?: string;
  features?: string;      // JSON-encoded Features
  user_name?: string;
}

export interface Customer {
  id: string;
  unternehmen_id: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  website?: string;
  address?: string;
  city?: string;
  plz?: string;
  country?: string;
  type: CustomerType;
  group_name?: string;
  status: string;
  birthday?: string;
  tax_id?: string;
  notes?: string;
  referred_by?: string | null;
  lat?: number;
  lng?: number;
  last_contact?: string;
  created_at: string;
}

export interface Invoice {
  id: string;
  unternehmen_id: string;
  customer_id: string | null;
  invoice_number: string;
  client_name: string;
  description?: string;
  line_items?: string;
  net: number;
  vat: number;
  gross: number;
  vat_rate: number;
  status: InvoiceStatus;
  date?: string;
  due_date?: string;
  sent_at?: string;
  paid_at?: string;
  reminder_count?: number;
  reminder_sent_at?: string;
  notes?: string;
  created_at: string;
}

export interface Expense {
  id: string;
  unternehmen_id: string;
  supplier: string;
  description?: string;
  category: string;
  net: number;
  vat: number;
  gross: number;
  vat_rate: number;
  status: ExpenseStatus | string;
  expense_date?: string;
  receipt_url?: string;
  has_receipt: 0 | 1;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  unternehmen_id: string;
  sku?: string;
  name: string;
  description?: string;
  category?: string;
  unit: string;
  stock: number;
  min_stock: number;
  buy_price: number;
  sell_price: number;
  supplier?: string;
  created_at: string;
  movements?: InventoryMovement[];
}

export interface InventoryMovement {
  id: string;
  item_id: string;
  invoice_id?: string | null;
  type: MoveType;
  qty: number;
  unit_cost: number;
  note?: string;
  moved_at: string;
  item_name?: string;
}

export interface Deal {
  id: string;
  unternehmen_id: string;
  customer_id?: string | null;
  name: string;
  company?: string;
  value: number;
  probability: number;
  stage: DealStage | string;
  contact_person?: string;
  expected_close?: string;
  notes?: string;
  created_at: string;
}

export interface DashboardStats {
  revenue: number;
  openAmount: number;
  openCount: number;
  overdueAmount: number;
  overdueCount: number;
  customerCount: number;
  pipelineValue: number;
  expenses: number;
  lowStockCount: number;
  lowStockItems: InventoryItem[];
  recentInvoices: Invoice[];
  recentCustomers: Customer[];
}
