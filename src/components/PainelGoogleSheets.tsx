import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Link2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  PlusCircle,
  Download,
  UploadCloud,
  LogOut,
  ShieldCheck,
  Check,
  Sparkles
} from 'lucide-react';
import type { StoreData, GoogleSheetConfig } from '../types';
import {
  initAuth,
  googleSignIn,
  logoutGoogle,
  getAccessToken,
  getCurrentUser
} from '../services/googleAuth';
import { GoogleSheetsService, type SheetSyncStatus } from '../services/googleSheets';
import { SetupApiService } from '../services/api';
import type { User } from 'firebase/auth';

interface PainelGoogleSheetsProps {
  storeData: StoreData;
  aoAtualizarStore: () => Promise<void>;
  onShowToast: (msg: string) => void;
}

export const PainelGoogleSheets: React.FC<PainelGoogleSheetsProps> = ({
  storeData,
  aoAtualizarStore,
  onShowToast
}) => {
  const [user, setUser] = useState<User | null>(getCurrentUser());
  const [token, setToken] = useState<string | null>(null);
  const [autenticando, setAutenticando] = useState(false);

  // Sheet config state
  const sheetConfig = storeData.sheetConfig;
  const [inputUrlOuId, setInputUrlOuId] = useState(sheetConfig?.spreadsheetUrl || sheetConfig?.spreadsheetId || '');
  const [spreadsheetId, setSpreadsheetId] = useState(sheetConfig?.spreadsheetId || '');
  const [spreadsheetTitle, setSpreadsheetTitle] = useState(sheetConfig?.spreadsheetTitle || '');
  const [autoSyncAtivo, setAutoSyncAtivo] = useState(sheetConfig?.autoSyncAtivo ?? true);

  // Operation states
  const [testando, setTestando] = useState(false);
  const [criandoPlanilha, setCriandoPlanilha] = useState(false);
  const [sincronizandoUpload, setSincronizandoUpload] = useState(false);
  const [puxandoDados, setPuxandoDados] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ tipo: 'sucesso' | 'erro' | 'info'; texto: string } | null>(null);
  const [modalConfirmacaoPuxar, setModalConfirmacaoPuxar] = useState(false);

  // Live Auto-Sync Status
  const [liveSyncStatus, setLiveSyncStatus] = useState<SheetSyncStatus>({
    isSyncing: false,
    lastSyncTime: null,
    lastError: null
  });

  useEffect(() => {
    const unsub = GoogleSheetsService.subscribeStatus((st) => {
      setLiveSyncStatus(st);
    });
    return () => unsub();
  }, []);

  // Initialize auth state
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, currentToken) => {
        setUser(currentUser);
        setToken(currentToken);
      },
      () => {
        setUser(getCurrentUser());
        getAccessToken().then(setToken);
      }
    );
    return () => unsubscribe();
  }, []);

  // Update local fields when storeData changes
  useEffect(() => {
    if (storeData.sheetConfig) {
      setSpreadsheetId(storeData.sheetConfig.spreadsheetId);
      setInputUrlOuId(storeData.sheetConfig.spreadsheetUrl || storeData.sheetConfig.spreadsheetId);
      setSpreadsheetTitle(storeData.sheetConfig.spreadsheetTitle || '');
      setAutoSyncAtivo(storeData.sheetConfig.autoSyncAtivo ?? true);
    }
  }, [storeData.sheetConfig]);

  const handleLoginGoogle = async () => {
    setAutenticando(true);
    setStatusMsg(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setToken(res.accessToken);
        onShowToast('Conectado à Conta Google com sucesso!');
        setStatusMsg({ tipo: 'sucesso', texto: `Conectado como ${res.user.email}` });
      }
    } catch (err: any) {
      console.error('Falha no login Google:', err);
      setStatusMsg({ tipo: 'erro', texto: err.message || 'Falha ao autenticar com o Google' });
    } finally {
      setAutenticando(false);
    }
  };

  const handleLogoutGoogle = async () => {
    await logoutGoogle();
    setUser(null);
    setToken(null);
    onShowToast('Desconectado do Google');
    setStatusMsg(null);
  };

  const handleExtrairId = (valor: string) => {
    setInputUrlOuId(valor);
    const idExtraido = GoogleSheetsService.extrairSpreadsheetId(valor);
    setSpreadsheetId(idExtraido);
  };

  const handleTestarEConectar = async () => {
    const idLimpo = GoogleSheetsService.extrairSpreadsheetId(inputUrlOuId);
    if (!idLimpo) {
      setStatusMsg({ tipo: 'erro', texto: 'Insira o link completo ou o ID da planilha Google.' });
      return;
    }

    let tokenAtual = token;
    if (!tokenAtual) {
      tokenAtual = await getAccessToken();
    }
    if (!tokenAtual) {
      setStatusMsg({ tipo: 'erro', texto: 'Por favor, conecte-se com sua conta Google primeiro clicando no botão abaixo.' });
      return;
    }

    setTestando(true);
    setStatusMsg(null);
    try {
      const info = await GoogleSheetsService.testarConexao(idLimpo, tokenAtual);
      setSpreadsheetId(info.id);
      setSpreadsheetTitle(info.title);

      const novaConfig: GoogleSheetConfig = {
        spreadsheetId: info.id,
        spreadsheetUrl: inputUrlOuId.includes('http')
          ? inputUrlOuId
          : `https://docs.google.com/spreadsheets/d/${info.id}/edit`,
        spreadsheetTitle: info.title,
        autoSyncAtivo: autoSyncAtivo,
        ultimaSync: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        sincronizadoPor: user?.email || 'Usuário Google'
      };

      await SetupApiService.salvarSheetConfig(novaConfig);
      await GoogleSheetsService.garantirAbas(info.id, tokenAtual);

      setStatusMsg({
        tipo: 'sucesso',
        texto: `Conectado com sucesso à planilha: "${info.title}"! As abas de sincronização foram validadas.`
      });
      onShowToast(`Planilha "${info.title}" conectada!`);
      await aoAtualizarStore();
    } catch (err: any) {
      setStatusMsg({ tipo: 'erro', texto: err.message || 'Erro ao conectar à planilha.' });
    } finally {
      setTestando(false);
    }
  };

  const handleCriarNovaPlanilha = async () => {
    let tokenAtual = token;
    if (!tokenAtual) {
      tokenAtual = await getAccessToken();
    }
    if (!tokenAtual) {
      setStatusMsg({ tipo: 'erro', texto: 'Conecte-se com sua conta Google primeiro para criar uma planilha no seu Drive.' });
      return;
    }

    setCriandoPlanilha(true);
    setStatusMsg(null);
    try {
      const nova = await GoogleSheetsService.criarNovaPlanilhaCNC(
        tokenAtual,
        'Setup Interno CNC - Registros de Produção'
      );

      const urlGerada = `https://docs.google.com/spreadsheets/d/${nova.id}/edit`;
      setInputUrlOuId(urlGerada);
      setSpreadsheetId(nova.id);
      setSpreadsheetTitle(nova.title);

      const novaConfig: GoogleSheetConfig = {
        spreadsheetId: nova.id,
        spreadsheetUrl: urlGerada,
        spreadsheetTitle: nova.title,
        autoSyncAtivo: true,
        ultimaSync: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        sincronizadoPor: user?.email || 'Usuário Google'
      };

      await SetupApiService.salvarSheetConfig(novaConfig);

      // Envia os dados atuais para a planilha recém-criada
      await GoogleSheetsService.sincronizarTudoParaPlanilha(nova.id, tokenAtual, storeData);

      setStatusMsg({
        tipo: 'sucesso',
        texto: `Nova planilha criada com sucesso no seu Google Drive com as abas de produção e dados atuais gravados!`
      });
      onShowToast('Nova planilha Google criada e vinculada com sucesso!');
      await aoAtualizarStore();
    } catch (err: any) {
      setStatusMsg({ tipo: 'erro', texto: err.message || 'Erro ao criar nova planilha.' });
    } finally {
      setCriandoPlanilha(false);
    }
  };

  const handleEnviarTudoParaPlanilha = async () => {
    if (!spreadsheetId) {
      setStatusMsg({ tipo: 'erro', texto: 'Nenhuma planilha vinculada no momento.' });
      return;
    }

    let tokenAtual = token;
    if (!tokenAtual) {
      tokenAtual = await getAccessToken();
    }
    if (!tokenAtual) {
      setStatusMsg({ tipo: 'erro', texto: 'Faça login com sua conta Google para autorizar o envio.' });
      return;
    }

    setSincronizandoUpload(true);
    setStatusMsg(null);
    try {
      const res = await GoogleSheetsService.sincronizarTudoParaPlanilha(spreadsheetId, tokenAtual, storeData);

      const configAtualizada: GoogleSheetConfig = {
        spreadsheetId,
        spreadsheetUrl: inputUrlOuId,
        spreadsheetTitle: spreadsheetTitle || 'Planilha Google CNC',
        autoSyncAtivo,
        ultimaSync: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        sincronizadoPor: user?.email || 'Usuário Google'
      };
      await SetupApiService.salvarSheetConfig(configAtualizada);

      setStatusMsg({ tipo: 'sucesso', texto: res.mensagem });
      onShowToast('Dados enviados para o Google Sheets com sucesso!');
      await aoAtualizarStore();
    } catch (err: any) {
      setStatusMsg({ tipo: 'erro', texto: err.message || 'Erro ao sincronizar com o Google Sheets.' });
    } finally {
      setSincronizandoUpload(false);
    }
  };

  const handleConfirmarPuxarDados = async () => {
    setModalConfirmacaoPuxar(false);
    if (!spreadsheetId) return;

    let tokenAtual = token;
    if (!tokenAtual) {
      tokenAtual = await getAccessToken();
    }
    if (!tokenAtual) {
      setStatusMsg({ tipo: 'erro', texto: 'Faça login com sua conta Google para ler a planilha.' });
      return;
    }

    setPuxandoDados(true);
    setStatusMsg(null);
    try {
      const dadosPlanilha = await GoogleSheetsService.puxarDadosDaPlanilha(spreadsheetId, tokenAtual);

      await SetupApiService.mesclarPlanilha(dadosPlanilha.concluidos, dadosPlanilha.maquinas);

      setStatusMsg({
        tipo: 'sucesso',
        texto: `Dados restaurados da planilha com sucesso! (${dadosPlanilha.concluidos.length} relatórios concluídos e ${dadosPlanilha.maquinas.length} máquinas).`
      });
      onShowToast('Informações restauradas da planilha Google!');
      await aoAtualizarStore();
    } catch (err: any) {
      setStatusMsg({ tipo: 'erro', texto: err.message || 'Erro ao puxar dados da planilha.' });
    } finally {
      setPuxandoDados(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.25)] shrink-0">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black text-white tracking-tight">
                Sincronização em Tempo Real com Planilha Google
              </h3>
              <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                Google Sheets
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Grave todos os setups, máquinas e paradas automaticamente na sua planilha para nunca mais perder informações.
            </p>
          </div>
        </div>

        {/* Google User Status */}
        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2.5 bg-slate-950/80 border border-slate-800 p-2 rounded-xl">
              <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold">
                {user.email ? user.email.charAt(0).toUpperCase() : 'G'}
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-xs font-bold text-white leading-none">{user.displayName || 'Google Conectado'}</p>
                <p className="text-[10px] text-slate-400 truncate max-w-[140px]">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={handleLogoutGoogle}
                className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800 transition"
                title="Desconectar conta Google"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleLoginGoogle}
              disabled={autenticando}
              className="flex items-center gap-2.5 bg-white hover:bg-slate-100 text-slate-900 font-bold px-4 py-2.5 rounded-xl text-xs transition shadow-md active:scale-95 disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{autenticando ? 'Conectando...' : 'Conectar com Google'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Spreadsheet Input and Actions */}
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
            Link ou ID da Planilha Google (Cole a URL do Navegador)
          </label>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Link2 className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={inputUrlOuId}
                onChange={(e) => handleExtrairId(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs... ou ID da planilha"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={handleTestarEConectar}
              disabled={testando || !inputUrlOuId}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition shrink-0 active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testando ? 'animate-spin' : ''}`} />
              <span>{testando ? 'Testando Conexão...' : 'Conectar Planilha'}</span>
            </button>

            <button
              type="button"
              onClick={handleCriarNovaPlanilha}
              disabled={criandoPlanilha}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition shrink-0 active:scale-95"
              title="Cria automaticamente uma planilha nova formatada no seu Drive com as abas certas"
            >
              <PlusCircle className={`w-3.5 h-3.5 ${criandoPlanilha ? 'animate-spin' : ''}`} />
              <span>{criandoPlanilha ? 'Criando no Drive...' : 'Criar Nova Planilha'}</span>
            </button>
          </div>
        </div>

        {/* Current Connection Card */}
        {spreadsheetId && (
          <div className="space-y-3">
            {/* Live Auto-Sync Indicator Banner */}
            <div className="bg-emerald-950/60 border border-emerald-500/50 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
              <div className="flex items-center gap-3">
                <span className="relative flex h-3.5 w-3.5">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${liveSyncStatus.isSyncing ? 'bg-amber-400' : 'bg-emerald-400'} opacity-75`}></span>
                  <span className={`relative inline-flex rounded-full h-3.5 w-3.5 ${liveSyncStatus.isSyncing ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-black text-white">
                      Sincronização em Tempo Real 100% Automática Ativada
                    </p>
                    <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-black uppercase px-2 py-0.5 rounded-full">
                      Automático
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    {liveSyncStatus.isSyncing
                      ? 'Salvando alterações em segundo plano na sua planilha Google...'
                      : liveSyncStatus.lastSyncTime
                      ? `Gravado automaticamente na Planilha Google às ${liveSyncStatus.lastSyncTime}. Qualquer edição no app grava sozinho!`
                      : 'Qualquer alteração feita por qualquer tablet (iniciar setup, paradas, checklists, liberação ou novas máquinas) é gravada na hora na planilha sem precisar clicar em nada!'}
                  </p>
                </div>
              </div>

              {liveSyncStatus.isSyncing && (
                <span className="text-[11px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-full flex items-center gap-1.5 shrink-0 animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  <span>Salvando na planilha...</span>
                </span>
              )}
            </div>

            <div className="bg-slate-950/70 border border-emerald-500/30 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white">
                    {spreadsheetTitle || 'Planilha Vinculada'}
                  </span>
                  <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                    ID: {spreadsheetId}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Última gravação:{' '}
                  <span className="text-slate-200 font-semibold">
                    {liveSyncStatus.lastSyncTime || sheetConfig?.ultimaSync || 'Gravando automaticamente...'}
                  </span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={
                    inputUrlOuId.includes('http')
                      ? inputUrlOuId
                      : `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition border border-slate-700"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                  <span>Abrir no Google Sheets</span>
                </a>

                <button
                  type="button"
                  onClick={handleEnviarTudoParaPlanilha}
                  disabled={sincronizandoUpload}
                  className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition shadow"
                  title="O app já sincroniza tudo automaticamente em tempo real! Use este botão apenas se quiser forçar um envio manual imediato."
                >
                  <UploadCloud className={`w-3.5 h-3.5 ${sincronizandoUpload ? 'animate-bounce text-emerald-400' : 'text-emerald-400'}`} />
                  <span>{sincronizandoUpload ? 'Gravando...' : 'Forçar Envio Agora'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setModalConfirmacaoPuxar(true)}
                  disabled={puxandoDados}
                  className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition shadow"
                >
                  <Download className={`w-3.5 h-3.5 ${puxandoDados ? 'animate-bounce' : ''}`} />
                  <span>{puxandoDados ? 'Lendo...' : 'Puxar da Planilha'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Feedback message */}
        {statusMsg && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 ${
              statusMsg.tipo === 'sucesso'
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                : statusMsg.tipo === 'erro'
                ? 'bg-red-950/60 border-red-500/40 text-red-300'
                : 'bg-blue-950/60 border-blue-500/40 text-blue-300'
            }`}
          >
            {statusMsg.tipo === 'sucesso' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : statusMsg.tipo === 'erro' ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            ) : (
              <Sparkles className="w-4 h-4 shrink-0 text-blue-400" />
            )}
            <span>{statusMsg.texto}</span>
          </div>
        )}

        {/* Architecture explanation banner */}
        <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 text-[11px] text-slate-400 space-y-1.5">
          <div className="flex items-center gap-2 text-slate-200 font-bold">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Como o armazenamento e sincronização funcionam:</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
            <li>
              <strong className="text-slate-300">Gravação em Tempo Real:</strong> Cada finalização de setup, início de máquina ou parada registrada é gravada diretamente na aba <code className="bg-slate-900 px-1 py-0.5 rounded text-emerald-400">SETUPS_CONCLUIDOS</code> da sua planilha Google.
            </li>
            <li>
              <strong className="text-slate-300">Sem perda de histórico:</strong> Se você recarregar a página ou abrir em múltiplos tablets, você pode usar o botão <strong className="text-purple-300">Puxar da Planilha</strong> para recuperar todos os setups salvos e filas cadastradas.
            </li>
            <li>
              <strong className="text-slate-300">Fuso Horário Corrigido:</strong> Todos os carimbos utilizam o fuso de Brasília/São Paulo (UTC-3), garantindo que 15:47 registre 15:47 exato.
            </li>
          </ul>
        </div>
      </div>

      {/* Confirmation Dialog for Destructive / Mutating Operation as per Workspace Guidelines */}
      {modalConfirmacaoPuxar && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Download className="w-6 h-6" />
            </div>

            <div>
              <h4 className="text-base font-bold text-white">Restaurar Informações da Planilha Google?</h4>
              <p className="text-xs text-slate-400 mt-1">
                Isso lerá todos os registros salvos na aba <code className="text-purple-400">SETUPS_CONCLUIDOS</code> e <code className="text-purple-400">MAQUINAS_FILA</code> da planilha Google e mesclará no sistema local. Nenhum dado existente na planilha será apagado.
              </p>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setModalConfirmacaoPuxar(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl text-xs transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmarPuxarDados}
                className="flex-1 bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Confirmar e Restaurar</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
