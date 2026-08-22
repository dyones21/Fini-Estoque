import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Inicialização segura do Firebase Admin SDK no backend
const apps = getApps();
let adminApp;

if (apps.length === 0) {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    'gen-lang-client-0540125949';

  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      adminApp = initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || projectId,
      });
    } catch (err) {
      console.warn('Falha ao processar FIREBASE_SERVICE_ACCOUNT_KEY, inicializando padrão:', err);
      adminApp = initializeApp({ projectId });
    }
  } else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    adminApp = initializeApp({
      credential: cert({
        projectId: projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
      projectId,
    });
  } else {
    // Inicialização padrão com ADC (Application Default Credentials) no Google Cloud / Cloud Run
    adminApp = initializeApp({ projectId });
  }
} else {
  adminApp = getApp();
}

export const adminAuth = getAuth(adminApp);
export default adminApp;
