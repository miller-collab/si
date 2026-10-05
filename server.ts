import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { StoreData, SetupAtivo, SetupConcluido, TurnoConfig, ParadaEvento, Maquina } from './src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, 'data');
const DATA_FILE = path.resolve(DATA_DIR, 'setup_store.json');

function formatarTempoStr(ms: number): string {
  const totalSeg = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

const INITIAL_MAQUINAS: Maquina[] = [];

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

// EXACT activities from Photo 2
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

const agoraMs = Date.now();

const INITIAL_SETUPS_ATIVOS: Record<string, SetupAtivo> = {};

const INITIAL_CONCLUIDOS: SetupConcluido[] = [
  {
    id: 'conc_1',
    data: '01/10/2026 16:45',
    timestamp: agoraMs - 24 * 3600 * 1000,
    maquina: 'TC18',
    peca: 'AL1526X0 (TRYOUT)',
    modeloAnterior: 'PC600',
    prep1: 'GABRIEL',
    prep2: 'IGOR',
    tempo: '02:47:35',
    tempoMs: 2 * 3600 * 1000 + 47 * 60 * 1000 + 35 * 1000,
    historico: '[01/10/2026 14:00] Início TC18 | [15:00 às 15:15] Café (-15m) | [15:20 às 15:45] Parada (00:25:00): Ajuste de ferramenta especial e conferência de folgas | [01/10/2026 16:45] Fim do Setup (Liberado)',
    pendenciasConcluidas: true
  },
  {
    id: 'conc_2',
    data: '01/10/2026 12:20',
    timestamp: agoraMs - 28 * 3600 * 1000,
    maquina: 'TC03',
    peca: 'A2016024',
    modeloAnterior: 'BD1402',
    prep1: 'GABRIEL',
    prep2: 'CAIO',
    tempo: '01:41:00',
    tempoMs: 1 * 3600 * 1000 + 41 * 60 * 1000,
    historico: '[01/10/2026 10:40] Início TC03 | [11:30 às 11:50] Parada (00:20:00): Troca de pinças do alimentador | [01/10/2026 12:20] Fim do Setup (Liberado)',
    pendenciasConcluidas: true
  }
];

class StoreManager {
  private data: StoreData;

  constructor() {
    this.data = this.loadData();
  }

  private loadData(): StoreData {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        const setupsAtivos = parsed.setupsAtivos || INITIAL_SETUPS_ATIVOS;
        Object.values(setupsAtivos).forEach((s: any) => {
          if (s && s.eventos && Array.isArray(s.eventos)) {
            let soma = 0;
            s.eventos.forEach((ev: any) => {
              if (!ev.emAndamento && ev.duracaoMs) {
                soma += ev.duracaoMs;
              }
            });
            if (soma > (s.deductionsMs || 0)) {
              s.deductionsMs = soma;
            }
          }
        });

        return {
          maquinas: parsed.maquinas || INITIAL_MAQUINAS,
          preparadores: parsed.preparadores || INITIAL_PREPARADORES,
          tarefas1: parsed.tarefas1 || INITIAL_TAREFAS_PARTE_1,
          tarefas2: parsed.tarefas2 || INITIAL_TAREFAS_PARTE_2,
          tarefasPendencias: parsed.tarefasPendencias || INITIAL_TAREFAS_PENDENCIAS,
          turnoConfig: parsed.turnoConfig || INITIAL_TURNO,
          setupsAtivos,
          concluidos: parsed.concluidos || INITIAL_CONCLUIDOS
        };
      }
    } catch (err) {
      console.error('Error reading setup_store.json:', err);
    }

    const defaultData: StoreData = {
      maquinas: INITIAL_MAQUINAS,
      preparadores: INITIAL_PREPARADORES,
      tarefas1: INITIAL_TAREFAS_PARTE_1,
      tarefas2: INITIAL_TAREFAS_PARTE_2,
      tarefasPendencias: INITIAL_TAREFAS_PENDENCIAS,
      turnoConfig: INITIAL_TURNO,
      setupsAtivos: INITIAL_SETUPS_ATIVOS,
      concluidos: INITIAL_CONCLUIDOS
    };
    this.saveDataDirect(defaultData);
    return defaultData;
  }

  private saveDataDirect(data: StoreData) {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tmp = `${DATA_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmp, DATA_FILE);
    } catch (err) {
      console.error('Error writing setup_store.json:', err);
    }
  }

  public save() {
    this.saveDataDirect(this.data);
  }

  public getData(): StoreData {
    return {
      ...this.data,
      serverTime: Date.now()
    };
  }

  public iniciarSetup(
    rowId: string,
    maquina: string,
    peca: string,
    modeloAnterior: string,
    clientInicioMs?: number,
    clientDataInicioStr?: string
  ): SetupAtivo {
    const agora = clientInicioMs || Date.now();
    const id = `setup_${Date.now()}`;
    const dh = new Date(agora);
    const dataInicioStr = clientDataInicioStr || `${dh.toLocaleDateString('pt-BR')} às ${dh.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

    const novoSetup: SetupAtivo = {
      id,
      rowId,
      maquina,
      peca,
      modeloAnterior: modeloAnterior.trim() || 'Não Informado',
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
      checksStateParte1: new Array(this.data.tarefas1.length).fill(false),
      checksStateParte2: new Array(this.data.tarefas2.length).fill(false),
      checksStatePendencias: new Array(this.data.tarefasPendencias.length).fill(false),
      setupRegistrado: false,
      updatedAt: agora
    };

    this.data.setupsAtivos[id] = novoSetup;
    // Remove from available machines queue
    this.data.maquinas = this.data.maquinas.filter(m => String(m.id) !== String(rowId));
    this.save();
    return novoSetup;
  }

  public autoSaveCard(
    id: string,
    prep1Val?: string,
    prep2Val?: string,
    checksParte1?: boolean[],
    checksParte2?: boolean[],
    checksPendencias?: boolean[],
    tempoDecorridoMs?: number
  ): SetupAtivo | null {
    const setup = this.data.setupsAtivos[id];
    if (!setup) return null;

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
    this.save();
    return setup;
  }

  public aplicarDesconto(id: string, tipo: 'cafe' | 'almoco'): SetupAtivo | null {
    const setup = this.data.setupsAtivos[id];
    if (!setup) return null;

    const dh = new Date();
    const strDH = `${dh.toLocaleDateString('pt-BR')} ${dh.toLocaleTimeString('pt-BR')}`;

    if (tipo === 'cafe') {
      setup.deductionsMs += 15 * 60 * 1000;
      setup.historico.push(`[${strDH}] Café (-15m)`);
      setup.eventos.push({
        id: `ev_${Date.now()}`,
        timestamp: strDH,
        tipo: 'cafe',
        motivo: 'Café (-15m)',
        inicioMs: Date.now()
      });
    } else if (tipo === 'almoco') {
      setup.deductionsMs += 90 * 60 * 1000;
      setup.historico.push(`[${strDH}] Almoço (-1.5h)`);
      setup.eventos.push({
        id: `ev_${Date.now()}`,
        timestamp: strDH,
        tipo: 'almoco',
        motivo: 'Almoço (-1.5h)',
        inicioMs: Date.now()
      });
    }

    setup.updatedAt = Date.now();
    this.save();
    return setup;
  }

  public iniciarParada(id: string, motivo: string): SetupAtivo | null {
    const setup = this.data.setupsAtivos[id];
    if (!setup) return null;

    const dh = new Date();
    const strDH = `${dh.toLocaleDateString('pt-BR')} ${dh.toLocaleTimeString('pt-BR')}`;
    const eventoId = `parada_${Date.now()}`;

    const novoEvento: ParadaEvento = {
      id: eventoId,
      timestamp: strDH,
      tipo: 'parada',
      motivo: motivo.trim() || 'Parada iniciada',
      inicioMs: Date.now(),
      emAndamento: true
    };

    setup.paradaAtiva = true;
    setup.paradaAtual = novoEvento;
    setup.eventos.push(novoEvento);
    setup.historico.push(`[${strDH}] Parada iniciada: ${motivo.trim() || 'Sem motivo prévio'}`);
    setup.updatedAt = Date.now();
    this.save();
    return setup;
  }

  public finalizarParada(id: string, motivoObrigatorio: string): SetupAtivo | null {
    const setup = this.data.setupsAtivos[id];
    if (!setup) return null;

    const dh = new Date();
    const strDH = `${dh.toLocaleDateString('pt-BR')} ${dh.toLocaleTimeString('pt-BR')}`;
    const agora = Date.now();

    setup.paradaAtiva = false;
    if (setup.paradaAtual) {
      const duracaoMs = Math.max(0, agora - setup.paradaAtual.inicioMs);
      setup.paradaAtual.fimMs = agora;
      setup.paradaAtual.duracaoMs = duracaoMs;
      setup.paradaAtual.emAndamento = false;
      setup.paradaAtual.motivo = motivoObrigatorio.trim();

      // Deduct duration from setup elapsed time
      setup.deductionsMs = (setup.deductionsMs || 0) + duracaoMs;

      // Update matching event in setup.eventos
      const ev = setup.eventos?.find((e) => e.id === setup.paradaAtual?.id);
      if (ev) {
        ev.fimMs = agora;
        ev.duracaoMs = duracaoMs;
        ev.emAndamento = false;
        ev.motivo = motivoObrigatorio.trim();
      }

      const duracaoFormatada = formatarTempoStr(duracaoMs);
      const horaIni = new Date(setup.paradaAtual.inicioMs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const horaFim = dh.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      setup.historico.push(`[${horaIni} às ${horaFim}] Parada (${duracaoFormatada}): ${motivoObrigatorio.trim()}`);
      setup.paradaAtual = undefined;
    } else {
      setup.historico.push(`[${strDH}] Parada encerrada: ${motivoObrigatorio.trim()}`);
    }

    setup.updatedAt = Date.now();
    this.save();
    return setup;
  }

  public liberarMaquina(id: string, prep1: string, prep2: string, tempoFormatado: string, tempoMs: number): SetupConcluido | null {
    const setup = this.data.setupsAtivos[id];
    if (!setup) return null;

    const dh = new Date();
    const dataStr = `${dh.toLocaleDateString('pt-BR')} ${dh.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

    setup.setupRegistrado = true;
    setup.prep1Val = prep1;
    setup.prep2Val = prep2;
    setup.tempoFormatado = tempoFormatado;
    setup.tempoSetupMs = tempoMs;
    setup.updatedAt = Date.now();

    const novoConcluido: SetupConcluido = {
      id: `conc_${Date.now()}`,
      data: dataStr,
      timestamp: Date.now(),
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

    this.data.concluidos.unshift(novoConcluido);
    this.save();
    return novoConcluido;
  }

  public encerrarPendencias(id: string): boolean {
    const setup = this.data.setupsAtivos[id];
    if (!setup) return false;

    const item = this.data.concluidos.find(c => c.maquina === setup.maquina && c.peca === setup.peca);
    if (item) {
      item.pendenciasConcluidas = true;
    }

    delete this.data.setupsAtivos[id];
    this.save();
    return true;
  }

  public toggleSetupExterno(maquinaId: string): boolean {
    const m = this.data.maquinas.find(item => String(item.id) === String(maquinaId));
    if (!m) return false;
    m.setupExternoPronto = !m.setupExternoPronto;
    this.save();
    return true;
  }

  public limparMaquinas(): boolean {
    this.data.maquinas = [];
    this.save();
    return true;
  }

  public deletarMaquina(maquinaId: string): boolean {
    this.data.maquinas = this.data.maquinas.filter(item => String(item.id) !== String(maquinaId));
    this.save();
    return true;
  }

  public deletarPreparador(nome: string): boolean {
    this.data.preparadores = this.data.preparadores.filter(p => p.toUpperCase() !== nome.toUpperCase());
    this.save();
    return true;
  }

  public salvarTarefas(grupo: 'parte1' | 'parte2' | 'pendencias', tarefas: string[]) {
    if (grupo === 'parte1') this.data.tarefas1 = tarefas;
    if (grupo === 'parte2') this.data.tarefas2 = tarefas;
    if (grupo === 'pendencias') this.data.tarefasPendencias = tarefas;
    this.save();
  }

  public salvarTurnoConfig(config: TurnoConfig) {
    this.data.turnoConfig = config;
    this.save();
  }

  public adicionarMaquina(maquina: string, peca: string) {
    const novoId = String(Date.now());
    this.data.maquinas.push({ id: novoId, maquina: maquina.trim().toUpperCase(), peca: peca.trim(), setupExternoPronto: false });
    this.save();
  }

  public adicionarPreparador(nome: string) {
    const clean = nome.trim().toUpperCase();
    if (!this.data.preparadores.includes(clean)) {
      this.data.preparadores.push(clean);
      this.save();
    }
  }

  public esvaziarConcluidos() {
    this.data.concluidos = [];
    this.save();
  }

  public carregarDadosBackup(backup: any) {
    if (!backup || typeof backup !== 'object') return;
    if (Array.isArray(backup.concluidos)) {
      this.data.concluidos = backup.concluidos;
    }
    if (Array.isArray(backup.maquinas)) {
      this.data.maquinas = backup.maquinas;
    }
    if (Array.isArray(backup.preparadores)) {
      this.data.preparadores = backup.preparadores;
    }
    if (backup.setupsAtivos && typeof backup.setupsAtivos === 'object') {
      this.data.setupsAtivos = backup.setupsAtivos;
    }
    if (backup.turnoConfig) {
      this.data.turnoConfig = backup.turnoConfig;
    }
    if (Array.isArray(backup.tarefas1)) {
      this.data.tarefas1 = backup.tarefas1;
    }
    if (Array.isArray(backup.tarefas2)) {
      this.data.tarefas2 = backup.tarefas2;
    }
    if (Array.isArray(backup.tarefasPendencias)) {
      this.data.tarefasPendencias = backup.tarefasPendencias;
    }
    this.save();
  }

  public resetDemoData() {
    this.data = {
      maquinas: INITIAL_MAQUINAS,
      preparadores: INITIAL_PREPARADORES,
      tarefas1: INITIAL_TAREFAS_PARTE_1,
      tarefas2: INITIAL_TAREFAS_PARTE_2,
      tarefasPendencias: INITIAL_TAREFAS_PENDENCIAS,
      turnoConfig: INITIAL_TURNO,
      setupsAtivos: INITIAL_SETUPS_ATIVOS,
      concluidos: INITIAL_CONCLUIDOS
    };
    this.save();
  }
}

const store = new StoreManager();

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Never cache API responses across multiple tablets
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  // API Endpoints
  app.get('/api/setup/sync', (req, res) => {
    res.json(store.getData());
  });

  app.post('/api/setup/iniciar', (req, res) => {
    const { rowId, maquina, peca, modeloAnterior, inicioMs, dataInicio } = req.body;
    if (!maquina) return res.status(400).json({ error: 'Máquina é obrigatória' });
    if (!modeloAnterior || !modeloAnterior.trim()) {
      return res.status(400).json({ error: 'É obrigatório informar o modelo anterior' });
    }
    const result = store.iniciarSetup(
      rowId || String(Date.now()),
      maquina,
      peca || '-',
      modeloAnterior.trim(),
      inicioMs,
      dataInicio
    );
    res.json({ sucesso: true, setup: result, data: store.getData() });
  });

  // Auto-save endpoint for immediate persistence
  app.post('/api/setup/auto-save-card', (req, res) => {
    const { id, prep1Val, prep2Val, checksParte1, checksParte2, checksPendencias, tempoDecorridoMs } = req.body;
    if (!id) return res.status(400).json({ error: 'ID do setup é obrigatório' });
    const result = store.autoSaveCard(id, prep1Val, prep2Val, checksParte1, checksParte2, checksPendencias, tempoDecorridoMs);
    res.json({ sucesso: !!result, setup: result });
  });

  app.post('/api/setup/desconto', (req, res) => {
    const { id, tipo } = req.body;
    if (!id || !tipo) return res.status(400).json({ error: 'Parâmetros inválidos' });
    const result = store.aplicarDesconto(id, tipo);
    res.json({ sucesso: !!result, setup: result });
  });

  app.post('/api/setup/iniciar-parada', (req, res) => {
    const { id, motivo } = req.body;
    if (!id) return res.status(400).json({ error: 'ID é obrigatório' });
    const result = store.iniciarParada(id, motivo || '');
    res.json({ sucesso: !!result, setup: result });
  });

  app.post('/api/setup/finalizar-parada', (req, res) => {
    const { id, motivo } = req.body;
    if (!id || !motivo || !motivo.trim()) {
      return res.status(400).json({ error: 'O motivo da parada é obrigatório' });
    }
    const result = store.finalizarParada(id, motivo.trim());
    res.json({ sucesso: !!result, setup: result });
  });

  app.post('/api/setup/liberar-maquina', (req, res) => {
    const { id, prep1, prep2, tempoFormatado, tempoMs } = req.body;
    if (!id || !prep1 || !prep2) return res.status(400).json({ error: 'Dados incompletos para liberação' });
    const result = store.liberarMaquina(id, prep1, prep2, tempoFormatado || '00:00:00', tempoMs || 0);
    res.json({ sucesso: !!result, concluido: result, data: store.getData() });
  });

  app.post('/api/setup/encerrar-pendencias', (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'ID é obrigatório' });
    const result = store.encerrarPendencias(id);
    res.json({ sucesso: result, data: store.getData() });
  });

  // Toggle Setup Externo Pronto with Password 1152
  app.post('/api/setup/toggle-setup-externo', (req, res) => {
    const { maquinaId, senha } = req.body;
    if (senha !== '1152') {
      return res.status(401).json({ error: 'Senha incorreta' });
    }
    const sucesso = store.toggleSetupExterno(maquinaId);
    res.json({ sucesso, data: store.getData() });
  });

  // Delete machine with Leader Password 8619 or 5211
  app.post('/api/setup/deletar-maquina', (req, res) => {
    const { maquinaId, senha } = req.body;
    if (senha && senha !== '8619' && senha !== '5211') {
      return res.status(401).json({ error: 'Senha incorreta' });
    }
    const sucesso = store.deletarMaquina(maquinaId);
    res.json({ sucesso, data: store.getData() });
  });

  // Clear all machines from queue
  app.post('/api/setup/limpar-maquinas', (req, res) => {
    const { senha } = req.body;
    if (senha && senha !== '8619' && senha !== '5211') {
      return res.status(401).json({ error: 'Senha incorreta' });
    }
    store.limparMaquinas();
    res.json({ sucesso: true, data: store.getData() });
  });

  // Delete preparador
  app.post('/api/setup/deletar-preparador', (req, res) => {
    const { nome, senha } = req.body;
    if (senha !== '8619' && senha !== '5211') {
      return res.status(401).json({ error: 'Senha incorreta' });
    }
    const sucesso = store.deletarPreparador(nome);
    res.json({ sucesso, data: store.getData() });
  });

  // Save/Update Checklist activities
  app.post('/api/setup/salvar-tarefas', (req, res) => {
    const { grupo, tarefas, senha } = req.body;
    if (senha !== '8619' && senha !== '5211') {
      return res.status(401).json({ error: 'Senha incorreta' });
    }
    if (!['parte1', 'parte2', 'pendencias'].includes(grupo) || !Array.isArray(tarefas)) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }
    store.salvarTarefas(grupo, tarefas);
    res.json({ sucesso: true, data: store.getData() });
  });

  app.post('/api/setup/turno', (req, res) => {
    const { turnoConfig, senha } = req.body;
    if (senha !== '8619' && senha !== '5211') {
      return res.status(401).json({ error: 'Senha incorreta' });
    }
    if (!turnoConfig) return res.status(400).json({ error: 'Configuração inválida' });
    store.salvarTurnoConfig(turnoConfig);
    res.json({ sucesso: true, data: store.getData() });
  });

  app.post('/api/setup/adicionar-maquina', (req, res) => {
    const { maquina, peca } = req.body;
    if (!maquina || !maquina.trim()) return res.status(400).json({ error: 'Nome da máquina obrigatório' });
    if (!peca || !peca.trim() || peca.trim() === '-') return res.status(400).json({ error: 'Modelo da peça obrigatório' });
    store.adicionarMaquina(maquina.trim().toUpperCase(), peca.trim().toUpperCase());
    res.json({ sucesso: true, data: store.getData() });
  });

  app.post('/api/setup/adicionar-preparador', (req, res) => {
    const { nome } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });
    store.adicionarPreparador(nome);
    res.json({ sucesso: true, data: store.getData() });
  });

  // Clear completed reports
  app.post('/api/setup/esvaziar-concluidos', (req, res) => {
    const { senha } = req.body;
    if (senha && senha !== '8619' && senha !== '5211') {
      return res.status(401).json({ error: 'Senha incorreta' });
    }
    store.esvaziarConcluidos();
    res.json({ sucesso: true, data: store.getData() });
  });

  // Load/Restore backup
  app.post('/api/setup/carregar-dados', (req, res) => {
    const { backup, senha } = req.body;
    if (senha && senha !== '8619' && senha !== '5211') {
      return res.status(401).json({ error: 'Senha incorreta' });
    }
    if (!backup) {
      return res.status(400).json({ error: 'Dados de backup ausentes' });
    }
    store.carregarDadosBackup(backup);
    res.json({ sucesso: true, data: store.getData() });
  });

  app.post('/api/setup/reset-demo', (req, res) => {
    store.resetDemoData();
    res.json({ sucesso: true, data: store.getData() });
  });

  // Vite Integration
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Setup Interno CNC Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
