export type LocationType = 'geral' | 'loja' | 'deposito';

export type ProductCategory = string;

export type MovementType = 'entrada_nf' | 'transferencia_deposito_loja' | 'venda_loja' | 'perda_avaria' | 'ajuste_inventario';

export type UserRole = 'super_admin' | 'admin' | 'gerente_loja' | 'operador_deposito' | 'caixa' | 'auditor';

export interface Tenant {
  id: string;          // ex: 'default-company' ou 'tenant-friburgo'
  code?: string;       // ex: 'FRIBURGO'
  name: string;        // Razão Social (ex: 'Doceria Nova Friburgo Ltda')
  tradeName?: string;  // Nome Fantasia (ex: 'Fini Nova Friburgo')
  cnpj: string;        // CNPJ (ex: '02.408.821/0001-44')
  address?: string;    // Endereço (ex: 'Rua Alberto Braune, 120 - Centro')
  city: string;        // Cidade (ex: 'Nova Friburgo')
  state: string;       // Estado (ex: 'RJ')
  active?: boolean;
  isMaster?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type CompanyInfo = Tenant;

export interface UserPermissions {
  canViewDashboard: boolean;
  canViewStock: boolean;
  canManageProducts: boolean; // Criar, editar, excluir produtos
  canAddNFEntries: boolean;   // Entrada por Nota Fiscal
  canTransferStock: boolean;  // Transferência Depósito -> Loja
  canRegisterMovements: boolean; // Vendas na Loja, Ajustes e Perdas
  canManageUsers: boolean;   // Gerenciar Usuários, Permissões e PINs (Admin)
  canManageBackup: boolean;  // Gerenciar Backup e Sincronização
  canManageCompany?: boolean; // Gerenciar Dados da Empresa
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  pin: string; // PIN de 4 dígitos
  permissions: UserPermissions;
  avatarUrl?: string;
  active?: boolean;
  tenantIds?: string[]; // IDs das empresas/unidades que possui acesso (ex: ['tenant-friburgo'] ou ['all'])
}

export interface Product {
  id: string;
  tenantId?: string;
  sku: string;
  ean: string;
  codeEAN?: string;
  name: string;
  category: ProductCategory;
  unit: 'Pacote 100g' | 'Pacote 500g' | 'Caixa 1kg' | 'Display 12un' | 'Unidade';
  stockDeposito: number;
  stockLoja: number;
  minStockDeposito: number;
  minStockLoja: number;
  costPrice: number; // Preço de Custo (R$)
  sellPrice: number; // Preço de Venda (R$)
  expirationDate: string; // ISO date YYYY-MM-DD
  batchNumber: string; // Lote
  lastUpdated: string;
  totalSalesQuantity: number; // Para cálculo de ranking e Curva ABC
  totalSalesValue: number; // Faturamento total gerado
}

export interface NFItem {
  productId: string;
  productName: string;
  quantity: number;
  costPrice: number;
  totalCost: number;
  batchNumber: string;
  expirationDate: string;
}

export interface NFEntry {
  id: string;
  tenantId?: string;
  numberNF: string;
  accessKey?: string;
  supplier: string;
  cnpjSupplier: string;
  issueDate: string;
  receiveDate: string;
  items: NFItem[];
  totalValue: number;
  notes?: string;
  createdBy: string;
}

export interface StockTransfer {
  id: string;
  tenantId?: string;
  date: string;
  productId: string;
  productName: string;
  quantity: number;
  origin: 'deposito';
  destination: 'loja';
  operatorName: string;
  notes?: string;
  status: 'concluida' | 'cancelada';
}

export interface StockMovement {
  id: string;
  tenantId?: string;
  date: string;
  productId: string;
  productName: string;
  type: MovementType;
  quantity: number;
  location: 'loja' | 'deposito' | 'ambos';
  unitPrice?: number;
  totalValue?: number;
  reason?: string;
  userName: string;
}

export interface ABCAnalysisItem {
  product: Product;
  totalRevenue: number;
  revenuePercentage: number;
  cumulativePercentage: number;
  classABC: 'A' | 'B' | 'C';
}

export interface AppNotification {
  id: string;
  tenantId?: string;
  title: string;
  message: string;
  type: 'low_stock' | 'expiration' | 'transfer' | 'system';
  severity: 'high' | 'medium' | 'info';
  timestamp: string;
  read: boolean;
  productId?: string;
  location?: 'loja' | 'deposito';
}

export interface CloudBackupInfo {
  lastSyncTime: string;
  status: 'synced' | 'syncing' | 'pending' | 'offline' | 'error';
  autoSyncEnabled: boolean;
  totalRecords: number;
  backupSizeKB: number;
}

export interface Sale {
  id: string;
  tenantId?: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  paymentMethod: 'Dinheiro' | 'PIX' | 'Cartão de Débito' | 'Cartão de Crédito';
  sellerName: string;
  timestamp: string;
}
