import React, { useState } from 'react';
import {
  Plus,
  Cog,
  Play,
  Search,
  ArrowRight,
  CheckCircle2,
  Trash2,
  X,
  AlertCircle
} from 'lucide-react';
import type { Maquina } from '../types';

interface AbaIniciarSetupProps {
  maquinas: Maquina[];
  aoSelecionarMaquina: (maquina: Maquina) => void;
  aoAdicionarMaquina: (maquina: string, peca: string) => void;
  aoToggleSetupExterno: (maquinaId: string, senha: string) => Promise<void>;
  aoDeletarMaquina: (maquinaId: string, senha: string) => Promise<void>;
}

export const AbaIniciarSetup: React.FC<AbaIniciarSetupProps> = ({
  maquinas,
  aoSelecionarMaquina,
  aoAdicionarMaquina,
  aoToggleSetupExterno,
  aoDeletarMaquina
}) => {
  const [busca, setBusca] = useState('');
  const [modalNovaMaquina, setModalNovaMaquina] = useState(false);
  const [novaMaquina, setNovaMaquina] = useState('');
  const [novaPeca, setNovaPeca] = useState('');
  const [erroValidacao, setErroValidacao] = useState(false);

  // Password modal for Setup Externo (senha: 1152)
  const [modalSenhaExterno, setModalSenhaExterno] = useState<{ aberto: boolean; maquinaId: string | null }>({
    aberto: false,
    maquinaId: null
  });
  const [senhaExterno, setSenhaExterno] = useState('');
  const [erroSenhaExterno, setErroSenhaExterno] = useState(false);

  const filtradas = maquinas.filter(
    (m) =>
      m.maquina.toLowerCase().includes(busca.toLowerCase()) ||
      m.peca.toLowerCase().includes(busca.toLowerCase())
  );

  const handleCriarMaquina = (e: React.FormEvent) => {
    e.preventDefault();
    const maqClean = novaMaquina.trim().toUpperCase();
    const pecaClean = novaPeca.trim().toUpperCase();
    if (!maqClean || !pecaClean) {
      setErroValidacao(true);
      return;
    }
    aoAdicionarMaquina(maqClean, pecaClean);
    setNovaMaquina('');
    setNovaPeca('');
    setErroValidacao(false);
    setModalNovaMaquina(false);
  };

  const handleConfirmarSetupExterno = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalSenhaExterno.maquinaId) return;
    try {
      await aoToggleSetupExterno(modalSenhaExterno.maquinaId, senhaExterno);
      setModalSenhaExterno({ aberto: false, maquinaId: null });
      setSenhaExterno('');
      setErroSenhaExterno(false);
    } catch (err) {
      setErroSenhaExterno(true);
    }
  };

  const handleDeletarCardRapido = async (maquinaId: string) => {
    await aoDeletarMaquina(maquinaId, '8619');
  };

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/30">
              <Play className="w-6 h-6 fill-blue-500 text-blue-500" />
            </span>
            Selecionar Máquina para Setup
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Escolha o torno/centro CNC para iniciar a contagem. O selo verde indica setup externo liberado.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar máquina ou peça..."
              className="bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 w-48 sm:w-64"
            />
          </div>

          <button
            onClick={() => setModalNovaMaquina(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg transition"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar Máquina</span>
          </button>
        </div>
      </div>

      {/* Machine Cards Grid */}
      {filtradas.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-12 text-center max-w-lg mx-auto mt-12">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mx-auto mb-4">
            <Cog className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-white mb-2">
            Fila de Máquinas Vazia
          </h3>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            Nenhuma máquina em fila de setup no momento. Cadastre as máquinas e peças que vão entrar em operação pelo botão abaixo ou no Painel do Líder.
          </p>
          <button
            onClick={() => setModalNovaMaquina(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-black px-6 py-3 rounded-xl shadow-lg transition flex items-center gap-2 mx-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Cadastrar Máquina Agora</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
          {filtradas.map((item) => {
            const isExternoPronto = !!item.setupExternoPronto;
            return (
              <div
                key={item.id}
                className="group bg-gradient-to-br from-slate-900 to-slate-950 p-6 rounded-2xl border border-slate-800 hover:border-blue-500/80 transition-all duration-300 relative flex flex-col justify-between shadow-xl"
              >
                {/* Decorative watermark */}
                <Cog className="w-36 h-36 absolute -bottom-6 -right-6 text-slate-800/20 group-hover:scale-110 transition duration-500 pointer-events-none group-hover:text-blue-500/10" />

                {/* Top bar on card: Label, Setup Externo Toggle, Delete button */}
                <div className="flex items-start justify-between mb-4 relative z-10">
                  <div>
                    <span className="text-[11px] font-extrabold uppercase tracking-widest text-blue-400 block mb-1">
                      MÁQUINA CNC
                    </span>
                    <h3 className="text-5xl font-black text-white tracking-tight group-hover:text-blue-200 transition">
                      {item.maquina}
                    </h3>
                  </div>

                  {/* Actions in top right (Photo 3) */}
                  <div className="flex items-center gap-1.5">
                    {/* Setup Externo Tik Button (Photo 3) */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSenhaExterno('');
                        setErroSenhaExterno(false);
                        setModalSenhaExterno({ aberto: true, maquinaId: item.id });
                      }}
                      title={isExternoPronto ? 'Setup externo pronto! Clique para alterar' : 'Marcar setup externo pronto'}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 shadow-md ${
                        isExternoPronto
                          ? 'bg-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.5)] border border-emerald-400 scale-105'
                          : 'bg-slate-950/80 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/50 border border-slate-800'
                      }`}
                    >
                      <CheckCircle2 className={`w-4 h-4 ${isExternoPronto ? 'text-slate-950 stroke-[3]' : 'text-slate-500'}`} />
                      <span className="text-[10px]">
                        {isExternoPronto ? 'EXT. PRONTO' : 'EXTERNO'}
                      </span>
                    </button>

                    {/* Quick delete button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletarCardRapido(item.id);
                      }}
                      title="Excluir máquina da fila"
                      className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-slate-800/80 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Target piece card */}
                <div className="relative z-10 mb-6 bg-slate-950/80 p-4 rounded-xl border border-slate-800/80 backdrop-blur-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Setup Atual (Para Onde Vai)
                  </span>
                  <p className="text-xl font-extrabold text-blue-300 truncate" title={item.peca}>
                    {item.peca}
                  </p>
                </div>

                {/* Start Setup Button */}
                <button
                  type="button"
                  onClick={() => aoSelecionarMaquina(item)}
                  className="relative z-10 w-full bg-blue-600 hover:bg-blue-500 text-white py-3.5 px-4 rounded-xl font-black text-sm tracking-wide shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2"
                >
                  <span>INICIAR SETUP</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Add Machine */}
      {modalNovaMaquina && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-lg font-black text-white mb-4">Adicionar Máquina para Setup</h3>
            <form onSubmit={handleCriarMaquina} className="space-y-4">
              <div>
                <label className="block text-slate-300 text-xs font-black uppercase mb-1 flex items-center justify-between">
                  <span>Nome do Torno / Centro *</span>
                  <span className="text-[10px] text-amber-400 font-bold lowercase tracking-normal">
                    (obrigatório)
                  </span>
                </label>
                <input
                  type="text"
                  value={novaMaquina}
                  onChange={(e) => {
                    setNovaMaquina(e.target.value);
                    if (erroValidacao) setErroValidacao(false);
                  }}
                  placeholder="Ex: TC21, CNC-02..."
                  required
                  autoFocus
                  className={`w-full bg-slate-950 border rounded-xl p-3 text-white text-sm uppercase focus:outline-none transition ${
                    erroValidacao && !novaMaquina.trim()
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-slate-700 focus:border-blue-500'
                  }`}
                />
              </div>

              <div>
                <label className="block text-slate-300 text-xs font-black uppercase mb-1 flex items-center justify-between">
                  <span>Modelo da Peça a Produzir *</span>
                  <span className="text-[10px] text-amber-400 font-bold lowercase tracking-normal">
                    (obrigatório)
                  </span>
                </label>
                <input
                  type="text"
                  value={novaPeca}
                  onChange={(e) => {
                    setNovaPeca(e.target.value);
                    if (erroValidacao) setErroValidacao(false);
                  }}
                  placeholder="Ex: BD1500, EIXO-35, PC5877..."
                  required
                  className={`w-full bg-slate-950 border rounded-xl p-3 text-white text-sm uppercase focus:outline-none transition ${
                    erroValidacao && !novaPeca.trim()
                      ? 'border-red-500 focus:border-red-500'
                      : 'border-slate-700 focus:border-blue-500'
                  }`}
                />
              </div>

              {erroValidacao && (!novaMaquina.trim() || !novaPeca.trim()) && (
                <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/50 text-red-300 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>Todos os campos de informações precisam estar preenchidos!</span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setModalNovaMaquina(false);
                    setErroValidacao(false);
                  }}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl text-sm transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!novaMaquina.trim() || !novaPeca.trim()}
                  className={`flex-1 font-black py-2.5 rounded-xl text-sm transition flex items-center justify-center gap-2 ${
                    novaMaquina.trim() && novaPeca.trim()
                      ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 cursor-pointer active:scale-95'
                      : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  }`}
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Password for Setup Externo (Photo 3 - Senha 1152) */}
      {modalSenhaExterno.aberto && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-emerald-500/50 rounded-2xl w-full max-w-sm p-6 shadow-2xl relative">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
                <h3 className="text-base font-black text-white">Autorizar Setup Externo</h3>
              </div>
              <button
                onClick={() => setModalSenhaExterno({ aberto: false, maquinaId: null })}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              Digite a senha para confirmar ou alternar o status do setup externo:
            </p>

            <form onSubmit={handleConfirmarSetupExterno} className="space-y-4">
              <input
                type="password"
                value={senhaExterno}
                onChange={(e) => setSenhaExterno(e.target.value)}
                placeholder="Digite a senha..."
                autoFocus
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-center text-white font-mono text-base focus:border-emerald-500 focus:outline-none"
              />

              {erroSenhaExterno && (
                <p className="text-xs font-bold text-red-400 text-center">
                  Senha incorreta!
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setModalSenhaExterno({ aberto: false, maquinaId: null })}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black py-2.5 rounded-xl text-xs shadow-lg"
                >
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
