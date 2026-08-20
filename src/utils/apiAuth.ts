import { auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

let authInitializationPromise: Promise<void> | null = null;

/**
 * Garante que o Firebase Auth completou a inicialização antes de realizar chamadas à API.
 */
export async function ensureAuthReady(): Promise<void> {
  if (auth.currentUser) return;

  if (!authInitializationPromise) {
    authInitializationPromise = new Promise<void>((resolve) => {
      if (typeof (auth as any).authStateReady === 'function') {
        (auth as any)
          .authStateReady()
          .then(() => resolve())
          .catch(() => resolve());
      } else {
        const unsubscribe = onAuthStateChanged(auth, () => {
          unsubscribe();
          resolve();
        });
      }
    });
  }

  await authInitializationPromise;
}

/**
 * Obtém o ID token JWT do usuário autenticado exclusivamente no Firebase Auth.
 * Retorna null se não houver usuário logado no Firebase.
 */
export async function getFirebaseAuthToken(): Promise<string | null> {
  try {
    if (!auth.currentUser) {
      await ensureAuthReady();
    }

    if (auth.currentUser) {
      return await auth.currentUser.getIdToken();
    }
  } catch (error) {
    console.error('Erro ao obter token do Firebase Auth:', error);
  }
  return null;
}

/**
 * Alias para getFirebaseAuthToken.
 */
export async function getAuthToken(): Promise<string | null> {
  return await getFirebaseAuthToken();
}

/**
 * Wrapper de fetch que anexa automaticamente o cabeçalho Authorization: Bearer <Firebase ID Token>
 * do usuário autenticado no Firebase Auth.
 */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = await getFirebaseAuthToken();

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
 * Sincroniza o usuário autenticado do Firebase Auth com o backend.
 * O papel (role) é estritamente determinado pelo servidor no backend.
 */
export async function syncUserWithPostgres(user: {
  uid: string;
  email?: string | null;
  displayName?: string | null;
}) {
  try {
    const token = await getFirebaseAuthToken();
    if (!token) return null;

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
      console.warn('Falha na resposta ao sincronizar usuário no Postgres:', err);
    }
  } catch (error) {
    console.error('Erro ao sincronizar usuário no Postgres via API:', error);
  }
  return null;
}

/**
 * Altera o cargo (role) de outro usuário no servidor PostgreSQL.
 * Apenas usuários autenticados com o cargo 'super_admin' no banco recebem autorização.
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
 * Salva ou atualiza um usuário no banco de dados PostgreSQL.
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
 * Exclui um usuário permanentemente do banco de dados PostgreSQL.
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
