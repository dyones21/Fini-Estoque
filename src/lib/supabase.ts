import { createClient } from '@supabase/supabase-js';
import { Product, StockMovement, NFEntry, Sale, UserProfile, UserRole } from '../types';
import { getRolePermissions } from '../utils/permissionUtils';

// Supabase project credentials
export const SUPABASE_URL =
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_URL) ||
  (import.meta as any).env?.VITE_SUPABASE_URL ||
  'https://erewcnfavhtexmitrtce.supabase.co';

export const SUPABASE_ANON_KEY =
  (typeof process !== 'undefined' && process.env?.VITE_SUPABASE_ANON_KEY) ||
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyZXdjbmZhdmh0ZXhtaXRydGNlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczMjgzODksImV4cCI6MjEwMjkwNDM4OX0.bG4GNHxbwiTHA85U9F9YA7Y8dPLAgsI5TA7VwbjlFBc';

/**
 * Cliente Oficial do Supabase configurado globalmente para persistência de sessão,
 * autenticação e operações CRUD em tempo real
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/* =========================================================================
   AUTH UTILITIES (SUPABASE AUTH)
   ========================================================================= */

/**
 * Autenticação via Google OAuth no Supabase
 */
export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
    },
  });
  if (error) throw error;
  return data;
}

/**
 * Login com e-mail e senha no Supabase
 */
export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

/**
 * Cadastro de nova conta no Supabase
 */
export async function signUpWithEmail(email: string, password: string, name?: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name || email.split('@')[0],
        name: name || email.split('@')[0],
      },
    },
  });
  if (error) throw error;
  return data;
}

/**
 * Logout no Supabase
 */
export async function signOutSupabase() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/* =========================================================================
   PRODUTOS (CRUD SUPABASE)
   ========================================================================= */

export async function fetchProductsFromSupabase(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    console.warn('Aviso Supabase Client ao buscar produtos:', error.message);
    throw error;
  }

  return (data || []).map((r: any) => ({
    id: r.id,
    sku: r.sku,
    ean: r.ean || r.code_ean || '',
    codeEAN: r.ean || r.code_ean || '',
    name: r.name,
    category: r.category,
    unit: r.unit,
    stockDeposito: Number(r.stock_deposito ?? r.stockDeposito ?? 0),
    stockLoja: Number(r.stock_loja ?? r.stockLoja ?? 0),
    minStockDeposito: Number(r.min_stock_deposito ?? r.minStockDeposito ?? 10),
    minStockLoja: Number(r.min_stock_loja ?? r.minStockLoja ?? 5),
    costPrice: Number(r.cost_price ?? r.costPrice ?? 0),
    sellPrice: Number(r.sell_price ?? r.sellPrice ?? 0),
    expirationDate: r.expiration_date ?? r.expirationDate ?? '',
    batchNumber: r.batch_number ?? r.batchNumber ?? '',
    lastUpdated: r.updated_at ?? r.updatedAt ?? new Date().toISOString(),
    totalSalesQuantity: 0,
    totalSalesValue: 0,
    tenantId: 'tenant-friburgo',
  }));
}

export async function upsertProductInSupabase(product: Product): Promise<Product> {
  const payload = {
    id: product.id,
    sku: product.sku,
    ean: product.ean || product.codeEAN || '',
    name: product.name,
    category: product.category,
    unit: product.unit,
    stock_deposito: product.stockDeposito,
    stock_loja: product.stockLoja,
    min_stock_deposito: product.minStockDeposito,
    min_stock_loja: product.minStockLoja,
    cost_price: product.costPrice,
    sell_price: product.sellPrice,
    expiration_date: product.expirationDate,
    batch_number: product.batchNumber,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('products')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    console.warn('Aviso Supabase Client ao salvar produto:', error.message);
    throw error;
  }

  return product;
}

export async function deleteProductInSupabase(id: string): Promise<boolean> {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) {
    console.warn('Aviso Supabase Client ao deletar produto:', error.message);
    throw error;
  }
  return true;
}

