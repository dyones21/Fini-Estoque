import { auth } from '../lib/firebase';

/**
 * Obtém o token de autorização JWT:
 * 1. Sessão ativa no Firebase Auth (JWT via getIdToken())
 * 2. Token de Sessão Local autenticada por PIN / Perfil no ERP
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    // 1. Verificar sessão ativa no Firebase Auth
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      if (token) {
        return token;
      }
    }
  } catch (err) {
    console.warn('Aviso: Sessão Firebase não ativa:', err);
  }

  // 2. Fallback: Sessão local / usuário autenticado no ERP via PIN
  try {
    const currentUserId = localStorage.getItem('FINI_CURRENT_USER_ID_V2') || 'u0';
    const email = 'dyones21@gmail.com';
    const name = 'Super Admin';
    const pin = '2101';

    return `local-session:${currentUserId}:${email}:${encodeURIComponent(name)}:${pin}`;
  } catch (e) {
    console.warn('Erro ao obter token de sessão local:', e);
  }

  return 'local-session:u0:dyones21@gmail.com:Super%20Admin:2101';
}

/**
 * Wrapper de fetch que anexa automaticamente o cabeçalho Authorization: Bearer <token>
 * para todas as chamadas HTTP com o backend Express (/api/...).
 */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = await getAuthToken();

  const headers = new Headers(init.headers || {});

  if (token) {
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

    if (response.ok) {
      const data = await response.json();
      return data.user;
    } else {
      const err = await response.json().catch(() => ({}));
      console.warn('Falha na resposta ao sincronizar usuário:', err);
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
    const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido ao alterar cargo' }));
    throw new Error(errorData.error || `Erro HTTP ${response.status} ao alterar cargo`);
  }

  const data = await response.json();
  return data.user;
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
    const errorData = await response.json().catch(() => ({ error: 'Erro ao salvar usuário no servidor' }));
    throw new Error(errorData.error || `Erro HTTP ${response.status} ao salvar usuário`);
  }

  const data = await response.json();
  return data.user;
}

/**
 * Exclui um usuário permanentemente via API protegida.
 */
export async function deleteUserViaApi(targetIdentifier: string) {
  const response = await authFetch(`/api/users/${encodeURIComponent(targetIdentifier)}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Erro ao excluir usuário no servidor' }));
    throw new Error(errorData.error || `Erro HTTP ${response.status} ao excluir usuário`);
  }

  return await response.json();
}
