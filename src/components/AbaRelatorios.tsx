import React, { useState, useMemo, useRef } from 'react';
import {
  BarChart3,
  Filter,
  Printer,
  Download,
  List,
  Search,
  CheckCircle2,
  Calendar,
  History,
  Upload,
  Database,
  Trash2,
  AlertTriangle,
  X,
  FileCheck,
  Lock,
  KeyRound,
  FileSpreadsheet,
  Eye
} from 'lucide-react';
import type { SetupConcluido, StoreData } from '../types';
import { parseDataBR, formatarTempo } from '../utils/turno';
import { ModalVisualizarRelatorio } from './ModalVisualizarRelatorio';
import type { DadosRelatorioGestor } from '../utils/pdfGestor';

interface AbaRelatoriosProps {
  concluidos: SetupConcluido[];
  aoAbrirHistorico: (historico: string, titulo: string) => void;
  aoImprimir: (filtrados: SetupConcluido[], filtroMaquina: string, filtroPeriodo: string) => void;
  aoCarregarDados?: (backup: any) => Promise<void>;
  aoEsvaziarConcluidos?: () => Promise<void>;
  dadosCompletos?: StoreData | null;
}

export const AbaRelatorios: React.FC<AbaRelatoriosProps> = ({
  concluidos,
  aoAbrirHistorico,
  aoImprimir,
  aoCarregarDados,
  aoEsvaziarConcluidos,
  dadosCompletos
}) => {
  const [filtroMaquina, setFiltroMaquina] = useState('todas');
  const [filtroPeriodo, setFiltroPeriodo] = useState('todos');
  const [termoBusca, setTermoBusca] = useState('');

  // Password Protection for Gestor Actions (Backup, Carregar Dados, Esvaziar)
  const [modalSenhaAberto, setModalSenhaAberto] = useState(false);
  const [acaoPendente, setAcaoPendente] = useState<'backup' | 'carregar' | 'esvaziar' | null>(null);
  const [senhaInput, setSenhaInput] = useState('');
  const [erroSenha, setErroSenha] = useState(false);

  // Modals for Loading and Emptying Data (Foto 1)
  const [modalEsvaziarAberto, setModalEsvaziarAberto] = useState(false);
  const [modalCarregarAberto, setModalCarregarAberto] = useState(false);
  const [modalVisualizarAberto, setModalVisualizarAberto] = useState(false);
  const [backupParaCarregar, setBackupParaCarregar] = useState<any>(null);
  const [processandoAcao, setProcessandoAcao] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Foto 1 Data Structure for Preview & PDF (Visualizar Antes de Salvar)
  const dadosVisualizar: DadosRelatorioGestor = useMemo(() => {
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

      if (c.historico && c.historico.trim() !== '') {
        c.historico.split('|').forEach((ev) => {
          let motivo = ev.replace(/\[.*?\]\s*/, '').trim();
          if (motivo) {
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

    let periodoTexto = 'Todos os Registros';
    if (filtroPeriodo === 'semana') periodoTexto = 'Últimos 7 Dias';
    else if (filtroPeriodo !== 'todos') periodoTexto = `Mês ${filtroPeriodo}`;

    const colabNome = filtroMaquina === 'todas' ? 'Todas as Máquinas' : `Máquina: ${filtroMaquina}`;

    return {
      filtrados,
      colabNome,
      periodoTexto,
      top3: top3Demorados,
      top10Paradas,
      kpiTotal: filtrados.length,
      kpiMedia: formatarTempo(mediaSeg * 1000),
      menorTempoStr: minSeg === Infinity ? '00:00:00' : formatarTempo(minSeg * 1000),
      maiorTempoStr: maxSeg === -1 ? '00:00:00' : formatarTempo(maxSeg * 1000),
      setupMenorTempo,
      setupMaiorTempo
    };
  }, [filtrados, filtroMaquina, filtroPeriodo]);

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

  // Full JSON Backup Export
  const exportarBackupJSON = () => {
    const backupObj = dadosCompletos || {
      concluidos,
      exportadoEm: new Date().toISOString()
    };
    const jsonStr = JSON.stringify(backupObj, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_completo_cnc_${new Date().toISOString().substring(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // File picker handler for "Carregar Dados"
  const handleArquivoSelecionado = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        setBackupParaCarregar(parsed);
        setModalCarregarAberto(true);
      } catch (err) {
        alert('O arquivo selecionado não é um arquivo JSON de backup válido.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirmarCarregarDados = async () => {
    if (!backupParaCarregar || !aoCarregarDados) return;
    setProcessandoAcao(true);
    try {
      await aoCarregarDados(backupParaCarregar);
      setModalCarregarAberto(false);
      setBackupParaCarregar(null);
    } finally {
      setProcessandoAcao(false);
    }
  };

  const handleConfirmarEsvaziar = async () => {
    if (!aoEsvaziarConcluidos) return;
    setProcessandoAcao(true);
    try {
      await aoEsvaziarConcluidos();
      setModalEsvaziarAberto(false);
    } finally {
      setProcessandoAcao(false);
    }
  };

  // Gestor Password Verification Handler
  const solicitarSenhaGestor = (acao: 'backup' | 'carregar' | 'esvaziar') => {
    setAcaoPendente(acao);
    setSenhaInput('');
    setErroSenha(false);
    setModalSenhaAberto(true);
  };

  const handleValidarSenhaGestor = (e: React.FormEvent) => {
    e.preventDefault();
    if (senhaInput.trim() === '8619' || senhaInput.trim() === '5211') {
      const acao = acaoPendente;
      setModalSenhaAberto(false);
      setSenhaInput('');
      setErroSenha(false);
      setAcaoPendente(null);

      if (acao === 'backup') {
        exportarBackupJSON();
      } else if (acao === 'carregar') {
        fileInputRef.current?.click();
      } else if (acao === 'esvaziar') {
        setModalEsvaziarAberto(true);
      }
    } else {
      setErroSenha(true);
    }
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

          {/* Visualizar Antes de Salvar Button (Foto 1) */}
          <button
            type="button"
            onClick={() => setModalVisualizarAberto(true)}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95 cursor-pointer"
            title="Visualizar a folha de relatório completa antes de salvar ou imprimir (Foto 1)"
          >
            <Eye className="w-4 h-4 text-slate-950" />
            <span>Visualizar Antes de Salvar</span>
          </button>

          {/* PDF Button (Foto 1) */}
          <button
            type="button"
            onClick={() => setModalVisualizarAberto(true)}
            className="bg-slate-200 hover:bg-white text-slate-950 font-black text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md active:scale-95 cursor-pointer"
            title="Visualizar e salvar relatório em folha A4 (Padrão Oficial Foto 1)"
          >
            <Printer className="w-3.5 h-3.5 text-slate-950" />
            <span>PDF (Foto 1)</span>
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



          {/* Backup JSON Button (Protegido por Senha do Gestor) */}
          <button
            onClick={() => solicitarSenhaGestor('backup')}
            className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 font-bold text-xs px-3.5 py-2.5 rounded-xl border border-blue-500/40 transition flex items-center gap-1.5 active:scale-95 shadow-sm"
            title="Ação do Gestor: Baixar cópia de segurança de todos os registros em JSON"
          >
            <Lock className="w-3 h-3 text-amber-400" />
            <Database className="w-3.5 h-3.5 text-blue-400" />
            <span>Backup</span>
          </button>

          {/* Carregar Dados Button (Protegido por Senha do Gestor) */}
          <button
            onClick={() => solicitarSenhaGestor('carregar')}
            className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 font-bold text-xs px-3.5 py-2.5 rounded-xl border border-emerald-500/40 transition flex items-center gap-1.5 active:scale-95 shadow-sm"
            title="Ação do Gestor: Carregar ou restaurar arquivo de backup com dados anteriores (JSON)"
          >
            <Lock className="w-3 h-3 text-amber-400" />
            <Upload className="w-3.5 h-3.5 text-emerald-400" />
            <span>Carregar Dados</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleArquivoSelecionado}
            accept=".json,application/json"
            className="hidden"
          />

          {/* Esvaziar Registros Button (Protegido por Senha do Gestor) */}
          <button
            onClick={() => solicitarSenhaGestor('esvaziar')}
            className="bg-red-600/15 hover:bg-red-600/25 text-red-400 font-bold text-xs px-3.5 py-2.5 rounded-xl border border-red-500/30 transition flex items-center gap-1.5 active:scale-95 shadow-sm"
            title="Ação do Gestor: Esvaziar histórico para começar do zero"
          >
            <Lock className="w-3 h-3 text-amber-400" />
            <Trash2 className="w-3.5 h-3.5 text-red-400" />
            <span>Esvaziar</span>
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

      {/* Modal Esvaziar Registros (Foto 1) */}
      {modalEsvaziarAberto && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-red-500/50 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5 text-red-400">
                <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/30">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <h3 className="text-base font-black text-white">Esvaziar Registros Concluídos</h3>
              </div>
              <button
                onClick={() => setModalEsvaziarAberto(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 mb-3 leading-relaxed">
              Deseja realmente esvaziar todos os registros concluídos para <strong>começar do zero</strong>?
            </p>
            <p className="text-[11px] text-slate-400 mb-5 leading-relaxed bg-slate-950 p-3 rounded-xl border border-slate-800">
              💡 <strong>Dica de Segurança:</strong> Recomendamos baixar um <strong>Backup em JSON</strong> ou exportar a planilha <strong>CSV</strong> antes de esvaziar para guardar todo o histórico anterior com segurança.
            </p>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={exportarBackupJSON}
                className="w-full bg-slate-800 hover:bg-slate-700 text-blue-300 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-700 transition"
              >
                <Database className="w-4 h-4 text-blue-400" />
                <span>Baixar Backup Completo (JSON) Antes</span>
              </button>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalEsvaziarAberto(false)}
                  disabled={processandoAcao}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl text-xs transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmarEsvaziar}
                  disabled={processandoAcao}
                  className="flex-1 bg-red-600 hover:bg-red-500 text-white font-black py-2.5 rounded-xl text-xs shadow-lg shadow-red-600/30 transition flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{processandoAcao ? 'Esvaziando...' : 'Sim, Esvaziar Tudo'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Carregar Dados (Foto 1) */}
      {modalCarregarAberto && backupParaCarregar && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-emerald-500/50 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5 text-emerald-400">
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                  <Upload className="w-5 h-5 text-emerald-400" />
                </div>
                <h3 className="text-base font-black text-white">Carregar Dados de Backup</h3>
              </div>
              <button
                onClick={() => {
                  setModalCarregarAberto(false);
                  setBackupParaCarregar(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 mb-3 leading-relaxed">
              O arquivo de backup foi lido com sucesso. Confira o conteúdo a ser restaurado:
            </p>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 mb-5 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-slate-300">
                <span>Setups Concluídos no Arquivo:</span>
                <span className="font-bold text-emerald-400 font-mono">
                  {Array.isArray(backupParaCarregar.concluidos) ? backupParaCarregar.concluidos.length : 0}
                </span>
              </div>
              {Array.isArray(backupParaCarregar.maquinas) && (
                <div className="flex items-center justify-between text-slate-300">
                  <span>Máquinas na Fila:</span>
                  <span className="font-bold text-blue-400 font-mono">
                    {backupParaCarregar.maquinas.length}
                  </span>
                </div>
              )}
              {Array.isArray(backupParaCarregar.preparadores) && (
                <div className="flex items-center justify-between text-slate-300">
                  <span>Preparadores Cadastrados:</span>
                  <span className="font-bold text-amber-400 font-mono">
                    {backupParaCarregar.preparadores.length}
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setModalCarregarAberto(false);
                  setBackupParaCarregar(null);
                }}
                disabled={processandoAcao}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl text-xs transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarCarregarDados}
                disabled={processandoAcao}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black py-2.5 rounded-xl text-xs shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-1.5"
              >
                <FileCheck className="w-4 h-4" />
                <span>{processandoAcao ? 'Carregando...' : 'Confirmar e Carregar'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Senha do Gestor para Backup / Carregar Dados / Esvaziar */}
      {modalSenhaAberto && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-amber-500/50 rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5 text-amber-400">
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <Lock className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">Acesso do Gestor</h3>
                  <span className="text-[10px] text-amber-400/90 font-bold uppercase tracking-wider block">
                    {acaoPendente === 'backup' && 'Download de Backup'}
                    {acaoPendente === 'carregar' && 'Restauração de Dados'}
                    {acaoPendente === 'esvaziar' && 'Esvaziar Histórico'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalSenhaAberto(false);
                  setSenhaInput('');
                  setErroSenha(false);
                  setAcaoPendente(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Esta ação é restrita e não pode ser executada por colaboradores. Digite a senha do gestor para autorizar:
            </p>

            <form onSubmit={handleValidarSenhaGestor} className="space-y-4">
              <div>
                <input
                  type="password"
                  value={senhaInput}
                  onChange={(e) => {
                    setSenhaInput(e.target.value);
                    if (erroSenha) setErroSenha(false);
                  }}
                  placeholder="Digite a senha do gestor..."
                  autoFocus
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-center text-white text-base font-mono tracking-widest focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                />
                {erroSenha && (
                  <p className="text-[11px] font-bold text-red-400 text-center mt-2 animate-shake">
                    Senha incorreta! Apenas o gestor pode liberar.
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setModalSenhaAberto(false);
                    setSenhaInput('');
                    setErroSenha(false);
                    setAcaoPendente(null);
                  }}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl text-xs transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-2.5 rounded-xl text-xs shadow-lg shadow-amber-500/30 transition flex items-center justify-center gap-1.5 uppercase tracking-wider"
                >
                  <KeyRound className="w-4 h-4 text-slate-950" />
                  <span>Liberar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Visualizar Folha A4 Antes de Salvar (Foto 1) */}
      <ModalVisualizarRelatorio
        aberto={modalVisualizarAberto}
        dados={dadosVisualizar}
        aoFechar={() => setModalVisualizarAberto(false)}
      />
    </div>
  );
};
