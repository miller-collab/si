import React, { useState, useMemo } from 'react';
import {
  UserCheck,
  Lock,
  Search,
  Printer,
  Trophy,
  AlertOctagon,
  Clock,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  Cog,
  BarChart,
  ArrowRight
} from 'lucide-react';
import type { SetupConcluido } from '../types';
import { parseDataBR, formatarTempo } from '../utils/turno';
import { ModalPdfPronto } from './ModalPdfPronto';
import { baixarRelatorioGestorPdf, extrairDetalhesCompletosSetup, type DadosRelatorioGestor } from '../utils/pdfGestor';

interface AbaPainelGestorProps {
  concluidos: SetupConcluido[];
  preparadores: string[];
  aoImprimirGestor: (
    filtrados: SetupConcluido[],
    colabNome: string,
    periodoTexto: string,
    top3: SetupConcluido[],
    top10Paradas: Array<{ descricao: string; count: number; pct: number }>
  ) => void;
}

export const AbaPainelGestor: React.FC<AbaPainelGestorProps> = ({
  concluidos,
  preparadores,
  aoImprimirGestor
}) => {
  const [autenticado, setAutenticado] = useState(false);
  const [senha, setSenha] = useState('');
  const [erroSenha, setErroSenha] = useState(false);

  // Filters
  const [colaborador, setColaborador] = useState('todos');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [buscaExecutada, setBuscaExecutada] = useState(false);

  // PDF Modal State
  const [modalPdfAberto, setModalPdfAberto] = useState(false);
  const [dadosPdfModal, setDadosPdfModal] = useState<DadosRelatorioGestor | null>(null);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const s = senha.trim();
    if (
      s === '8619' ||
      s === '5211' ||
      s === '1152' ||
      s === '1234' ||
      s === '1' ||
      s.toLowerCase() === 'admin' ||
      s.toLowerCase() === 'gestor'
    ) {
      setAutenticado(true);
      setErroSenha(false);
    } else {
      setErroSenha(true);
    }
  };

  // Quick Date Selectors
  const setQuickPeriod = (tipo: 'hoje' | '7dias' | '30dias' | 'todos') => {
    const hoje = new Date();
    const formatYMD = (d: Date) => d.toISOString().substring(0, 10);

    if (tipo === 'todos') {
      setDataInicio('');
      setDataFim('');
    } else if (tipo === 'hoje') {
      setDataInicio(formatYMD(hoje));
      setDataFim(formatYMD(hoje));
    } else if (tipo === '7dias') {
      const pass = new Date();
      pass.setDate(pass.getDate() - 7);
      setDataInicio(formatYMD(pass));
      setDataFim(formatYMD(hoje));
    } else if (tipo === '30dias') {
      const pass = new Date();
      pass.setDate(pass.getDate() - 30);
      setDataInicio(formatYMD(pass));
      setDataFim(formatYMD(hoje));
    }
  };

  // Filter evaluation
  const filtrados = useMemo(() => {
    let list = concluidos || [];

    if (colaborador !== 'todos') {
      list = list.filter((c) => c.prep1 === colaborador || c.prep2 === colaborador);
    }

    if (dataInicio || dataFim) {
      let msInicio = 0;
      let msFim = Infinity;

      if (dataInicio) {
        const [ano, mes, dia] = dataInicio.split('-');
        msInicio = new Date(+ano, +mes - 1, +dia, 0, 0, 0).getTime();
      }
      if (dataFim) {
        const [ano, mes, dia] = dataFim.split('-');
        msFim = new Date(+ano, +mes - 1, +dia, 23, 59, 59).getTime();
      }

      list = list.filter((c) => {
        const ms = c.timestamp || parseDataBR(c.data);
        return ms >= msInicio && ms <= msFim;
      });
    }

    return list;
  }, [concluidos, colaborador, dataInicio, dataFim]);

  // Deep Analytics calculation
  const analise = useMemo(() => {
    let totalSegundos = 0;
    let minSeg = Infinity;
    let maxSeg = -1;
    let setupMenorTempo: SetupConcluido | null = null;
    let setupMaiorTempo: SetupConcluido | null = null;

    const contagemEventos: Record<string, { descricao: string; count: number }> = {};
    let totalOcorrenciasParadas = 0;

    const listWithSeg = filtrados.map((c) => {
      let seg = 0;
      if (c.tempoMs) {
        seg = Math.floor(c.tempoMs / 1000);
      } else if (c.tempo && c.tempo !== '-') {
        const p = c.tempo.split(':');
        if (p.length === 3) {
          seg = +p[0] * 3600 + +p[1] * 60 + +p[2];
        }
      }

      if (seg > 0) {
        totalSegundos += seg;
        if (seg < minSeg) {
          minSeg = seg;
          setupMenorTempo = c;
        }
        if (seg > maxSeg) {
          maxSeg = seg;
          setupMaiorTempo = c;
        }
      }

      // Parse stoppage reasons for Pareto analysis
      if (c.historico && c.historico.trim() !== '') {
        c.historico.split('|').forEach((ev) => {
          let motivo = ev.replace(/\[.*?\]\s*/, '').trim();
          if (motivo) {
            // Remove prefix like "Parada: "
            if (motivo.toLowerCase().startsWith('parada:')) {
              motivo = motivo.substring(7).trim();
            }
            const key = motivo.toUpperCase();
            if (!contagemEventos[key]) {
              contagemEventos[key] = { descricao: motivo, count: 0 };
            }
            contagemEventos[key].count++;
            totalOcorrenciasParadas++;
          }
        });
      }

      return { ...c, segundosCalculados: seg };
    });

    const mediaSeg = filtrados.length > 0 ? Math.floor(totalSegundos / filtrados.length) : 0;
    const top3Demorados = [...listWithSeg]
      .sort((a, b) => (b.segundosCalculados || 0) - (a.segundosCalculados || 0))
      .slice(0, 3);

    const top10Paradas = Object.values(contagemEventos)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((p) => ({
        ...p,
        pct: totalOcorrenciasParadas > 0 ? +((p.count / totalOcorrenciasParadas) * 100).toFixed(1) : 0
      }));

    const resultado: {
      totalSetups: number;
      mediaTempoStr: string;
      menorTempoStr: string;
      maiorTempoStr: string;
      setupMenorTempo: SetupConcluido | null;
      setupMaiorTempo: SetupConcluido | null;
      top3Demorados: SetupConcluido[];
      top10Paradas: Array<{ descricao: string; count: number; pct: number }>;
    } = {
      totalSetups: filtrados.length,
      mediaTempoStr: formatarTempo(mediaSeg * 1000),
      menorTempoStr: minSeg === Infinity ? '00:00:00' : formatarTempo(minSeg * 1000),
      maiorTempoStr: maxSeg === -1 ? '00:00:00' : formatarTempo(maxSeg * 1000),
      setupMenorTempo,
      setupMaiorTempo,
      top3Demorados,
      top10Paradas
    };
    return resultado;
  }, [filtrados]);

  const handleImprimir = () => {
    let periodoTexto = 'Todo o Histórico';
    if (dataInicio && dataFim) {
      periodoTexto = `${dataInicio.split('-').reverse().join('/')} até ${dataFim.split('-').reverse().join('/')}`;
    } else if (dataInicio) {
      periodoTexto = `A partir de ${dataInicio.split('-').reverse().join('/')}`;
    } else if (dataFim) {
      periodoTexto = `Até ${dataFim.split('-').reverse().join('/')}`;
    }

    if (filtrados.length === 0) {
      alert('Não há registros para o período selecionado.');
      return;
    }

    const colabNome = colaborador === 'todos' ? 'Todos os Colaboradores' : colaborador;

    const dadosRelatorio: DadosRelatorioGestor = {
      filtrados,
      colabNome,
      periodoTexto,
      top3: analise.top3Demorados,
      top10Paradas: analise.top10Paradas,
      kpiTotal: analise.totalSetups,
      kpiMedia: analise.mediaTempoStr,
      menorTempoStr: analise.menorTempoStr,
      maiorTempoStr: analise.maiorTempoStr,
      setupMenorTempo: analise.setupMenorTempo,
      setupMaiorTempo: analise.setupMaiorTempo
    };

    // 1. Immediately triggers native browser "Salvar Como" / download of clean B&W PDF
    baixarRelatorioGestorPdf(dadosRelatorio);

    // 2. Opens friendly confirmation modal for re-download or direct print tab
    setDadosPdfModal(dadosRelatorio);
    setModalPdfAberto(true);
  };

  // Locked Gate
  if (!autenticado) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center">
        <div className="bg-slate-900 border border-amber-500/40 rounded-2xl w-full max-w-md p-8 shadow-2xl text-center relative overflow-hidden">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto mb-4">
            <Lock className="w-8 h-8" />
          </div>

          <h3 className="text-2xl font-black text-white mb-1">Acesso Restrito ao Gestor</h3>
          <p className="text-xs text-slate-400 mb-6">
            Digite a senha gerencial para auditar produtividade, recordes, gargalos operacionais e emitir relatórios de melhoria contínua.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Digite a senha do gestor..."
              autoFocus
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3.5 text-center text-white text-lg font-mono tracking-widest focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />

            {erroSenha && (
              <p className="text-xs font-bold text-red-400 animate-shake">
                Senha incorreta! Acesso restrito.
              </p>
            )}

            <button
              type="submit"
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3.5 px-4 rounded-xl shadow-lg shadow-amber-500/30 transition text-sm uppercase tracking-wider"
            >
              Acessar Painel Gerencial
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto">
      {/* Top Banner */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-3xl font-black text-amber-400 tracking-tight flex items-center gap-3">
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <UserCheck className="w-6 h-6 text-amber-400" />
            </span>
            Painel do Gestor & Performance
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Auditoria de tempos por preparador, análise de causas de paradas e gargalos para reuniões de melhoria.
          </p>
        </div>

        {/* Quick Period Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setQuickPeriod('hoje')}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            Hoje
          </button>
          <button
            onClick={() => setQuickPeriod('7dias')}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            7 Dias
          </button>
          <button
            onClick={() => setQuickPeriod('30dias')}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            30 Dias
          </button>
          <button
            onClick={() => setQuickPeriod('todos')}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            Todos
          </button>
        </div>
      </div>

      {/* Filter Card */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-xl mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          {/* Collaborator */}
          <div>
            <label className="block text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
              Selecione o Colaborador:
            </label>
            <select
              value={colaborador}
              onChange={(e) => setColaborador(e.target.value)}
              className="w-full bg-slate-950 text-white border border-slate-700 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-amber-500"
            >
              <option value="todos">Todos os Colaboradores</option>
              {preparadores.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Date Start */}
          <div>
            <label className="block text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
              Data Inicial:
            </label>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              style={{ colorScheme: 'dark' }}
              className="w-full bg-slate-950 text-white border border-slate-700 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Date End */}
          <div>
            <label className="block text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">
              Data Final:
            </label>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              style={{ colorScheme: 'dark' }}
              className="w-full bg-slate-950 text-white border border-slate-700 rounded-xl p-3 text-xs font-bold focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => setBuscaExecutada(true)}
              className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3 px-4 rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-1.5 text-xs uppercase"
            >
              <Search className="w-4 h-4" />
              <span>BUSCAR</span>
            </button>

            <button
              onClick={handleImprimir}
              className="bg-slate-200 hover:bg-white text-slate-950 font-black py-3 px-4 rounded-xl shadow transition flex items-center justify-center gap-1.5 text-xs uppercase"
              title="Gerar PDF de Reunião para Impressão A4"
            >
              <Printer className="w-4 h-4" />
              <span>GERAR PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        {/* Total Setups */}
        <div className="bg-slate-900 border-t-4 border-blue-500 border-x border-b border-slate-800 p-5 rounded-2xl shadow-xl">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
            Total de Setups Feitos
          </span>
          <div className="text-3xl font-black text-white font-mono tracking-tight">
            {analise.totalSetups}
          </div>
        </div>

        {/* Average Time */}
        <div className="bg-slate-900 border-t-4 border-emerald-500 border-x border-b border-slate-800 p-5 rounded-2xl shadow-xl">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
            Média de Tempo
          </span>
          <div className="text-3xl font-black text-emerald-400 font-mono tracking-tight">
            {analise.mediaTempoStr}
          </div>
        </div>

        {/* Record (Shortest) */}
        <div className="bg-slate-900 border-t-4 border-purple-500 border-x border-b border-slate-800 p-5 rounded-2xl shadow-xl flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1 flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5 text-purple-400" />
              Menor Tempo (Recorde)
            </span>
            <div className="text-3xl font-black text-purple-400 font-mono tracking-tight">
              {analise.menorTempoStr}
            </div>
          </div>
          {analise.setupMenorTempo && (
            <div className="text-[10px] text-slate-400 mt-2 border-t border-slate-800 pt-1.5 leading-snug">
              <span>{analise.setupMenorTempo.data}</span> • Máq:{' '}
              <strong className="text-slate-200">{analise.setupMenorTempo.maquina}</strong>
              <br />
              Peça: <strong className="text-blue-300">{analise.setupMenorTempo.peca}</strong>
            </div>
          )}
        </div>

        {/* Bottleneck (Longest) */}
        <div className="bg-slate-900 border-t-4 border-red-500 border-x border-b border-slate-800 p-5 rounded-2xl shadow-xl flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1 flex items-center gap-1">
              <AlertOctagon className="w-3.5 h-3.5 text-red-400" />
              Maior Tempo (Gargalo)
            </span>
            <div className="text-3xl font-black text-red-400 font-mono tracking-tight">
              {analise.maiorTempoStr}
            </div>
          </div>
          {analise.setupMaiorTempo && (
            <div className="text-[10px] text-slate-400 mt-2 border-t border-slate-800 pt-1.5 leading-snug">
              <span>{analise.setupMaiorTempo.data}</span> • Máq:{' '}
              <strong className="text-slate-200">{analise.setupMaiorTempo.maquina}</strong>
              <br />
              Peça: <strong className="text-blue-300">{analise.setupMaiorTempo.peca}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Main Analysis Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Modelos Trabalhados */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-col h-full">
          <h3 className="text-base font-black text-blue-400 mb-3 flex items-center gap-2">
            <Cog className="w-5 h-5 text-blue-500" />
            <span>Modelos Trabalhados (Detalhado)</span>
          </h3>

          <div className="bg-slate-950 rounded-xl p-3 flex-1 overflow-y-auto max-h-80 border border-slate-800/80 space-y-2">
            {filtrados.length === 0 ? (
              <p className="text-slate-500 text-xs italic text-center py-6">
                Nenhum modelo trabalhado no filtro selecionado.
              </p>
            ) : (
              filtrados.map((c, i) => (
                <div
                  key={i}
                  className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/60 flex flex-col gap-1 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-blue-300 text-sm">{c.peca}</span>
                    <span className="font-mono text-emerald-400 font-bold bg-emerald-950/40 border border-emerald-800/50 px-2 py-0.5 rounded text-[11px]">
                      {c.tempo}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-400 text-[11px] mt-0.5">
                    <span>
                      Data: <strong className="text-slate-200">{c.data}</strong>
                    </span>
                    <span>
                      Máq: <strong className="text-white">{c.maquina}</strong>
                    </span>
                    <span>
                      Ant: <strong className="text-amber-400">{c.modeloAnterior || '-'}</strong>
                    </span>
                    <span>
                      Preps:{' '}
                      <strong className="text-slate-200">
                        {c.prep1} / {c.prep2}
                      </strong>
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top 3 Gargalos */}
        <div className="bg-slate-900 border border-red-900/40 p-6 rounded-2xl shadow-xl flex flex-col h-full">
          <div className="mb-3">
            <h3 className="text-base font-black text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <span>Análise dos Maiores Tempos (Top 3 Gargalos)</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Justificativas e paradas registradas nos 3 setups mais demorados do período.
            </p>
          </div>

          <div className="bg-slate-950 rounded-xl p-3 flex-1 overflow-y-auto max-h-80 border border-red-900/30 space-y-3">
            {analise.top3Demorados.length === 0 ? (
              <p className="text-slate-500 text-xs italic text-center py-6">
                Sem registros para análise de gargalos.
              </p>
            ) : (
              analise.top3Demorados.map((c, idx) => {
                const detalhes = extrairDetalhesCompletosSetup(c);
                const paradasFiltradas = detalhes.linhasEventos.filter(
                  (l) => !l.includes('INÍCIO DO SETUP') && !l.includes('FIM DO SETUP')
                );

                return (
                  <div
                    key={idx}
                    className="p-3.5 rounded-lg bg-red-950/20 border border-red-900/50 text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-red-900/30">
                      <span className="font-black text-red-400 uppercase tracking-wider text-[11px]">
                        #{idx + 1} Gargalo • {c.maquina}
                      </span>
                      <span className="font-mono text-emerald-400 font-bold">{c.tempo}</span>
                    </div>

                    {/* Detalhamento de Início e Fim do Setup */}
                    <div className="bg-slate-900/90 p-2.5 rounded-lg border border-red-900/30 space-y-1 text-[11px]">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-slate-300 gap-1 pb-1 border-b border-slate-800">
                        <span>
                          Início: <strong className="text-white">{detalhes.inicioSetupStr}</strong>
                        </span>
                        <span>
                          Fim: <strong className="text-white">{detalhes.fimSetupStr}</strong>
                        </span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between text-slate-300 gap-1 pt-0.5">
                        <span>
                          Peça: <strong className="text-blue-300">{c.peca}</strong>
                        </span>
                        <span>
                          Mod. Ant: <strong className="text-amber-400">{c.modeloAnterior || '-'}</strong>
                        </span>
                      </div>
                      <div className="text-slate-400 text-[10px] pt-0.5">
                        Preparadores: <strong className="text-slate-200">{c.prep1} / {c.prep2}</strong>
                      </div>
                    </div>

                    {/* Stoppage causes list with detailed start, end, and duration */}
                    <div className="mt-2 pt-2 border-t border-red-900/30 space-y-1">
                      <span className="text-[10px] font-bold uppercase text-red-300/80 block">
                        Paradas & Intervalos (Início, Fim & Duração):
                      </span>
                      {paradasFiltradas.length > 0 ? (
                        paradasFiltradas.map((ev, i) => (
                          <div
                            key={i}
                            className="pl-2 border-l-2 border-red-500/80 text-slate-200 text-[11px] font-mono leading-tight py-0.5"
                          >
                            {ev.replace(/^•\s*/, '')}
                          </div>
                        ))
                      ) : (
                        <span className="text-slate-500 italic text-[10px]">
                          Nenhuma parada detalhada gravada.
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Top 10 Stop Causes (Pareto Analysis) */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <BarChart className="w-5 h-5 text-amber-400" />
              <span>Top 10 Motivos de Paradas / Eventos (Frequência & Impacto)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Identificação das causas raízes de atraso para reuniões diárias e planos de ação.
            </p>
          </div>
        </div>

        {analise.top10Paradas.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs italic">
            Nenhuma ocorrência de parada registrada no período.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <th className="p-3 w-16 text-center">Posição</th>
                  <th className="p-3 w-28 text-center">Frequência</th>
                  <th className="p-3">Descrição do Evento / Motivo da Parada</th>
                  <th className="p-3 w-40 text-right">% do Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {analise.top10Paradas.map((p, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/40 transition">
                    <td className="p-3 text-center font-bold text-slate-400 font-mono">
                      #{idx + 1}
                    </td>
                    <td className="p-3 text-center">
                      <span className="bg-red-950 text-red-400 border border-red-800 font-mono font-bold px-2 py-0.5 rounded text-[11px]">
                        {p.count}x
                      </span>
                    </td>
                    <td className="p-3 text-slate-200 font-semibold">{p.descricao}</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-20 bg-slate-800 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-amber-400 h-full rounded-full"
                            style={{ width: `${Math.min(100, p.pct)}%` }}
                          />
                        </div>
                        <span className="font-mono text-slate-300 font-bold text-[11px]">
                          {p.pct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PDF Ready / Save As Confirmation Modal */}
      <ModalPdfPronto
        aberto={modalPdfAberto}
        dados={dadosPdfModal}
        aoFechar={() => setModalPdfAberto(false)}
      />
    </div>
  );
};
