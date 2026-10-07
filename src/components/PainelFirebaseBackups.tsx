import React, { useState, useEffect, useRef } from 'react';
import {
  Database,
  Download,
  Upload,
  Search,
  RotateCcw,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Cloud,
  FileCheck
} from 'lucide-react';
import type { StoreData } from '../types';
import { FirebaseService, type FirebaseConnectionStatus } from '../services/firebase';
import { ModalBuscaRegistros } from './ModalBuscaRegistros';

interface PainelFirebaseBackupsProps {
  storeData: StoreData;
  aoAtualizarStore: () => Promise<void>;
  onShowToast: (msg: string) => void;
  aoRestaurarBackup: (dados: StoreData) => Promise<void>;
  aoResetarTudo: (senha: string) => Promise<void>;
}

export const PainelFirebaseBackups: React.FC<PainelFirebaseBackupsProps> = ({
  storeData,
  aoAtualizarStore,
  onShowToast,
  aoRestaurarBackup,
  aoResetarTudo
}) => {
  const [firebaseStatus, setFirebaseStatus] = useState<FirebaseConnectionStatus>({
    connected: true,
    lastSyncTime: null,
    error: null
  });

  const [modalBuscaAberto, setModalBuscaAberto] = useState(false);
  const [modalResetAberto, setModalResetAberto] = useState(false);
  const [senhaReset, setSenhaReset] = useState('');
  const [erroSenhaReset, setErroSenhaReset] = useState(false);
  const [executandoReset, setExecutandoReset] = useState(false);

  const [salvandoNuvem, setSalvandoNuvem] = useState(false);
  const [carregandoArquivo, setCarregandoArquivo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = FirebaseService.subscribeStatus((st) => {
      setFirebaseStatus(st);
    });
    return () => unsub();
  }, []);

  const handleBaixarBackup = () => {
    try {
      FirebaseService.baixarArquivoBackupJson(storeData);
      onShowToast('Arquivo de Backup baixado com sucesso!');
    } catch (err: any) {
      onShowToast('Erro ao gerar arquivo de backup.');
    }
  };

  const handleSalvarPontoNuvem = async () => {
    setSalvandoNuvem(true);
    try {
      const backupId = await FirebaseService.criarSnapshotNuvem(storeData);
      onShowToast(`Ponto de restauração salvo na nuvem Firebase (${backupId})!`);
    } catch (err: any) {
      onShowToast('Erro ao salvar ponto na nuvem.');
    } finally {
      setSalvandoNuvem(false);
    }
  };

  const handleArquivoSelecionado = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCarregandoArquivo(true);
    try {
      const dadosRestaurados = await FirebaseService.lerArquivoBackupJson(file);
      await aoRestaurarBackup(dadosRestaurados);
      onShowToast('Backup restaurado e sincronizado no Firebase com sucesso!');
      await aoAtualizarStore();
    } catch (err: any) {
      onShowToast(err.message || 'Erro ao restaurar arquivo de backup.');
    } finally {
      setCarregandoArquivo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmarReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senhaReset !== '8619' && senhaReset !== '5211') {
      setErroSenhaReset(true);
      return;
    }

    setExecutandoReset(true);
    try {
      await aoResetarTudo(senhaReset);
      setModalResetAberto(false);
      setSenhaReset('');
      setErroSenhaReset(false);
      onShowToast('Aplicativo resetado com sucesso! Começando limpo do zero.');
      await aoAtualizarStore();
    } catch (err: any) {
      onShowToast(err.message || 'Erro ao resetar aplicativo.');
    } finally {
      setExecutandoReset(false);
    }
  };

  const qtdConcluidos = storeData.concluidos?.length || 0;
  const qtdMaquinas = storeData.maquinas?.length || 0;
  const qtdAtivos = Object.keys(storeData.setupsAtivos || {}).length;

  return (
    <>
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)] shrink-0">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-xl font-black text-white tracking-tight">
                  Armazenamento Seguro na Nuvem Firebase
                </h3>
                <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Nuvem Dedicada Ativa
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Todos os dados e setups são hospedados e sincronizados no Firebase Firestore em tempo real. Seus registros nunca são perdidos.
              </p>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-2 text-xs">
            <div className="bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-center">
              <span className="text-[10px] text-slate-500 block uppercase font-bold">Máquinas na Fila</span>
              <strong className="text-white text-sm">{qtdMaquinas}</strong>
            </div>
            <div className="bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-center">
              <span className="text-[10px] text-slate-500 block uppercase font-bold">Setups Ativos</span>
              <strong className="text-amber-400 text-sm">{qtdAtivos}</strong>
            </div>
            <div className="bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-center">
              <span className="text-[10px] text-slate-500 block uppercase font-bold">Concluídos Salvos</span>
              <strong className="text-emerald-400 text-sm">{qtdConcluidos}</strong>
            </div>
          </div>
        </div>

        {/* Action Grid: Backups, Search, Restore and Reset */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Action 1: Fazer Backup */}
          <div className="bg-slate-950/70 border border-slate-800 hover:border-blue-500/40 p-4 rounded-2xl flex flex-col justify-between transition group">
            <div className="space-y-1.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center">
                <Download className="w-5 h-5 group-hover:scale-110 transition-transform" />
              </div>
              <h4 className="text-sm font-black text-white">Fazer Backup Geral</h4>
              <p className="text-[11px] text-slate-400">
                Baixe um arquivo JSON com 100% dos dados para guardar com segurança no seu computador.
              </p>
            </div>
            <button
              type="button"
              onClick={handleBaixarBackup}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/20 transition active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>Baixar Backup (JSON)</span>
            </button>
          </div>

          {/* Action 2: Buscar Registros Gravados */}
          <div className="bg-slate-950/70 border border-slate-800 hover:border-emerald-500/40 p-4 rounded-2xl flex flex-col justify-between transition group">
            <div className="space-y-1.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                <Search className="w-5 h-5 group-hover:scale-110 transition-transform" />
              </div>
              <h4 className="text-sm font-black text-white">Buscar Dados Gravados</h4>
              <p className="text-[11px] text-slate-400">
                Pesquise no histórico por máquinas, peças, preparadores, tempos ou motivos de paradas.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setModalBuscaAberto(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 transition active:scale-95"
            >
              <Search className="w-4 h-4" />
              <span>Buscar Registros</span>
            </button>
          </div>

          {/* Action 3: Restaurar Backup */}
          <div className="bg-slate-950/70 border border-slate-800 hover:border-purple-500/40 p-4 rounded-2xl flex flex-col justify-between transition group">
            <div className="space-y-1.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center">
                <Upload className="w-5 h-5 group-hover:scale-110 transition-transform" />
              </div>
              <h4 className="text-sm font-black text-white">Restaurar Backup</h4>
              <p className="text-[11px] text-slate-400">
                Carregue um arquivo JSON de backup feito anteriormente para restaurar todos os dados.
              </p>
            </div>
            <div>
              <input
                type="file"
                ref={fileInputRef}
                accept=".json"
                onChange={handleArquivoSelecionado}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={carregandoArquivo}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-purple-600/20 transition active:scale-95"
              >
                {carregandoArquivo ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                <span>Carregar Arquivo</span>
              </button>
            </div>
          </div>

          {/* Action 4: Reset Geral (Começar do Zero) */}
          <div className="bg-slate-950/70 border border-red-500/30 hover:border-red-500/60 p-4 rounded-2xl flex flex-col justify-between transition group">
            <div className="space-y-1.5 mb-4">
              <div className="w-9 h-9 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 flex items-center justify-center">
                <RotateCcw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
              </div>
              <h4 className="text-sm font-black text-white">Resetar do Zero</h4>
              <p className="text-[11px] text-slate-400">
                Limpa todas as máquinas, setups ativos e histórico do aplicativo, deixando o app 100% zerado.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSenhaReset('');
                setErroSenhaReset(false);
                setModalResetAberto(true);
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg shadow-red-600/20 transition active:scale-95"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Resetar Aplicativo</span>
            </button>
          </div>
        </div>

        {/* Security & Cloud info footer */}
        <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Banco de dados <strong>Firestore</strong> ativo • Última verificação:{' '}
              <strong className="text-white">{firebaseStatus.lastSyncTime || 'Agora'}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={handleSalvarPontoNuvem}
            disabled={salvandoNuvem}
            className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 font-semibold transition"
          >
            {salvandoNuvem ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileCheck className="w-3.5 h-3.5" />}
            <span>Salvar Ponto de Restauração na Nuvem</span>
          </button>
        </div>
      </div>

      {/* Modal de Busca de Registros */}
      <ModalBuscaRegistros
        aberto={modalBuscaAberto}
        aoFechar={() => setModalBuscaAberto(false)}
        concluidos={storeData.concluidos || []}
      />

      {/* Modal de Confirmação de RESET TOTAL (Começar do Zero) */}
      {modalResetAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-red-500/50 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-5 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 mx-auto">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-xl font-black text-white">Resetar Todo o Aplicativo?</h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                Esta ação vai limpar todas as máquinas da fila, encerrar todos os setups em andamento e esvaziar o histórico para começar <strong className="text-white">100% do zero</strong>.
              </p>
            </div>

            <form onSubmit={handleConfirmarReset} className="space-y-4">
              <div>
                <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-2 text-left">
                  Digite a Senha do Líder (8619 ou 5211):
                </label>
                <input
                  type="password"
                  value={senhaReset}
                  onChange={(e) => {
                    setSenhaReset(e.target.value);
                    setErroSenhaReset(false);
                  }}
                  placeholder="Senha do líder..."
                  autoFocus
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-center text-white font-mono tracking-widest focus:outline-none focus:border-red-500"
                />
                {erroSenhaReset && (
                  <p className="text-xs font-bold text-red-400 mt-1 text-left">
                    Senha incorreta! Digite 8619 ou 5211.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalResetAberto(false)}
                  disabled={executandoReset}
                  className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={executandoReset}
                  className="py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-black text-xs shadow-lg shadow-red-600/30 transition flex items-center justify-center gap-2"
                >
                  {executandoReset ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <RotateCcw className="w-4 h-4" />
                  )}
                  <span>Zerar Tudo Agora</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
