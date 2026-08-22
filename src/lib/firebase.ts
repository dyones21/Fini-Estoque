import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged as fbOnAuthStateChanged,
  User as FirebaseUser,
  Auth,
} from 'firebase/auth';

const apiKey = (import.meta.env.VITE_FIREBASE_API_KEY || '').trim();
const projectId = (import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim();
const authDomain = (
  import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
  (projectId ? `${projectId}.firebaseapp.com` : '')
).trim();
const storageBucket = (
  import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
  (projectId ? `${projectId}.appspot.com` : '')
).trim();
const messagingSenderId = (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim();
const appId = (import.meta.env.VITE_FIREBASE_APP_ID || '').trim();

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

export async function signInWithGoogle(): Promise<FirebaseUser> {
  if (!isFirebaseConfigured || !auth || !googleProvider) {
    throw new Error(
      'Configuração do Firebase não encontrada. Defina as variáveis VITE_FIREBASE_API_KEY e VITE_FIREBASE_PROJECT_ID no painel de ambiente do AI Studio.'
    );
  }
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutFirebase(): Promise<void> {
  if (auth) {
    await signOut(auth);
  }
}

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
