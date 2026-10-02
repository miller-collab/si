import React, { useState, useEffect } from 'react';
import {
  Clock,
  Coffee,
  Utensils,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  ArrowRight,
  ShieldCheck,
  CheckSquare,
  Play,
  Check,
  Pause
} from 'lucide-react';
import type { SetupAtivo, TurnoConfig } from '../types';
import { formatarTempo } from '../utils/turno';

interface AbaSetupsAtivosProps {
  setupsAtivos: Record<string, SetupAtivo>;
  preparadores: string[];
  tarefas1: string[];
  tarefas2: string[];
  tarefasPendencias: string[];
  turnoConfig: TurnoConfig;
  turnoAtivo: boolean;
  aoAutoSalvarCard: (
    id: string,
    prep1Val: string,
    prep2Val: string,
    c1: boolean[],
    c2: boolean[],
    cPend: boolean[],
    tempoDecorridoMs?: number
  ) => Promise<void>;
  aoDesconto: (id: string, tipo: 'cafe' | 'almoco') => void;
  aoIniciarParada: (setupId: string, motivo: string) => void;
  aoFinalizarParada: (setupId: string, motivo: string) => void;
  aoLiberarMaquina: (
    id: string,
    prep1: string,
    prep2: string,
    tempoFormatado: string,
    tempoMs: number
  ) => void;
  aoEncerrarPendencias: (id: string) => void;
  aoMudarParaIniciar: () => void;
}

