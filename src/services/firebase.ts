import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  setDoc
} from 'firebase/firestore';
import type {
  StoreData,
  SetupAtivo,
  SetupConcluido,
  Maquina,
  TurnoConfig,
  ParadaEvento,
  GoogleSheetConfig
} from '../types';
import { db, app } from '../firebase';
import { calcularTempoValidoTurno } from '../utils/turno';

export { db, app };

export const APP_STATE_COLLECTION = 'app_state';
export const APP_STATE_DOC = 'current';

export interface FirebaseConnectionStatus {
  connected: boolean;
  lastSyncTime: string | null;
  error: string | null;
}

const INITIAL_PREPARADORES = [
  'GABRIEL',
  'CAIO',
  'IGOR',
  'JONAS',
  'MILLER',
  'LUCAS',
  'RAFAEL',
  'MATHEUS',
  'ADRIANO',
  'MARCELO'
];

const INITIAL_TAREFAS_PARTE_1 = [
  'GUARDAR PGMS E FOTOS DO MODELO ATUAL NA PASTA DRIVE CORRETA AO INICIAR O NOVO SETUP',
  'VERIFICAR A NECESSIDADE DE LIMPAR O CAVACO (MATERIAL DIFERENTE)',
  'TROCAR PINÇAS ALIMENTADOR',
  'AJUSTAR APERTO DAS BUCHAS GUIAS',
  'AJUSTAR PARAMETROS DO ALIMENTADOR'
];

const INITIAL_TAREFAS_PARTE_2 = [
  'TROCAR AS PINÇAS SE NECESSÁRIO',
  'AJUSTAR APERTO DAS PINÇAS',
  'GUARDAR PGMS ANTIGO PEN DRIVE E COLOCAR O NOVO',
  'ALOCAR E FIXAR AS FERRAMENTAS CONFORME PGM ATUAL (AJUSTAR PGM E FERRAMENTAS)',
  'PRESSET DAS FERRAMENTAS',
  'SIMULAR NO VAZIO COM MUITA ATENÇÃO PARA ELIMINAR COLISÃO',
  'AJUSTAR A POSIÇÃO DOS OLEOS',
  'FAZER UMA PEÇA BOA CONFORME DESENHO',
  'SOLTAR A MAQUINA PARA PRODUZIR ( ALERTAR INSPETOR SOBRE ALGUM DETALHE ESPECIAL NA PEÇA)'
];

const INITIAL_TAREFAS_PENDENCIAS = [
  'FAZER VIDA UTIL DAS FERRAMENTAS',
  'FINALIZAR REGISTRO ANTIGO E ABRIR O NOVO',
  'FAZER OU AJUSTAR A FOLHA DE PROCESSO',
  'SOLICITAR BARRAS PARA A PRODUÇÃO DO LOTE',
  'SOLICITAR ETIQUETA DO NOVO MODELO',
  'ANOTAR AS FERRAMENTAS PARA CORREÇÃO NO QUADRO',
  'ATUALIZAR A PLANILHA DE PRODUÇÃO DO PCP NO SISTEMA COMO FINALIZADO',
  'COLOCAR A QUANTIDADE DO LOTE A SER PRODUZIDO NA MAQUINA E OS DESENHOS NOS LOCAIS CORRETOS',
  'CONFERIR O TEMPO DE ACORDO COM O PADRÃO ( CASO DIVERGENTE COMUNICAR O LIDER)',
  'ASSINAR O REGISTRO DO PREPARADOR 1',
  'GUARDAR E ORGANIZAR FERRAMENTAS / CALIBRES / PEÇAS MODELO',
  'SINALIZAR INICIO DE PRODUÇÃO NA PLANILHA PCP'
];

const INITIAL_TURNO: TurnoConfig = {
  dias: ['1', '2', '3', '4', '5'],
  inicio: '07:00',
  fim: '17:00'
};

function formatarTempoMs(ms: number): string {
  const totalSeg = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

function getHoraSP(date: Date | number = new Date()): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  return d.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getDataHoraCurtaSP(date: Date | number = new Date()): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  const data = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const hora = d.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit'
  });
  return `${data} às ${hora}`;
}

export class FirebaseService {
  private static isConnected = false;
  private static lastSyncTime: string | null = null;
  private static lastError: string | null = null;
  private static statusListeners: Array<(status: FirebaseConnectionStatus) => void> = [];

  // Snapshot em memória do documento app_state/current com versionamento
  private static localStore: StoreData | null = null;

  private static storeListeners: Array<(data: StoreData) => void> = [];
  private static unsubscribers: Array<() => void> = [];
  private static isInitialized = false;

  public static getDefaultStore(): StoreData {
    return {
      maquinas: [],
      preparadores: INITIAL_PREPARADORES,
      tarefas1: INITIAL_TAREFAS_PARTE_1,
      tarefas2: INITIAL_TAREFAS_PARTE_2,
      tarefasPendencias: INITIAL_TAREFAS_PENDENCIAS,
      turnoConfig: INITIAL_TURNO,
      setupsAtivos: {},
      concluidos: [],
      version: 1,
      updatedAt: Date.now()
    };
  }

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

