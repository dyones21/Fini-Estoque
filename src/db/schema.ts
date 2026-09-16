import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  doublePrecision,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * ARCHITECTURAL NOTE - MULTI-TENANT ROADMAP:
 * O sistema opera atualmente em arquitetura Single-Tenant dedicada exclusivamente para "Fini Nova Friburgo".
 * A modelagem multi-empresa real (com adição de coluna 'tenant_id' nas tabelas products, stock_movements,
 * nf_entries, sales e users, além do isolamento por tenant no banco) fica reservada para uma fase futura de expansão SaaS.
 */

// Company Info Table (Single Enterprise Settings)
export const companyInfo = pgTable('company_info', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  tradeName: text('trade_name').default(''),
  cnpj: text('cnpj').notNull(),
  address: text('address').default(''),
  city: text('city').notNull(),
  state: text('state').notNull(),
  defaultMarkupPercent: doublePrecision('default_markup_percent').notNull().default(85),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Categories Table
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Roles Table (Dynamic RBAC)
export const roles = pgTable('roles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  isSystemRole: boolean('is_system_role').notNull().default(false),
  canViewDashboard: boolean('can_view_dashboard').notNull().default(false),
  canViewStock: boolean('can_view_stock').notNull().default(false),
  canManageProducts: boolean('can_manage_products').notNull().default(false),
  canAddNFEntries: boolean('can_add_nf_entries').notNull().default(false),
  canDeleteNFEntries: boolean('can_delete_nf_entries').notNull().default(false),
  canTransferStock: boolean('can_transfer_stock').notNull().default(false),
  canRegisterMovements: boolean('can_register_movements').notNull().default(false),
  canManageUsers: boolean('can_manage_users').notNull().default(false),
  canManageBackup: boolean('can_manage_backup').notNull().default(false),
  canManageCompany: boolean('can_manage_company').notNull().default(false),
  canWipeSystem: boolean('can_wipe_system').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// Users Table (Supabase Auth sync)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  name: text('name').default('Usuário Fini'),
  role: text('role').default('Operador Depósito/Loja'),
  roleId: text('role_id').references(() => roles.id),
  pin: text('pin'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Products Table
export const products = pgTable('products', {
  id: text('id').primaryKey(),
  sku: text('sku').notNull(),
  ean: text('ean').notNull(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  unit: text('unit').notNull(),
  stockDeposito: integer('stock_deposito').notNull().default(0),
  stockLoja: integer('stock_loja').notNull().default(0),
  minStockDeposito: integer('min_stock_deposito').notNull().default(10),
  minStockLoja: integer('min_stock_loja').notNull().default(5),
  costPrice: doublePrecision('cost_price').notNull().default(0),
  sellPrice: doublePrecision('sell_price').notNull().default(0),
  expirationDate: text('expiration_date').notNull(),
  batchNumber: text('batch_number').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Stock Movements Table
export const stockMovements = pgTable('stock_movements', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull(),
  productName: text('product_name').notNull(),
  type: text('type').notNull(), // 'Entrada NF', 'Transferência Interna', 'Venda Directa Loja', 'Ajuste / Perda'
  origin: text('origin').notNull(), // 'Depósito Central', 'Loja Nova Friburgo', 'Fornecedor NF', 'Cliente Final'
  destination: text('destination').notNull(),
  quantity: integer('quantity').notNull(),
  previousQuantity: integer('previous_quantity'),
  lossCategory: text('loss_category'),
  batchNumber: text('batch_number').notNull(),
  reason: text('reason').notNull(),
  createdBy: text('created_by').notNull(),
  timestamp: text('timestamp').notNull(),
  nfEntryId: text('nf_entry_id'),
});

// NF Entries Table
export const nfEntries = pgTable(
  'nf_entries',
  {
    id: text('id').primaryKey(),
    numberNF: text('number_nf').notNull(),
    accessKey: text('access_key').default(''),
    supplier: text('supplier').notNull(),
    cnpjSupplier: text('cnpj_supplier').notNull(),
    issueDate: text('issue_date').notNull(),
    totalValue: doublePrecision('total_value').notNull(),
    notes: text('notes').default(''),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('nf_entries_access_key_unique_idx')
      .on(table.accessKey)
      .where(sql`${table.accessKey} != '' AND ${table.accessKey} IS NOT NULL`),
  ]
);

// NF Items Table
export const nfItems = pgTable('nf_items', {
  id: serial('id').primaryKey(),
  nfId: text('nf_id')
    .references(() => nfEntries.id, { onDelete: 'cascade' })
    .notNull(),
  productId: text('product_id').notNull(),
  productName: text('product_name').notNull(),
  quantity: integer('quantity').notNull(),
  costPrice: doublePrecision('cost_price').notNull(),
  totalCost: doublePrecision('total_cost').notNull(),
  batchNumber: text('batch_number').notNull(),
  expirationDate: text('expiration_date').notNull(),
  freightAllocated: doublePrecision('freight_allocated').notNull().default(0),
  insuranceAllocated: doublePrecision('insurance_allocated').notNull().default(0),
  otherExpensesAllocated: doublePrecision('other_expenses_allocated').notNull().default(0),
  discountAllocated: doublePrecision('discount_allocated').notNull().default(0),
  icmsStAllocated: doublePrecision('icms_st_allocated').notNull().default(0),
  ipiAllocated: doublePrecision('ipi_allocated').notNull().default(0),
  iiAllocated: doublePrecision('ii_allocated').notNull().default(0),
  difalAllocated: doublePrecision('difal_allocated').notNull().default(0),
  recoverableTaxesAllocated: doublePrecision('recoverable_taxes_allocated').notNull().default(0),
});

// Store Sales Table
export const storeSales = pgTable('store_sales', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull(),
  productName: text('product_name').notNull(),
  quantity: integer('quantity').notNull(),
  unitPrice: doublePrecision('unit_price').notNull(),
  totalAmount: doublePrecision('total_amount').notNull(),
  paymentMethod: text('payment_method').notNull(), // 'Dinheiro', 'PIX', 'Cartão de Débito', 'Cartão de Crédito'
  sellerName: text('seller_name').notNull(),
  timestamp: text('timestamp').notNull(),
});

// Supplier Product Links Table (Memorização de vínculos fornecedor x código de produto na importação de XML)
export const supplierProductLinks = pgTable(
  'supplier_product_links',
  {
    id: text('id').primaryKey(),
    supplierCnpj: text('supplier_cnpj').notNull(),
    supplierProductCode: text('supplier_product_code').notNull(),
    supplierDescription: text('supplier_description').default(''),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    unique('supplier_product_links_cnpj_code_unique').on(
      table.supplierCnpj,
      table.supplierProductCode
    ),
  ]
);

// Relations
export const productsRelations = relations(products, ({ many }) => ({
  movements: many(stockMovements),
  sales: many(storeSales),
  supplierLinks: many(supplierProductLinks),
}));

export const supplierProductLinksRelations = relations(supplierProductLinks, ({ one }) => ({
  product: one(products, {
    fields: [supplierProductLinks.productId],
    references: [products.id],
  }),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  product: one(products, {
    fields: [stockMovements.productId],
    references: [products.id],
  }),
  nfEntry: one(nfEntries, {
    fields: [stockMovements.nfEntryId],
    references: [nfEntries.id],
  }),
}));

export const nfEntriesRelations = relations(nfEntries, ({ many }) => ({
  items: many(nfItems),
}));

export const nfItemsRelations = relations(nfItems, ({ one }) => ({
  nfEntry: one(nfEntries, {
    fields: [nfItems.nfId],
    references: [nfEntries.id],
  }),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
}));

export const usersRelations = relations(users, ({ one }) => ({
  roleDetail: one(roles, {
    fields: [users.roleId],
    references: [roles.id],
  }),
}));
