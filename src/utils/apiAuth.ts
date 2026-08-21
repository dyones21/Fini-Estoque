import { supabase } from '../lib/supabase';

/**
 * Obtém o token de autorização JWT centralizado no Supabase:
 * 1. Sessão ativa no Supabase Auth (JWT)
 * 2. Token de Sessão Local autenticada por PIN / Perfil no ERP
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    // 1. Verificar sessão ativa no Supabase
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return session.access_token;
    }
  } catch (err) {
    console.warn('Aviso: Sessão Supabase não ativa:', err);
  }

  // 2. Fallback: Sessão local / usuário autenticado no ERP via PIN ou localStorage
  try {
    const currentUserId = localStorage.getItem('FINI_CURRENT_USER_ID_V2') || 'u0';
    const rawUsers = localStorage.getItem('FINI_USERS_V2');
    let email = 'dyones21@gmail.com';
    let name = 'Super Admin';
    let pin = '2101';

    if (rawUsers) {
      try {
        const parsedUsers = JSON.parse(rawUsers);
        if (Array.isArray(parsedUsers)) {
          const found = parsedUsers.find((u: any) => u.id === currentUserId);
          if (found) {
            email = found.email || email;
            name = found.name || name;
            pin = found.pin || pin;
          }
        }
      } catch {
        // Ignora erro de JSON
      }
    }

    return `local-session:${currentUserId}:${email}:${encodeURIComponent(name)}:${pin}`;
  } catch (e) {
    console.warn('Erro ao obter token de sessão local:', e);
  }

  return 'local-session:u0:dyones21@gmail.com:Super%20Admin:2101';
}

/**
 * Wrapper de fetch que anexa automaticamente o cabeçalho Authorization: Bearer <token>
 * para todas as chamadas HTTP com o backend Express / Supabase.
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
 * Sincroniza o usuário autenticado (Supabase Auth ou Operador Local) com a base do Supabase.
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
      console.warn('Falha na resposta ao sincronizar usuário no Supabase:', err);
    }
  } catch (error) {
    console.error('Erro ao sincronizar usuário no Supabase via API:', error);
  }
  return null;
}

/**
 * Altera o cargo (role) de outro usuário no servidor Supabase.
 */
export async function updateUserRoleViaApi(targetUid: string, newRole: string) {
  const response = await authFetch(`/api/users/${targetUid}/role`, {
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
 * Salva ou atualiza um usuário no banco de dados Supabase.
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
 * Exclui um usuário permanentemente do banco de dados Supabase.
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