  public static getCurrentStore(): StoreData {
    if (this.localStore) {
      return {
        maquinas: Array.isArray(this.localStore.maquinas) ? this.localStore.maquinas : [],
        preparadores: Array.isArray(this.localStore.preparadores) ? this.localStore.preparadores : INITIAL_PREPARADORES,
        tarefas1: Array.isArray(this.localStore.tarefas1) ? this.localStore.tarefas1 : INITIAL_TAREFAS_PARTE_1,
        tarefas2: Array.isArray(this.localStore.tarefas2) ? this.localStore.tarefas2 : INITIAL_TAREFAS_PARTE_2,
        tarefasPendencias: Array.isArray(this.localStore.tarefasPendencias) ? this.localStore.tarefasPendencias : INITIAL_TAREFAS_PENDENCIAS,
        turnoConfig: this.localStore.turnoConfig || INITIAL_TURNO,
        setupsAtivos: this.localStore.setupsAtivos ? { ...this.localStore.setupsAtivos } : {},
        concluidos: Array.isArray(this.localStore.concluidos) ? [...this.localStore.concluidos] : [],
        sheetConfig: this.localStore.sheetConfig,
        version: this.localStore.version || 1,
        updatedAt: this.localStore.updatedAt || Date.now()
      };
    }
    return this.getDefaultStore();
  }

  public static notifyStore(store: StoreData) {
    this.storeListeners.forEach((listener) => {
      try {
        listener(store);
      } catch (e) {
        console.error('Erro no listener da store:', e);
      }
    });
  }

  public static subscribeStore(
    onData: (data: StoreData) => void,
    onError?: (err: Error) => void
  ): () => void {
    this.storeListeners.push(onData);
    onData(this.getCurrentStore());

    if (!this.isInitialized) {
      this.isInitialized = true;
      this.iniciarListenerStore(onError);
    }

    return () => {
      this.storeListeners = this.storeListeners.filter((l) => l !== onData);
    };
  }

  /**
   * Listener em tempo real do Firestore para app_state/current:
   * - Nunca substitui o estado local por um snapshot cujo version seja menor que o local.
   * - Ignora snapshots com hasPendingWrites.
   */
  private static iniciarListenerStore(onError?: (err: Error) => void) {
    const docRef = doc(db, APP_STATE_COLLECTION, APP_STATE_DOC);

    const unsub = onSnapshot(
      docRef,
      (snapshot) => {
        this.isConnected = true;
        this.lastSyncTime = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        this.lastError = null;
        this.notifyStatus();

        if (snapshot.exists()) {
          const remote = snapshot.data() as StoreData;
          const currentVersion = this.localStore?.version || 0;
          const currentUpdatedAt = this.localStore?.updatedAt || 0;

          // Se a versão remota for estritamente menor E a data remota for estritamente mais antiga que a local, ignora
          if ((remote.version || 0) < currentVersion && (remote.updatedAt || 0) < currentUpdatedAt) {
            return;
          }

          // Se o documento estiver vazio ou corrompido, não substitui por vazio
          if (!remote.turnoConfig && !remote.setupsAtivos && (!remote.concluidos || remote.concluidos.length === 0)) {
            return;
          }

          this.localStore = {
            maquinas: Array.isArray(remote.maquinas) ? remote.maquinas : [],
            preparadores: Array.isArray(remote.preparadores) && remote.preparadores.length > 0 ? remote.preparadores : (this.localStore?.preparadores || INITIAL_PREPARADORES),
            tarefas1: Array.isArray(remote.tarefas1) && remote.tarefas1.length > 0 ? remote.tarefas1 : (this.localStore?.tarefas1 || INITIAL_TAREFAS_PARTE_1),
            tarefas2: Array.isArray(remote.tarefas2) && remote.tarefas2.length > 0 ? remote.tarefas2 : (this.localStore?.tarefas2 || INITIAL_TAREFAS_PARTE_2),
            tarefasPendencias: Array.isArray(remote.tarefasPendencias) && remote.tarefasPendencias.length > 0 ? remote.tarefasPendencias : (this.localStore?.tarefasPendencias || INITIAL_TAREFAS_PENDENCIAS),
            turnoConfig: remote.turnoConfig || this.localStore?.turnoConfig || INITIAL_TURNO,
            setupsAtivos: remote.setupsAtivos || {},
            concluidos: Array.isArray(remote.concluidos) ? remote.concluidos : [],
            sheetConfig: remote.sheetConfig || this.localStore?.sheetConfig,
            version: remote.version || 1,
            updatedAt: remote.updatedAt || Date.now()
          };

          this.notifyStore(this.localStore);
        }
      },
      (err) => {
        console.warn('Aviso no listener do Firestore:', err);
        this.isConnected = false;
        this.lastError = err.message;
        this.notifyStatus();
        if (onError) onError(err);
      }
    );

    this.unsubscribers.push(unsub);
  }

