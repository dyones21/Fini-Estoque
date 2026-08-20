import { auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

const SESSION_STORAGE_KEY = 'FINI_SESSION_TOKEN';
let authInitializationPromise: Promise<void> | null = null;
let inMemorySessionToken: string | null = null;

/**
 * Define o token de sessão local no armazenamento.
 */
export function setSessionToken(token: string | null) {
  inMemorySessionToken = token;
  try {
    if (token) {
      localStorage.setItem(SESSION_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch (e) {
    console.error('Erro ao salvar token de sessão no localStorage:', e);
  }
}

/**
 * Recupera o token de sessão local ativo.
 */
export function getSessionToken(): string | null {
  if (inMemorySessionToken) return inMemorySessionToken;
  try {
    const saved = localStorage.getItem(SESSION_STORAGE_KEY);
    if (saved) {
      inMemorySessionToken = saved;
      return saved;
    }
  } catch (e) {
    console.error('Erro ao ler token de sessão:', e);
  }
  return null;
}

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
 * Obtém o token de autenticação ativo (Firebase Auth ou Token de Sessão assinado do ERP).
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    // 1. Se houver usuário Firebase logado
    if (!auth.currentUser) {
      await ensureAuthReady();
    }

    if (auth.currentUser) {
      const fbToken = await auth.currentUser.getIdToken();
      if (fbToken) return fbToken;
    }
  } catch (error) {
    console.error('Erro ao obter token do Firebase Auth:', error);
  }

  // 2. Fallback para token de sessão assinado pelo servidor
  return getSessionToken();
}

/**
 * Retrocompatibilidade para chamadas que usam getFirebaseAuthToken
 */
export async function getFirebaseAuthToken(): Promise<string | null> {
  return await getAuthToken();
}

/**
 * Estabelece ou renova uma sessão para o usuário ativo do ERP.
 */
export async function obtainUserSession(user: {
  id?: string;
  uid?: string;
  email: string;
  name?: string;
  role?: string;
  pin?: string;
}): Promise<string | null> {
  try {
    const response = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: user.id || user.uid,
        email: user.email,
        name: user.name,
        role: user.role,
        pin: user.pin,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.token) {
        setSessionToken(data.token);
        return data.token;
      }
    }
  } catch (e) {
    console.error('Erro ao obter sessão do usuário via API:', e);
  }
  return null;
}

/**
 * Realiza login com PIN diretamente no servidor e obtém token de autenticação.
 */
export async function loginWithPinViaApi(emailOrId: string, pin: string) {
  const response = await fetch('/api/auth/login-pin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailOrId, pin }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'PIN incorreto ou usuário não encontrado.' }));
    throw new Error(errorData.error || `Erro HTTP ${response.status}`);
  }

  const data = await response.json();
  if (data.token) {
    setSessionToken(data.token);
  }
  return data;
}

/**
 * Wrapper de fetch que anexa automaticamente o cabeçalho Authorization: Bearer <token>.
 */
export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  let token = await getAuthToken();

  // Se ainda não houver token, tenta recuperar do usuário salvo no localStorage
  if (!token) {
    try {
      const currentUserId = localStorage.getItem('FINI_CURRENT_USER_ID');
      const usersRaw = localStorage.getItem('FINI_USERS');
      if (usersRaw) {
        const usersList = JSON.parse(usersRaw);
        const currentUser = usersList.find((u: any) => u.id === currentUserId) || usersList[0];
        if (currentUser && currentUser.email) {
          token = await obtainUserSession(currentUser);
        }
      }
    } catch {
      // Ignorar fallback
    }
  }

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