export const AbaSetupsAtivos: React.FC<AbaSetupsAtivosProps> = ({
  setupsAtivos,
  preparadores,
  tarefas1,
  tarefas2,
  tarefasPendencias,
  turnoConfig,
  turnoAtivo,
  aoAutoSalvarCard,
  aoDesconto,
  aoIniciarParada,
  aoFinalizarParada,
  aoLiberarMaquina,
  aoEncerrarPendencias,
  aoMudarParaIniciar
}) => {
  // Unconditional 1-second live clock (empty dependency array so it NEVER resets or pauses)
  const [agora, setAgora] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setAgora(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-save feedback indicators
  const [salvandoAuto, setSalvandoAuto] = useState<Record<string, boolean>>({});

  // Mandatory motive modal when closing a stop
  const [modalFecharParada, setModalFecharParada] = useState<{
    aberto: boolean;
    setupId: string | null;
    motivo: string;
    erro: boolean;
  }>({
    aberto: false,
    setupId: null,
    motivo: '',
    erro: false
  });

  // Modal alert for incomplete tasks when trying to release
  const [alertaIncompleto, setAlertaIncompleto] = useState<string | null>(null);

  const ids = Object.keys(setupsAtivos);

  // Auto-save trigger on any checkbox or preparador change
  const handleCheckChange = async (setupId: string, group: 'p1' | 'p2' | 'pend', index: number) => {
    const s = setupsAtivos[setupId];
    if (!s || (s.setupRegistrado && group !== 'pend')) return;

    let c1 = [...(s.checksStateParte1 || new Array(tarefas1.length).fill(false))];
    let c2 = [...(s.checksStateParte2 || new Array(tarefas2.length).fill(false))];
    let cPend = [...(s.checksStatePendencias || new Array(tarefasPendencias.length).fill(false))];

    while (c1.length < tarefas1.length) c1.push(false);
    while (c2.length < tarefas2.length) c2.push(false);
    while (cPend.length < tarefasPendencias.length) cPend.push(false);

    if (group === 'p1') c1[index] = !c1[index];
    if (group === 'p2') c2[index] = !c2[index];
    if (group === 'pend') cPend[index] = !cPend[index];

    s.checksStateParte1 = c1;
    s.checksStateParte2 = c2;
    s.checksStatePendencias = cPend;

    const decorridoAtual = Math.max(0, agora - (s.inicioMs || agora));

    setSalvandoAuto((prev) => ({ ...prev, [setupId]: true }));
    try {
      await aoAutoSalvarCard(
        setupId,
        s.prep1Val,
        s.prep2Val,
        c1,
        c2,
        cPend,
        decorridoAtual
      );
    } finally {
      setTimeout(() => {
        setSalvandoAuto((prev) => ({ ...prev, [setupId]: false }));
      }, 1000);
    }
  };

  const handlePrepChange = async (setupId: string, prepType: 1 | 2, val: string) => {
    const s = setupsAtivos[setupId];
    if (!s) return;

    if (prepType === 1) s.prep1Val = val;
    if (prepType === 2) s.prep2Val = val;

    const decorridoAtual = Math.max(0, agora - (s.inicioMs || agora));

    setSalvandoAuto((prev) => ({ ...prev, [setupId]: true }));
    try {
      await aoAutoSalvarCard(
        setupId,
        s.prep1Val,
        s.prep2Val,
        s.checksStateParte1,
        s.checksStateParte2,
        s.checksStatePendencias,
        decorridoAtual
      );
    } finally {
      setTimeout(() => {
        setSalvandoAuto((prev) => ({ ...prev, [setupId]: false }));
      }, 1000);
    }
  };

  // Parada Action
  const handleBotaoParadaClick = (setup: SetupAtivo) => {
    if (!setup.paradaAtiva) {
      aoIniciarParada(setup.id, 'Parada em andamento');
    } else {
      setModalFecharParada({
        aberto: true,
        setupId: setup.id,
        motivo: '',
        erro: false
      });
    }
  };

  const handleConfirmarFechamentoParada = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalFecharParada.setupId) return;
    if (!modalFecharParada.motivo.trim()) {
      setModalFecharParada((prev) => ({ ...prev, erro: true }));
      return;
    }

    aoFinalizarParada(modalFecharParada.setupId, modalFecharParada.motivo.trim());
    setModalFecharParada({ aberto: false, setupId: null, motivo: '', erro: false });
  };

  // Validate completion for Liberar Máquina (Photo 4)
  const handleLiberarMaquinaClick = (setupId: string, tempoLiquidoMs: number, tempoFormatado: string) => {
    const s = setupsAtivos[setupId];
    if (!s) return;

    const c1 = s.checksStateParte1 || [];
    const c2 = s.checksStateParte2 || [];

    const faltantesP1 = tarefas1.length - c1.filter(Boolean).length;
    const faltantesP2 = tarefas2.length - c2.filter(Boolean).length;

    if (!s.prep1Val || !s.prep2Val) {
      setAlertaIncompleto('Selecione ambos os preparadores (Parte 1 e Parte 2) antes de liberar a máquina!');
      return;
    }

    if (faltantesP1 > 0 || faltantesP2 > 0) {
      setAlertaIncompleto(
        `Não é possível liberar a máquina!\n\n` +
        (faltantesP1 > 0 ? `• Restam ${faltantesP1} tarefa(s) pendente(s) na PARTE 1.\n` : '') +
        (faltantesP2 > 0 ? `• Restam ${faltantesP2} tarefa(s) pendente(s) na PARTE 2.\n` : '') +
        `\nConclua e marque todas as atividades antes de registrar a liberação.`
      );
      return;
    }

    aoLiberarMaquina(setupId, s.prep1Val, s.prep2Val, tempoFormatado, tempoLiquidoMs);
  };

  const handleEncerrarPendenciasClick = (setupId: string) => {
    const s = setupsAtivos[setupId];
    if (!s) return;

    const cPend = s.checksStatePendencias || [];
    const faltantesPend = tarefasPendencias.length - cPend.filter(Boolean).length;

    if (faltantesPend > 0) {
      setAlertaIncompleto(
        `Não é possível encerrar o card!\n\nRestam ${faltantesPend} atividade(s) pendente(s) na lista de PENDÊNCIAS pós-setup.\nMarque todas para finalizar.`
      );
      return;
    }

    aoEncerrarPendencias(setupId);
  };

  if (ids.length === 0) {
    return (
      <div className="flex-1 p-8 flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 mb-5">
          <Clock className="w-10 h-10" />
        </div>
        <h3 className="text-2xl font-black text-white mb-2">Nenhum setup em andamento</h3>
        <p className="text-sm text-slate-400 max-w-md mb-6">
          Selecione uma máquina na fila para iniciar a contagem e realizar o checklist com 1 ou 2 preparadores.
        </p>
        <button
          onClick={aoMudarParaIniciar}
          className="bg-blue-600 hover:bg-blue-500 text-white font-extrabold px-6 py-3.5 rounded-xl shadow-lg shadow-blue-600/30 transition flex items-center gap-2"
        >
          <Play className="w-4 h-4 fill-white" />
          <span>Iniciar Novo Setup</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/30">
              <Clock className="w-6 h-6 text-blue-500" />
            </span>
            Setups em Andamento ({ids.length})
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Tempo correndo em tempo real segundo a segundo. Todas as alterações são salvas automaticamente.
          </p>
        </div>

        {/* Turno Indicator Badge */}
        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border shadow-lg ${
            turnoAtivo
              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-600/50 shadow-emerald-950/30'
              : 'bg-red-950/60 text-red-400 border-red-600/50 shadow-red-950/30'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              turnoAtivo ? 'bg-emerald-400 animate-ping' : 'bg-red-400'
            }`}
          />
          <span>{turnoAtivo ? 'Turno Ativo (Contando Tempo)' : 'Turno Pausado (Tempo Estático)'}</span>
        </div>
      </div>

      {/* Grid of Active Cards */}
      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-8">
        {ids.map((id) => {
          const setup = setupsAtivos[id];
          const isLiberada = !!setup.setupRegistrado;

          // BULLETPROOF LIVE CHRONOMETER CALCULATION
          let displayTime = '00:00:00';
          let tempoLiquidoMs = 0;

          if (isLiberada) {
            displayTime = setup.tempoFormatado || formatarTempo(setup.tempoSetupMs || setup.tempoDecorridoMs || 0);
            tempoLiquidoMs = setup.tempoSetupMs || setup.tempoDecorridoMs || 0;
          } else {
            // Live real-time elapsed time from exact start timestamp
            const start = setup.inicioMs || agora;
            const bruto = Math.max(0, agora - start);
            tempoLiquidoMs = Math.max(0, bruto - (setup.deductionsMs || 0));
            displayTime = formatarTempo(tempoLiquidoMs);
          }

          // Stop timer calculation
          let tempoParadaAtualMs = 0;
          if (setup.paradaAtiva && setup.paradaAtual) {
            tempoParadaAtualMs = Math.max(0, agora - setup.paradaAtual.inicioMs);
          }
          const stopTimeStr = formatarTempo(tempoParadaAtualMs);

          // Task states
          const c1 = setup.checksStateParte1 || [];
          const c2 = setup.checksStateParte2 || [];
          const cPend = setup.checksStatePendencias || [];

          const p1Feito = c1.filter(Boolean).length;
          const p1Total = tarefas1.length || 1;
          const p2Feito = c2.filter(Boolean).length;
          const p2Total = tarefas2.length || 1;
          const pendFeito = cPend.filter(Boolean).length;
          const pendTotal = tarefasPendencias.length || 1;

          const podeLiberar = p1Feito === p1Total && p2Feito === p2Total && !!setup.prep1Val && !!setup.prep2Val;
          const podeEncerrar = pendFeito === pendTotal;

          const temAlmoco = setup.historico.some((h) => h.includes('Almoço'));

          return (
            <div
              key={id}
              className={`bg-slate-900 rounded-2xl p-6 transition-all duration-300 relative ${
                isLiberada
                  ? 'border-2 border-purple-500 shadow-[0_0_25px_rgba(168,85,247,0.25)]'
                  : 'border border-slate-700 shadow-2xl hover:border-slate-600'
              }`}
            >
              {/* Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5 pb-4 border-b border-slate-800">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-4xl font-black text-white tracking-tight">
                      {setup.maquina}
                    </h3>
                    {isLiberada && (
                      <span className="bg-purple-950 text-purple-300 border border-purple-500 text-[10px] font-black uppercase px-2.5 py-1 rounded-full flex items-center gap-1 tracking-widest shadow-md">
                        <CheckCircle2 className="w-3 h-3 text-purple-400" />
                        MÁQ. LIBERADA
                      </span>
                    )}

                    {/* Auto-save status feedback */}
                    {salvandoAuto[id] ? (
                      <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 animate-spin" />
                        Salvando...
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-emerald-400/80 flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        Salvo
                      </span>
                    )}
                  </div>

                  {/* Previous vs Current Piece */}
                  <div className="flex items-center gap-2 mt-2 text-xs font-bold uppercase tracking-wider">
                    <span className="text-slate-500">Ant:</span>
                    <span className="text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      {setup.modeloAnterior || '-'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
                    <span className="text-slate-500">Atual:</span>
                    <span className="text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 font-black">
                      {setup.peca}
                    </span>
                  </div>
                </div>

                {/* Big Chronometer (Live ticking in real time) */}
                <div className="text-left sm:text-right">
                  <div
                    className={`text-5xl font-black font-mono tracking-tight tabular-nums ${
                      isLiberada
                        ? 'text-purple-400'
                        : setup.paradaAtiva
                        ? 'text-red-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {displayTime}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500 mt-1 flex items-center sm:justify-end gap-1.5">
                    <Calendar className="w-3 h-3 text-slate-600" />
                    <span>Início: {setup.dataInicio}</span>
                  </div>
                </div>
              </div>

              {/* Deduction & Stop Buttons */}
              {!isLiberada && (
                <div className="flex flex-wrap items-center gap-2.5 mb-6 p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <button
                    onClick={() => aoDesconto(id, 'cafe')}
                    className="bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 active:scale-95"
                    title="Descontar 15 minutos do intervalo de café"
                  >
                    <Coffee className="w-3.5 h-3.5 text-yellow-400" />
                    <span>Café (-15m)</span>
                  </button>

                  {!temAlmoco && (
                    <button
                      onClick={() => aoDesconto(id, 'almoco')}
                      className="bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/30 px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 active:scale-95"
                      title="Descontar 1 hora e 30 minutos de almoço"
                    >
                      <Utensils className="w-3.5 h-3.5 text-orange-400" />
                      <span>Almoço (-1.5h)</span>
                    </button>
                  )}

                  {/* PARADA Button with discreet real-time stopwatch right beside it */}
                  <div className="ml-auto flex items-center gap-2">
                    {setup.paradaAtiva && (
                      <div className="px-3 py-1.5 rounded-xl bg-red-950/80 border border-red-500/60 text-red-400 font-mono text-xs font-bold flex items-center gap-1.5 animate-pulse tabular-nums">
                        <Pause className="w-3.5 h-3.5 text-red-400" />
                        <span>PARADO: {stopTimeStr}</span>
                      </div>
                    )}

                    <button
                      onClick={() => handleBotaoParadaClick(setup)}
                      className={`text-white px-4 py-2 rounded-xl text-xs font-black tracking-wider uppercase transition shadow-lg flex items-center gap-1.5 ${
                        setup.paradaAtiva
                          ? 'piscar-alerta'
                          : 'bg-red-600 hover:bg-red-500 shadow-red-600/30'
                      }`}
                      title={setup.paradaAtiva ? 'Clique para encerrar a parada e registrar o motivo' : 'Iniciar parada do setup'}
                    >
                      <AlertTriangle className="w-4 h-4" />
                      <span>{setup.paradaAtiva ? 'ENCERRAR PARADA' : 'PARADA'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Checklists 3-Column Layout */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-sm mb-6">
                {/* PARTE 1 */}
                <div
                  className={`p-4 rounded-xl border transition-all ${
                    isLiberada
                      ? 'bg-slate-950/40 border-slate-800/60 opacity-60'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800">
                    <span className="font-black text-xs uppercase tracking-wider text-slate-300">
                      PARTE 1
                    </span>
                    <span
                      className={`text-[10px] font-bold font-mono ${
                        p1Feito === p1Total ? 'text-emerald-400' : 'text-blue-400'
                      }`}
                    >
                      {p1Feito}/{p1Total}
                    </span>
                  </div>

                  {/* Preparador 1 dropdown */}
                  <div className="mb-4">
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Preparador 1:
                    </label>
                    <select
                      value={setup.prep1Val || ''}
                      disabled={isLiberada}
                      onChange={(e) => handlePrepChange(id, 1, e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-bold focus:outline-none focus:border-blue-500 disabled:opacity-50"
                    >
                      <option value="">Selecione o Preparador 1</option>
                      {preparadores.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Tasks list */}
                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {tarefas1.map((t, idx) => (
                      <label
                        key={idx}
                        className={`flex items-start gap-2.5 p-1.5 rounded-lg hover:bg-slate-900/60 transition cursor-pointer ${
                          isLiberada ? 'cursor-not-allowed opacity-70' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={c1[idx] || false}
                          disabled={isLiberada}
                          onChange={() => handleCheckChange(id, 'p1', idx)}
                          className="mt-0.5 w-4 h-4 rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0 focus:ring-offset-0 disabled:opacity-50"
                        />
                        <span
                          className={`text-xs leading-snug ${
                            c1[idx] ? 'text-slate-400 line-through' : 'text-slate-200 font-semibold'
                          }`}
                        >
                          {t}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* PARTE 2 */}
                <div
                  className={`p-4 rounded-xl border transition-all ${
                    isLiberada
                      ? 'bg-slate-950/40 border-slate-800/60 opacity-60'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800">
                    <span className="font-black text-xs uppercase tracking-wider text-slate-300">
                      PARTE 2
                    </span>
                    <span
                      className={`text-[10px] font-bold font-mono ${
                        p2Feito === p2Total ? 'text-emerald-400' : 'text-blue-400'
                      }`}
                    >
                      {p2Feito}/{p2Total}
                    </span>
                  </div>

                  {/* Preparador 2 dropdown */}
                  <div className="mb-4">
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Preparador 2:
                    </label>
                    <select
                      value={setup.prep2Val || ''}
                      disabled={isLiberada}
                      onChange={(e) => handlePrepChange(id, 2, e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-white font-bold focus:outline-none focus:border-blue-500 disabled:opacity-50"
                    >
                      <option value="">Selecione o Preparador 2</option>
                      {preparadores.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Tasks list */}
                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {tarefas2.map((t, idx) => (
                      <label
                        key={idx}
                        className={`flex items-start gap-2.5 p-1.5 rounded-lg hover:bg-slate-900/60 transition cursor-pointer ${
                          isLiberada ? 'cursor-not-allowed opacity-70' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={c2[idx] || false}
                          disabled={isLiberada}
                          onChange={() => handleCheckChange(id, 'p2', idx)}
                          className="mt-0.5 w-4 h-4 rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0 focus:ring-offset-0 disabled:opacity-50"
                        />
                        <span
                          className={`text-xs leading-snug ${
                            c2[idx] ? 'text-slate-400 line-through' : 'text-slate-200 font-semibold'
                          }`}
                        >
                          {t}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* PENDÊNCIAS */}
                <div className="p-4 rounded-xl bg-slate-950 border border-purple-500/30">
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-purple-500/20">
                    <span className="font-black text-xs uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                      <CheckSquare className="w-3.5 h-3.5 text-purple-400" />
                      PENDÊNCIAS
                    </span>
                    <span
                      className={`text-[10px] font-bold font-mono ${
                        pendFeito === pendTotal ? 'text-emerald-400' : 'text-purple-400'
                      }`}
                    >
                      {pendFeito}/{pendTotal}
                    </span>
                  </div>

                  <p className="text-[10px] text-purple-300/70 mb-3 font-semibold">
                    Tarefas pós-setup (realizadas mesmo após liberar a máquina para usinagem).
                  </p>

                  {/* Tasks list */}
                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {tarefasPendencias.map((t, idx) => (
                      <label
                        key={idx}
                        className="flex items-start gap-2.5 p-1.5 rounded-lg hover:bg-slate-900/60 transition cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={cPend[idx] || false}
                          onChange={() => handleCheckChange(id, 'pend', idx)}
                          className="mt-0.5 w-4 h-4 rounded bg-slate-900 border-purple-700 text-purple-600 focus:ring-0 focus:ring-offset-0"
                        />
                        <span
                          className={`text-xs leading-snug ${
                            cPend[idx] ? 'text-slate-400 line-through' : 'text-purple-200 font-semibold'
                          }`}
                        >
                          {t}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bottom Release Action (Photo 4: Enforces 100% check of Parte 1 & Parte 2) */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-end">
                {isLiberada ? (
                  <button
                    onClick={() => handleEncerrarPendenciasClick(id)}
                    className={`w-full sm:w-auto px-8 py-3.5 rounded-xl font-black text-xs tracking-widest uppercase transition shadow-xl flex items-center justify-center gap-2 ${
                      podeEncerrar
                        ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/30'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>ENCERRAR PENDÊNCIAS ({pendFeito}/{pendTotal})</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleLiberarMaquinaClick(id, tempoLiquidoMs, displayTime)}
                    className={`w-full sm:w-auto px-8 py-3.5 rounded-xl font-black text-xs tracking-widest uppercase transition shadow-xl flex items-center justify-center gap-2 ${
                      podeLiberar
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 cursor-pointer active:scale-95'
                        : 'bg-emerald-950/40 text-emerald-600 border border-emerald-900/50 cursor-pointer hover:bg-emerald-900/40'
                    }`}
                    title={
                      !podeLiberar
                        ? 'Conclua todas as tarefas de Parte 1 e Parte 2 para poder liberar a máquina'
                        : 'Liberar máquina para produção e gravar tempo oficial'
                    }
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>
                      LIBERAR MÁQUINA (Registrar){' '}
                      {!podeLiberar && `(P1: ${p1Feito}/${p1Total} | P2: ${p2Feito}/${p2Total})`}
                    </span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal to force writing reason when closing a stop */}
      {modalFecharParada.aberto && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-red-500/60 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <div className="flex items-center gap-2.5 text-red-400 mb-3">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-black text-white">O que você fez durante a parada?</h3>
            </div>

            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Para encerrar a parada e retomar a contagem do setup, descreva com precisão a causa ou atividade executada (máquina parada atrasa o setup e o líder precisa desta informação).
            </p>

            <form onSubmit={handleConfirmarFechamentoParada} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                  Motivo Obrigatório da Parada:
                </label>
                <textarea
                  value={modalFecharParada.motivo}
                  onChange={(e) =>
                    setModalFecharParada((prev) => ({ ...prev, motivo: e.target.value, erro: false }))
                  }
                  rows={3}
                  placeholder="Ex: Quebra de ferramenta e troca do inserto / Aguardando matéria prima / Manutenção hidráulica..."
                  autoFocus
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-xs focus:border-red-500 focus:outline-none"
                />
                {modalFecharParada.erro && (
                  <p className="text-[11px] text-red-400 font-bold mt-1">
                    É obrigatório informar o motivo antes de retomar o setup!
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setModalFecharParada({ aberto: false, setupId: null, motivo: '', erro: false })
                  }
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl text-xs"
                >
                  Manter Parado
                </button>
                <button
                  type="submit"
                  className="flex-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black py-2.5 rounded-xl text-xs shadow-lg flex items-center justify-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Gravar Motivo & Retomar Setup</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal warning when tasks are incomplete */}
      {alertaIncompleto && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-amber-500/50 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center gap-2.5 text-amber-400 mb-3">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-base font-black text-white">Tarefas Pendentes no Setup</h3>
            </div>

            <div className="text-xs text-slate-300 whitespace-pre-line mb-6 bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono">
              {alertaIncompleto}
            </div>

            <button
              onClick={() => setAlertaIncompleto(null)}
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3 rounded-xl text-xs uppercase"
            >
              Entendido, vou concluir as tarefas
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