  /**
   * Salva o estado usando runTransaction de forma atômica e segura contra concorrência:
   * 1. Lê o documento atual no Firestore.
   * 2. Mescla setupsAtivos por chave (id) pelo maior updatedAt sem deletar setups ativos de outros tablets.
   * 3. Mescla concluidos por id (união sem duplicar).
   * 4. maquinas, preparadores, tarefas1, tarefas2, tarefasPendencias e turnoConfig: usa valor local apenas se mais recente.
   * 5. Se o array local estiver vazio e o do Firestore tiver itens, mantém o do Firestore.
   * 6. Incrementa version e atualiza updatedAt.
   */
  public static async salvarStore(incomingData: Partial<StoreData> | StoreData): Promise<StoreData> {
    const docRef = doc(db, APP_STATE_COLLECTION, APP_STATE_DOC);
    const now = Date.now();
    let finalMerged: StoreData = this.getCurrentStore();

    await runTransaction(db, async (txn) => {
      const snap = await txn.get(docRef);
      const remote = (snap.exists() ? (snap.data() as StoreData) : null) || null;

      // Se o banco estiver vazio e os dados locais vazios, não grava estado vazio por cima
      if (!remote) {
        const base = this.localStore || this.getDefaultStore();
        const payload: StoreData = {
          ...base,
          ...incomingData,
          version: 1,
          updatedAt: now
        };
        txn.set(docRef, payload);
        finalMerged = payload;
        return;
      }

      const local = incomingData;

      // 1. setupsAtivos por chave (id), usando o maior updatedAt (nunca apaga setups de outros tablets)
      const remoteAtivos = remote.setupsAtivos || {};
      const localAtivos = local.setupsAtivos || {};
      const mergedAtivos: Record<string, SetupAtivo> = { ...remoteAtivos };

      for (const [id, localSetup] of Object.entries(localAtivos)) {
        if (!localSetup) continue;
        const remoteSetup = remoteAtivos[id];
        if (!remoteSetup) {
          mergedAtivos[id] = localSetup;
        } else {
          const localUp = localSetup.updatedAt || 0;
          const remoteUp = remoteSetup.updatedAt || 0;
          mergedAtivos[id] = localUp >= remoteUp ? localSetup : remoteSetup;
        }
      }

      // 2. concluidos por id (união, sem duplicar)
      const remoteConc = Array.isArray(remote.concluidos) ? remote.concluidos : [];
      const localConc = Array.isArray(local.concluidos) ? local.concluidos : [];
      const concMap = new Map<string, SetupConcluido>();

      remoteConc.forEach((c) => {
        if (c && c.id) concMap.set(c.id, c);
      });

      localConc.forEach((c) => {
        if (c && c.id) {
          const existing = concMap.get(c.id);
          if (!existing) {
            concMap.set(c.id, c);
          } else {
            const localUp = c.updatedAt || c.timestamp || 0;
            const remoteUp = existing.updatedAt || existing.timestamp || 0;
            concMap.set(c.id, localUp >= remoteUp ? { ...existing, ...c } : existing);
          }
        }
      });

      const mergedConcluidos = Array.from(concMap.values()).sort(
        (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
      );

      // 3. Regras de mesclagem para configurações gerais:
      const mergedMaquinas =
        local.maquinas !== undefined
          ? local.maquinas
          : (remote.maquinas || []);

      const mergedPreparadores =
        local.preparadores !== undefined && local.preparadores.length > 0
          ? local.preparadores
          : (remote.preparadores && remote.preparadores.length > 0 ? remote.preparadores : INITIAL_PREPARADORES);

      const mergedTarefas1 =
        local.tarefas1 !== undefined && local.tarefas1.length > 0
          ? local.tarefas1
          : (remote.tarefas1 && remote.tarefas1.length > 0 ? remote.tarefas1 : INITIAL_TAREFAS_PARTE_1);

      const mergedTarefas2 =
        local.tarefas2 !== undefined && local.tarefas2.length > 0
          ? local.tarefas2
          : (remote.tarefas2 && remote.tarefas2.length > 0 ? remote.tarefas2 : INITIAL_TAREFAS_PARTE_2);

      const mergedTarefasPendencias =
        local.tarefasPendencias !== undefined && local.tarefasPendencias.length > 0
          ? local.tarefasPendencias
          : (remote.tarefasPendencias && remote.tarefasPendencias.length > 0 ? remote.tarefasPendencias : INITIAL_TAREFAS_PENDENCIAS);

      const mergedTurno =
        local.turnoConfig !== undefined
          ? local.turnoConfig
          : (remote.turnoConfig || INITIAL_TURNO);

      const mergedSheet = local.sheetConfig !== undefined ? local.sheetConfig : remote.sheetConfig;

      const newVersion = Math.max(remote.version || 0, local.version || 0, this.localStore?.version || 0) + 1;

      const mergedStore: StoreData = {
        maquinas: mergedMaquinas,
        preparadores: mergedPreparadores,
        tarefas1: mergedTarefas1,
        tarefas2: mergedTarefas2,
        tarefasPendencias: mergedTarefasPendencias,
        turnoConfig: mergedTurno,
        setupsAtivos: mergedAtivos,
        concluidos: mergedConcluidos,
        sheetConfig: mergedSheet,
        version: newVersion,
        updatedAt: now
      };

      txn.set(docRef, mergedStore);
      finalMerged = mergedStore;
    });

    this.localStore = finalMerged;
    this.notifyStore(finalMerged);
    return finalMerged;
  }

  public static async obterStore(): Promise<StoreData> {
    try {
      const docRef = doc(db, APP_STATE_COLLECTION, APP_STATE_DOC);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as StoreData;
        if (data && (!this.localStore || (data.version || 0) >= (this.localStore.version || 0))) {
          this.localStore = data;
        }
      }
    } catch (e) {
      console.warn('Aviso ao obter store do Firestore:', e);
    }
    return this.getCurrentStore();
  }