/* =========================================================================
   MOVIMENTAÇÕES DE ESTOQUE (CRUD SUPABASE)
   ========================================================================= */

export async function fetchMovementsFromSupabase(): Promise<StockMovement[]> {
  const { data, error } = await supabase
    .from('stock_movements')
    .select('*')
    .order('timestamp', { ascending: false });

  if (error) {
    console.warn('Aviso Supabase Client ao buscar movimentações:', error.message);
    throw error;
  }

  return (data || []).map((r: any) => ({
    id: r.id,
    tenantId: 'tenant-friburgo',
    date: r.timestamp || new Date().toISOString(),
    productId: r.product_id ?? r.productId,
    productName: r.product_name ?? r.productName,
    type: r.type,
    quantity: Number(r.quantity || 0),
    location: (r.destination === 'Loja Nova Friburgo' || r.location === 'loja' ? 'loja' : 'deposito') as any,
    reason: r.reason || '',
    userName: r.created_by ?? r.createdBy ?? 'Sistema',
  }));
}

export async function insertMovementInSupabase(m: StockMovement): Promise<StockMovement> {
  const payload = {
    id: m.id,
    product_id: m.productId,
    product_name: m.productName,
    type: m.type,
    origin: m.location === 'deposito' ? 'Depósito Central' : 'Loja Nova Friburgo',
    destination: m.location === 'loja' ? 'Loja Nova Friburgo' : 'Depósito Central',
    quantity: m.quantity,
    batch_number: 'LOTE-DEFAULT',
    reason: m.reason || 'Movimentação de estoque',
    created_by: m.userName || 'Sistema',
    timestamp: m.date || new Date().toISOString(),
  };

  const { error } = await supabase.from('stock_movements').insert(payload);
  if (error) {
    console.warn('Aviso Supabase Client ao registrar movimentação:', error.message);
    throw error;
  }
  return m;
}

/* =========================================================================
   NOTAS FISCAIS (CRUD SUPABASE)
   ========================================================================= */

export async function fetchNFEntriesFromSupabase(): Promise<NFEntry[]> {
  const { data: entries, error: errEntries } = await supabase
    .from('nf_entries')
    .select('*')
    .order('created_at', { ascending: false });

  if (errEntries) {
    console.warn('Aviso Supabase Client ao buscar notas fiscais:', errEntries.message);
    throw errEntries;
  }

  const { data: items, error: errItems } = await supabase.from('nf_items').select('*');
  if (errItems) {
    console.warn('Aviso Supabase Client ao buscar itens de NFs:', errItems.message);
  }

  const allItems = items || [];

  return (entries || []).map((e: any) => {
    const entryItems = allItems
      .filter((i: any) => (i.nf_id ?? i.nfId) === e.id)
      .map((i: any) => ({
        productId: i.product_id ?? i.productId,
        productName: i.product_name ?? i.productName,
        quantity: Number(i.quantity || 0),
        costPrice: Number(i.cost_price ?? i.costPrice ?? 0),
        totalCost: Number(i.total_cost ?? i.totalCost ?? 0),
        batchNumber: i.batch_number ?? i.batchNumber ?? '',
        expirationDate: i.expiration_date ?? i.expirationDate ?? '',
      }));

    return {
      id: e.id,
      tenantId: 'tenant-friburgo',
      numberNF: e.number_nf ?? e.numberNF,
      accessKey: e.access_key ?? e.accessKey ?? undefined,
      supplier: e.supplier,
      cnpjSupplier: e.cnpj_supplier ?? e.cnpjSupplier,
      issueDate: e.issue_date ?? e.issueDate,
      receiveDate: (e.created_at ?? e.createdAt ?? new Date().toISOString()).slice(0, 10),
      totalValue: Number(e.total_value ?? e.totalValue ?? 0),
      notes: e.notes || undefined,
      createdBy: e.created_by ?? e.createdBy ?? 'Operador',
      items: entryItems,
    };
  });
}

