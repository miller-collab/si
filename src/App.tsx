/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  StoreData,
  Maquina,
  SetupAtivo,
  SetupConcluido,
  TurnoConfig
} from './types';
import { SetupApiService } from './services/api';
import { FirebaseService } from './services/firebase';
import { estaNoTurno, formatarTempo } from './utils/turno';
import { baixarRelatorioDashboardPdf, baixarRelatorioGestorPdf } from './utils/pdfGestor';

import { Navbar } from './components/Navbar';
import { AbaIniciarSetup } from './components/AbaIniciarSetup';
import { AbaSetupsAtivos } from './components/AbaSetupsAtivos';
import { AbaRelatorios } from './components/AbaRelatorios';
import { AbaPainelGestor } from './components/AbaPainelGestor';
import { AbaAdmin } from './components/AbaAdmin';
import { ErrorBoundary } from './components/ErrorBoundary';

import { ModalIniciarSetup } from './components/ModalIniciarSetup';
import { ModalResumoHistorico } from './components/ModalResumoHistorico';
import { ModalBuscaRegistros } from './components/ModalBuscaRegistros';
import {
  AreaImpressao,
  type DadosImpressaoDashboard,
  type DadosImpressaoGestor
} from './components/AreaImpressao';
import { RotateCcw, AlertTriangle, Lock, X } from 'lucide-react';