  // =========================================================================
  // MUTAÇÕES DO FLUXO OPERACIONAL
  // =========================================================================

  public static async iniciarSetup(setup: SetupAtivo, rowId: string): Promise<SetupAtivo> {
    const docRef = doc(db, APP_STATE_COLLECTION, APP_STATE_DOC);
    const now = Date.now();
    const cleanRowId = String(rowId || '').trim().toUpperCase();
    const cleanMaquina = String(setup.maquina || '').trim().toUpperCase();

    const setupCompleto: SetupAtivo = {
      ...setup,
      updatedAt: now,
      version: 1
    };

    await runTransaction(db, async (txn) => {
      const snap = await txn.get(docRef);
      const remote = snap.exists() ? (snap.data() as StoreData) : this.getDefaultStore();

      const nextMaquinas = (remote.maquinas || []).filter(
        (m) =>
          String(m.id || '').trim().toUpperCase() !== cleanRowId &&
          String(m.maquina || '').trim().toUpperCase() !== cleanMaquina
      );

      const nextSetups = {
        ...(remote.setupsAtivos || {}),
        [setup.id]: setupCompleto
      };

      const newVersion = (remote.version || 0) + 1;
      txn.set(docRef, {
        ...remote,
        maquinas: nextMaquinas,
        setupsAtivos: nextSetups,
        version: newVersion,
        updatedAt: now
      });

      if (this.localStore) {
        this.localStore = {
          ...this.localStore,
          maquinas: nextMaquinas,
          setupsAtivos: nextSetups,
          version: newVersion,
          updatedAt: now
        };
      }
    });

    this.notifyStore(this.getCurrentStore());
    return setupCompleto;
  }

  public static async autoSaveCard(
    id: string,
    prep1Val?: string,
    prep2Val?: string,
    checksParte1?: boolean[],
    checksParte2?: boolean[],
    checksPendencias?: boolean[],
    tempoDecorridoMs?: number
  ): Promise<SetupAtivo> {
    const docRef = doc(db, APP_STATE_COLLECTION, APP_STATE_DOC);
    const now = Date.now();
    let resultSetup: SetupAtivo | null = null;

    await runTransaction(db, async (txn) => {
      const snap = await txn.get(docRef);
      if (!snap.exists()) return;
      const remote = snap.data() as StoreData;
      const remoteAtivos = remote.setupsAtivos || {};
      const target = remoteAtivos[id];
      if (!target) return;

      const updatedSetup: SetupAtivo = {
        ...target,
        prep1Val: prep1Val !== undefined ? prep1Val : (target.prep1Val || ''),
        prep2Val: prep2Val !== undefined ? prep2Val : (target.prep2Val || ''),
        checksStateParte1: Array.isArray(checksParte1) ? checksParte1 : (target.checksStateParte1 || []),
        checksStateParte2: Array.isArray(checksParte2) ? checksParte2 : (target.checksStateParte2 || []),
        checksStatePendencias: Array.isArray(checksPendencias) ? checksPendencias : (target.checksStatePendencias || []),
        tempoDecorridoMs: tempoDecorridoMs !== undefined && tempoDecorridoMs > 0 ? tempoDecorridoMs : (target.tempoDecorridoMs || 0),
        lastTick: now,
        updatedAt: now,
        version: (target.version || 0) + 1
      };

      resultSetup = updatedSetup;
      const nextAtivos = {
        ...remoteAtivos,
        [id]: updatedSetup
      };
      const newVersion = (remote.version || 0) + 1;

      txn.update(docRef, {
        setupsAtivos: nextAtivos,
        version: newVersion,
        updatedAt: now
      });

      if (this.localStore) {
        this.localStore.setupsAtivos = nextAtivos;
        this.localStore.version = newVersion;
        this.localStore.updatedAt = now;
      }
    });

    const finalStore = this.getCurrentStore();
    this.notifyStore(finalStore);
    return resultSetup || finalStore.setupsAtivos?.[id] || ({} as SetupAtivo);
  }

