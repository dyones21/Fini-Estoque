import { authFetch } from './apiAuth';
import { Product, StockMovement } from '../types';

export interface PostgresConnectionInfo {
  host: string;
  port: number;
  user: string;
  database: string;
  ssl: boolean;
  poolTotal?: number;
  poolIdle?: number;
  poolWaiting?: number;
  configured: boolean;
}

export interface PostgresHealthStatus {
  status: 'healthy' | 'unhealthy';
  latencyMs: number;
  serverTime?: string;
  version?: string;
  database?: string;
  connection?: PostgresConnectionInfo;
  counts?: {
    products: number;
    movements: number;
    nfEntries: number;
    sales: number;
    users: number;
  };
  error?: string;
}

export interface PostgresStockSummary {
  timestamp: string;
  latencyMs: number;
  summary: {
    productsCount: number;
    totalDepositoUnits: number;
    totalLojaUnits: number;
    totalUnits: number;
    totalCostValue: number;
    totalSellValue: number;
    lowStockCount: number;
    criticalStockCount: number;
    movementsCount: number;
    salesCount: number;
  };
  products: Array<
    Product & {
      totalStock: number;
      totalCostValue: number;
      totalSellValue: number;
      stockStatus: 'critico' | 'alerta' | 'normal';
    }
  >;
  recentMovements: StockMovement[];
}

export interface PostgresDiagnosticsResult {
  success: boolean;
  latencyMs: number;
  timestamp: string;
  tables: Array<{ table_name: string; columns_count: string | number }>;
  connection: PostgresConnectionInfo;
  error?: string;
}

/**
 * Lê o corpo da resposta HTTP com segurança, prevenindo erros de sintaxe JSON quando
 * o servidor retorna HTML (ex: inicialização do Vite, 404, fallback SPA).
 */
async function safeJsonParse(response: Response, defaultErrorText: string) {
  let text = '';
  try {
    text = await response.text();
  } catch (err: any) {
    console.warn(`[API Info] Falha na leitura de resposta:`, err);
    return null;
  }

  let data: any = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // Se o corpo retornado não for JSON (ex: HTML do fallback SPA durante inicialização ou reinício)
    return null;
  }

  if (!response.ok) {
    if (response.status === 403) {
      console.warn('Acesso restrito para esta operação.');
      return null;
    }
    if (response.status === 401) {
      console.warn('Sessão autenticando...');
      return null;
    }
    console.warn(data?.error || defaultErrorText);
    return null;
  }

  return data;
}

/**
 * Consulta o status de saúde e latência do PostgreSQL
 */
export async function fetchPostgresHealth(): Promise<PostgresHealthStatus | null> {
  try {
    const response = await authFetch('/api/postgres/status');
    return await safeJsonParse(response, 'Falha ao consultar status do PostgreSQL');
  } catch (e) {
    return null;
  }
}

/**
 * Busca o estoque em tempo real com métricas diretamente do PostgreSQL
 */
export async function fetchPostgresStockRealtime(): Promise<PostgresStockSummary | null> {
  try {
    const response = await authFetch('/api/postgres/stock-realtime');
    return await safeJsonParse(response, 'Falha ao buscar estoque em tempo real');
  } catch (e) {
    return null;
  }
}

/**
 * Executa diagnóstico de integridade das tabelas do PostgreSQL
 */
export async function runPostgresDiagnostics(): Promise<PostgresDiagnosticsResult | null> {
  try {
    const response = await authFetch('/api/postgres/diagnostics', {
      method: 'POST',
    });
    return await safeJsonParse(response, 'Falha ao executar diagnóstico no PostgreSQL');
  } catch (e) {
    return null;
  }
}
