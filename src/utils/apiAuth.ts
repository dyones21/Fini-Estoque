import { auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

let authInitializationPromise: Promise<void> | null = null;

/**
 * Garante que o Firebase Auth completou a inicialização antes de realizar chamadas à API.
 * Não autentica anonimamente nem cria sessões ocultas para visitantes não logados.
 */
export async function ensureAuthReady(): Promise<void> {
  if (auth.currentUser) return;

  if (!authInitializationPromise) {
    authInitializationPromise = new Promise<void>((resolve) => {
      // 1. Verifica se authStateReady existe no SDK
      if (typeof (auth as any).authStateReady === 'function') {
        (auth as any)
          .authStateReady()
          .then(() => resolve())
          .catch(() => resolve());
      } else {
        // Fallback para onAuthStateChanged
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
 * Obtém o ID token JWT do usuário atualmente autenticado no Firebase Auth.
 * Retorna null imediatamente se nenhum usuário estiver autenticado.
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
 * Wrapper de fetch que anexa automaticamente o cabeçalho Authorization: Bearer <token>
 * com o token do usuário autenticado no Firebase Auth.
 * Se não houver usuário logado, segue sem o header Authorization (o servidor retorna 401 normalmente).
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
 * Nota de Segurança: O papel (role) é estritamente determinado pelo servidor no backend.
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