  public static async aplicarDesconto(id: string, tipo: 'cafe' | 'almoco'): Promise<SetupAtivo> {
    const docRef = doc(db, APP_STATE_COLLECTION, APP_STATE_DOC);
    const now = Date.now();
    let resultSetup: SetupAtivo | null = null;

    await runTransaction(db, async (txn) => {
      const snap = await txn.get(docRef);
      if (!snap.exists()) return;
      const remote = snap.data() as StoreData;
      const remoteAtivos = remote.setupsAtivos || {};
      const setup = remoteAtivos[id];
      if (!setup) return;

      const strDH = new Date(now).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const dur = tipo === 'cafe' ? 15 * 60 * 1000 : 90 * 60 * 1000;
      const horaIni = getHoraSP(now);
      const horaFim = getHoraSP(now + dur);
      const motivo = tipo === 'cafe' ? 'Café (-15 min)' : 'Almoço (-1.5h)';

      const novoEvento: ParadaEvento = {
        id: `ev_${now}`,
        timestamp: strDH,
        tipo,
        motivo,
        inicioMs: now,
        fimMs: now + dur,
        duracaoMs: dur
      };

      const updatedSetup: SetupAtivo = {
        ...setup,
        deductionsMs: (setup.deductionsMs || 0) + dur,
        historico: [...(setup.historico || []), `[${horaIni} às ${horaFim}] ${motivo}`],
        eventos: [...(setup.eventos || []), novoEvento],
        updatedAt: now,
        version: (setup.version || 0) + 1
      };

      resultSetup = updatedSetup;
      const nextAtivos = {
        ...remoteAtivos,
        [id]: updatedSetup
      };
      const newVersion = (remote.version || 0) + 1;

      txn.update(docRef, {
        setupsAtivos: nextAtivos,
        version: newVersion,
        updatedAt: now
      });

      if (this.localStore) {
        this.localStore.setupsAtivos = nextAtivos;
        this.localStore.version = newVersion;
        this.localStore.updatedAt = now;
      }
    });

    const finalStore = this.getCurrentStore();
    this.notifyStore(finalStore);
    return resultSetup || finalStore.setupsAtivos?.[id] || ({} as SetupAtivo);
  }

  public static async iniciarParada(id: string, motivo: string): Promise<SetupAtivo> {
    const docRef = doc(db, APP_STATE_COLLECTION, APP_STATE_DOC);
    const now = Date.now();
    let resultSetup: SetupAtivo | null = null;

    await runTransaction(db, async (txn) => {
      const snap = await txn.get(docRef);
      if (!snap.exists()) return;
      const remote = snap.data() as StoreData;
      const remoteAtivos = remote.setupsAtivos || {};
      const setup = remoteAtivos[id];
      if (!setup) return;

      const strDH = new Date(now).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const novoEvento: ParadaEvento = {
        id: `parada_${now}`,
        timestamp: strDH,
        tipo: 'parada',
        motivo: motivo.trim() || 'Parada iniciada',
        inicioMs: now,
        emAndamento: true
      };

      const updatedSetup: SetupAtivo = {
        ...setup,
        paradaAtiva: true,
        paradaAtual: novoEvento,
        eventos: [...(setup.eventos || []), novoEvento],
        historico: [...(setup.historico || []), `[${strDH}] Parada iniciada: ${motivo.trim() || 'Sem motivo prévio'}`],
        updatedAt: now,
        version: (setup.version || 0) + 1
      };

      resultSetup = updatedSetup;
      const nextAtivos = {
        ...remoteAtivos,
        [id]: updatedSetup
      };
      const newVersion = (remote.version || 0) + 1;

      txn.update(docRef, {
        setupsAtivos: nextAtivos,
        version: newVersion,
        updatedAt: now
      });

      if (this.localStore) {
        this.localStore.setupsAtivos = nextAtivos;
        this.localStore.version = newVersion;
        this.localStore.updatedAt = now;
      }
    });

    const finalStore = this.getCurrentStore();
    this.notifyStore(finalStore);
    return resultSetup || finalStore.setupsAtivos?.[id] || ({} as SetupAtivo);
  }

  public static async finalizarParada(id: string, motivo: string): Promise<SetupAtivo> {
    const docRef = doc(db, APP_STATE_COLLECTION, APP_STATE_DOC);
    const now = Date.now();
    let resultSetup: SetupAtivo | null = null;

    await runTransaction(db, async (txn) => {
      const snap = await txn.get(docRef);
      if (!snap.exists()) return;
      const remote = snap.data() as StoreData;
      const remoteAtivos = remote.setupsAtivos || {};
      const setup = remoteAtivos[id];
      if (!setup) return;

      let deductionsMs = setup.deductionsMs || 0;
      let eventos = [...(setup.eventos || [])];
      let historico = (setup.historico || []).filter((h) => !h.includes('Parada iniciada'));

      if (setup.paradaAtual) {
        const duracaoMs = Math.max(0, now - setup.paradaAtual.inicioMs);
        deductionsMs += duracaoMs;
        const duracaoFormatada = formatarTempoMs(duracaoMs);
        const horaIni = getHoraSP(setup.paradaAtual.inicioMs);
        const horaFim = getHoraSP(now);
        historico.push(`[${horaIni} às ${horaFim}] Parada (${duracaoFormatada}): ${motivo.trim()}`);

        eventos = eventos.map((ev) => {
          if (ev.id === setup.paradaAtual?.id) {
            return { ...ev, fimMs: now, duracaoMs, emAndamento: false, motivo: motivo.trim() };
          }
          return ev;
        });
      }

      const updatedSetup: SetupAtivo = {
        ...setup,
        paradaAtiva: false,
        paradaAtual: undefined,
        deductionsMs,
        eventos,
        historico,
        updatedAt: now,
        version: (setup.version || 0) + 1
      };

      resultSetup = updatedSetup;
      const nextAtivos = {
        ...remoteAtivos,
        [id]: updatedSetup
      };
      const newVersion = (remote.version || 0) + 1;

      txn.update(docRef, {
        setupsAtivos: nextAtivos,
        version: newVersion,
        updatedAt: now
      });

      if (this.localStore) {
        this.localStore.setupsAtivos = nextAtivos;
        this.localStore.version = newVersion;
        this.localStore.updatedAt = now;
      }
    });

    const finalStore = this.getCurrentStore();
    this.notifyStore(finalStore);
    return resultSetup || finalStore.setupsAtivos?.[id] || ({} as SetupAtivo);
  }

