import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  collection,
  setDoc as setFirestoreDoc
} from 'firebase/firestore';
import type { StoreData, SetupConcluido } from '../types';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app);

export interface FirebaseConnectionStatus {
  connected: boolean;
  lastSyncTime: string | null;
  error: string | null;
}

const APP_STATE_COLLECTION = 'app_state';
const APP_STATE_DOC = 'current';

export class FirebaseService {
  private static isConnected = false;
  private static lastSyncTime: string | null = null;
  private static lastError: string | null = null;
  private static statusListeners: Array<(status: FirebaseConnectionStatus) => void> = [];

  public static subscribeStatus(listener: (status: FirebaseConnectionStatus) => void) {
    this.statusListeners.push(listener);
    listener({
      connected: this.isConnected,
      lastSyncTime: this.lastSyncTime,
      error: this.lastError
    });
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== listener);
    };
  }

  private static notifyStatus() {
    this.statusListeners.forEach((l) => {
      try {
        l({
          connected: this.isConnected,
          lastSyncTime: this.lastSyncTime,
          error: this.lastError
        });
      } catch (err) {
        console.error(err);
      }
    });
  }

  /**
   * Listener em tempo real do Firestore: qualquer tablet ou tela atualiza instantaneamente
   */
  public static subscribeStore(
    onData: (data: StoreData) => void,
    onError?: (err: Error) => void
  ) {
    const docRef = doc(db, APP_STATE_COLLECTION, APP_STATE_DOC);

    return onSnapshot(
      docRef,
      (snapshot) => {
        this.isConnected = true;
        this.lastError = null;
        const now = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        this.lastSyncTime = now;
        this.notifyStatus();

        if (snapshot.exists()) {
          const raw = snapshot.data();
          try {
            const storeData: StoreData = {
              maquinas: Array.isArray(raw.maquinas) ? raw.maquinas : [],
              preparadores: Array.isArray(raw.preparadores) ? raw.preparadores : [],
              tarefas1: Array.isArray(raw.tarefas1) ? raw.tarefas1 : [],
              tarefas2: Array.isArray(raw.tarefas2) ? raw.tarefas2 : [],
              tarefasPendencias: Array.isArray(raw.tarefasPendencias) ? raw.tarefasPendencias : [],
              turnoConfig: raw.turnoConfig || { dias: ['1', '2', '3', '4', '5'], inicio: '07:00', fim: '17:00' },
              setupsAtivos: raw.setupsAtivos || {},
              concluidos: Array.isArray(raw.concluidos) ? raw.concluidos : []
            };
            onData(storeData);
          } catch (e: any) {
            console.error('Erro ao processar dados do Firestore:', e);
          }
        }
      },
      (err) => {
        console.error('Erro no snapshot do Firestore:', err);
        this.isConnected = false;
        this.lastError = err.message;
        this.notifyStatus();
        if (onError) onError(err);
      }
    );
  }

  /**
   * Grava o estado atual no documento mestre do Firestore
   */
  public static async salvarStore(data: StoreData): Promise<void> {
    try {
      const docRef = doc(db, APP_STATE_COLLECTION, APP_STATE_DOC);
      const payload = {
        maquinas: data.maquinas || [],
        preparadores: data.preparadores || [],
        tarefas1: data.tarefas1 || [],
        tarefas2: data.tarefas2 || [],
        tarefasPendencias: data.tarefasPendencias || [],
        turnoConfig: data.turnoConfig,
        setupsAtivos: data.setupsAtivos || {},
        concluidos: data.concluidos || [],
        updatedAt: Date.now()
      };

      await setDoc(docRef, payload, { merge: true });
      this.isConnected = true;
      this.lastSyncTime = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      this.lastError = null;
      this.notifyStatus();
    } catch (err: any) {
      this.isConnected = false;
      this.lastError = err.message;
      this.notifyStatus();
      throw err;
    }
  }

  /**
   * Salva um setup concluído de forma permanente na coleção dedicada /setups_concluidos
   */
  public static async registrarSetupConcluido(setup: SetupConcluido): Promise<void> {
    try {
      const docRef = doc(db, 'setups_concluidos', setup.id);
      await setFirestoreDoc(docRef, { ...setup, savedAt: Date.now() }, { merge: true });
    } catch (e) {
      console.warn('Erro ao salvar documento individual no Firestore:', e);
    }
  }

  /**
   * Salva uma cópia de segurança na nuvem Firebase (coleção backups)
   */
  public static async criarSnapshotNuvem(data: StoreData, autor: string = 'Líder CNC'): Promise<string> {
    const backupId = `backup_${Date.now()}`;
    const docRef = doc(db, 'backups_cloud', backupId);
    await setDoc(docRef, {
      ...data,
      backupId,
      criadoEm: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      timestamp: Date.now(),
      autor
    });
    return backupId;
  }

  /**
   * Realiza o RESET TOTAL do aplicativo no Firebase voltando do ZERO absoluto
   */
  public static async resetTotal(defaultChecklists: {
    preparadores: string[];
    tarefas1: string[];
    tarefas2: string[];
    tarefasPendencias: string[];
  }): Promise<StoreData> {
    const cleanStore: StoreData = {
      maquinas: [],
      setupsAtivos: {},
      concluidos: [],
      preparadores: defaultChecklists.preparadores,
      tarefas1: defaultChecklists.tarefas1,
      tarefas2: defaultChecklists.tarefas2,
      tarefasPendencias: defaultChecklists.tarefasPendencias,
      turnoConfig: { dias: ['1', '2', '3', '4', '5'], inicio: '07:00', fim: '17:00' }
    };

    await this.salvarStore(cleanStore);
    return cleanStore;
  }

  /**
   * Gera e faz o download imediato de um arquivo JSON com 100% dos dados para segurança
   */
  public static baixarArquivoBackupJson(data: StoreData) {
    const agora = new Date();
    const dataFormatada = agora.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const nomeArquivo = `backup_setup_cnc_${dataFormatada}.json`;

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Lê e valida um arquivo JSON de backup enviado pelo usuário
   */
  public static async lerArquivoBackupJson(file: File): Promise<StoreData> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const parsed = JSON.parse(content);
          if (!parsed || typeof parsed !== 'object') {
            throw new Error('Arquivo de backup inválido.');
          }
          const storeData: StoreData = {
            maquinas: Array.isArray(parsed.maquinas) ? parsed.maquinas : [],
            preparadores: Array.isArray(parsed.preparadores) ? parsed.preparadores : [],
            tarefas1: Array.isArray(parsed.tarefas1) ? parsed.tarefas1 : [],
            tarefas2: Array.isArray(parsed.tarefas2) ? parsed.tarefas2 : [],
            tarefasPendencias: Array.isArray(parsed.tarefasPendencias) ? parsed.tarefasPendencias : [],
            turnoConfig: parsed.turnoConfig || { dias: ['1', '2', '3', '4', '5'], inicio: '07:00', fim: '17:00' },
            setupsAtivos: parsed.setupsAtivos || {},
            concluidos: Array.isArray(parsed.concluidos) ? parsed.concluidos : []
          };
          resolve(storeData);
        } catch (err) {
          reject(new Error('Falha ao processar o arquivo JSON. Certifique-se de que é um backup válido.'));
        }
      };
      reader.onerror = () => reject(new Error('Erro ao ler arquivo.'));
      reader.readAsText(file);
    });
  }
}
