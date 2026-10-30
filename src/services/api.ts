import type { StoreData, SetupAtivo, TurnoConfig, GoogleSheetConfig, SetupConcluido, Maquina } from '../types';
import { FirebaseService } from './firebase';

const STORAGE_KEY = 'setup_interno_screen_cache';

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

export class SetupApiService {
  private static cachedData: StoreData | null = null;

  public static getCachedData(): StoreData | null {
    return this.cachedData || FirebaseService.getCurrentStore();
  }

  /**
   * Obtém a store atual partindo do Firestore em tempo real.
   * O localStorage funciona apenas como cache de tela para carregamento instantâneo.
   */
  public static getCurrentStore(): StoreData {
    const fsData = FirebaseService.getCurrentStore();
    if (fsData && (fsData.maquinas.length > 0 || Object.keys(fsData.setupsAtivos).length > 0 || fsData.concluidos.length > 0)) {
      return fsData;
    }
    if (this.cachedData) {
      return this.cachedData;
    }
    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          this.cachedData = JSON.parse(saved);
          return this.cachedData!;
        }
      }
    } catch {
      // Ignora erro de leitura do localStorage
    }
    return {
      maquinas: [],
      preparadores: INITIAL_PREPARADORES,
      tarefas1: INITIAL_TAREFAS_PARTE_1,
      tarefas2: INITIAL_TAREFAS_PARTE_2,
      tarefasPendencias: INITIAL_TAREFAS_PENDENCIAS,
      turnoConfig: INITIAL_TURNO,
      setupsAtivos: {},
      concluidos: []
    };
  }

  public static setCache(data: StoreData, _forceNotify: boolean = false) {
    this.cachedData = data;
    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
    } catch {
      // Ignora erro de gravação em localStorage
    }
  }

  public static subscribe(listener: (data: StoreData) => void): () => void {
    return FirebaseService.subscribeStore((store) => {
      this.setCache(store, false);
      listener(store);
    });
  }

  public static isServerAvailable(): boolean {
    return false;
  }

  public static syncFromCloud(_cloudData: StoreData) {
    // Desativado: o Firestore é a única fonte da verdade, eliminando o arquivo local e conflitos
  }

  public static async fetchSync(): Promise<StoreData> {
    try {
      const data = await FirebaseService.obterStore();
      this.setCache(data, false);
      return data;
    } catch {
      return this.getCurrentStore();
    }
  }

  public static findSetupAtivo(
    store: StoreData,
    id: string
  ): { setup: SetupAtivo; key: string } | null {
    if (!store.setupsAtivos) return null;
    if (store.setupsAtivos[id]) {
      return { setup: store.setupsAtivos[id], key: id };
    }
    const clean = String(id || '').trim().toUpperCase();
    const key = Object.keys(store.setupsAtivos).find((k) => {
      const s = store.setupsAtivos[k];
      return (
        k === id ||
        s.id === id ||
        String(s.rowId) === String(id) ||
        (s.maquina && s.maquina.trim().toUpperCase() === clean)
      );
    });
    if (key && store.setupsAtivos[key]) {
      return { setup: store.setupsAtivos[key], key };
    }
    return null;
  }

  public static async iniciarSetup(
    rowIdOrSetup: string | SetupAtivo,
    maquina?: string,
    peca?: string,
    modeloAnterior?: string,
    forcedId?: string,
    forcedInicioMs?: number,
    forcedDataInicioStr?: string
  ): Promise<{ setup: SetupAtivo; data: StoreData }> {
    if (typeof rowIdOrSetup === 'object') {
      const setup = rowIdOrSetup;
      const created = await FirebaseService.iniciarSetup(setup, setup.rowId);
      return { setup: created, data: FirebaseService.getCurrentStore() };
    }

    const agora = forcedInicioMs || Date.now();
    const dataInicioStr = forcedDataInicioStr || getDataHoraCurtaSP(agora);
    const id = forcedId || `setup_${agora}`;
    const modClean = (modeloAnterior || '').trim() || 'NÃO INFORMADO';

    const novoSetup: SetupAtivo = {
      id,
      rowId: String(rowIdOrSetup),
      maquina: maquina || '',
      peca: peca || '-',
      modeloAnterior: modClean,
      prep1Val: '',
      prep2Val: '',
      dataInicio: dataInicioStr,
      inicioMs: agora,
      lastTick: agora,
      tempoDecorridoMs: 0,
      deductionsMs: 0,
      paradaAtiva: false,
      historico: [`[${dataInicioStr}] Início do setup`],
      eventos: [],
      checksStateParte1: [],
      checksStateParte2: [],
      checksStatePendencias: [],
      setupRegistrado: false,
      updatedAt: agora,
      version: 1
    };

    const created = await FirebaseService.iniciarSetup(novoSetup, String(rowIdOrSetup));
    return { setup: created, data: FirebaseService.getCurrentStore() };
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
    return await FirebaseService.autoSaveCard(
      id,
      prep1Val,
      prep2Val,
      checksParte1,
      checksParte2,
      checksPendencias,
      tempoDecorridoMs
    );
  }

  public static async aplicarDesconto(id: string, tipo: 'cafe' | 'almoco'): Promise<SetupAtivo> {
    return await FirebaseService.aplicarDesconto(id, tipo);
  }

  public static async iniciarParada(id: string, motivo: string): Promise<SetupAtivo> {
    return await FirebaseService.iniciarParada(id, motivo);
  }

  public static async finalizarParada(id: string, motivo: string): Promise<SetupAtivo> {
    return await FirebaseService.finalizarParada(id, motivo);
  }

  public static async liberarMaquina(
    id: string,
    prep1: string,
    prep2: string,
    tempoFormatado: string,
    tempoMs: number
  ): Promise<{ setupConcluido: SetupConcluido; setupAtivo: SetupAtivo; concluido: SetupConcluido; data: StoreData }> {
    const res = await FirebaseService.liberarMaquina(id, prep1, prep2, tempoFormatado, tempoMs);
    return {
      setupConcluido: res.setupConcluido,
      setupAtivo: res.setupAtivo,
      concluido: res.setupConcluido,
      data: FirebaseService.getCurrentStore()
    };
  }

  public static async encerrarPendencias(id: string, turnoConfig?: TurnoConfig): Promise<{ sucesso: boolean; data: StoreData }> {
    const sucesso = await FirebaseService.encerrarPendencias(id, turnoConfig);
    return { sucesso, data: FirebaseService.getCurrentStore() };
  }

  public static async cancelarSetupAtivo(id: string): Promise<{ sucesso: boolean; data: StoreData }> {
    await FirebaseService.cancelarSetupAtivo(id);
    return { sucesso: true, data: FirebaseService.getCurrentStore() };
  }

  public static async editarTempoConcluido(setupId: string, novoTempo: string, _senha?: string): Promise<{ sucesso: boolean; data: StoreData }> {
    await FirebaseService.editarTempoConcluido(setupId, novoTempo);
    return { sucesso: true, data: FirebaseService.getCurrentStore() };
  }

  public static async adicionarMaquina(maquina: string, peca: string): Promise<{ sucesso: boolean; data: StoreData }> {
    await FirebaseService.adicionarMaquina(maquina, peca);
    return { sucesso: true, data: FirebaseService.getCurrentStore() };
  }

  public static async deletarMaquina(maquinaId: string, _senha?: string): Promise<{ sucesso: boolean; data: StoreData }> {
    await FirebaseService.deletarMaquina(maquinaId);
    return { sucesso: true, data: FirebaseService.getCurrentStore() };
  }

  public static async toggleSetupExterno(maquinaId: string, _senha?: string): Promise<{ sucesso: boolean; data: StoreData }> {
    await FirebaseService.toggleSetupExterno(maquinaId);
    return { sucesso: true, data: FirebaseService.getCurrentStore() };
  }

  public static async limparMaquinas(_senha?: string): Promise<{ sucesso: boolean; data: StoreData }> {
    await FirebaseService.limparMaquinas();
    return { sucesso: true, data: FirebaseService.getCurrentStore() };
  }

  public static async adicionarPreparador(nome: string): Promise<{ sucesso: boolean; data: StoreData }> {
    await FirebaseService.adicionarPreparador(nome);
    return { sucesso: true, data: FirebaseService.getCurrentStore() };
  }

  public static async deletarPreparador(nome: string, _senha?: string): Promise<{ sucesso: boolean; data: StoreData }> {
    await FirebaseService.deletarPreparador(nome);
    return { sucesso: true, data: FirebaseService.getCurrentStore() };
  }

  public static async salvarTarefas(grupo: 'parte1' | 'parte2' | 'pendencias', tarefas: string[], _senha?: string): Promise<{ sucesso: boolean; data: StoreData }> {
    await FirebaseService.salvarTarefas(grupo, tarefas);
    return { sucesso: true, data: FirebaseService.getCurrentStore() };
  }

  public static async salvarTurno(turnoConfig: TurnoConfig, _senha?: string): Promise<{ sucesso: boolean; data: StoreData }> {
    await FirebaseService.salvarTurno(turnoConfig);
    return { sucesso: true, data: FirebaseService.getCurrentStore() };
  }

  public static async salvarSheetConfig(sheetConfig?: GoogleSheetConfig): Promise<{ sucesso: boolean; data: StoreData }> {
    await FirebaseService.salvarSheetConfig(sheetConfig);
    return { sucesso: true, data: FirebaseService.getCurrentStore() };
  }

  public static async esvaziarConcluidos(_senha?: string): Promise<{ sucesso: boolean; data: StoreData }> {
    await FirebaseService.esvaziarConcluidos();
    return { sucesso: true, data: FirebaseService.getCurrentStore() };
  }

  public static async resetDemo(): Promise<{ sucesso: boolean; data: StoreData }> {
    await FirebaseService.resetDemo();
    return { sucesso: true, data: FirebaseService.getCurrentStore() };
  }

  public static async resetTotal(_senha?: string): Promise<{ sucesso: boolean; data: StoreData }> {
    const data = await FirebaseService.resetTotal();
    return { sucesso: true, data };
  }

  public static async carregarDados(backup: any, _senha?: string): Promise<{ sucesso: boolean; data: StoreData }> {
    await FirebaseService.carregarDados(backup);
    return { sucesso: true, data: FirebaseService.getCurrentStore() };
  }

  public static async mesclarPlanilha(
    concluidos?: SetupConcluido[],
    maquinas?: Maquina[],
    _substituirTudo: boolean = true,
    preparadores?: string[],
    ativos?: Record<string, SetupAtivo>
  ): Promise<{ sucesso: boolean; data: StoreData }> {
    await FirebaseService.carregarDados({
      concluidos,
      maquinas,
      preparadores,
      setupsAtivos: ativos
    });
    return { sucesso: true, data: FirebaseService.getCurrentStore() };
  }
}
