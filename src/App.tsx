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
import { getAccessToken } from './services/googleAuth';
import { GoogleSheetsService } from './services/googleSheets';
import { estaNoTurno, formatarTempo } from './utils/turno';
import { baixarRelatorioDashboardPdf, baixarRelatorioGestorPdf } from './utils/pdfGestor';

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

  // 40-second auto-sync loop state (Foto 2)
  const [segundosParaSync, setSegundosParaSync] = useState(40);
  const [sincronizando, setSincronizando] = useState(false);
  const ultimaAtividadeRef = useRef(Date.now());
  const sincronizandoRef = useRef(false);
  const autoSaveSheetsTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch data & optionally sync automatically to Google Sheets
  const carregarDados = useCallback(async (sincronizarComPlanilha = false) => {
    try {
      const data = await SetupApiService.fetchSync();
      setStoreData(data);
      checarTurno(data.turnoConfig);
      setOnline(true);

      // Sincronização Bidirecional em tempo real com a Planilha Google (A Planilha é o Centro de Tudo)
      if (sincronizarComPlanilha && data.sheetConfig?.spreadsheetId) {
        getAccessToken().then((tok) => {
          if (tok) {
            GoogleSheetsService.sincronizacaoBidirecional(
              data.sheetConfig!.spreadsheetId,
              tok,
              data
            )
              .then((res) => {
                if (res?.storeAtualizado) {
                  setStoreData(res.storeAtualizado);
                }
              })
              .catch((e) => console.warn('Erro na sincronização bidirecional Google Sheets:', e));
          }
        });
      }

      return data;
    } catch (err) {
      console.warn('Erro ao sincronizar com backend:', err);
      setOnline(false);
      return null;
    } finally {
      setCarregando(false);
    }
  }, [checarTurno]);

  const sincronizarAgora = useCallback(async () => {
    if (sincronizandoRef.current) return;
    sincronizandoRef.current = true;
    setSincronizando(true);
    try {
      await carregarDados(true);
    } finally {
      setSegundosParaSync(40);
      sincronizandoRef.current = false;
      setSincronizando(false);
    }
  }, [carregarDados]);

  useEffect(() => {
    carregarDados(true);

    // Listen to local cache updates
    const unsubscribe = SetupApiService.subscribe((data) => {
      setStoreData(data);
      checarTurno(data.turnoConfig);
    });

    // Reset inactivity timer when user interacts with tablet
    const resetAtividade = () => {
      ultimaAtividadeRef.current = Date.now();
    };

    window.addEventListener('pointerdown', resetAtividade, { passive: true });
    window.addEventListener('touchstart', resetAtividade, { passive: true });
    window.addEventListener('keydown', resetAtividade, { passive: true });
    window.addEventListener('mousemove', resetAtividade, { passive: true });

    // Wakeup on focus / visibilitychange (Photo 2 - when tablet screen turns on or tab is viewed)
    const onVisibilidadeChange = () => {
      if (document.visibilityState === 'visible') {
        sincronizarAgora();
      }
    };
    const onWindowFocus = () => {
      sincronizarAgora();
    };

    document.addEventListener('visibilitychange', onVisibilidadeChange);
    window.addEventListener('focus', onWindowFocus);

    // 40-second auto-sync loop if nobody is interacting (Photo 2)
    const intervalOcioso = setInterval(() => {
      const segundosSemInteracao = Math.floor((Date.now() - ultimaAtividadeRef.current) / 1000);
      const restantes = Math.max(0, 40 - (segundosSemInteracao % 40));
      setSegundosParaSync(restantes);

      // When reaching 40s idle loop or cycling every 40s idle
      if (segundosSemInteracao > 0 && segundosSemInteracao % 40 === 0) {
        sincronizarAgora();
      }
    }, 1000);

    // Light background poll every 4 seconds to sync between multiple tablets
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
      window.removeEventListener('pointerdown', resetAtividade);
      window.removeEventListener('touchstart', resetAtividade);
      window.removeEventListener('keydown', resetAtividade);
      window.removeEventListener('mousemove', resetAtividade);
      document.removeEventListener('visibilitychange', onVisibilidadeChange);
      window.removeEventListener('focus', onWindowFocus);
      clearInterval(intervalOcioso);
      clearInterval(syncInterval);
      clearInterval(turnoInterval);
    };
  }, [carregarDados, checarTurno, sincronizarAgora, storeData.turnoConfig]);

  // Handlers
  const handleIniciarSetup = async (maquina: Maquina, modeloAnterior: string) => {
    setMaquinaParaIniciar(null);
    try {
      await SetupApiService.iniciarSetup(maquina.id, maquina.maquina, maquina.peca, modeloAnterior);
      await carregarDados(true);
      setAbaAtiva('ativos');
      showToast(`Setup iniciado para a máquina ${maquina.maquina}! Gravado na planilha.`);
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

      // Auto-gravação em segundo plano na planilha Google com debounce de 1 segundo
      if (storeData.sheetConfig?.spreadsheetId) {
        if (autoSaveSheetsTimerRef.current) {
          clearTimeout(autoSaveSheetsTimerRef.current);
        }
        autoSaveSheetsTimerRef.current = setTimeout(async () => {
          await carregarDados(true);
        }, 1000);
      }
    } catch (err) {
      console.error('Erro no auto-save:', err);
    }
  };

  const handleDesconto = async (id: string, tipo: 'cafe' | 'almoco') => {
    try {
      await SetupApiService.aplicarDesconto(id, tipo);
      await carregarDados(true);
      showToast(tipo === 'cafe' ? 'Intervalo de café descontado (-15m)' : 'Intervalo de almoço descontado (-1.5h)');
    } catch (err) {
      console.error(err);
      showToast('Erro ao aplicar desconto.');
    }
  };

  const handleIniciarParada = async (id: string, motivo: string) => {
    try {
      await SetupApiService.iniciarParada(id, motivo);
      await carregarDados(true);
      showToast('Parada iniciada! Relógio em andamento gravado na planilha.');
    } catch (err) {
      console.error(err);
      showToast('Erro ao iniciar parada.');
    }
  };

  const handleFinalizarParada = async (id: string, motivo: string) => {
    try {
      await SetupApiService.finalizarParada(id, motivo);
      await carregarDados(true);
      showToast('Motivo da parada gravado! Setup retomado e sincronizado na planilha.');
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
      await carregarDados(true);
      showToast(`Máquina liberada para produção! Tempo registrado na Planilha Google: ${tempoFormatado}.`);
    } catch (err) {
      console.error(err);
      showToast('Erro ao liberar máquina.');
    }
  };

  const handleEncerrarPendencias = async (id: string) => {
    try {
      await SetupApiService.encerrarPendencias(id);
      await carregarDados(true);
      showToast('Todas as pendências foram concluídas. Setup arquivado e sincronizado!');
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
    await carregarDados(true);
    showToast('Status de Setup Externo atualizado e sincronizado!');
  };

  const handleDeletarMaquina = async (maquinaId: string, senha: string) => {
    await SetupApiService.deletarMaquina(maquinaId, senha);
    await carregarDados(true);
    showToast('Máquina removida da fila e da planilha!');
  };

  const handleLimparMaquinas = async (senha: string) => {
    await SetupApiService.limparMaquinas(senha);
    await carregarDados(true);
    showToast('Fila de máquinas limpa com sucesso!');
  };

  const handleDeletarPreparador = async (nome: string, senha: string) => {
    await SetupApiService.deletarPreparador(nome, senha);
    await carregarDados(true);
    showToast(`Preparador ${nome} removido!`);
  };

  const handleSalvarTurno = async (config: TurnoConfig, senha: string) => {
    await SetupApiService.salvarTurno(config, senha);
    await carregarDados(true);
    showToast('Horários de turno atualizados e sincronizados!');
  };

  const handleSalvarTarefas = async (grupo: 'parte1' | 'parte2' | 'pendencias', tarefas: string[], senha: string) => {
    await SetupApiService.salvarTarefas(grupo, tarefas, senha);
    await carregarDados(true);
    showToast('Atividades do checklist salvas!');
  };

  const handleAdicionarPreparador = async (nome: string) => {
    try {
      await SetupApiService.adicionarPreparador(nome);
      await carregarDados(true);
      showToast(`Preparador ${nome} adicionado com sucesso!`);
    } catch (err) {
      console.error(err);
      showToast('Erro ao adicionar preparador.');
    }
  };

  const handleAdicionarMaquina = async (maquina: string, peca: string) => {
    try {
      await SetupApiService.adicionarMaquina(maquina, peca);
      await carregarDados(true);
      showToast(`Máquina ${maquina} adicionada à fila e à Planilha Google!`);
    } catch (err) {
      console.error(err);
      showToast('Erro ao adicionar máquina.');
    }
  };

  const handleResetDemo = async () => {
    await SetupApiService.resetDemo();
    await carregarDados(true);
    showToast('Checklists padrão restaurados com sucesso!');
  };

  const handleEsvaziarConcluidos = async () => {
    try {
      await SetupApiService.esvaziarConcluidos('8619');
      await carregarDados(true);
      showToast('Histórico de registros esvaziado com sucesso! Começando do zero.');
    } catch (err) {
      console.error(err);
      showToast('Erro ao esvaziar registros.');
    }
  };

  const handleCarregarDados = async (backup: any) => {
    try {
      await SetupApiService.carregarDados(backup, '8619');
      await carregarDados(true);
      showToast('Dados e histórico carregados com sucesso!');
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Falha ao restaurar dados.');
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
        segundosParaSync={segundosParaSync}
        sincronizando={sincronizando}
        aoSincronizarAgora={sincronizarAgora}
        sheetConfig={storeData.sheetConfig}
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
            aoCarregarDados={handleCarregarDados}
            aoEsvaziarConcluidos={handleEsvaziarConcluidos}
            dadosCompletos={storeData}
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
