import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  Filter,
  Printer,
  Download,
  List,
  Search,
  CheckCircle2,
  Calendar,
  History
} from 'lucide-react';
import type { SetupConcluido } from '../types';
import { parseDataBR, formatarTempo } from '../utils/turno';

interface AbaRelatoriosProps {
  concluidos: SetupConcluido[];
  aoAbrirHistorico: (historico: string, titulo: string) => void;
  aoImprimir: (filtrados: SetupConcluido[], filtroMaquina: string, filtroPeriodo: string) => void;
}

export const AbaRelatorios: React.FC<AbaRelatoriosProps> = ({
  concluidos,
  aoAbrirHistorico,
  aoImprimir
}) => {
  const [filtroMaquina, setFiltroMaquina] = useState('todas');
  const [filtroPeriodo, setFiltroPeriodo] = useState('todos');
  const [termoBusca, setTermoBusca] = useState('');

  // Extract unique machines from completed setups
  const maquinasUnicas = useMemo(() => {
    const set = new Set<string>();
    concluidos.forEach((c) => {
      if (c.maquina && c.maquina !== '-') set.add(c.maquina);
    });
    return Array.from(set).sort();
  }, [concluidos]);

  // Filtered dataset
  const filtrados = useMemo(() => {
    let list = concluidos || [];

    if (filtroMaquina !== 'todas') {
      list = list.filter((c) => c.maquina === filtroMaquina);
    }

    if (filtroPeriodo !== 'todos') {
      if (filtroPeriodo === 'semana') {
        const agora = Date.now();
        const limiteMs = 7 * 24 * 3600 * 1000;
        list = list.filter((c) => {
          const ms = c.timestamp || parseDataBR(c.data);
          return ms > 0 && agora - ms <= limiteMs;
        });
      } else {
        const mesInt = parseInt(filtroPeriodo, 10);
        list = list.filter((c) => {
          if (!c.data || c.data === '-') return false;
          const partes = c.data.split('/');
          return partes.length > 1 && parseInt(partes[1], 10) === mesInt;
        });
      }
    }

    if (termoBusca.trim()) {
      const q = termoBusca.toLowerCase();
      list = list.filter(
        (c) =>
          c.maquina.toLowerCase().includes(q) ||
          c.peca.toLowerCase().includes(q) ||
          (c.modeloAnterior || '').toLowerCase().includes(q) ||
          c.prep1.toLowerCase().includes(q) ||
          c.prep2.toLowerCase().includes(q)
      );
    }

    return list;
  }, [concluidos, filtroMaquina, filtroPeriodo, termoBusca]);

  // KPIs
  const { totalSetups, mediaTempoStr, chartData } = useMemo(() => {
    let totalSegundos = 0;
    let validCount = 0;
    const points: Array<{ label: string; minutos: number; tempoStr: string; maquina: string }> = [];

    filtrados.forEach((c) => {
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
        validCount++;
        const minutos = +(seg / 60).toFixed(1);
        const diaMes = c.data ? c.data.substring(0, 5) : '';
        points.push({
          label: `${c.maquina} (${diaMes})`,
          minutos,
          tempoStr: c.tempo,
          maquina: c.maquina
        });
      }
    });

    const mediaSeg = validCount > 0 ? Math.floor(totalSegundos / validCount) : 0;
    return {
      totalSetups: filtrados.length,
      mediaTempoStr: formatarTempo(mediaSeg * 1000),
      chartData: points.slice(0, 40).reverse() // Show chronological points
    };
  }, [filtrados]);

  // Export CSV
  const exportarCSV = () => {
    if (filtrados.length === 0) return;
    const cabecalho = ['Data', 'Maquina', 'Prep1', 'Prep2', 'Modelo_Anterior', 'Peca_Atual', 'Tempo', 'Historico'];
    const linhas = filtrados.map((c) => [
      `"${c.data}"`,
      `"${c.maquina}"`,
      `"${c.prep1}"`,
      `"${c.prep2}"`,
      `"${c.modeloAnterior || '-'}"`,
      `"${c.peca}"`,
      `"${c.tempo}"`,
      `"${(c.historico || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [cabecalho.join(';'), ...linhas.map((l) => l.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `setups_cnc_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const maxMinutos = Math.max(...chartData.map((d) => d.minutos), 60);

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto">
      {/* Top Bar with Filters */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/30">
              <BarChart3 className="w-6 h-6 text-blue-500" />
            </span>
            Dashboard de Setups & Relatórios
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Análise histórica de tempos de setup, máquinas usinadas e paradas operacionais.
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Machine Filter */}
          <select
            value={filtroMaquina}
            onChange={(e) => setFiltroMaquina(e.target.value)}
            className="bg-slate-900 text-blue-400 border border-blue-500/40 rounded-xl px-3 py-2.5 text-xs font-bold uppercase focus:outline-none focus:border-blue-500 cursor-pointer shadow-lg shadow-blue-500/10"
          >
            <option value="todas">Todas as Máquinas</option>
            {maquinasUnicas.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          {/* Period Filter */}
          <select
            value={filtroPeriodo}
            onChange={(e) => setFiltroPeriodo(e.target.value)}
            className="bg-slate-900 text-blue-400 border border-blue-500/40 rounded-xl px-3 py-2.5 text-xs font-bold uppercase focus:outline-none focus:border-blue-500 cursor-pointer shadow-lg shadow-blue-500/10"
          >
            <option value="todos">Todos os Registros</option>
            <option value="semana">Últimos 7 Dias (Semanal)</option>
            <optgroup label="Filtrar por Mês">
              <option value="1">Janeiro</option>
              <option value="2">Fevereiro</option>
              <option value="3">Março</option>
              <option value="4">Abril</option>
              <option value="5">Maio</option>
              <option value="6">Junho</option>
              <option value="7">Julho</option>
              <option value="8">Agosto</option>
              <option value="9">Setembro</option>
              <option value="10">Outubro</option>
              <option value="11">Novembro</option>
              <option value="12">Dezembro</option>
            </optgroup>
          </select>

          {/* PDF Button */}
          <button
            onClick={() => aoImprimir(filtrados, filtroMaquina, filtroPeriodo)}
            className="bg-slate-200 hover:bg-white text-slate-950 font-black text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md"
            title="Gerar PDF para impressão em A4"
          >
            <Printer className="w-3.5 h-3.5 text-slate-950" />
            <span>PDF</span>
          </button>

          {/* CSV Button */}
          <button
            onClick={exportarCSV}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs px-4 py-2.5 rounded-xl border border-slate-700 transition flex items-center gap-1.5"
            title="Exportar planilha CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-6">
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex items-center justify-between shadow-xl">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Total de Setups Concluídos
            </span>
            <div className="text-4xl font-black text-blue-500 font-mono tracking-tight">
              {totalSetups}
            </div>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <CheckCircle2 className="w-7 h-7" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex items-center justify-between shadow-xl">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Tempo Médio de Preparação
            </span>
            <div className="text-4xl font-black text-emerald-400 font-mono tracking-tight">
              {mediaTempoStr}
            </div>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Calendar className="w-7 h-7" />
          </div>
        </div>
      </div>

      {/* Chart Section */}
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-500" />
            Tempo de Preparação por Setup (Minutos)
          </h3>
          <span className="text-xs text-slate-500 font-mono">
            {chartData.length} registros no gráfico
          </span>
        </div>

        {chartData.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs italic">
            Sem dados para exibição do gráfico neste filtro.
          </div>
        ) : (
          <div className="h-56 flex items-end gap-1.5 pt-6 pb-2 px-2 overflow-x-auto">
            {chartData.map((d, idx) => {
              const alturaPct = Math.max(10, Math.min(100, (d.minutos / maxMinutos) * 100));
              return (
                <div
                  key={idx}
                  className="flex-1 min-w-[28px] max-w-[48px] h-full flex flex-col justify-end items-center group relative cursor-pointer"
                >
                  {/* Tooltip on hover */}
                  <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 bg-slate-950 text-white text-[10px] font-mono px-2 py-1 rounded shadow-lg border border-slate-700 whitespace-nowrap">
                    {d.label}: {d.tempoStr} ({d.minutos}m)
                  </div>

                  <div
                    style={{ height: `${alturaPct}%` }}
                    className="w-full bg-blue-600/80 group-hover:bg-blue-500 rounded-t-md transition-all duration-300 relative"
                  />
                  <span className="text-[9px] text-slate-500 mt-2 truncate w-full text-center font-mono">
                    {d.maquina}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detailed Historical Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <List className="w-4 h-4 text-blue-500" />
            Histórico Detalhado ({filtrados.length})
          </h3>

          {/* Table search filter */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={termoBusca}
              onChange={(e) => setTermoBusca(e.target.value)}
              placeholder="Buscar em registros..."
              className="bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-44 sm:w-56"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950/80 text-slate-400 uppercase font-black tracking-wider text-[10px] border-b border-slate-800">
                <th className="p-3.5">Data</th>
                <th className="p-3.5">Máquina</th>
                <th className="p-3.5">Prep 1</th>
                <th className="p-3.5">Prep 2</th>
                <th className="p-3.5 text-center">Ações</th>
                <th className="p-3.5 text-amber-400">Mod. Anterior</th>
                <th className="p-3.5 text-blue-400">Peça (Atual)</th>
                <th className="p-3.5 text-right">Tempo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 font-medium">
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500 italic">
                    Nenhum registro encontrado para este filtro.
                  </td>
                </tr>
              ) : (
                filtrados.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/50 transition">
                    <td className="p-3.5 text-slate-400 whitespace-nowrap font-mono">{c.data}</td>
                    <td className="p-3.5 font-black text-white">{c.maquina}</td>
                    <td className="p-3.5 text-slate-300 font-semibold">{c.prep1}</td>
                    <td className="p-3.5 text-slate-300 font-semibold">{c.prep2}</td>
                    <td className="p-3.5 text-center">
                      <button
                        onClick={() =>
                          aoAbrirHistorico(
                            c.historico,
                            `Histórico - Máq: ${c.maquina} (${c.data})`
                          )
                        }
                        className="bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition flex items-center gap-1 mx-auto shadow"
                      >
                        <History className="w-3 h-3 text-blue-400 group-hover:text-white" />
                        <span>Histórico</span>
                      </button>
                    </td>
                    <td className="p-3.5 text-amber-400 font-bold">{c.modeloAnterior || '-'}</td>
                    <td className="p-3.5 text-blue-300 font-bold">{c.peca}</td>
                    <td className="p-3.5 font-mono text-emerald-400 font-bold text-sm text-right">
                      {c.tempo}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
