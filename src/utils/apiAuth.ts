import { auth } from '../lib/firebase';

/**
 * Obtém o token de autorização JWT assinado da sessão ativa do Firebase Auth.
 * Se não houver usuário logado no Firebase, retorna null.
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    if (auth && auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      if (token && typeof token === 'string' && token.split('.').length === 3) {
        return token;
      }
    }
  } catch (err) {
    console.warn('Aviso: Erro ao obter token do Firebase Auth:', err);
  }

  return null;
}

/**
 * Wrapper de fetch que anexa automaticamente o cabeçalho Authorization: Bearer <token>
 * quando há usuário autenticado no Firebase.
 */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = await getAuthToken();

  const headers = new Headers(init.headers || {});

  if (token && typeof token === 'string' && token.split('.').length === 3) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (init.body && !headers.has('Content-Type') && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(input, {
    ...init,
    headers,
  });
}

/**
 * Utilitário seguro para ler JSON de uma resposta HTTP.
 * Evita erros de "Unexpected token '<', "<!doctype "... is not valid JSON"
 * caso o proxy ou servidor retorne HTML em vez de JSON.
 */
export async function safeParseJson<T = any>(response: Response | null | undefined): Promise<T | null> {
  if (!response || !response.ok) return null;

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