  public static async liberarMaquina(
    id: string,
    prep1: string,
    prep2: string,
    tempoFormatado: string,
    tempoMs: number
  ): Promise<{ setupConcluido: SetupConcluido; setupAtivo: SetupAtivo }> {
    const docRef = doc(db, APP_STATE_COLLECTION, APP_STATE_DOC);
    const now = Date.now();
    const dataStr = getDataHoraCurtaSP(now);
    const concId = `conc_${now}`;
    const horaLib = getHoraSP(now);

    let resultConcluido: SetupConcluido | null = null;
    let resultAtivo: SetupAtivo | null = null;

    await runTransaction(db, async (txn) => {
      const snap = await txn.get(docRef);
      if (!snap.exists()) return;
      const remote = snap.data() as StoreData;
      const remoteAtivos = remote.setupsAtivos || {};
      const setup = remoteAtivos[id];
      if (!setup) return;

      const historico = [...(setup.historico || []), `[${horaLib}] Máquina liberada para produção (Início das pendências)`];

      const updatedSetup: SetupAtivo = {
        ...setup,
        setupRegistrado: true,
        prep1Val: prep1,
        prep2Val: prep2,
        tempoFormatado,
        tempoSetupMs: tempoMs,
        pendenciasInicioMs: now,
        historico,
        updatedAt: now,
        version: (setup.version || 0) + 1
      };

      const novoConcluido: SetupConcluido = {
        id: concId,
        data: dataStr,
        timestamp: now,
        maquina: setup.maquina,
        peca: setup.peca,
        modeloAnterior: setup.modeloAnterior,
        prep1,
        prep2,
        tempo: tempoFormatado,
        tempoMs,
        historico: historico.join(' | '),
        eventos: setup.eventos || [],
        pendenciasConcluidas: false,
        pendenciasInicioMs: now,
        version: 1,
        updatedAt: now
      };

      resultConcluido = novoConcluido;
      resultAtivo = updatedSetup;

      const nextAtivos = {
        ...remoteAtivos,
        [id]: updatedSetup
      };
      const nextConcluidos = [novoConcluido, ...(remote.concluidos || []).filter((c) => c.id !== concId)];
      const newVersion = (remote.version || 0) + 1;

      txn.update(docRef, {
        setupsAtivos: nextAtivos,
        concluidos: nextConcluidos,
        version: newVersion,
        updatedAt: now
      });

      if (this.localStore) {
        this.localStore.setupsAtivos = nextAtivos;
        this.localStore.concluidos = nextConcluidos;
        this.localStore.version = newVersion;
        this.localStore.updatedAt = now;
      }
    });

    const finalStore = this.getCurrentStore();
    this.notifyStore(finalStore);
    return {
      setupConcluido: resultConcluido || ({} as SetupConcluido),
      setupAtivo: resultAtivo || ({} as SetupAtivo)
    };
  }

  public static async encerrarPendencias(id: string, turnoConfig?: TurnoConfig): Promise<boolean> {
    const docRef = doc(db, APP_STATE_COLLECTION, APP_STATE_DOC);
    const now = Date.now();

    await runTransaction(db, async (txn) => {
      const snap = await txn.get(docRef);
      if (!snap.exists()) return;
      const remote = snap.data() as StoreData;
      const remoteAtivos = { ...(remote.setupsAtivos || {}) };
      const setup = remoteAtivos[id];
      if (!setup) return;

      const cfg = turnoConfig || remote.turnoConfig || INITIAL_TURNO;
      const inicioPend = setup.pendenciasInicioMs || setup.updatedAt || now;
      const duracaoPendMs = calcularTempoValidoTurno(inicioPend, now, cfg);
      const tempoPendFormatado = formatarTempoMs(duracaoPendMs);
      const horaIni = getHoraSP(inicioPend);
      const horaFim = getHoraSP(now);
      const linhaPend = `[${horaIni} às ${horaFim}] [Pós-Setup] Organização & Pendências: ${tempoPendFormatado}`;

      delete remoteAtivos[id];

      const nextConcluidos = (remote.concluidos || []).map((c) => {
        if (c.maquina.toUpperCase() === setup.maquina.toUpperCase() && !c.pendenciasConcluidas) {
          const evPend: ParadaEvento = {
            id: `ev_pend_${now}`,
            timestamp: `${horaIni} às ${horaFim}`,
            tipo: 'info',
            motivo: `[Pós-Setup] Organização & Pendências: ${tempoPendFormatado}`,
            inicioMs: inicioPend,
            fimMs: now,
            duracaoMs: duracaoPendMs
          };

          return {
            ...c,
            pendenciasConcluidas: true,
            pendenciasInicioMs: inicioPend,
            pendenciasFimMs: now,
            tempoPendenciasMs: duracaoPendMs,
            tempoPendenciasFormatado: tempoPendFormatado,
            historico: c.historico ? `${c.historico} | ${linhaPend}` : linhaPend,
            eventos: [...(c.eventos || []).filter((e) => !e.id.startsWith('ev_pend_')), evPend],
            updatedAt: now,
            version: (c.version || 0) + 1
          };
        }
        return c;
      });

      const newVersion = (remote.version || 0) + 1;
      txn.update(docRef, {
        setupsAtivos: remoteAtivos,
        concluidos: nextConcluidos,
        version: newVersion,
        updatedAt: now
      });

      if (this.localStore) {
        this.localStore.setupsAtivos = remoteAtivos;
        this.localStore.concluidos = nextConcluidos;
        this.localStore.version = newVersion;
        this.localStore.updatedAt = now;
      }
    });

    this.notifyStore(this.getCurrentStore());
    return true;
  }

