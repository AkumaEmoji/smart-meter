import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function createFirebaseCredential() {
  const values = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY,
  };
  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing Firebase environment configuration: ${missing.join(', ')}`);
  }

  return cert({
    projectId: values.projectId,
    clientEmail: values.clientEmail,
    privateKey: values.privateKey.replace(/\\n/g, '\n'),
  });
}

if (!getApps().length) {
  initializeApp({ credential: createFirebaseCredential() });
}

export const db = getFirestore();
