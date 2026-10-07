import React, { useState, useMemo } from 'react';
import {
  Search,
  X,
  Calendar,
  Clock,
  User,
  Cpu,
  FileText,
  AlertCircle,
  CheckCircle2,
  Filter,
  Download
} from 'lucide-react';
import type { SetupConcluido } from '../types';

interface ModalBuscaRegistrosProps {
  aberto: boolean;
  aoFechar: () => void;
  concluidos: SetupConcluido[];
}

export const ModalBuscaRegistros: React.FC<ModalBuscaRegistrosProps> = ({
  aberto,
  aoFechar,
  concluidos
}) => {
  const [termo, setTermo] = useState('');
  const [filtroMaquina, setFiltroMaquina] = useState('');
  const [filtroPreparador, setFiltroPreparador] = useState('');

  const maquinasUnicas = useMemo(() => {
    return Array.from(new Set(concluidos.map((c) => c.maquina).filter(Boolean))).sort();
  }, [concluidos]);

  const preparadoresUnicos = useMemo(() => {
    const list: string[] = [];
    concluidos.forEach((c) => {
      if (c.prep1 && c.prep1 !== '-') list.push(c.prep1);
      if (c.prep2 && c.prep2 !== '-') list.push(c.prep2);
    });
    return Array.from(new Set(list)).sort();
  }, [concluidos]);

  const filtrados = useMemo(() => {
    return concluidos.filter((c) => {
      const matchTermo =
        !termo.trim() ||
        c.maquina.toLowerCase().includes(termo.toLowerCase()) ||
        c.peca.toLowerCase().includes(termo.toLowerCase()) ||
        (c.modeloAnterior && c.modeloAnterior.toLowerCase().includes(termo.toLowerCase())) ||
        (c.prep1 && c.prep1.toLowerCase().includes(termo.toLowerCase())) ||
        (c.prep2 && c.prep2.toLowerCase().includes(termo.toLowerCase())) ||
        (c.historico && c.historico.toLowerCase().includes(termo.toLowerCase())) ||
        c.data.toLowerCase().includes(termo.toLowerCase());

      const matchMaq = !filtroMaquina || c.maquina === filtroMaquina;
      const matchPrep =
        !filtroPreparador || c.prep1 === filtroPreparador || c.prep2 === filtroPreparador;

      return matchTermo && matchMaq && matchPrep;
    });
  }, [concluidos, termo, filtroMaquina, filtroPreparador]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <Search className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white flex items-center gap-2">
                Buscar Registros Gravados no Firebase
              </h3>
              <p className="text-xs text-slate-400">
                Pesquise por máquinas, peças, preparadores, datas ou motivos de paradas no histórico
              </p>
            </div>
          </div>
          <button
            onClick={aoFechar}
            className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter bar */}
        <div className="p-5 border-b border-slate-800/80 bg-slate-900/90 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Digite máquina, peça, data..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <select
              value={filtroMaquina}
              onChange={(e) => setFiltroMaquina(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="">Todas as Máquinas ({maquinasUnicas.length})</option>
              {maquinasUnicas.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={filtroPreparador}
              onChange={(e) => setFiltroPreparador(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="">Todos os Preparadores ({preparadoresUnicos.length})</option>
              {preparadoresUnicos.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Results summary */}
        <div className="px-6 py-2.5 bg-slate-950/40 border-b border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
          <span>
            Encontrados: <strong className="text-white">{filtrados.length}</strong> registro(s)
          </span>
          {(termo || filtroMaquina || filtroPreparador) && (
            <button
              onClick={() => {
                setTermo('');
                setFiltroMaquina('');
                setFiltroPreparador('');
              }}
              className="text-blue-400 hover:underline"
            >
              Limpar filtros
            </button>
          )}
        </div>

        {/* List of results */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {filtrados.length === 0 ? (
            <div className="py-16 text-center text-slate-500 flex flex-col items-center">
              <AlertCircle className="w-12 h-12 mb-3 text-slate-600" />
              <p className="font-bold text-sm">Nenhum registro encontrado</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm">
                Tente ajustar os termos da busca ou selecione outros filtros.
              </p>
            </div>
          ) : (
            filtrados.map((item) => (
              <div
                key={item.id}
                className="bg-slate-950/80 border border-slate-800 hover:border-slate-700 p-4 rounded-2xl transition space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
                  <div className="flex items-center gap-3">
                    <span className="font-black text-sm text-blue-400 tracking-wide bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-lg">
                      {item.maquina}
                    </span>
                    <span className="font-bold text-sm text-white">
                      Peça: {item.peca}
                    </span>
                    {item.modeloAnterior && item.modeloAnterior !== '-' && (
                      <span className="text-[11px] text-slate-400">
                        (Anterior: {item.modeloAnterior})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      {item.data}
                    </span>
                    <span className="flex items-center gap-1 text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      <Clock className="w-3.5 h-3.5" />
                      {item.tempo}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="text-slate-300">
                    <span className="text-slate-500">Preparadores:</span>{' '}
                    <strong>{item.prep1 || '-'}</strong> / <strong>{item.prep2 || '-'}</strong>
                  </div>
                  <div className="text-slate-300">
                    <span className="text-slate-500">Pendências pós-setup:</span>{' '}
                    {item.pendenciasConcluidas ? (
                      <span className="text-emerald-400 font-bold">100% Concluídas</span>
                    ) : (
                      <span className="text-amber-400 font-bold">Em Aberto</span>
                    )}
                  </div>
                </div>

                {item.historico && (
                  <div className="bg-slate-900/60 border border-slate-800/80 p-2.5 rounded-xl text-xs text-slate-300">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold tracking-wider mb-1">
                      Histórico de Ocorrências e Paradas:
                    </span>
                    <p className="line-clamp-2">{item.historico}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex justify-end">
          <button
            onClick={aoFechar}
            className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