export async function insertNFEntryInSupabase(nf: NFEntry): Promise<NFEntry> {
  const payloadNF = {
    id: nf.id,
    number_nf: nf.numberNF,
    access_key: nf.accessKey || '',
    supplier: nf.supplier,
    cnpj_supplier: nf.cnpjSupplier,
    issue_date: nf.issueDate,
    total_value: nf.totalValue,
    notes: nf.notes || '',
    created_by: nf.createdBy || 'Operador',
    created_at: nf.receiveDate || new Date().toISOString(),
  };

  const { error: errNF } = await supabase.from('nf_entries').upsert(payloadNF, { onConflict: 'id' });
  if (errNF) {
    console.warn('Aviso Supabase Client ao salvar NF:', errNF.message);
    throw errNF;
  }

  // Insere itens se existirem
  if (nf.items && nf.items.length > 0) {
    await supabase.from('nf_items').delete().eq('nf_id', nf.id);

    const itemsPayload = nf.items.map((item) => ({
      nf_id: nf.id,
      product_id: item.productId,
      product_name: item.productName,
      quantity: item.quantity,
      cost_price: item.costPrice,
      total_cost: item.totalCost,
      batch_number: item.batchNumber || 'LOTE-PADRAO',
      expiration_date: item.expirationDate || new Date().toISOString().slice(0, 10),
    }));

    const { error: errItems } = await supabase.from('nf_items').insert(itemsPayload);
    if (errItems) {
      console.warn('Aviso Supabase Client ao salvar itens da NF:', errItems.message);
    }
  }

  return nf;
}

/* =========================================================================
   VENDAS DA LOJA (CRUD SUPABASE)
   ========================================================================= */

export async function fetchSalesFromSupabase(): Promise<Sale[]> {
  const { data, error } = await supabase
    .from('store_sales')
    .select('*')
    .order('timestamp', { ascending: false });

  if (error) {
    console.warn('Aviso Supabase Client ao buscar vendas:', error.message);
    throw error;
  }

  return (data || []).map((r: any) => ({
    id: r.id,
    tenantId: 'tenant-friburgo',
    productId: r.product_id ?? r.productId,
    productName: r.product_name ?? r.productName,
    quantity: Number(r.quantity || 0),
    unitPrice: Number(r.unit_price ?? r.unitPrice ?? 0),
    totalAmount: Number(r.total_amount ?? r.totalAmount ?? 0),
    paymentMethod: r.payment_method ?? r.paymentMethod,
    sellerName: r.seller_name ?? r.sellerName,
    timestamp: r.timestamp || new Date().toISOString(),
  }));
}

export async function insertSaleInSupabase(s: Sale): Promise<Sale> {
  const payload = {
    id: s.id,
    product_id: s.productId,
    product_name: s.productName,
    quantity: s.quantity,
    unit_price: s.unitPrice,
    total_amount: s.totalAmount,
    payment_method: s.paymentMethod,
    seller_name: s.sellerName,
    timestamp: s.timestamp || new Date().toISOString(),
  };

  const { error } = await supabase.from('store_sales').insert(payload);
  if (error) {
    console.warn('Aviso Supabase Client ao salvar venda:', error.message);
    throw error;
  }
  return s;
}

/* =========================================================================
   USUÁRIOS (CRUD SUPABASE)
   ========================================================================= */

export async function fetchUsersFromSupabase(): Promise<UserProfile[]> {
  const { data, error } = await supabase.from('users').select('*');
  if (error) {
    console.warn('Aviso Supabase Client ao buscar usuários:', error.message);
    throw error;
  }

  return (data || []).map((u: any) => {
    const role = (u.role || 'Operador Depósito/Loja') as UserRole;
    return {
      id: u.uid || `usr-${u.id}`,
      name: u.name || 'Usuário Fini',
      email: u.email,
      role,
      pin: u.pin || '',
      active: u.active ?? true,
      tenantIds: ['tenant-friburgo'],
      avatarUrl: role === 'super_admin' ? 'emoji:👑' : 'emoji:🍬',
      permissions: getRolePermissions(role),
    };
  });
}
