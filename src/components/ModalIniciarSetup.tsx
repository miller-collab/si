import React, { useState, useEffect } from 'react';
import { PlayCircle, X, ArrowRight, AlertCircle } from 'lucide-react';
import type { Maquina } from '../types';

interface ModalIniciarSetupProps {
  aberto: boolean;
  maquina: Maquina | null;
  aoFechar: () => void;
  aoConfirmar: (maquina: Maquina, modeloAnterior: string) => void;
}

export const ModalIniciarSetup: React.FC<ModalIniciarSetupProps> = ({
  aberto,
  maquina,
  aoFechar,
  aoConfirmar
}) => {
  const [modeloAnterior, setModeloAnterior] = useState('');
  const [erro, setErro] = useState(false);

  useEffect(() => {
    if (aberto) {
      setModeloAnterior('');
      setErro(false);
    }
  }, [aberto]);

  if (!aberto || !maquina) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = modeloAnterior.trim();
    if (!clean) {
      setErro(true);
      return;
    }
    aoConfirmar(maquina, clean.toUpperCase());
  };

  const preenchido = modeloAnterior.trim().length > 0;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-blue-500/40 rounded-2xl w-full max-w-md p-6 shadow-2xl relative overflow-hidden">
        {/* Glow accent */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5 text-blue-400">
            <PlayCircle className="w-6 h-6 text-blue-500" />
            <h3 className="text-xl font-black text-white tracking-tight">
              Iniciar Setup
            </h3>
          </div>
          <button
            onClick={aoFechar}
            className="text-slate-400 hover:text-white transition p-1 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Machine info badge */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 mb-5 flex items-center justify-between">
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

        <form onSubmit={handleSubmit}>
          <label className="block text-slate-300 text-xs font-black uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Qual o Modelo Anterior? *</span>
            <span className="text-[10px] text-amber-400 font-bold lowercase tracking-normal">
              (obrigatório para iniciar)
            </span>
          </label>
          <input
            type="text"
            value={modeloAnterior}
            required
            onChange={(e) => {
              setModeloAnterior(e.target.value);
              if (erro) setErro(false);
            }}
            placeholder="Ex: Eixo 45, Flange 110, BD1200..."
            autoFocus
            className={`w-full bg-slate-950 border rounded-xl p-3.5 text-white placeholder-slate-500 font-semibold focus:outline-none uppercase text-sm ${
              erro
                ? 'border-red-500 focus:border-red-500'
                : 'border-slate-700 focus:border-blue-500'
            }`}
          />

          {erro && (
            <p className="text-xs font-bold text-red-400 flex items-center gap-1.5 mt-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>É obrigatório preencher o modelo anterior para iniciar o setup!</span>
            </p>
          )}

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={aoFechar}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 px-4 rounded-xl transition text-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!preenchido}
              className={`flex-1 font-black py-3 px-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2 text-sm ${
                preenchido
                  ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30 cursor-pointer active:scale-95'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
              }`}
            >
              <span>Confirmar</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
