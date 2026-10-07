import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import type { StoreData } from '../types';

const APP_STATE_COLLECTION = 'app_state';
const APP_STATE_DOC = 'current';

/**
 * Salva o estado completo da fábrica no Cloud Firestore
 */
export async function salvarNoFirestore(data: StoreData): Promise<void> {
  try {
    const docRef = doc(db, APP_STATE_COLLECTION, APP_STATE_DOC);
    // Firestore não aceita campos undefined, removemos ou substituímos por null
    const payload = JSON.parse(JSON.stringify(data));
    payload.updatedAt = Date.now();
    await setDoc(docRef, payload, { merge: true });
  } catch (error) {
    console.warn('Erro ao salvar no Firestore:', error);
  }
}

/**
 * Carrega o estado mais recente do Cloud Firestore
 */
export async function carregarDoFirestore(): Promise<StoreData | null> {
  try {
    const docRef = doc(db, APP_STATE_COLLECTION, APP_STATE_DOC);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as StoreData;
    }
  } catch (error) {
    console.warn('Erro ao carregar do Firestore:', error);
  }
  return null;
}

/**
 * Escuta alterações no Firestore em tempo real para sincronizar todos os tablets instantaneamente
 */
export function escutarFirestore(onUpdate: (data: StoreData) => void): () => void {
  const docRef = doc(db, APP_STATE_COLLECTION, APP_STATE_DOC);
  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data() as StoreData;
        onUpdate(data);
      }
    },
    (error) => {
      console.warn('Erro no listener do Firestore:', error);
    }
  );
}