  public static async cancelarSetupAtivo(id: string): Promise<void> {
    const docRef = doc(db, APP_STATE_COLLECTION, APP_STATE_DOC);
    const now = Date.now();

    await runTransaction(db, async (txn) => {
      const snap = await txn.get(docRef);
      if (!snap.exists()) return;
      const remote = snap.data() as StoreData;
      const remoteAtivos = { ...(remote.setupsAtivos || {}) };
      delete remoteAtivos[id];
      const newVersion = (remote.version || 0) + 1;

      txn.update(docRef, {
        setupsAtivos: remoteAtivos,
        version: newVersion,
        updatedAt: now
      });

      if (this.localStore) {
        this.localStore.setupsAtivos = remoteAtivos;
        this.localStore.version = newVersion;
        this.localStore.updatedAt = now;
      }
    });

    this.notifyStore(this.getCurrentStore());
  }

  public static async editarTempoConcluido(setupId: string, novoTempo: string): Promise<void> {
    const cleanTempo = novoTempo.trim();
    let ms = 0;
    const partes = cleanTempo.split(':');
    if (partes.length === 3) {
      ms = (+partes[0] * 3600 + +partes[1] * 60 + +partes[2]) * 1000;
    } else if (partes.length === 2) {
      ms = (+partes[0] * 60 + +partes[1]) * 1000;
    } else {
      ms = (+partes[0] || 0) * 60 * 1000;
    }

    const current = this.getCurrentStore();
    const nextConcluidos = (current.concluidos || []).map((c) => {
      if (c.id === setupId) {
        return {
          ...c,
          tempo: cleanTempo,
          tempoMs: ms,
          updatedAt: Date.now(),
          version: (c.version || 0) + 1
        };
      }
      return c;
    });

    await this.salvarStore({
      concluidos: nextConcluidos,
      updatedAt: Date.now()
    });
  }

  public static async adicionarMaquina(maquina: string, peca: string): Promise<void> {
    const current = this.getCurrentStore();
    const nova: Maquina = {
      id: `m_${Date.now()}`,
      maquina: maquina.trim().toUpperCase(),
      peca: peca.trim().toUpperCase(),
      setupExternoPronto: false
    };

    await this.salvarStore({
      maquinas: [...(current.maquinas || []), nova],
      updatedAt: Date.now()
    });
  }

  public static async deletarMaquina(maquinaId: string): Promise<void> {
    const cleanId = String(maquinaId || '').trim().toUpperCase();
    const docRef = doc(db, APP_STATE_COLLECTION, APP_STATE_DOC);
    const now = Date.now();

    await runTransaction(db, async (txn) => {
      const snap = await txn.get(docRef);
      if (!snap.exists()) return;
      const remote = snap.data() as StoreData;
      const currentList = Array.isArray(remote.maquinas) ? remote.maquinas : [];
      const filtered = currentList.filter(
        (m) =>
          String(m.id || '').trim().toUpperCase() !== cleanId &&
          String(m.maquina || '').trim().toUpperCase() !== cleanId
      );
      const newVersion = (remote.version || 0) + 1;
      txn.update(docRef, {
        maquinas: filtered,
        version: newVersion,
        updatedAt: now
      });
      if (this.localStore) {
        this.localStore.maquinas = filtered;
        this.localStore.version = newVersion;
        this.localStore.updatedAt = now;
      }
    });

    this.notifyStore(this.getCurrentStore());
  }

  public static async toggleSetupExterno(maquinaId: string): Promise<void> {
    const cleanId = String(maquinaId || '').trim().toUpperCase();
    const docRef = doc(db, APP_STATE_COLLECTION, APP_STATE_DOC);
    const now = Date.now();

    await runTransaction(db, async (txn) => {
      const snap = await txn.get(docRef);
      if (!snap.exists()) return;
      const remote = snap.data() as StoreData;
      const currentList = Array.isArray(remote.maquinas) ? remote.maquinas : [];
      const updated = currentList.map((m) => {
        if (
          String(m.id || '').trim().toUpperCase() === cleanId ||
          String(m.maquina || '').trim().toUpperCase() === cleanId
        ) {
          return { ...m, setupExternoPronto: !m.setupExternoPronto };
        }
        return m;
      });
      const newVersion = (remote.version || 0) + 1;
      txn.update(docRef, {
        maquinas: updated,
        version: newVersion,
        updatedAt: now
      });
      if (this.localStore) {
        this.localStore.maquinas = updated;
        this.localStore.version = newVersion;
        this.localStore.updatedAt = now;
      }
    });

    this.notifyStore(this.getCurrentStore());
  }

