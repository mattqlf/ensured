import * as admin from 'firebase-admin';
import { ServiceAccount } from 'firebase-admin';
// Using a static import allows Next.js to bundle this file correctly.
// Since this code only runs on the server (Admin SDK), the key won't be exposed to the client.
import serviceAccountJson from '../ensured-firebase-admin.json';

const serviceAccount = serviceAccountJson as ServiceAccount;

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: "ensured-5682b",
    });
  } catch (error) {
    console.error('Firebase Admin initialization error', error);
  }
}

export const db = admin.firestore();
export const auth = admin.auth();