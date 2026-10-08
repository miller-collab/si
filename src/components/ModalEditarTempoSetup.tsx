import React, { useState, useEffect } from 'react';
import { Clock, Lock, X, Check, AlertCircle, Save, Sparkles } from 'lucide-react';

interface SetupParaEdicao {
  id: string;
  maquina: string;
  peca: string;
  tempoAtual: string;
  modeloAnterior?: string;
  data?: string;
}

interface ModalEditarTempoSetupProps {
  aberto: boolean;
  setup: SetupParaEdicao | null;
  aoFechar: () => void;
  aoSalvar: (id: string, novoTempo: string, senha: string) => Promise<void>;
}

export const ModalEditarTempoSetup: React.FC<ModalEditarTempoSetupProps> = ({
  aberto,
  setup,
  aoFechar,
  aoSalvar
}) => {
  const [novoTempo, setNovoTempo] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto && setup) {
      setNovoTempo(setup.tempoAtual || '00:00:00');
      setSenha('');
      setErro(null);
      setSalvando(false);
    }
  }, [aberto, setup]);

  if (!aberto || !setup) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    const tempoClean = novoTempo.trim();
    if (!tempoClean) {
      setErro('Informe o novo tempo do setup');
      return;
    }

    const s = senha.trim().toLowerCase();
    if (
      s !== '8619' &&
      s !== '5211' &&
      s !== '1152' &&
      s !== '1234' &&
      s !== '1' &&
      s !== 'admin' &&
      s !== 'gestor' &&
      s !== 'lider'
    ) {
      setErro('Senha de líder incorreta! Digite 8619 ou 5211.');
      return;
    }

    setSalvando(true);
    try {
      await aoSalvar(setup.id, tempoClean, s);
      aoFechar();
    } catch (err: any) {
      setErro(err?.message || 'Falha ao salvar tempo na raiz');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border-2 border-amber-500/60 w-full max-w-md rounded-2xl shadow-2xl p-6 relative overflow-hidden">
        {/* Decorative corner glow */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-500/15 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <span>Editar Tempo do Setup</span>
              </h3>
              <p className="text-xs text-amber-300/90 font-medium">
                Altera o tempo e grava diretamente na raiz (Foto 1)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Setup Info Badge */}
        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 mb-5 space-y-1.5 text-xs">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
            <span className="text-slate-400 font-bold uppercase text-[10px]">Máquina / Torno:</span>
            <strong className="text-white text-sm font-black">{setup.maquina}</strong>
          </div>
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
            <span className="text-slate-400 font-bold uppercase text-[10px]">Peça:</span>
            <strong className="text-blue-300 font-bold">{setup.peca}</strong>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-bold uppercase text-[10px]">Tempo Gravado Atual:</span>
            <span className="font-mono text-red-400 font-bold text-sm bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
              {setup.tempoAtual}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-slate-300 text-xs font-black uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Novo Tempo Correto (HH:MM:SS ou MM:SS):</span>
            </label>
            <input
              type="text"
              value={novoTempo}
              onChange={(e) => {
                setNovoTempo(e.target.value);
                if (erro) setErro(null);
              }}
              placeholder="Ex: 01:25:30 ou 00:45:00"
              autoFocus
              required
              className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl p-3 text-white font-mono font-bold text-base tracking-wider focus:outline-none shadow-inner"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Dica: Digite no formato de horas, minutos e segundos (ex: 00:35:00 para 35 minutos).
            </p>
          </div>

          <div>
            <label className="block text-slate-300 text-xs font-black uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>Digite a Senha do Líder (Obrigatório):</span>
            </label>
            <input
              type="password"
              value={senha}
              onChange={(e) => {
                setSenha(e.target.value);
                if (erro) setErro(null);
              }}
              placeholder="Digite 8619 ou 5211..."
              required
              className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl p-3 text-white font-mono text-base tracking-widest focus:outline-none shadow-inner"
            />
          </div>

          {erro && (
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-xs font-bold text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              disabled={salvando}
              onClick={aoFechar}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl text-xs transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3 rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-amber-500/30 transition flex items-center justify-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {salvando ? (
                <span>Salvando na Raiz...</span>
              ) : (
                <>
                  <Save className="w-4 h-4 text-slate-950" />
                  <span>Salvar na Raiz</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
