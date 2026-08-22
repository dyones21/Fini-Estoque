import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: (import.meta as any).env?.VITE_FIREBASE_API_KEY || 'AIzaSyDemoPlaceholderKeyForFirebase123',
  authDomain: (import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN || 'fini-erp-app.firebaseapp.com',
  projectId: (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID || 'fini-erp-app',
  storageBucket: (import.meta as any).env?.VITE_FIREBASE_STORAGE_BUCKET || 'fini-erp-app.appspot.com',
  messagingSenderId: (import.meta as any).env?.VITE_FIREBASE_MESSAGING_SENDER_ID || '1234567890',
  appId: (import.meta as any).env?.VITE_FIREBASE_APP_ID || '1:1234567890:web:abcdef123456',
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    console.error('Erro no login com Google (Firebase):', error);
    throw error;
  }
}

export async function signInEmail(email: string, pass: string) {
  const res = await signInWithEmailAndPassword(auth, email, pass);
  return res.user;
}

export async function signUpEmail(email: string, pass: string) {
  const res = await createUserWithEmailAndPassword(auth, email, pass);
  return res.user;
}

export async function signOutFirebase() {
  await signOut(auth);
}

export { onAuthStateChanged };
export type { FirebaseUser };
