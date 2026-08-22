import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  sendPasswordResetEmail as fbSendPasswordResetEmail,
  signOut,
  onAuthStateChanged as fbOnAuthStateChanged,
  User as FirebaseUser,
  Auth,
} from 'firebase/auth';

const apiKey = (
  import.meta.env.VITE_FIREBASE_API_KEY ||
  'AIzaSyDiRMrXydHjiD_j3T4pq5l7jLOIA0l3bGo'
).trim();

const projectId = (
  import.meta.env.VITE_FIREBASE_PROJECT_ID ||
  'gen-lang-client-0540125949'
).trim();

const authDomain = (
  import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
  'gen-lang-client-0540125949.firebaseapp.com'
).trim();

const storageBucket = (
  import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
  'gen-lang-client-0540125949.firebasestorage.app'
).trim();

const messagingSenderId = (
  import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
  '573191501804'
).trim();

const appId = (
  import.meta.env.VITE_FIREBASE_APP_ID ||
  '1:573191501804:web:4761661ea1c3fe5b1432c9'
).trim();

export const isFirebaseConfigured = Boolean(
  apiKey &&
  apiKey.length > 5 &&
  !apiKey.includes('sua_api_key') &&
  !apiKey.includes('AIzaSy_sua')
);

export const firebaseConfig = {
  apiKey: apiKey,
  authDomain: authDomain,
  projectId: projectId,
  storageBucket: storageBucket,
  messagingSenderId: messagingSenderId,
  appId: appId,
};

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let googleProviderInstance: GoogleAuthProvider | null = null;

if (isFirebaseConfigured) {
  try {
    appInstance = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    authInstance = getAuth(appInstance);
    googleProviderInstance = new GoogleAuthProvider();
    googleProviderInstance.setCustomParameters({ prompt: 'select_account' });
  } catch (err) {
    console.warn('Aviso: Falha ao inicializar Firebase Auth no navegador:', err);
  }
}

export const auth = authInstance;
export const googleProvider = googleProviderInstance;

/**
 * Autenticação via Google Popup (OAuth)
 */
export async function signInWithGoogle(): Promise<FirebaseUser> {
  if (!isFirebaseConfigured || !auth || !googleProvider) {
    throw new Error(
      'Configuração do Firebase não encontrada. Defina as variáveis VITE_FIREBASE_API_KEY e VITE_FIREBASE_PROJECT_ID no painel de ambiente do AI Studio.'
    );
  }
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

/**
 * Autenticação via E-mail e Senha (Client-side)
 * Para usuários cadastrados previamente pelo administrador.
 */
export async function signInEmail(email: string, password: string): Promise<FirebaseUser> {
  if (!isFirebaseConfigured || !auth) {
    throw new Error(
      'Configuração do Firebase não encontrada. Defina as variáveis VITE_FIREBASE_API_KEY e VITE_FIREBASE_PROJECT_ID no painel de ambiente do AI Studio.'
    );
  }
  const cleanEmail = email.trim();
  if (!cleanEmail) {
    throw new Error('Por favor, informe seu e-mail de acesso.');
  }
  if (!password) {
    throw new Error('Por favor, informe sua senha de acesso.');
  }
  const result = await signInWithEmailAndPassword(auth, cleanEmail, password);
  return result.user;
}

/**
 * Envia e-mail de redefinição de senha para o usuário
 */
export async function sendPasswordReset(email: string): Promise<void> {
  if (!isFirebaseConfigured || !auth) {
    throw new Error('Firebase não configurado.');
  }
  const cleanEmail = email.trim();
  if (!cleanEmail) {
    throw new Error('Por favor, informe o e-mail cadastrado.');
  }
  await fbSendPasswordResetEmail(auth, cleanEmail);
}

/**
 * Encerra a sessão ativa no Firebase Auth
 */
export async function signOutFirebase(): Promise<void> {
  if (auth) {
    await signOut(auth);
  }
}

/**
 * Observer do estado de autenticação do Firebase
 */
export function onAuthStateChanged(
  authObj: Auth | null | undefined,
  nextOrObserver: (user: FirebaseUser | null) => void,
  error?: (error: any) => void,
  completed?: () => void
): () => void {
  if (!authObj) {
    return () => {};
  }
  try {
    return fbOnAuthStateChanged(authObj, nextOrObserver, error, completed);
  } catch (err) {
    console.warn('Aviso no listener do Firebase Auth:', err);
    return () => {};
  }
}

export type { FirebaseUser };
