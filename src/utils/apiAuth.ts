import { auth } from '../lib/firebase';

/**
 * Obtém o token de autorização JWT assinado da sessão ativa do Firebase Auth.
 * Se não houver usuário logado no Firebase, retorna null.
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    if (auth) {
      if (typeof (auth as any).authStateReady === 'function') {
        try {
          await (auth as any).authStateReady();
        } catch (e) {
          // Prossegue se authStateReady não for suportado ou falhar
        }
      }
      if (auth.currentUser) {
        const token = await auth.currentUser.getIdToken();
        if (token && typeof token === 'string' && token.split('.').length === 3) {
          return token;
        }
      }
    }
  } catch (err) {
    console.warn('Aviso: Erro ao obter token do Firebase Auth:', err);
  }

  return null;
}

/**
 * Wrapper de fetch que anexa automaticamente o cabeçalho Authorization: Bearer <token>
 * quando há usuário autenticado no Firebase e instrumenta tempos de resposta para escrita.
 */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase();
  const isWrite = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

  const token = await getAuthToken();

  const headers = new Headers(init.headers || {});

  if (token && typeof token === 'string' && token.split('.').length === 3) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (init.body && !headers.has('Content-Type') && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (isWrite) {
    const totalMs = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime
    );
    const serverHeader = response.headers.get('X-Response-Time-Ms');
    const serverMs = serverHeader ? Number(serverHeader) : null;
    const networkMs = serverMs !== null && !isNaN(serverMs) ? Math.max(0, totalMs - serverMs) : null;
    const urlStr =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.toString()
        : (input as Request)?.url || '';

    if (serverMs !== null && !isNaN(serverMs)) {
      console.info(
        `[API Perf] ${method} ${urlStr} → Total: ${totalMs}ms (Servidor: ${serverMs}ms | Rede: ${networkMs}ms)`
      );
    } else {
      console.info(`[API Perf] ${method} ${urlStr} → Total: ${totalMs}ms`);
    }
  }

  return response;
}

/**
 * Utilitário seguro para ler JSON de uma resposta HTTP.
 * Evita erros de "Unexpected token '<', "<!doctype "... is not valid JSON"
 * caso o proxy ou servidor retorne HTML em vez de JSON.
 */
export async function safeParseJson<T = any>(response: Response | null | undefined): Promise<T | null> {
  if (!response) return null;

  try {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json') && !contentType.includes('+json')) {
      return null;
    }

    const text = await response.text();
    if (!text || text.trim().startsWith('<')) {
      return null;
    }

    return JSON.parse(text) as T;
  } catch (e) {
    console.warn('Aviso: Resposta HTTP não contém JSON válido:', e);
    return null;
  }
}

/**
 * Sincroniza o usuário autenticado com o backend Express / PostgreSQL.
 */
export async function syncUserWithPostgres(user: {
  uid: string;
  email?: string | null;
  displayName?: string | null;
}) {
  try {
    const response = await authFetch('/api/users/sync', {
      method: 'POST',
      body: JSON.stringify({
        uid: user.uid,
        email: user.email || '',
        name: user.displayName || user.email?.split('@')[0] || 'Usuário Fini',
      }),
    });

    if (response && response.ok) {
      const data = await safeParseJson<{ success: boolean; user: any }>(response);
      return data?.user || null;
    } else {
      const err = await safeParseJson(response);
      if (err) {
        console.warn('Falha na resposta ao sincronizar usuário:', err);
      }
    }
  } catch (error) {
    console.error('Erro ao sincronizar usuário via API:', error);
  }
  return null;
}

/**
 * Altera o cargo (role) de outro usuário no servidor via API protegida.
 */
export async function updateUserRoleViaApi(targetUid: string, newRole: string) {
  const response = await authFetch(`/api/users/${encodeURIComponent(targetUid)}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role: newRole }),
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Você não tem permissão para esta ação.');
    }
    const errorData = await safeParseJson<{ error?: string }>(response);
    throw new Error(errorData?.error || `Erro HTTP ${response.status} ao alterar cargo`);
  }

  const data = await safeParseJson<{ success: boolean; user: any }>(response);
  return data?.user;
}

/**
 * Salva ou atualiza um usuário no banco de dados via API protegida.
 */
export async function saveUserViaApi(userData: {
  uid?: string;
  email: string;
  name?: string;
  role?: string;
  pin?: string;
}) {
  const response = await authFetch('/api/users', {
    method: 'POST',
    body: JSON.stringify(userData),
  });

  if (!response.ok) {
    const errorData = await safeParseJson<{ error?: string }>(response);
    throw new Error(errorData?.error || `Erro HTTP ${response.status} ao salvar usuário`);
  }

  const data = await safeParseJson<{ success: boolean; user: any }>(response);
  return data?.user;
}

/**
 * Cria um novo usuário no Firebase Auth (via Admin SDK) e no Postgres com senha temporária.
 * Apenas usuários com permissão canManageUsers podem executar.
 */
export async function createUserWithPasswordViaApi(userData: {
  email: string;
  password: string;
  name?: string;
  role?: string;
  pin?: string;
}) {
  const response = await authFetch('/api/users/create-with-password', {
    method: 'POST',
    body: JSON.stringify(userData),
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Acesso negado: Você não tem permissão para cadastrar novos usuários.');
    }
    const errorData = await safeParseJson<{ error?: string }>(response);
    throw new Error(errorData?.error || `Erro HTTP ${response.status} ao cadastrar usuário.`);
  }

  const data = await safeParseJson<{ success: boolean; user: any; message?: string }>(response);
  return data?.user;
}

export async function setUserPasswordViaApi(email: string, password: string) {
  const response = await authFetch('/api/users/set-password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('Acesso negado: Você não tem permissão para alterar senhas de usuários.');
    }
    const errorData = await safeParseJson<{ error?: string }>(response);
    throw new Error(errorData?.error || `Erro HTTP ${response.status} ao alterar senha.`);
  }

  const data = await safeParseJson<{ success: boolean; message?: string }>(response);
  return data;
}

/**
 * Exclui um usuário permanentemente via API protegida.
 */
export async function deleteUserViaApi(targetIdentifier: string) {
  const response = await authFetch(`/api/users/${encodeURIComponent(targetIdentifier)}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorData = await safeParseJson<{ error?: string }>(response);
    throw new Error(errorData?.error || `Erro HTTP ${response.status} ao excluir usuário`);
  }

  return await safeParseJson(response);
}
