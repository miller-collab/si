/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  StoreData,
  Maquina,
  SetupAtivo,
  SetupConcluido,
  TurnoConfig
} from './types';
import { SetupApiService } from './services/api';
import { estaNoTurno, formatarTempo } from './utils/turno';

import { Navbar } from './components/Navbar';
import { AbaIniciarSetup } from './components/AbaIniciarSetup';
import { AbaSetupsAtivos } from './components/AbaSetupsAtivos';
import { AbaRelatorios } from './components/AbaRelatorios';
import { AbaPainelGestor } from './components/AbaPainelGestor';
import { AbaAdmin } from './components/AbaAdmin';

import { ModalIniciarSetup } from './components/ModalIniciarSetup';
import { ModalResumoHistorico } from './components/ModalResumoHistorico';
import {
  AreaImpressao,
  type DadosImpressaoDashboard,
  type DadosImpressaoGestor
} from './components/AreaImpressao';

export default function App() {
  const [carregando, setCarregando] = useState(true);
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

  // Print states
  const [modoImpressao, setModoImpressao] = useState<'dashboard' | 'gestor' | null>(null);
  const [dadosPrintDashboard, setDadosPrintDashboard] = useState<DadosImpressaoDashboard | null>(null);
  const [dadosPrintGestor, setDadosPrintGestor] = useState<DadosImpressaoGestor | null>(null);

  // Toast feedback
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // Turno evaluation
  const checarTurno = useCallback((config: TurnoConfig) => {
    const agora = new Date();
    const dentro = estaNoTurno(agora, config);
    setTurnoAtivo(dentro);
  }, []);

  // Fetch initial data & subscribe
  const carregarDados = useCallback(async () => {
    try {
      const data = await SetupApiService.fetchSync();
      setStoreData(data);
      checarTurno(data.turnoConfig);
      setOnline(true);
    } catch (err) {
      console.warn('Erro ao sincronizar com backend:', err);
      setOnline(false);
    } finally {
      setCarregando(false);
    }
  }, [checarTurno]);

  useEffect(() => {
    carregarDados();

    // Listen to local cache updates
    const unsubscribe = SetupApiService.subscribe((data) => {
      setStoreData(data);
      checarTurno(data.turnoConfig);
    });

    // Centralized API polling every 4 seconds to sync between multiple tablets
    const syncInterval = setInterval(() => {
      SetupApiService.fetchSync()
        .then((data) => {
          setStoreData(data);
          setOnline(true);
        })
        .catch(() => setOnline(false));
    }, 4000);

    // Turno clock check every 15 seconds
    const turnoInterval = setInterval(() => {
      checarTurno(storeData.turnoConfig);
    }, 15000);

    return () => {
      unsubscribe();
      clearInterval(syncInterval);
      clearInterval(turnoInterval);
    };
  }, [carregarDados, checarTurno, storeData.turnoConfig]);

  // Handlers
  const handleIniciarSetup = async (maquina: Maquina, modeloAnterior: string) => {
    setMaquinaParaIniciar(null);
    try {
      await SetupApiService.iniciarSetup(maquina.id, maquina.maquina, maquina.peca, modeloAnterior);
      await carregarDados();
      setAbaAtiva('ativos');
      showToast(`Setup iniciado para a máquina ${maquina.maquina}!`);
    } catch (err) {
      console.error(err);
      showToast('Erro ao iniciar setup.');
    }
  };

  const handleAutoSalvarCard = async (
    id: string,
    prep1Val: string,
    prep2Val: string,
    checks1: boolean[],
    checks2: boolean[],
    checksPend: boolean[],
    tempoDecorridoMs?: number
  ) => {
    try {
      await SetupApiService.autoSaveCard(id, prep1Val, prep2Val, checks1, checks2, checksPend, tempoDecorridoMs);
    } catch (err) {
      console.error('Erro no auto-save:', err);
    }
  };

  const handleDesconto = async (id: string, tipo: 'cafe' | 'almoco') => {
    try {
      await SetupApiService.aplicarDesconto(id, tipo);
      await carregarDados();
      showToast(tipo === 'cafe' ? 'Intervalo de café descontado (-15m)' : 'Intervalo de almoço descontado (-1.5h)');
    } catch (err) {
      console.error(err);
      showToast('Erro ao aplicar desconto.');
    }
  };

  const handleIniciarParada = async (id: string, motivo: string) => {
    try {
      await SetupApiService.iniciarParada(id, motivo);
      await carregarDados();
      showToast('Parada iniciada! Relógio em andamento.');
    } catch (err) {
      console.error(err);
      showToast('Erro ao iniciar parada.');
    }
  };

  const handleFinalizarParada = async (id: string, motivo: string) => {
    try {
      await SetupApiService.finalizarParada(id, motivo);
      await carregarDados();
      showToast('Motivo da parada gravado! Setup retomado.');
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
      await SetupApiService.liberarMaquina(id, prep1, prep2, tempoFormatado, tempoMs);
      await carregarDados();
      showToast(`Máquina liberada para produção! Tempo oficial registrado: ${tempoFormatado}.`);
    } catch (err) {
      console.error(err);
      showToast('Erro ao liberar máquina.');
    }
  };

  const handleEncerrarPendencias = async (id: string) => {
    try {
      await SetupApiService.encerrarPendencias(id);
      await carregarDados();
      showToast('Todas as pendências foram concluídas. Setup arquivado com sucesso!');
      if (Object.keys(storeData.setupsAtivos).length <= 1) {
        setAbaAtiva('concluidos');
      }
    } catch (err) {
      console.error(err);
      showToast('Erro ao encerrar pendências.');
    }
  };

  const handleToggleSetupExterno = async (maquinaId: string, senha: string) => {
    await SetupApiService.toggleSetupExterno(maquinaId, senha);
    await carregarDados();
    showToast('Status de Setup Externo atualizado com sucesso!');
  };

  const handleDeletarMaquina = async (maquinaId: string, senha: string) => {
    await SetupApiService.deletarMaquina(maquinaId, senha);
    await carregarDados();
    showToast('Máquina removida da fila!');
  };

  const handleLimparMaquinas = async (senha: string) => {
    await SetupApiService.limparMaquinas(senha);
    await carregarDados();
    showToast('Fila de máquinas limpa com sucesso!');
  };

  const handleDeletarPreparador = async (nome: string, senha: string) => {
    await SetupApiService.deletarPreparador(nome, senha);
    await carregarDados();
    showToast(`Preparador ${nome} removido!`);
  };

  const handleSalvarTurno = async (config: TurnoConfig, senha: string) => {
    await SetupApiService.salvarTurno(config, senha);
    await carregarDados();
    showToast('Horários de turno atualizados!');
  };

  const handleSalvarTarefas = async (grupo: 'parte1' | 'parte2' | 'pendencias', tarefas: string[], senha: string) => {
    await SetupApiService.salvarTarefas(grupo, tarefas, senha);
    await carregarDados();
    showToast('Atividades do checklist salvas!');
  };

  const handleAdicionarPreparador = async (nome: string) => {
    try {
      await SetupApiService.adicionarPreparador(nome);
      await carregarDados();
      showToast(`Preparador ${nome} adicionado com sucesso!`);
    } catch (err) {
      console.error(err);
      showToast('Erro ao adicionar preparador.');
    }
  };

  const handleAdicionarMaquina = async (maquina: string, peca: string) => {
    try {
      await SetupApiService.adicionarMaquina(maquina, peca);
      await carregarDados();
      showToast(`Máquina ${maquina} adicionada à fila!`);
    } catch (err) {
      console.error(err);
      showToast('Erro ao adicionar máquina.');
    }
  };

  const handleResetDemo = async () => {
    await SetupApiService.resetDemo();
    await carregarDados();
    showToast('Checklists padrão restaurados com sucesso!');
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

    setDadosPrintDashboard({
      filtrados,
      filtroMaquina: filtroMaquina === 'todas' ? 'Todas as Máquinas' : filtroMaquina,
      filtroPeriodo: filtroPeriodo === 'todos' ? 'Todos os Registros' : filtroPeriodo === 'semana' ? 'Últimos 7 Dias' : `Mês ${filtroPeriodo}`,
      kpiTotal: filtrados.length,
      kpiMedia: formatarTempo(mediaSeg * 1000),
      top10Paradas
    });

    setModoImpressao('dashboard');
    setTimeout(() => {
      window.print();
    }, 200);
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

    setDadosPrintGestor({
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

    setModoImpressao('gestor');
    setTimeout(() => {
      window.print();
    }, 200);
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
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950 relative">
        {abaAtiva === 'dashboard' && (
          <AbaIniciarSetup
            maquinas={storeData.maquinas || []}
            aoSelecionarMaquina={(m) => setMaquinaParaIniciar(m)}
            aoAdicionarMaquina={handleAdicionarMaquina}
            aoToggleSetupExterno={handleToggleSetupExterno}
            aoDeletarMaquina={handleDeletarMaquina}
          />
        )}

        {abaAtiva === 'ativos' && (
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
            aoMudarParaIniciar={() => setAbaAtiva('dashboard')}
          />
        )}

        {abaAtiva === 'concluidos' && (
          <AbaRelatorios
            concluidos={storeData.concluidos || []}
            aoAbrirHistorico={(h, t) => setResumoHistorico({ aberto: true, texto: h, titulo: t })}
            aoImprimir={handleImprimirDashboard}
          />
        )}

        {abaAtiva === 'gestor' && (
          <AbaPainelGestor
            concluidos={storeData.concluidos || []}
            preparadores={storeData.preparadores || []}
            aoImprimirGestor={handleImprimirGestor}
          />
        )}

        {abaAtiva === 'admin' && (
          <AbaAdmin
            turnoConfig={storeData.turnoConfig}
            preparadores={storeData.preparadores || []}
            maquinas={storeData.maquinas || []}
            tarefas1={storeData.tarefas1 || []}
            tarefas2={storeData.tarefas2 || []}
            tarefasPendencias={storeData.tarefasPendencias || []}
            aoSalvarTurno={handleSalvarTurno}
            aoAdicionarPreparador={handleAdicionarPreparador}
            aoDeletarPreparador={handleDeletarPreparador}
            aoAdicionarMaquina={handleAdicionarMaquina}
            aoDeletarMaquina={handleDeletarMaquina}
            aoLimparMaquinas={handleLimparMaquinas}
            aoSalvarTarefas={handleSalvarTarefas}
            aoResetDemo={handleResetDemo}
          />
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

      {/* Hidden print report area (activated only during window.print()) */}
      <AreaImpressao
        modoImpressao={modoImpressao}
        dadosDashboard={dadosPrintDashboard}
        dadosGestor={dadosPrintGestor}
      />
    </div>
  );
}