export default function App() {
  const [online, setOnline] = useState(true);
  const [abaAtiva, setAbaAtiva] = useState<'dashboard' | 'ativos' | 'concluidos' | 'gestor' | 'admin'>('dashboard');

  // Store data
  const [storeData, setStoreData] = useState<StoreData>({
    maquinas: [],
    preparadores: [],
    tarefas1: [],
    tarefas2: [],
    tarefasPendencias: [],
    turnoConfig: { dias: ['1', '2', '3', '4', '5'], inicio: '07:00', fim: '17:00' },
    setupsAtivos: {},
    concluidos: []
  });

  // Turno live state
  const [turnoAtivo, setTurnoAtivo] = useState(true);

  // Modals state
  const [maquinaParaIniciar, setMaquinaParaIniciar] = useState<Maquina | null>(null);
  const [resumoHistorico, setResumoHistorico] = useState<{ aberto: boolean; texto: string; titulo: string }>({
    aberto: false,
    texto: '',
    titulo: ''
  });
  const [modalBuscaAberto, setModalBuscaAberto] = useState(false);
  const [modalResetAberto, setModalResetAberto] = useState(false);
  const [senhaReset, setSenhaReset] = useState('');
  const [erroSenhaReset, setErroSenhaReset] = useState(false);
  const [resetando, setResetando] = useState(false);

  // Print states
  const [modoImpressao, setModoImpressao] = useState<'dashboard' | 'gestor' | null>(null);
  const [dadosPrintDashboard, setDadosPrintDashboard] = useState<DadosImpressaoDashboard | null>(null);
  const [dadosPrintGestor, setDadosPrintGestor] = useState<DadosImpressaoGestor | null>(null);

  // Toast feedback
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const storeDataRef = useRef(storeData);
  storeDataRef.current = storeData;

  // Turno evaluation
  const checarTurno = useCallback((config?: TurnoConfig) => {
    const cfg = config || storeDataRef.current?.turnoConfig;
    if (!cfg) return;
    const agora = new Date();
    const dentro = estaNoTurno(agora, cfg);
    setTurnoAtivo(dentro);
  }, []);

  // Fetch data from local backend & keep Firebase in sync
  const carregarDados = useCallback(async () => {
    try {
      const data = await SetupApiService.fetchSync();
      setStoreData(data);
      checarTurno(data.turnoConfig);
      setOnline(true);
      return data;
    } catch (err) {
      console.warn('Erro ao sincronizar com backend local:', err);
      setOnline(false);
      return null;
    }
  }, [checarTurno]);

  useEffect(() => {
    // 1. Initial fetch from local server
    carregarDados();

    // 2. Listen to local cache updates
    const unsubscribeApi = SetupApiService.subscribe((data) => {
      setStoreData(data);
      checarTurno(data.turnoConfig);
    });

    // 3. Real-time Firestore sync listener: keeps all devices synchronized via Firebase
    const unsubscribeFirestore = FirebaseService.subscribeStore((cloudData) => {
      if (cloudData) {
        setStoreData(cloudData);
        checarTurno(cloudData.turnoConfig);
        setOnline(true);
      }
    });

    // 4. Background poll every 10 seconds to detect network recovery
    const syncInterval = setInterval(() => {
      SetupApiService.fetchSync()
        .then(() => setOnline(true))
        .catch(() => setOnline(false));
    }, 10000);

    // 5. Turno clock check every 15 seconds
    const turnoInterval = setInterval(() => {
      checarTurno();
    }, 15000);

    return () => {
      unsubscribeApi();
      unsubscribeFirestore();
      clearInterval(syncInterval);
      clearInterval(turnoInterval);
    };
  }, [carregarDados, checarTurno]);

  // Backup Completo: Download JSON + Cloud Snapshot in Firebase
  const handleBackupTudo = async () => {
    try {
      FirebaseService.baixarArquivoBackupJson(storeData);
      try {
        await FirebaseService.criarSnapshotNuvem(storeData);
      } catch (e) {
        console.warn('Aviso ao salvar snapshot no Firebase:', e);
      }
      showToast('Backup completo baixado e salvo no Firebase com sucesso!');
    } catch (err) {
      console.error(err);
      showToast('Erro ao gerar arquivo de backup.');
    }
  };

  // Abrir Busca de Registros
  const handleAbrirBusca = () => {
    setModalBuscaAberto(true);
  };

  // Abrir Modal de Reset
  const handleAbrirReset = () => {
    setSenhaReset('');
    setErroSenhaReset(false);
    setModalResetAberto(true);
  };

  // Executar Reset Geral do App com Senha
  const handleConfirmarResetComSenha = async (s: string) => {
    const cleanPass = s.trim().toLowerCase();
    if (cleanPass !== '8619' && cleanPass !== '5211' && cleanPass !== '1152' && cleanPass !== '1234' && cleanPass !== '1' && cleanPass !== 'admin' && cleanPass !== 'lider') {
      setErroSenhaReset(true);
      return;
    }

    setResetando(true);
    try {
      // 1. Reset local backend
      await SetupApiService.resetTotal(cleanPass);

      // 2. Reset Firebase Firestore (wipe active setups, completed setups, machine queue)
      const cleanStore = await FirebaseService.resetTotal({
        preparadores: storeData.preparadores || [],
        tarefas1: storeData.tarefas1 || [],
        tarefas2: storeData.tarefas2 || [],
        tarefasPendencias: storeData.tarefasPendencias || []
      });

      // 3. Immediately set state in React UI
      setStoreData(cleanStore);
      setModalResetAberto(false);
      showToast('Aplicativo resetado com sucesso! Começando do zero absoluto.');
    } catch (err: any) {
      console.error('Erro ao resetar:', err);
      showToast(err?.message || 'Falha ao resetar o aplicativo.');
    } finally {
      setResetando(false);
    }
  };

  // Confirmar Reset Geral do App (pelo Modal de Confirmação)
  const handleConfirmarReset = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    await handleConfirmarResetComSenha(senhaReset);
  };

  // Cancelar setup ativo específico (ex: iniciado por engano)
  const handleCancelarSetupAtivo = async (id: string) => {
    try {
      await SetupApiService.cancelarSetupAtivo(id);
      const updated = await FirebaseService.cancelarSetupAtivo(id, storeData);
      setStoreData(updated);
      showToast('Setup cancelado e removido com sucesso!');
    } catch (err) {
      console.error('Erro ao cancelar setup ativo:', err);
      showToast('Erro ao cancelar setup ativo.');
    }
  };

  // Restaurar Backup
  const handleRestaurarBackup = async (dados: StoreData) => {
    try {
      await SetupApiService.carregarDados(dados, '8619');
      try {
        await FirebaseService.salvarStore(dados);
      } catch (fbErr) {
        console.warn('Aviso ao salvar backup no Firebase:', fbErr);
      }
      await carregarDados();
      showToast('Backup restaurado com sucesso!');
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Falha ao restaurar dados.');
    }
  };

  // Handlers
  const handleIniciarSetup = async (maquina: Maquina, modeloAnterior: string) => {
    setMaquinaParaIniciar(null);
    const agora = Date.now();
    const d = new Date(agora);
    const dataInicioStr = `${d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} às ${d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}`;
    const setupId = `setup_${agora}`;
    const modClean = (modeloAnterior || '').trim() || 'NÃO INFORMADO';

    const novoSetup: SetupAtivo = {
      id: setupId,
      rowId: String(maquina.id),
      maquina: maquina.maquina,
      peca: maquina.peca,
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
      checksStateParte1: new Array((storeData.tarefas1 || []).length).fill(false),
      checksStateParte2: new Array((storeData.tarefas2 || []).length).fill(false),
      checksStatePendencias: new Array((storeData.tarefasPendencias || []).length).fill(false),
      setupRegistrado: false,
      updatedAt: agora
    };

    // 1. Optimistic instant local update
    const nextData: StoreData = {
      ...storeData,
      maquinas: (storeData.maquinas || []).filter((m) => String(m.id) !== String(maquina.id)),
      setupsAtivos: {
        ...(storeData.setupsAtivos || {}),
        [setupId]: novoSetup
      }
    };
    setStoreData(nextData);
    setAbaAtiva('ativos');
    showToast(`Setup iniciado para a máquina ${maquina.maquina}!`);

    // 2. Immediate real-time Firebase Cloud sync for all tablets
    FirebaseService.salvarStore(nextData).catch((fbErr) => {
      console.warn('Sync Firebase ao iniciar setup:', fbErr);
    });

    // 3. Local backend disk persistence
    try {
      await SetupApiService.iniciarSetup(maquina.id, maquina.maquina, maquina.peca, modClean);
    } catch (err: any) {
      console.warn('Backend local persist aviso:', err);
    }
  };

  const handleAutoSalvarCard = async (
    id: string,
    prep1Val: string,
    prep2Val: string,
    checksParte1: boolean[],
    checksParte2: boolean[],
    checksPendencias: boolean[],
    tempoDecorridoMs?: number
  ) => {
    try {
      const atualizado = await SetupApiService.autoSaveCard(
        id,
        prep1Val,
        prep2Val,
        checksParte1,
        checksParte2,
        checksPendencias,
        tempoDecorridoMs
      );
      if (atualizado) {
        setStoreData((prev) => {
          const next = {
            ...prev,
            setupsAtivos: {
              ...prev.setupsAtivos,
              [id]: atualizado
            }
          };
          FirebaseService.salvarStore(next).catch(() => {});
          return next;
        });
      }
    } catch (err) {
      console.warn('Erro ao salvar card:', err);
    }
  };

  const handleDesconto = async (setupId: string, tipo: 'cafe' | 'almoco') => {
    try {
      await SetupApiService.aplicarDesconto(setupId, tipo);
      const updated = await carregarDados();
      showToast(tipo === 'cafe' ? 'Intervalo de Café registrado!' : 'Intervalo de Almoço registrado!');
      if (updated) FirebaseService.salvarStore(updated).catch(() => {});
    } catch (err) {
      console.error(err);
      showToast('Erro ao registrar intervalo.');
    }
  };

  const handleIniciarParada = async (setupId: string, motivo: string) => {
    try {
      await SetupApiService.iniciarParada(setupId, motivo);
      const updated = await carregarDados();
      showToast(`Parada iniciada: ${motivo}`);
      if (updated) FirebaseService.salvarStore(updated).catch(() => {});
    } catch (err) {
      console.error(err);
      showToast('Erro ao registrar parada.');
    }
  };

  const handleFinalizarParada = async (setupId: string, motivo: string) => {
    try {
      await SetupApiService.finalizarParada(setupId, motivo);
      const updated = await carregarDados();
      showToast('Parada finalizada e retomado!');
      if (updated) FirebaseService.salvarStore(updated).catch(() => {});
    } catch (err) {
      console.error(err);
      showToast('Erro ao finalizar parada.');
    }
  };

  const handleLiberarMaquina = async (
    id: string,
    prep1: string,
    prep2: string,
    tempoFormatado: string,
    tempoMs: number
  ) => {
    try {
      const resp = await SetupApiService.liberarMaquina(id, prep1, prep2, tempoFormatado, tempoMs);
      const updated = await carregarDados();
      showToast(`Setup concluído! Máquina liberada para produção.`);
      if (resp?.setupConcluido) {
        FirebaseService.registrarSetupConcluido(resp.setupConcluido).catch(() => {});
      }
      if (updated) {
        FirebaseService.salvarStore(updated).catch(() => {});
      }
    } catch (err) {
      console.error(err);
      showToast('Erro ao liberar máquina.');
    }
  };

  const handleEncerrarPendencias = async (setupId: string) => {
    try {
      await SetupApiService.encerrarPendencias(setupId);
      const updated = await carregarDados();
      showToast(`Pendências concluídas e setup arquivado no histórico!`);
      if (updated) {
        FirebaseService.salvarStore(updated).catch(() => {});
      }
    } catch (err) {
      console.error(err);
      showToast('Erro ao encerrar pendências.');
    }
  };

  const handleToggleSetupExterno = async (maquinaId: string, senha: string) => {
    try {
      await SetupApiService.toggleSetupExterno(maquinaId, senha);
      const updated = await carregarDados();
      showToast('Status de Setup Externo autorizado!');
      if (updated) FirebaseService.salvarStore(updated).catch(() => {});
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Senha incorreta!');
    }
  };

  const handleDeletarMaquina = async (maquinaId: string, senha: string) => {
    try {
      await SetupApiService.deletarMaquina(maquinaId, senha);
      const updated = await carregarDados();
      showToast('Máquina excluída da fila.');
      if (updated) FirebaseService.salvarStore(updated).catch(() => {});
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Senha incorreta.');
    }
  };

  const handleLimparMaquinas = async (senha: string) => {
    try {
      await SetupApiService.limparMaquinas(senha);
      const updated = await carregarDados();
      showToast('Fila de máquinas limpa com sucesso.');
      if (updated) FirebaseService.salvarStore(updated).catch(() => {});
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Senha incorreta.');
    }
  };

  const handleDeletarPreparador = async (nome: string, senha: string) => {
    try {
      await SetupApiService.deletarPreparador(nome, senha);
      const updated = await carregarDados();
      showToast(`Preparador ${nome} removido.`);
      if (updated) FirebaseService.salvarStore(updated).catch(() => {});
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Senha incorreta.');
    }
  };

  const handleSalvarTurno = async (config: TurnoConfig, senha: string) => {
    try {
      await SetupApiService.salvarTurno(config, senha);
      const updated = await carregarDados();
      showToast('Horários de turno atualizados.');
      if (updated) FirebaseService.salvarStore(updated).catch(() => {});
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Erro ao salvar turno.');
    }
  };

  const handleSalvarTarefas = async (grupo: 'parte1' | 'parte2' | 'pendencias', tarefas: string[], senha: string) => {
    try {
      await SetupApiService.salvarTarefas(grupo, tarefas, senha);
      const updated = await carregarDados();
      showToast('Checklist atualizado com sucesso.');
      if (updated) FirebaseService.salvarStore(updated).catch(() => {});
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Erro ao salvar checklist.');
    }
  };

  const handleAdicionarPreparador = async (nome: string) => {
    try {
      await SetupApiService.adicionarPreparador(nome);
      const updated = await carregarDados();
      showToast(`Preparador ${nome} cadastrado!`);
      if (updated) FirebaseService.salvarStore(updated).catch(() => {});
    } catch (err) {
      console.error(err);
      showToast('Erro ao adicionar preparador.');
    }
  };

  const handleAdicionarMaquina = async (maquina: string, peca: string) => {
    try {
      await SetupApiService.adicionarMaquina(maquina, peca);
      const updated = await carregarDados();
      showToast(`Máquina ${maquina} adicionada à fila!`);
      if (updated) {
        try {
          await FirebaseService.salvarStore(updated);
        } catch (fbErr) {
          console.warn('Sync Firebase ao adicionar máquina:', fbErr);
        }
      }
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Erro ao adicionar máquina.');
    }
  };

  const handleResetDemo = async () => {
    await SetupApiService.resetDemo();
    await carregarDados();
    showToast('Checklists padrão restaurados com sucesso!');
  };

  const handleEsvaziarConcluidos = async (senha?: string) => {
    try {
      await SetupApiService.esvaziarConcluidos(senha || '8619');
      const updated: StoreData = { ...storeData, concluidos: [] };
      await FirebaseService.salvarStore(updated);
      setStoreData(updated);
      showToast('Histórico de registros esvaziado com sucesso! Começando do zero.');
    } catch (err) {
      console.error(err);
      showToast('Erro ao esvaziar registros.');
    }
  };

  // Print Handlers
  const handleImprimirDashboard = (
    filtrados: SetupConcluido[],
    filtroMaquina: string,
    filtroPeriodo: string
  ) => {
    if (filtrados.length === 0) {
      showToast('Não há dados para imprimir neste filtro.');
      return;
    }

    const contagemEventos: Record<string, { descricao: string; count: number }> = {};
    let totalParadas = 0;
    let totalSegundos = 0;

    filtrados.forEach((c) => {
      let seg = 0;
      if (c.tempoMs) seg = Math.floor(c.tempoMs / 1000);
      else if (c.tempo && c.tempo !== '-') {
        const p = c.tempo.split(':');
        if (p.length === 3) seg = +p[0] * 3600 + +p[1] * 60 + +p[2];
      }
      totalSegundos += seg;

      if (c.historico && c.historico.trim() !== '') {
        c.historico.split('|').forEach((ev) => {
          let motivo = ev.replace(/\[.*?\]\s*/, '').trim();
          if (motivo) {
            if (motivo.toLowerCase().startsWith('parada:')) motivo = motivo.substring(7).trim();
            const key = motivo.toUpperCase();
            if (!contagemEventos[key]) contagemEventos[key] = { descricao: motivo, count: 0 };
            contagemEventos[key].count++;
            totalParadas++;
          }
        });
      }
    });

    const top10Paradas = Object.values(contagemEventos)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((p) => ({
        ...p,
        pct: totalParadas > 0 ? +((p.count / totalParadas) * 100).toFixed(1) : 0
      }));

    const mediaSeg = filtrados.length > 0 ? Math.floor(totalSegundos / filtrados.length) : 0;

    baixarRelatorioDashboardPdf({
      filtrados,
      filtroMaquina: filtroMaquina === 'todas' ? 'Todas as Máquinas' : filtroMaquina,
      filtroPeriodo: filtroPeriodo === 'todos' ? 'Todos os Registros' : filtroPeriodo === 'semana' ? 'Últimos 7 Dias' : `Mês ${filtroPeriodo}`,
      kpiTotal: filtrados.length,
      kpiMedia: formatarTempo(mediaSeg * 1000),
      top10Paradas
    });
    showToast('PDF em Preto e Branco gerado! Verifique seus Downloads.');
  };

  const handleImprimirGestor = (
    filtrados: SetupConcluido[],
    colabNome: string,
    periodoTexto: string,
    top3: SetupConcluido[],
    top10Paradas: Array<{ descricao: string; count: number; pct: number }>
  ) => {
    if (filtrados.length === 0) {
      showToast('Não há registros para gerar o relatório gerencial.');
      return;
    }

    let totalSegundos = 0;
    let minSeg = Infinity;
    let maxSeg = -1;
    let setupMenorTempo: SetupConcluido | null = null;
    let setupMaiorTempo: SetupConcluido | null = null;

    filtrados.forEach((c) => {
      let seg = 0;
      if (c.tempoMs) seg = Math.floor(c.tempoMs / 1000);
      else if (c.tempo && c.tempo !== '-') {
        const p = c.tempo.split(':');
        if (p.length === 3) seg = +p[0] * 3600 + +p[1] * 60 + +p[2];
      }
      totalSegundos += seg;
      if (seg > 0) {
        if (seg < minSeg) {
          minSeg = seg;
          setupMenorTempo = c;
        }
        if (seg > maxSeg) {
          maxSeg = seg;
          setupMaiorTempo = c;
        }
      }
    });

    const mediaSeg = filtrados.length > 0 ? Math.floor(totalSegundos / filtrados.length) : 0;

    baixarRelatorioGestorPdf({
      filtrados,
      colabNome,
      periodoTexto,
      top3,
      top10Paradas,
      kpiTotal: filtrados.length,
      kpiMedia: formatarTempo(mediaSeg * 1000),
      menorTempoStr: minSeg === Infinity ? '00:00:00' : formatarTempo(minSeg * 1000),
      maiorTempoStr: maxSeg === -1 ? '00:00:00' : formatarTempo(maxSeg * 1000),
      setupMenorTempo,
      setupMaiorTempo
    });
    showToast('PDF Gerencial em Preto e Branco gerado com sucesso!');
  };

  const qtdAtivos = Object.keys(storeData.setupsAtivos || {}).length;
  const shiftScheduleStr = `${storeData.turnoConfig?.inicio || '07:00'}-${storeData.turnoConfig?.fim || '17:00'}`;

  return (
    <div className="bg-slate-950 text-slate-100 font-sans h-screen flex overflow-hidden select-none">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 border border-blue-500/50 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-2xl animate-in slide-in-from-top-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Main Sidebar Navigation */}
      <Navbar
        abaAtiva={abaAtiva}
        aoMudarAba={(aba) => setAbaAtiva(aba)}
        qtdAtivos={qtdAtivos}
        turnoAtivo={turnoAtivo}
        online={online}
        shiftScheduleStr={shiftScheduleStr}
        aoBackupTudo={handleBackupTudo}
        aoAbrirBusca={handleAbrirBusca}
        aoAbrirReset={handleAbrirReset}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950 relative">
        {abaAtiva === 'dashboard' && (
          <ErrorBoundary fallbackTitle="Erro ao carregar Iniciar Setup">
            <AbaIniciarSetup
              maquinas={storeData.maquinas || []}
              aoSelecionarMaquina={(m) => setMaquinaParaIniciar(m)}
              aoAdicionarMaquina={handleAdicionarMaquina}
              aoToggleSetupExterno={handleToggleSetupExterno}
              aoDeletarMaquina={handleDeletarMaquina}
            />
          </ErrorBoundary>
        )}

        {abaAtiva === 'ativos' && (
          <ErrorBoundary fallbackTitle="Erro ao carregar Setups Ativos">
            <AbaSetupsAtivos
              setupsAtivos={storeData.setupsAtivos || {}}
              preparadores={storeData.preparadores || []}
              tarefas1={storeData.tarefas1 || []}
              tarefas2={storeData.tarefas2 || []}
              tarefasPendencias={storeData.tarefasPendencias || []}
              turnoConfig={storeData.turnoConfig}
              turnoAtivo={turnoAtivo}
              aoAutoSalvarCard={handleAutoSalvarCard}
              aoDesconto={handleDesconto}
              aoIniciarParada={handleIniciarParada}
              aoFinalizarParada={handleFinalizarParada}
              aoLiberarMaquina={handleLiberarMaquina}
              aoEncerrarPendencias={handleEncerrarPendencias}
              aoCancelarSetupAtivo={handleCancelarSetupAtivo}
              aoMudarParaIniciar={() => setAbaAtiva('dashboard')}
            />
          </ErrorBoundary>
        )}

        {abaAtiva === 'concluidos' && (
          <ErrorBoundary fallbackTitle="Erro ao carregar Relatórios">
            <AbaRelatorios
              concluidos={storeData.concluidos || []}
              aoAbrirHistorico={(h, t) => setResumoHistorico({ aberto: true, texto: h, titulo: t })}
              aoImprimir={handleImprimirDashboard}
              aoCarregarDados={handleRestaurarBackup}
              aoEsvaziarConcluidos={handleEsvaziarConcluidos}
              dadosCompletos={storeData}
            />
          </ErrorBoundary>
        )}

        {abaAtiva === 'gestor' && (
          <ErrorBoundary fallbackTitle="Erro no Painel do Gestor">
            <AbaPainelGestor
              concluidos={storeData.concluidos || []}
              preparadores={storeData.preparadores || []}
              aoImprimirGestor={handleImprimirGestor}
            />
          </ErrorBoundary>
        )}

        {abaAtiva === 'admin' && (
          <ErrorBoundary fallbackTitle="Erro no Painel do Líder">
            <AbaAdmin
              turnoConfig={storeData.turnoConfig}
              preparadores={storeData.preparadores || []}
              maquinas={storeData.maquinas || []}
              tarefas1={storeData.tarefas1 || []}
              tarefas2={storeData.tarefas2 || []}
              tarefasPendencias={storeData.tarefasPendencias || []}
              storeData={storeData}
              aoAtualizarStore={async () => { await carregarDados(); }}
              onShowToast={showToast}
              aoSalvarTurno={handleSalvarTurno}
              aoAdicionarPreparador={handleAdicionarPreparador}
              aoDeletarPreparador={handleDeletarPreparador}
              aoAdicionarMaquina={handleAdicionarMaquina}
              aoDeletarMaquina={handleDeletarMaquina}
              aoLimparMaquinas={handleLimparMaquinas}
              aoSalvarTarefas={handleSalvarTarefas}
              aoResetDemo={handleResetDemo}
              aoRestaurarBackup={handleRestaurarBackup}
              aoResetarTudo={handleConfirmarResetComSenha}
              aoEsvaziarConcluidos={handleEsvaziarConcluidos}
            />
          </ErrorBoundary>
        )}
      </main>

      {/* Modals */}
      <ModalIniciarSetup
        aberto={!!maquinaParaIniciar}
        maquina={maquinaParaIniciar}
        aoFechar={() => setMaquinaParaIniciar(null)}
        aoConfirmar={handleIniciarSetup}
      />

      <ModalResumoHistorico
        aberto={resumoHistorico.aberto}
        historicoStr={resumoHistorico.texto}
        titulo={resumoHistorico.titulo}
        aoFechar={() => setResumoHistorico({ aberto: false, texto: '', titulo: '' })}
      />

      {/* Modal de Busca Geral de Registros Gravados */}
      <ModalBuscaRegistros
        aberto={modalBuscaAberto}
        aoFechar={() => setModalBuscaAberto(false)}
        concluidos={storeData.concluidos || []}
      />

      {/* Modal de Confirmação de Reset (Começar do Zero) */}
      {modalResetAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-red-500/50 w-full max-w-md rounded-2xl shadow-2xl p-6 relative overflow-hidden">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                  <RotateCcw className="w-6 h-6 animate-spin-reverse" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">Resetar o App (Do Zero)</h3>
                  <p className="text-xs text-red-300 font-semibold">Limpar todos os registros e setups</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalResetAberto(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Esta ação limpa todas as máquinas na fila, setups ativos e histórico de concluídos para que você comece do zero absoluto sem registros antigos.
            </p>

            <form onSubmit={handleConfirmarReset} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Digite a Senha do Líder:</span>
                </label>
                <input
                  type="password"
                  value={senhaReset}
                  onChange={(e) => {
                    setSenhaReset(e.target.value);
                    setErroSenhaReset(false);
                  }}
                  placeholder="Digite 8619 ou 5211..."
                  autoFocus
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-center text-white text-base font-mono tracking-widest focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                />
                <p className="text-[11px] text-slate-400 font-medium mt-1">
                  🔑 Senha padrão: <strong>8619</strong> ou <strong>5211</strong>
                </p>
                {erroSenhaReset && (
                  <p className="text-xs font-bold text-red-400 mt-1 animate-shake">
                    Senha incorreta! Digite 8619 ou 5211.
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalResetAberto(false)}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 px-4 rounded-xl text-xs transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={resetando}
                  className="flex-1 bg-red-600 hover:bg-red-500 text-white font-black py-3 px-4 rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-red-600/30 transition flex items-center justify-center gap-2"
                >
                  {resetando ? (
                    <span>Limpando...</span>
                  ) : (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      <span>Confirmar Reset</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hidden print report area (activated only during window.print()) */}
      <AreaImpressao
        modoImpressao={modoImpressao}
        dadosDashboard={dadosPrintDashboard}
        dadosGestor={dadosPrintGestor}
      />
    </div>
  );
}
