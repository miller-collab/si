import React from 'react';
import { ListFilter, X, Clock, AlertTriangle, Coffee, Utensils, Info } from 'lucide-react';

interface ModalResumoHistoricoProps {
  aberto: boolean;
  historicoStr: string;
  titulo?: string;
  aoFechar: () => void;
}

export const ModalResumoHistorico: React.FC<ModalResumoHistoricoProps> = ({
  aberto,
  historicoStr,
  titulo = 'Histórico de Ocorrências & Paradas',
  aoFechar
}) => {
  if (!aberto) return null;

  const eventos = (historicoStr || '')
    .split('|')
    .map((e) => e.trim())
    .filter(Boolean);

  const getBadge = (texto: string) => {
    const lower = texto.toLowerCase();
    if (lower.includes('parada')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-red-950 text-red-400 border border-red-800">
          <AlertTriangle className="w-3 h-3" />
          Parada
        </span>
      );
    }
    if (lower.includes('almoço') || lower.includes('almoco')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-950 text-amber-400 border border-amber-800">
          <Utensils className="w-3 h-3" />
          Almoço (-1.5h)
        </span>
      );
    }
    if (lower.includes('café') || lower.includes('cafe')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-yellow-950 text-yellow-400 border border-yellow-800">
          <Coffee className="w-3 h-3" />
          Café (-15m)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-blue-950 text-blue-400 border border-blue-800">
        <Info className="w-3 h-3" />
        Evento
      </span>
    );
  };

  const parseItem = (item: string) => {
    let dataHora = '-';
    let descricao = item;
    if (item.startsWith('[')) {
      const parts = item.split('] ');
      dataHora = parts[0].substring(1);
      descricao = parts.slice(1).join('] ');
    }
    return { dataHora, descricao };
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl relative overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5 text-blue-400">
            <ListFilter className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-black text-white">{titulo}</h3>
          </div>
          <button
            onClick={aoFechar}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-5">
          {eventos.length === 0 ? (
            <div className="py-12 text-center text-slate-500 italic">
              Nenhum evento registrado para este setup.
            </div>
          ) : (
            <div className="space-y-3">
              {eventos.map((ev, idx) => {
                const { dataHora, descricao } = parseItem(ev);
                return (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:border-slate-700 transition"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{getBadge(ev)}</div>
                      <div>
                        <p className="text-sm font-semibold text-slate-200 leading-snug">
                          {descricao}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-400 text-xs font-mono shrink-0 pl-1">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>{dataHora}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40">
          <button
            onClick={aoFechar}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 rounded-xl transition text-sm"
          >
            Fechar Relatório
          </button>
        </div>
      </div>
    </div>
  );
};
