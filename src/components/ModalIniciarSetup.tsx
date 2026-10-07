import React, { useState, useEffect, memo } from 'react';
import { PlayCircle, X, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import type { Maquina } from '../types';

interface ModalIniciarSetupProps {
  aberto: boolean;
  maquina: Maquina | null;
  aoFechar: () => void;
  aoConfirmar: (maquina: Maquina, modeloAnterior: string) => void;
}

export const ModalIniciarSetup: React.FC<ModalIniciarSetupProps> = memo(({
  aberto,
  maquina,
  aoFechar,
  aoConfirmar
}) => {
  const [modeloAnterior, setModeloAnterior] = useState('');
  const [iniciando, setIniciando] = useState(false);

  useEffect(() => {
    if (aberto) {
      setModeloAnterior('');
      setIniciando(false);
    }
  }, [aberto]);

  if (!aberto || !maquina) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (iniciando) return;
    setIniciando(true);
    const clean = modeloAnterior.trim() || 'NÃO INFORMADO';
    aoConfirmar(maquina, clean.toUpperCase());
  };

  const sugestoesRapidas = ['PRIMEIRO SETUP', 'NÃO INFORMADO', 'MESMO MODELO', 'LOTE ANTERIOR', 'NOVA PEÇA'];

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-blue-500/50 rounded-2xl w-full max-w-md p-6 shadow-2xl relative overflow-hidden">
        {/* Glow accent */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-blue-500/15 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5 text-blue-400">
            <PlayCircle className="w-6 h-6 text-blue-500" />
            <h3 className="text-xl font-black text-white tracking-tight">
              Iniciar Setup
            </h3>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            className="text-slate-400 hover:text-white transition p-1.5 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Machine info badge */}
        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 mb-5 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Máquina Selecionada
            </span>
            <p className="text-2xl font-black text-white">{maquina.maquina}</p>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">
              Para Onde Vai (Peça)
            </span>
            <p className="text-base font-bold text-blue-200 truncate max-w-[170px]">
              {maquina.peca}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-slate-300 text-xs font-black uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Modelo Anterior (Opcional)</span>
              <span className="text-[10px] text-slate-400 font-semibold lowercase tracking-normal">
                (ou selecione abaixo)
              </span>
            </label>
            <input
              type="text"
              value={modeloAnterior}
              onChange={(e) => setModeloAnterior(e.target.value)}
              placeholder="Ex: Eixo 45, Flange 110 (ou deixe em branco)..."
              autoFocus
              className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-xl p-3.5 text-white placeholder-slate-500 font-semibold focus:outline-none uppercase text-sm shadow-inner transition"
            />

            {/* Quick suggestion chips */}
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {sugestoesRapidas.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  onClick={() => setModeloAnterior(sug)}
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition ${
                    modeloAnterior.toUpperCase() === sug
                      ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
                  }`}
                >
                  + {sug}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              disabled={iniciando}
              onClick={aoFechar}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3.5 px-4 rounded-xl transition text-sm disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={iniciando}
              className="flex-1 font-black py-3.5 px-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2 text-sm bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30 cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {iniciando ? (
                <span>Iniciando Setup...</span>
              ) : (
                <>
                  <span>Iniciar Setup Agora</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});

