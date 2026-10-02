import React, { useState, useEffect } from 'react';
import { AlertTriangle, Clock, X, Check, Play, Tag } from 'lucide-react';
import type { SetupAtivo } from '../types';
import { formatarTempo } from '../utils/turno';

interface ModalParadaProps {
  aberto: boolean;
  setup: SetupAtivo | null;
  aoFechar: () => void;
  aoIniciarParada: (setupId: string, motivo: string) => void;
  aoFinalizarParada: (setupId: string, justificativaAdicional?: string) => void;
}

const MOTIVOS_RAPIDOS = [
  'Quebra de ferramenta / Troca de inserto',
  'Aguardando barras / Matéria-prima',
  'Aguardando aprovação de qualidade (1ª peça)',
  'Manutenção mecânica / vazamento de óleo',
  'Manutenção elétrica / falha CNC',
  'Ajuste de programa / correção de cotas',
  'Troca / ajuste de pinça ou buchas',
  'Falta de chave / dispositivo especial',
  'Limpeza profunda de cavacos no fuso',
  'Apoio a outro operador / Reunião rápida'
];

export const ModalParada: React.FC<ModalParadaProps> = ({
  aberto,
  setup,
  aoFechar,
  aoIniciarParada,
  aoFinalizarParada
}) => {
  const [motivo, setMotivo] = useState('');
  const [obsFinal, setObsFinal] = useState('');
  const [tempoParadaAtiva, setTempoParadaAtiva] = useState('00:00:00');

  useEffect(() => {
    if (aberto) {
      setMotivo('');
      setObsFinal('');
    }
  }, [aberto]);

  // Live timer for ongoing stop
  useEffect(() => {
    if (!aberto || !setup || !setup.paradaAtiva || !setup.paradaAtual) return;

    const interval = setInterval(() => {
      const ms = Date.now() - setup.paradaAtual!.inicioMs;
      setTempoParadaAtiva(formatarTempo(ms));
    }, 1000);

    return () => clearInterval(interval);
  }, [aberto, setup]);

  if (!aberto || !setup) return null;

  const isEmParada = setup.paradaAtiva;

  const handleStartStop = (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivo.trim()) return;
    aoIniciarParada(setup.id, motivo.trim());
    aoFechar();
  };

  const handleFinishStop = () => {
    aoFinalizarParada(setup.id, obsFinal.trim());
    aoFechar();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-red-500/50 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative overflow-hidden">
        {/* Glow */}
        <div className="absolute -top-12 -right-12 w-36 h-36 bg-red-600/15 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-red-500/20 text-red-400 border border-red-500/40">
              <AlertTriangle className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white">
                {isEmParada ? 'Parada em Andamento' : 'Registrar Parada do Setup'}
              </h3>
              <p className="text-xs text-slate-400 font-semibold">
                Máquina: <span className="text-white font-bold">{setup.maquina}</span> | Peça: <span className="text-blue-400">{setup.peca}</span>
              </p>
            </div>
          </div>
          <button
            onClick={aoFechar}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Previous events trail */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Eventos Anteriores Deste Setup:
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              {setup.historico.length} evento(s)
            </span>
          </div>
          <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 max-h-32 overflow-y-auto space-y-1.5 text-xs text-slate-300">
            {setup.historico.length === 0 ? (
              <p className="text-slate-500 italic text-center py-2">
                Nenhum evento registrado ainda.
              </p>
            ) : (
              setup.historico.map((ev, i) => (
                <div key={i} className="flex items-start gap-2 border-b border-slate-900 pb-1 last:border-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-600 mt-1.5 shrink-0" />
                  <span className="font-mono text-slate-400 leading-tight">{ev}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {isEmParada ? (
          /* Ongoing stop screen */
          <div className="space-y-4">
            <div className="bg-red-950/40 border border-red-500/50 rounded-xl p-4 text-center">
              <span className="text-xs font-bold text-red-300 uppercase tracking-widest block mb-1">
                Tempo Parado Atual
              </span>
              <div className="text-4xl font-black font-mono text-red-400 tracking-wider">
                {tempoParadaAtiva}
              </div>
              <p className="text-xs text-slate-300 mt-2 font-semibold">
                Motivo: <span className="text-white font-bold">{setup.paradaAtual?.motivo || 'Em parada'}</span>
              </p>
            </div>

            <div>
              <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-1.5">
                Observação de Retorno / Ação Tomada (Opcional):
              </label>
              <input
                type="text"
                value={obsFinal}
                onChange={(e) => setObsFinal(e.target.value)}
                placeholder="Ex: Inserto substituído e zerado, folga corrigida..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={aoFechar}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl transition text-sm"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleFinishStop}
                className="flex-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3 rounded-xl shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-2 text-sm"
              >
                <Play className="w-4 h-4" />
                <span>FINALIZAR PARADA (Retomar Setup)</span>
              </button>
            </div>
          </div>
        ) : (
          /* New stop registration screen */
          <form onSubmit={handleStartStop} className="space-y-4">
            <div>
              <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-red-400" />
                <span>Motivos Industriais Frequentes (Toque Rápido):</span>
              </label>
              <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                {MOTIVOS_RAPIDOS.map((m, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setMotivo(m)}
                    className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border transition text-left ${
                      motivo === m
                        ? 'bg-red-600 text-white border-red-400'
                        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-1.5">
                Qual o motivo da parada? (O que vai fazer a não ser o setup):
              </label>
              <input
                type="text"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex: Quebra de ferramenta, aguardando barras, manutenção..."
                required
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-red-500 font-semibold"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={aoFechar}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl transition text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!motivo.trim()}
                className="flex-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-black py-3 rounded-xl shadow-lg shadow-red-600/30 transition flex items-center justify-center gap-2 text-sm"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>REGISTRAR PARADA</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
