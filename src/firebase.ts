import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
  type Firestore
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Inicializa o app Firebase sem nenhuma dependência de Auth
export const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

const dbId = (firebaseConfig as any).firestoreDatabaseId;

let firestoreInstance: Firestore;
try {
  firestoreInstance = initializeFirestore(
    app,
    {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    },
    dbId && dbId !== '(default)' ? dbId : undefined
  );
} catch {
  // If already initialized (e.g. fast-refresh)
  firestoreInstance = dbId && dbId !== '(default)' ? getFirestore(app, dbId) : getFirestore(app);
}

export const db: Firestore = firestoreInstance;