  public static async limparMaquinas(): Promise<void> {
    const docRef = doc(db, APP_STATE_COLLECTION, APP_STATE_DOC);
    const now = Date.now();

    await runTransaction(db, async (txn) => {
      const snap = await txn.get(docRef);
      if (!snap.exists()) return;
      const remote = snap.data() as StoreData;
      const newVersion = (remote.version || 0) + 1;
      txn.update(docRef, {
        maquinas: [],
        version: newVersion,
        updatedAt: now
      });
      if (this.localStore) {
        this.localStore.maquinas = [];
        this.localStore.version = newVersion;
        this.localStore.updatedAt = now;
      }
    });

    this.notifyStore(this.getCurrentStore());
  }

  public static async adicionarPreparador(nome: string): Promise<void> {
    const current = this.getCurrentStore();
    const clean = nome.trim().toUpperCase();
    const lista = [...(current.preparadores || INITIAL_PREPARADORES)];
    if (!lista.includes(clean)) {
      lista.push(clean);
    }
    await this.salvarStore({
      preparadores: lista,
      updatedAt: Date.now()
    });
  }

  public static async deletarPreparador(nome: string): Promise<void> {
    const current = this.getCurrentStore();
    const clean = nome.trim().toUpperCase();
    const lista = (current.preparadores || INITIAL_PREPARADORES).filter((p) => p !== clean);
    await this.salvarStore({
      preparadores: lista,
      updatedAt: Date.now()
    });
  }

  public static async salvarTarefas(grupo: 'parte1' | 'parte2' | 'pendencias', tarefas: string[]): Promise<void> {
    const update: Partial<StoreData> = { updatedAt: Date.now() };
    if (grupo === 'parte1') update.tarefas1 = tarefas;
    else if (grupo === 'parte2') update.tarefas2 = tarefas;
    else update.tarefasPendencias = tarefas;
    await this.salvarStore(update);
  }

  public static async salvarTurno(turnoConfig: TurnoConfig): Promise<void> {
    await this.salvarStore({
      turnoConfig,
      updatedAt: Date.now()
    });
  }

  public static async salvarSheetConfig(sheetConfig?: GoogleSheetConfig): Promise<void> {
    await this.salvarStore({
      sheetConfig: sheetConfig || undefined,
      updatedAt: Date.now()
    });
  }

  public static async esvaziarConcluidos(): Promise<void> {
    await this.salvarStore({
      concluidos: [],
      updatedAt: Date.now()
    });
  }

  public static async resetDemo(): Promise<void> {
    await this.salvarStore({
      tarefas1: INITIAL_TAREFAS_PARTE_1,
      tarefas2: INITIAL_TAREFAS_PARTE_2,
      tarefasPendencias: INITIAL_TAREFAS_PENDENCIAS,
      updatedAt: Date.now()
    });
  }

  public static async resetTotal(defaultChecklists?: {
    preparadores: string[];
    tarefas1: string[];
    tarefas2: string[];
    tarefasPendencias: string[];
  }): Promise<StoreData> {
    return await this.salvarStore({
      maquinas: [],
      preparadores: defaultChecklists?.preparadores || INITIAL_PREPARADORES,
      tarefas1: defaultChecklists?.tarefas1 || INITIAL_TAREFAS_PARTE_1,
      tarefas2: defaultChecklists?.tarefas2 || INITIAL_TAREFAS_PARTE_2,
      tarefasPendencias: defaultChecklists?.tarefasPendencias || INITIAL_TAREFAS_PENDENCIAS,
      turnoConfig: INITIAL_TURNO,
      setupsAtivos: {},
      concluidos: [],
      updatedAt: Date.now()
    });
  }

  public static async carregarDados(backup: any): Promise<void> {
    if (!backup || typeof backup !== 'object') return;
    await this.salvarStore({
      ...backup,
      updatedAt: Date.now()
    });
  }

  public static async registrarSetupConcluido(concluido: SetupConcluido): Promise<void> {
    if (!concluido || !concluido.id) return;
    const current = this.getCurrentStore();
    const nextConcluidos = [concluido, ...(current.concluidos || []).filter((c) => c.id !== concluido.id)];
    await this.salvarStore({
      concluidos: nextConcluidos,
      updatedAt: Date.now()
    });
  }

  public static async criarSnapshotNuvem(data: StoreData, autor: string = 'Líder CNC'): Promise<string> {
    const backupId = `backup_${Date.now()}`;
    const docRef = doc(db, 'backups_cloud', backupId);
    const cleanData = JSON.parse(
      JSON.stringify({
        ...data,
        backupId,
        criadoEm: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        timestamp: Date.now(),
        autor
      })
    );
    await setDoc(docRef, cleanData);
    return backupId;
  }

  public static lerArquivoBackupJson(file: File): Promise<StoreData> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target?.result as string);
          resolve(json);
        } catch {
          reject(new Error('Arquivo JSON inválido'));
        }
      };
      reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
      reader.readAsText(file);
    });
  }

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
}
