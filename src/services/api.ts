import type { StoreData, SetupAtivo, TurnoConfig, GoogleSheetConfig, SetupConcluido, Maquina, ParadaEvento } from '../types';
import { FirebaseService } from './firebase';

const STORAGE_KEY = 'setup_interno_local_cache';

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

function getHoraSP(date: Date | number = new Date()): string {
  const d = typeof date === 'number' ? new Date(date) : date;
  return d.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatarTempoMs(ms: number): string {
  const totalSeg = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

export class SetupApiService {
  private static cachedData: StoreData | null = null;
  private static listeners: Array<(data: StoreData) => void> = [];

  public static getCachedData(): StoreData | null {
    if (this.cachedData) return this.cachedData;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        this.cachedData = JSON.parse(saved);
        return this.cachedData;
      }
    } catch (e) {
      console.warn('Erro ao ler cache local:', e);
    }
    return null;
  }

  public static getCurrentStore(): StoreData {
    const cached = this.getCachedData();
    if (cached) {
      return {
        maquinas: Array.isArray(cached.maquinas) ? cached.maquinas : [],
        preparadores: Array.isArray(cached.preparadores) ? cached.preparadores : INITIAL_PREPARADORES,
        tarefas1: Array.isArray(cached.tarefas1) ? cached.tarefas1 : INITIAL_TAREFAS_PARTE_1,
        tarefas2: Array.isArray(cached.tarefas2) ? cached.tarefas2 : INITIAL_TAREFAS_PARTE_2,
        tarefasPendencias: Array.isArray(cached.tarefasPendencias) ? cached.tarefasPendencias : INITIAL_TAREFAS_PENDENCIAS,
        turnoConfig: cached.turnoConfig || INITIAL_TURNO,
        setupsAtivos: cached.setupsAtivos || {},
        concluidos: Array.isArray(cached.concluidos) ? cached.concluidos : [],
        sheetConfig: cached.sheetConfig
      };
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

  public static setCache(data: StoreData, forceNotify: boolean = true) {
    const oldStr = this.cachedData ? JSON.stringify(this.cachedData) : '';
    const newStr = JSON.stringify(data);
    this.cachedData = data;
    try {
      localStorage.setItem(STORAGE_KEY, newStr);
    } catch (e) {
      console.warn('Erro ao gravar cache local:', e);
    }
    if (forceNotify || oldStr !== newStr) {
      this.notify(data);
    }
  }

  public static subscribe(listener: (data: StoreData) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private static notify(data: StoreData) {
    this.listeners.forEach((l) => {
      try {
        l(data);
      } catch (err) {
        console.error('Erro em listener do SetupApiService:', err);
      }
    });
  }

  private static serverAvailable: boolean | null = null;

  public static isServerAvailable(): boolean {
    return this.serverAvailable === true;
  }

  /**
   * Helper seguro que tenta chamar a API local/Express.
   * Se já detectamos que a aplicação está rodando em ambiente serverless/Vercel (sem backend Express),
   * executa de imediato sem emitir requisições de rede inúteis com erro 404.
   */
  private static async safeFetchJson<T>(url: string, options?: RequestInit): Promise<T | null> {
    if (this.serverAvailable === false) {
      return null;
    }
    try {
      const res = await fetch(url, options);
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        if (this.serverAvailable === null) {
          this.serverAvailable = false;
        }
        return null;
      }
      this.serverAvailable = true;
      return (await res.json()) as T;
    } catch {
      if (this.serverAvailable === null) {
        this.serverAvailable = false;
      }
      return null;
    }
  }

  public static async fetchSync(): Promise<StoreData> {
    // 1. Tenta backend local se estiver ativo
    const serverData = await this.safeFetchJson<StoreData>(`/api/setup/sync?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache'
      }
    });

    if (serverData && serverData.turnoConfig) {
      this.serverAvailable = true;
      this.setCache(serverData, false);
      return serverData;
    }

    // 2. Se estiver no Vercel (onde /api não existe ou retorna 404 HTML), busca diretamente do Firebase
    try {
      const cloudData = await FirebaseService.obterStore();
      if (cloudData && cloudData.turnoConfig) {
        this.setCache(cloudData, false);
        return cloudData;
      }
    } catch (e) {
      console.warn('Aviso ao sincronizar do Firebase:', e);
    }

    // 3. Fallback no cache local
    const current = this.getCurrentStore();
    this.setCache(current, false);
    return current;
  }

  public static async iniciarSetup(
    rowId: string,
    maquina: string,
    peca: string,
    modeloAnterior: string
  ): Promise<{ setup: SetupAtivo; data: StoreData }> {
    const agora = Date.now();
    const dataInicioStr = getDataHoraCurtaSP(agora);

    // 1. Tenta rota do servidor se disponível
    const serverResult = await this.safeFetchJson<{ setup: SetupAtivo; data: StoreData }>('/api/setup/iniciar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rowId,
        maquina,
        peca,
        modeloAnterior,
        inicioMs: agora,
        dataInicio: dataInicioStr
      })
    });

    if (serverResult && serverResult.setup && serverResult.data) {
      this.setCache(serverResult.data);
      return serverResult;
    }

    // 2. Execução autônoma direta para Vercel / Cloud Run / Offline
    const store = this.getCurrentStore();
    const id = `setup_${agora}`;
    const novoSetup: SetupAtivo = {
      id,
      rowId,
      maquina,
      peca,
      modeloAnterior: (modeloAnterior || '').trim() || 'Não Informado',
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
      checksStateParte1: new Array(store.tarefas1?.length || 0).fill(false),
      checksStateParte2: new Array(store.tarefas2?.length || 0).fill(false),
      checksStatePendencias: new Array(store.tarefasPendencias?.length || 0).fill(false),
      setupRegistrado: false,
      updatedAt: agora
    };

    const nextStore: StoreData = {
      ...store,
      maquinas: (store.maquinas || []).filter((m) => String(m.id) !== String(rowId)),
      setupsAtivos: {
        ...(store.setupsAtivos || {}),
        [id]: novoSetup
      }
    };

    this.setCache(nextStore);
    FirebaseService.salvarStore(nextStore).catch((e) => console.warn('Erro ao salvar no Firebase:', e));
    return { setup: novoSetup, data: nextStore };
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
    const serverResult = await this.safeFetchJson<{ setup: SetupAtivo }>('/api/setup/auto-save-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, prep1Val, prep2Val, checksParte1, checksParte2, checksPendencias, tempoDecorridoMs })
    });

    if (serverResult && serverResult.setup) {
      return serverResult.setup;
    }

    const store = this.getCurrentStore();
    const setup = store.setupsAtivos?.[id];
    if (!setup) {
      throw new Error('Setup ativo não encontrado');
    }

    if (prep1Val !== undefined) setup.prep1Val = prep1Val;
    if (prep2Val !== undefined) setup.prep2Val = prep2Val;
    if (checksParte1) setup.checksStateParte1 = checksParte1;
    if (checksParte2) setup.checksStateParte2 = checksParte2;
    if (checksPendencias) setup.checksStatePendencias = checksPendencias;
    if (tempoDecorridoMs !== undefined && tempoDecorridoMs > 0) {
      setup.tempoDecorridoMs = tempoDecorridoMs;
    }
    setup.lastTick = Date.now();
    setup.updatedAt = Date.now();

    this.setCache(store);
    FirebaseService.salvarStore(store).catch(() => {});
    return setup;
  }

  public static async aplicarDesconto(id: string, tipo: 'cafe' | 'almoco'): Promise<SetupAtivo> {
    const serverResult = await this.safeFetchJson<{ setup: SetupAtivo }>('/api/setup/desconto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, tipo })
    });

    if (serverResult && serverResult.setup) {
      return serverResult.setup;
    }

    const store = this.getCurrentStore();
    const setup = store.setupsAtivos?.[id];
    if (!setup) throw new Error('Setup não encontrado');

    const agora = Date.now();
    const strDH = new Date(agora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    if (tipo === 'cafe') {
      const dur = 15 * 60 * 1000;
      const horaIni = getHoraSP(agora);
      const horaFim = getHoraSP(agora + dur);
      setup.deductionsMs += dur;
      setup.historico.push(`[${horaIni} às ${horaFim}] Café (-15 min)`);
      setup.eventos.push({
        id: `ev_${agora}`,
        timestamp: strDH,
        tipo: 'cafe',
        motivo: 'Café (-15m)',
        inicioMs: agora,
        fimMs: agora + dur,
        duracaoMs: dur
      });
    } else if (tipo === 'almoco') {
      const dur = 90 * 60 * 1000;
      const horaIni = getHoraSP(agora);
      const horaFim = getHoraSP(agora + dur);
      setup.deductionsMs += dur;
      setup.historico.push(`[${horaIni} às ${horaFim}] Almoço (-1.5h)`);
      setup.eventos.push({
        id: `ev_${agora}`,
        timestamp: strDH,
        tipo: 'almoco',
        motivo: 'Almoço (-1.5h)',
        inicioMs: agora,
        fimMs: agora + dur,
        duracaoMs: dur
      });
    }

    setup.updatedAt = agora;
    this.setCache(store);
    FirebaseService.salvarStore(store).catch(() => {});
    return setup;
  }

  public static async iniciarParada(id: string, motivo: string = ''): Promise<SetupAtivo> {
    const serverResult = await this.safeFetchJson<{ setup: SetupAtivo }>('/api/setup/iniciar-parada', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, motivo })
    });

    if (serverResult && serverResult.setup) {
      return serverResult.setup;
    }

    const store = this.getCurrentStore();
    const setup = store.setupsAtivos?.[id];
    if (!setup) throw new Error('Setup não encontrado');

    const agora = Date.now();
    const strDH = new Date(agora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const eventoId = `parada_${agora}`;

    const novoEvento: ParadaEvento = {
      id: eventoId,
      timestamp: strDH,
      tipo: 'parada',
      motivo: motivo.trim() || 'Parada iniciada',
      inicioMs: agora,
      emAndamento: true
    };

    setup.paradaAtiva = true;
    setup.paradaAtual = novoEvento;
    setup.eventos.push(novoEvento);
    setup.historico.push(`[${strDH}] Parada iniciada: ${motivo.trim() || 'Sem motivo prévio'}`);
    setup.updatedAt = agora;

    this.setCache(store);
    FirebaseService.salvarStore(store).catch(() => {});
    return setup;
  }

  public static async finalizarParada(id: string, motivo: string): Promise<SetupAtivo> {
    const serverResult = await this.safeFetchJson<{ setup: SetupAtivo }>('/api/setup/finalizar-parada', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, motivo })
    });

    if (serverResult && serverResult.setup) {
      return serverResult.setup;
    }

    const store = this.getCurrentStore();
    const setup = store.setupsAtivos?.[id];
    if (!setup) throw new Error('Setup não encontrado');

    const agora = Date.now();
    const strDH = new Date(agora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    setup.paradaAtiva = false;
    if (setup.paradaAtual) {
      const duracaoMs = Math.max(0, agora - setup.paradaAtual.inicioMs);
      setup.paradaAtual.fimMs = agora;
      setup.paradaAtual.duracaoMs = duracaoMs;
      setup.paradaAtual.emAndamento = false;
      setup.paradaAtual.motivo = motivo.trim();

      setup.deductionsMs = (setup.deductionsMs || 0) + duracaoMs;

      const ev = setup.eventos?.find((e) => e.id === setup.paradaAtual?.id);
      if (ev) {
        ev.fimMs = agora;
        ev.duracaoMs = duracaoMs;
        ev.emAndamento = false;
        ev.motivo = motivo.trim();
      }

      const duracaoFormatada = formatarTempoMs(duracaoMs);
      const horaIni = getHoraSP(setup.paradaAtual.inicioMs);
      const horaFim = getHoraSP(agora);
      setup.historico = (setup.historico || []).filter((h) => !h.includes('Parada iniciada'));
      setup.historico.push(`[${horaIni} às ${horaFim}] Parada (${duracaoFormatada}): ${motivo.trim()}`);
      setup.paradaAtual = undefined;
    } else {
      setup.historico = (setup.historico || []).filter((h) => !h.includes('Parada iniciada'));
      setup.historico.push(`[${strDH}] Parada encerrada: ${motivo.trim()}`);
    }

    setup.updatedAt = agora;
    this.setCache(store);
    FirebaseService.salvarStore(store).catch(() => {});
    return setup;
  }

  public static async liberarMaquina(
    id: string,
    prep1: string,
    prep2: string,
    tempoFormatado: string,
    tempoMs: number
  ): Promise<{ sucesso: boolean; setupConcluido: SetupConcluido; data: StoreData }> {
    const serverResult = await this.safeFetchJson<{ sucesso: boolean; concluido: SetupConcluido; data: StoreData }>('/api/setup/liberar-maquina', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, prep1, prep2, tempoFormatado, tempoMs })
    });

    if (serverResult && serverResult.concluido && serverResult.data) {
      this.setCache(serverResult.data);
      return { sucesso: true, setupConcluido: serverResult.concluido, data: serverResult.data };
    }

    const store = this.getCurrentStore();
    const setup = store.setupsAtivos?.[id];
    if (!setup) throw new Error('Setup não encontrado');

    const agora = Date.now();
    const dataStr = getDataHoraCurtaSP(agora);

    if (setup.paradaAtiva && setup.paradaAtual) {
      const duracaoMs = Math.max(0, agora - setup.paradaAtual.inicioMs);
      setup.paradaAtual.fimMs = agora;
      setup.paradaAtual.duracaoMs = duracaoMs;
      setup.paradaAtual.emAndamento = false;
      const ev = setup.eventos?.find((e) => e.id === setup.paradaAtual?.id);
      if (ev) {
        ev.fimMs = agora;
        ev.duracaoMs = duracaoMs;
        ev.emAndamento = false;
      }
      setup.paradaAtiva = false;
      const duracaoFormatada = formatarTempoMs(duracaoMs);
      const horaIni = getHoraSP(setup.paradaAtual.inicioMs);
      const horaFim = getHoraSP(agora);
      setup.historico = (setup.historico || []).filter((h) => !h.includes('Parada iniciada'));
      setup.historico.push(`[${horaIni} às ${horaFim}] Parada (${duracaoFormatada}): ${setup.paradaAtual.motivo}`);
      setup.paradaAtual = undefined;
    }

    setup.setupRegistrado = true;
    setup.prep1Val = prep1;
    setup.prep2Val = prep2;
    setup.tempoFormatado = tempoFormatado;
    setup.tempoSetupMs = tempoMs;
    setup.updatedAt = agora;

    const novoConcluido: SetupConcluido = {
      id: `conc_${agora}`,
      data: dataStr,
      timestamp: agora,
      maquina: setup.maquina,
      peca: setup.peca,
      modeloAnterior: setup.modeloAnterior,
      prep1,
      prep2,
      tempo: tempoFormatado,
      tempoMs,
      historico: setup.historico.join(' | '),
      eventos: setup.eventos,
      pendenciasConcluidas: false
    };

    store.concluidos = [novoConcluido, ...(store.concluidos || [])];
    this.setCache(store);
    FirebaseService.registrarSetupConcluido(novoConcluido).catch(() => {});
    FirebaseService.salvarStore(store).catch(() => {});

    return { sucesso: true, setupConcluido: novoConcluido, data: store };
  }

  public static async encerrarPendencias(id: string): Promise<boolean> {
    const serverResult = await this.safeFetchJson<{ sucesso: boolean; data: StoreData }>('/api/setup/encerrar-pendencias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });

    if (serverResult && serverResult.data) {
      this.setCache(serverResult.data);
      return true;
    }

    const store = this.getCurrentStore();
    const setup = store.setupsAtivos?.[id];
    if (!setup) return false;

    const item = (store.concluidos || []).find((c) => c.maquina === setup.maquina && c.peca === setup.peca);
    if (item) {
      item.pendenciasConcluidas = true;
    }

    delete store.setupsAtivos[id];
    this.setCache(store);
    FirebaseService.salvarStore(store).catch(() => {});
    return true;
  }

  public static async toggleSetupExterno(maquinaId: string, senha: string): Promise<void> {
    const cleanPass = (senha || '').trim().toLowerCase();
    if (cleanPass !== '1152' && cleanPass !== '8619' && cleanPass !== '5211' && cleanPass !== 'admin' && cleanPass !== 'lider') {
      throw new Error('Senha incorreta! Digite a senha correta.');
    }

    const serverResult = await this.safeFetchJson<{ data: StoreData }>('/api/setup/toggle-setup-externo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maquinaId, senha })
    });

    if (serverResult && serverResult.data) {
      this.setCache(serverResult.data);
      return;
    }

    const store = this.getCurrentStore();
    const m = (store.maquinas || []).find((item) => String(item.id) === String(maquinaId));
    if (m) {
      m.setupExternoPronto = !m.setupExternoPronto;
    }
    this.setCache(store);
    FirebaseService.salvarStore(store).catch(() => {});
  }

  public static async deletarMaquina(maquinaId: string, senha: string): Promise<void> {
    const cleanPass = (senha || '').trim().toLowerCase();
    if (cleanPass !== '8619' && cleanPass !== '5211' && cleanPass !== 'admin' && cleanPass !== 'lider') {
      throw new Error('Senha incorreta! Digite a senha correta.');
    }

    const serverResult = await this.safeFetchJson<{ data: StoreData }>('/api/setup/deletar-maquina', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maquinaId, senha })
    });

    if (serverResult && serverResult.data) {
      this.setCache(serverResult.data);
      return;
    }

    const store = this.getCurrentStore();
    store.maquinas = (store.maquinas || []).filter((m) => String(m.id) !== String(maquinaId));
    this.setCache(store);
    FirebaseService.salvarStore(store).catch(() => {});
  }

  public static async limparMaquinas(senha: string): Promise<void> {
    const cleanPass = (senha || '').trim().toLowerCase();
    if (cleanPass !== '8619' && cleanPass !== '5211' && cleanPass !== 'admin' && cleanPass !== 'lider') {
      throw new Error('Senha incorreta! Digite a senha correta.');
    }

    const serverResult = await this.safeFetchJson<{ data: StoreData }>('/api/setup/limpar-maquinas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha })
    });

    if (serverResult && serverResult.data) {
      this.setCache(serverResult.data);
      return;
    }

    const store = this.getCurrentStore();
    store.maquinas = [];
    this.setCache(store);
    FirebaseService.salvarStore(store).catch(() => {});
  }

  public static async deletarPreparador(nome: string, senha: string): Promise<void> {
    const cleanPass = (senha || '').trim().toLowerCase();
    if (cleanPass !== '8619' && cleanPass !== '5211' && cleanPass !== 'admin' && cleanPass !== 'lider') {
      throw new Error('Senha incorreta! Digite a senha correta.');
    }

    const serverResult = await this.safeFetchJson<{ data: StoreData }>('/api/setup/deletar-preparador', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, senha })
    });

    if (serverResult && serverResult.data) {
      this.setCache(serverResult.data);
      return;
    }

    const store = this.getCurrentStore();
    store.preparadores = store.preparadores.filter((p) => p !== nome);
    this.setCache(store);
    FirebaseService.salvarStore(store).catch(() => {});
  }

  public static async salvarTarefas(grupo: 'parte1' | 'parte2' | 'pendencias', tarefas: string[], senha: string): Promise<void> {
    const cleanPass = (senha || '').trim().toLowerCase();
    if (cleanPass !== '8619' && cleanPass !== '5211' && cleanPass !== 'admin' && cleanPass !== 'lider') {
      throw new Error('Senha incorreta! Digite a senha correta.');
    }

    const serverResult = await this.safeFetchJson<{ data: StoreData }>('/api/setup/salvar-tarefas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grupo, tarefas, senha })
    });

    if (serverResult && serverResult.data) {
      this.setCache(serverResult.data);
      return;
    }

    const store = this.getCurrentStore();
    if (grupo === 'parte1') store.tarefas1 = tarefas;
    else if (grupo === 'parte2') store.tarefas2 = tarefas;
    else store.tarefasPendencias = tarefas;

    this.setCache(store);
    FirebaseService.salvarStore(store).catch(() => {});
  }

  public static async salvarTurno(turnoConfig: TurnoConfig, senha: string): Promise<void> {
    const cleanPass = (senha || '').trim().toLowerCase();
    if (cleanPass !== '8619' && cleanPass !== '5211' && cleanPass !== 'admin' && cleanPass !== 'lider') {
      throw new Error('Senha incorreta! Digite a senha correta.');
    }

    const serverResult = await this.safeFetchJson<{ data: StoreData }>('/api/setup/turno', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ turnoConfig, senha })
    });

    if (serverResult && serverResult.data) {
      this.setCache(serverResult.data);
      return;
    }

    const store = this.getCurrentStore();
    store.turnoConfig = turnoConfig;
    this.setCache(store);
    FirebaseService.salvarStore(store).catch(() => {});
  }

  public static async adicionarMaquina(maquina: string, peca: string): Promise<void> {
    const serverResult = await this.safeFetchJson<{ data: StoreData }>('/api/setup/adicionar-maquina', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maquina, peca })
    });

    if (serverResult && serverResult.data) {
      this.setCache(serverResult.data);
      return;
    }

    const store = this.getCurrentStore();
    const nova: Maquina = {
      id: `m_${Date.now()}`,
      maquina: maquina.trim().toUpperCase(),
      peca: peca.trim().toUpperCase(),
      setupExternoPronto: false
    };
    store.maquinas = [...(store.maquinas || []), nova];
    this.setCache(store);
    FirebaseService.salvarStore(store).catch(() => {});
  }

  public static async adicionarPreparador(nome: string): Promise<void> {
    const serverResult = await this.safeFetchJson<{ data: StoreData }>('/api/setup/adicionar-preparador', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome })
    });

    if (serverResult && serverResult.data) {
      this.setCache(serverResult.data);
      return;
    }

    const store = this.getCurrentStore();
    const clean = nome.trim().toUpperCase();
    if (!store.preparadores.includes(clean)) {
      store.preparadores = [...store.preparadores, clean];
    }
    this.setCache(store);
    FirebaseService.salvarStore(store).catch(() => {});
  }

  public static async esvaziarConcluidos(senha?: string): Promise<void> {
    const cleanPass = (senha || '').trim().toLowerCase();
    if (cleanPass && cleanPass !== '8619' && cleanPass !== '5211' && cleanPass !== 'admin' && cleanPass !== 'lider') {
      throw new Error('Senha incorreta! Digite a senha correta.');
    }

    const serverResult = await this.safeFetchJson<{ data: StoreData }>('/api/setup/esvaziar-concluidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha })
    });

    if (serverResult && serverResult.data) {
      this.setCache(serverResult.data);
      return;
    }

    const store = this.getCurrentStore();
    store.concluidos = [];
    this.setCache(store);
    FirebaseService.salvarStore(store).catch(() => {});
  }

  public static async carregarDados(backup: any, senha?: string): Promise<void> {
    const cleanPass = (senha || '').trim().toLowerCase();
    if (cleanPass && cleanPass !== '8619' && cleanPass !== '5211' && cleanPass !== 'admin' && cleanPass !== 'lider') {
      throw new Error('Senha incorreta! Digite a senha correta.');
    }

    const serverResult = await this.safeFetchJson<{ data: StoreData }>('/api/setup/carregar-dados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backup, senha })
    });

    if (serverResult && serverResult.data) {
      this.setCache(serverResult.data);
      return;
    }

    if (backup && typeof backup === 'object') {
      const store: StoreData = {
        maquinas: Array.isArray(backup.maquinas) ? backup.maquinas : [],
        preparadores: Array.isArray(backup.preparadores) ? backup.preparadores : INITIAL_PREPARADORES,
        tarefas1: Array.isArray(backup.tarefas1) ? backup.tarefas1 : INITIAL_TAREFAS_PARTE_1,
        tarefas2: Array.isArray(backup.tarefas2) ? backup.tarefas2 : INITIAL_TAREFAS_PARTE_2,
        tarefasPendencias: Array.isArray(backup.tarefasPendencias) ? backup.tarefasPendencias : INITIAL_TAREFAS_PENDENCIAS,
        turnoConfig: backup.turnoConfig || INITIAL_TURNO,
        setupsAtivos: backup.setupsAtivos || {},
        concluidos: Array.isArray(backup.concluidos) ? backup.concluidos : []
      };
      this.setCache(store);
      await FirebaseService.salvarStore(store).catch(() => {});
    }
  }

  public static async resetDemo(): Promise<void> {
    const serverResult = await this.safeFetchJson<{ data: StoreData }>('/api/setup/reset-demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (serverResult && serverResult.data) {
      this.setCache(serverResult.data);
      return;
    }

    const store = this.getCurrentStore();
    store.tarefas1 = INITIAL_TAREFAS_PARTE_1;
    store.tarefas2 = INITIAL_TAREFAS_PARTE_2;
    store.tarefasPendencias = INITIAL_TAREFAS_PENDENCIAS;
    this.setCache(store);
    FirebaseService.salvarStore(store).catch(() => {});
  }

  public static async cancelarSetupAtivo(id: string): Promise<StoreData | null> {
    const serverResult = await this.safeFetchJson<{ data: StoreData }>('/api/setup/cancelar-setup-ativo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });

    if (serverResult && serverResult.data) {
      this.setCache(serverResult.data);
      return serverResult.data;
    }

    const store = this.getCurrentStore();
    delete store.setupsAtivos[id];
    this.setCache(store);
    FirebaseService.salvarStore(store).catch(() => {});
    return store;
  }

  public static async resetTotal(senha?: string): Promise<StoreData> {
    const cleanPass = (senha || '').trim().toLowerCase();
    if (cleanPass && cleanPass !== '8619' && cleanPass !== '5211' && cleanPass !== '1152' && cleanPass !== 'admin' && cleanPass !== 'lider') {
      throw new Error('Senha incorreta! Digite a senha correta.');
    }

    const serverResult = await this.safeFetchJson<{ data: StoreData }>('/api/setup/reset-total', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha })
    });

    if (serverResult && serverResult.data) {
      this.setCache(serverResult.data);
      return serverResult.data;
    }

    const store: StoreData = {
      maquinas: [],
      preparadores: INITIAL_PREPARADORES,
      tarefas1: INITIAL_TAREFAS_PARTE_1,
      tarefas2: INITIAL_TAREFAS_PARTE_2,
      tarefasPendencias: INITIAL_TAREFAS_PENDENCIAS,
      turnoConfig: INITIAL_TURNO,
      setupsAtivos: {},
      concluidos: []
    };

    this.setCache(store);
    FirebaseService.salvarStore(store).catch(() => {});
    return store;
  }

  public static async salvarSheetConfig(sheetConfig?: GoogleSheetConfig): Promise<void> {
    const serverResult = await this.safeFetchJson<{ data: StoreData }>('/api/setup/sheets-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetConfig })
    });

    if (serverResult && serverResult.data) {
      this.setCache(serverResult.data);
      return;
    }

    const store = this.getCurrentStore();
    store.sheetConfig = sheetConfig;
    this.setCache(store);
    FirebaseService.salvarStore(store).catch(() => {});
  }

  public static async editarTempoConcluido(id: string, novoTempo: string, senha: string): Promise<StoreData | null> {
    const cleanPass = (senha || '').trim().toLowerCase();
    if (
      cleanPass !== '8619' &&
      cleanPass !== '5211' &&
      cleanPass !== '1152' &&
      cleanPass !== '1234' &&
      cleanPass !== '1' &&
      cleanPass !== 'admin' &&
      cleanPass !== 'gestor' &&
      cleanPass !== 'lider'
    ) {
      throw new Error('Senha incorreta! Digite a senha correta.');
    }

    const serverResult = await this.safeFetchJson<{ data: StoreData }>('/api/setup/editar-tempo-concluido', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, novoTempo, senha })
    });

    if (serverResult && serverResult.data) {
      this.setCache(serverResult.data);
      return serverResult.data;
    }

    const store = this.getCurrentStore();
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

    store.concluidos = (store.concluidos || []).map((c) => {
      if (c.id === id) {
        return { ...c, tempo: cleanTempo, tempoMs: ms };
      }
      return c;
    });

    this.setCache(store);
    FirebaseService.salvarStore(store).catch(() => {});
    return store;
  }

  public static async syncFromCloud(cloudData: StoreData): Promise<void> {
    if (this.serverAvailable === false) return;
    try {
      await fetch('/api/setup/sync-from-cloud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cloudData })
      });
    } catch {
      // Background non-blocking sync
    }
  }

  public static async mesclarPlanilha(
    concluidos?: SetupConcluido[],
    maquinas?: Maquina[],
    substituirTudo: boolean = true,
    preparadores?: string[],
    ativos?: Record<string, SetupAtivo>
  ): Promise<void> {
    const serverResult = await this.safeFetchJson<{ data: StoreData }>('/api/setup/mesclar-planilha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ concluidos, maquinas, substituirTudo, preparadores, ativos })
    });

    if (serverResult && serverResult.data) {
      this.setCache(serverResult.data);
      return;
    }

    const store = this.getCurrentStore();
    if (substituirTudo) {
      if (concluidos) store.concluidos = concluidos;
      if (maquinas) store.maquinas = maquinas;
      if (preparadores) store.preparadores = preparadores;
      if (ativos) store.setupsAtivos = ativos;
    } else {
      if (maquinas) {
        const exist = new Set(store.maquinas.map((m) => `${m.maquina}-${m.peca}`));
        maquinas.forEach((m) => {
          if (!exist.has(`${m.maquina}-${m.peca}`)) {
            store.maquinas.push(m);
            exist.add(`${m.maquina}-${m.peca}`);
          }
        });
      }
      if (concluidos) {
        const existC = new Set(store.concluidos.map((c) => c.id));
        concluidos.forEach((c) => {
          if (!existC.has(c.id)) {
            store.concluidos.push(c);
            existC.add(c.id);
          }
        });
      }
    }
    this.setCache(store);
    FirebaseService.salvarStore(store).catch(() => {});
  }
}
