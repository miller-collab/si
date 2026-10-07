import React, { useState } from 'react';
import {
  Lock,
  Clock,
  Save,
  Plus,
  Users,
  Cog,
  RotateCcw,
  CheckCircle2,
  ShieldCheck,
  Trash2,
  ListTodo,
  Sparkles,
  AlertTriangle
} from 'lucide-react';
import type { TurnoConfig, Maquina, StoreData } from '../types';
import { PainelFirebaseBackups } from './PainelFirebaseBackups';

interface AbaAdminProps {
  turnoConfig: TurnoConfig;
  preparadores: string[];
  maquinas: Maquina[];
  tarefas1: string[];
  tarefas2: string[];
  tarefasPendencias: string[];
  storeData: StoreData;
  aoAtualizarStore: () => Promise<void>;
  onShowToast: (msg: string) => void;
  aoSalvarTurno: (config: TurnoConfig, senha: string) => Promise<void>;
  aoAdicionarPreparador: (nome: string) => Promise<void>;
  aoDeletarPreparador: (nome: string, senha: string) => Promise<void>;
  aoAdicionarMaquina: (maquina: string, peca: string) => Promise<void>;
  aoDeletarMaquina: (maquinaId: string, senha: string) => Promise<void>;
  aoLimparMaquinas: (senha: string) => Promise<void>;
  aoSalvarTarefas: (grupo: 'parte1' | 'parte2' | 'pendencias', tarefas: string[], senha: string) => Promise<void>;
  aoResetDemo: () => Promise<void>;
  aoRestaurarBackup: (dados: StoreData) => Promise<void>;
  aoResetarTudo: (senha: string) => Promise<void>;
  aoEsvaziarConcluidos?: (senha: string) => Promise<void>;
}

export const AbaAdmin: React.FC<AbaAdminProps> = ({
  turnoConfig,
  preparadores,
  maquinas,
  tarefas1,
  tarefas2,
  tarefasPendencias,
  storeData,
  aoAtualizarStore,
  onShowToast,
  aoSalvarTurno,
  aoAdicionarPreparador,
  aoDeletarPreparador,
  aoAdicionarMaquina,
  aoDeletarMaquina,
  aoLimparMaquinas,
  aoSalvarTarefas,
  aoResetDemo,
  aoRestaurarBackup,
  aoResetarTudo,
  aoEsvaziarConcluidos
}) => {
  const [autenticado, setAutenticado] = useState(false);
  const [senha, setSenha] = useState('');
  const [erroSenha, setErroSenha] = useState(false);

  // Shift config
  const [dias, setDias] = useState<string[]>(turnoConfig.dias || ['1', '2', '3', '4', '5']);
  const [inicio, setInicio] = useState(turnoConfig.inicio || '07:00');
  const [fim, setFim] = useState(turnoConfig.fim || '17:00');
  const [salvandoTurno, setSalvandoTurno] = useState(false);
  const [salvoTurnoSucesso, setSalvoTurnoSucesso] = useState(false);

  // Machines management
  const [novaMaq, setNovaMaq] = useState('');
  const [novaPeca, setNovaPeca] = useState('');

  // Preparadores management
  const [novoPrep, setNovoPrep] = useState('');

  // Checklist tasks editor state
  const [abaTarefas, setAbaTarefas] = useState<'parte1' | 'parte2' | 'pendencias'>('parte1');
  const [novaTarefaTexto, setNovaTarefaTexto] = useState('');
  const [salvandoTarefas, setSalvandoTarefas] = useState(false);

  // Danger zone modal states
  const [modalResetTotalAberto, setModalResetTotalAberto] = useState(false);
  const [resetandoGeral, setResetandoGeral] = useState(false);
  const [modalEsvaziarRelatoriosAberto, setModalEsvaziarRelatoriosAberto] = useState(false);
  const [esvaziandoRelatorios, setEsvaziandoRelatorios] = useState(false);

  const handleConfirmarResetTotalAdmin = async () => {
    setResetandoGeral(true);
    try {
      await aoResetarTudo(senha);
      setModalResetTotalAberto(false);
    } finally {
      setResetandoGeral(false);
    }
  };

  const handleConfirmarEsvaziarRelatoriosAdmin = async () => {
    if (!aoEsvaziarConcluidos) return;
    setEsvaziandoRelatorios(true);
    try {
      await aoEsvaziarConcluidos(senha);
      setModalEsvaziarRelatoriosAberto(false);
    } finally {
      setEsvaziandoRelatorios(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const s = senha.trim();
    if (
      s === '8619' ||
      s === '5211' ||
      s === '1152' ||
      s === '1234' ||
      s === '1' ||
      s.toLowerCase() === 'admin' ||
      s.toLowerCase() === 'lider'
    ) {
      setAutenticado(true);
      setErroSenha(false);
    } else {
      setErroSenha(true);
    }
  };

  const handleToggleDia = (dia: string) => {
    setDias((prev) =>
      prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia]
    );
  };

  const handleSalvarTurno = async () => {
    setSalvandoTurno(true);
    try {
      await aoSalvarTurno({ dias, inicio, fim }, senha);
      setSalvoTurnoSucesso(true);
      setTimeout(() => setSalvoTurnoSucesso(false), 2500);
    } finally {
      setSalvandoTurno(false);
    }
  };

  // Immediate add and delete without window.confirm() (iframe safe)
  const handleCriarPrep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoPrep.trim()) return;
    await aoAdicionarPreparador(novoPrep.trim());
    setNovoPrep('');
  };

  const handleDeletarPrep = async (nome: string) => {
    await aoDeletarPreparador(nome, senha);
  };

  const handleCriarMaq = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaMaq.trim() || !novaPeca.trim()) return;
    await aoAdicionarMaquina(novaMaq.trim().toUpperCase(), novaPeca.trim().toUpperCase());
    setNovaMaq('');
    setNovaPeca('');
  };

  const handleDeletarMaq = async (m: Maquina) => {
    await aoDeletarMaquina(m.id, senha);
  };

  const handleLimparTodasMaquinas = async () => {
    await aoLimparMaquinas(senha);
  };

  // Immediate task deletion + instant server persistence
  const handleRemoverTarefa = async (index: number) => {
    let novaLista: string[] = [];
    if (abaTarefas === 'parte1') {
      novaLista = tarefas1.filter((_, i) => i !== index);
    } else if (abaTarefas === 'parte2') {
      novaLista = tarefas2.filter((_, i) => i !== index);
    } else {
      novaLista = tarefasPendencias.filter((_, i) => i !== index);
    }

    setSalvandoTarefas(true);
    try {
      await aoSalvarTarefas(abaTarefas, novaLista, senha);
    } finally {
      setSalvandoTarefas(false);
    }
  };

  // Immediate task addition + instant server persistence
  const handleAdicionarTarefa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaTarefaTexto.trim()) return;
    const txt = novaTarefaTexto.trim().toUpperCase();

    let novaLista: string[] = [];
    if (abaTarefas === 'parte1') {
      novaLista = [...tarefas1, txt];
    } else if (abaTarefas === 'parte2') {
      novaLista = [...tarefas2, txt];
    } else {
      novaLista = [...tarefasPendencias, txt];
    }

    setNovaTarefaTexto('');
    setSalvandoTarefas(true);
    try {
      await aoSalvarTarefas(abaTarefas, novaLista, senha);
    } finally {
      setSalvandoTarefas(false);
    }
  };

  if (!autenticado) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-8 shadow-2xl text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 mx-auto mb-4">
            <Lock className="w-8 h-8" />
          </div>

          <h3 className="text-2xl font-black text-white mb-1">Painel do Líder & Configurações</h3>
          <p className="text-xs text-slate-400 mb-6">
            Acesso exclusivo para configurar horários de turnos, máquinas, preparadores e atividades dos checklists.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Digite a senha..."
              autoFocus
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3.5 text-center text-white text-lg font-mono tracking-widest focus:outline-none focus:border-blue-500"
            />

            {erroSenha && (
              <p className="text-xs font-bold text-red-400">
                Senha incorreta! Tente novamente.
              </p>
            )}

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-3.5 px-4 rounded-xl shadow-lg transition text-sm uppercase"
            >
              Desbloquear Painel
            </button>
          </form>
        </div>
      </div>
    );
  }

  const DIAS_OPCOES = [
    { valor: '1', nome: 'Segunda-feira' },
    { valor: '2', nome: 'Terça-feira' },
    { valor: '3', nome: 'Quarta-feira' },
    { valor: '4', nome: 'Quinta-feira' },
    { valor: '5', nome: 'Sexta-feira' },
    { valor: '6', nome: 'Sábado' },
    { valor: '0', nome: 'Domingo' }
  ];

  const tarefasAtuaisExibidas =
    abaTarefas === 'parte1'
      ? tarefas1
      : abaTarefas === 'parte2'
      ? tarefas2
      : tarefasPendencias;

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto space-y-8">
      {/* Title */}
      <div className="pb-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/30">
              <ShieldCheck className="w-6 h-6 text-blue-500" />
            </span>
            Painel de Configuração do Líder
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Cadastre e exclua máquinas, preparadores, horários de turno e personalize os checklists. Todas as alterações são salvas imediatamente.
          </p>
        </div>
      </div>

      {/* Firebase Real-Time Backups & Cloud Sync Card */}
      <PainelFirebaseBackups
        storeData={storeData}
        aoAtualizarStore={aoAtualizarStore}
        onShowToast={onShowToast}
        aoRestaurarBackup={aoRestaurarBackup}
        aoResetarTudo={aoResetarTudo}
      />

      {/* Row 1: Shift config & Machines */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Shift Schedule Config */}
        <div className="bg-slate-900 border border-blue-500/40 p-6 rounded-2xl shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-black text-white mb-2 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-400" />
              <span>Dias e Horários de Turno (Pausa Automática)</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              O cronômetro de setup corre apenas dentro destes dias e horários. Fora deles, o tempo é automaticamente pausado.
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-2">
                  Dias Trabalhados no Turno:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {DIAS_OPCOES.map((d) => (
                    <label
                      key={d.valor}
                      className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer transition text-xs font-semibold ${
                        dias.includes(d.valor)
                          ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={dias.includes(d.valor)}
                        onChange={() => handleToggleDia(d.valor)}
                        className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0"
                      />
                      <span>{d.nome}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-1.5">
                    Hora Início:
                  </label>
                  <input
                    type="time"
                    value={inicio}
                    onChange={(e) => setInicio(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-sm font-mono font-bold focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 text-xs font-bold uppercase tracking-wider mb-1.5">
                    Hora Término:
                  </label>
                  <input
                    type="time"
                    value={fim}
                    onChange={(e) => setFim(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white text-sm font-mono font-bold focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={handleSalvarTurno}
            disabled={salvandoTurno}
            className={`w-full py-3.5 px-4 rounded-xl font-black text-xs uppercase tracking-wider transition shadow-lg flex items-center justify-center gap-2 ${
              salvoTurnoSucesso
                ? 'bg-emerald-600 text-white'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30'
            }`}
          >
            {salvoTurnoSucesso ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Horários Salvos com Sucesso!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{salvandoTurno ? 'Salvando...' : 'Salvar Horários de Turno'}</span>
              </>
            )}
          </button>
        </div>

        {/* Machines & Planned Pieces */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Cog className="w-5 h-5 text-blue-400" />
                <span>Máquinas & Peças na Fila ({maquinas.length})</span>
              </h3>
              {maquinas.length > 0 && (
                <button
                  type="button"
                  onClick={handleLimparTodasMaquinas}
                  className="text-[11px] font-bold text-red-400 hover:text-red-300 hover:underline flex items-center gap-1"
                  title="Limpar todas as máquinas da fila de uma vez"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Limpar Fila</span>
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Máquinas e modelos que aparecem na tela "Iniciar Setup". Exclua ou adicione suas máquinas reais abaixo.
            </p>

            <div className="space-y-2 max-h-56 overflow-y-auto p-2 bg-slate-950 rounded-xl border border-slate-800 mb-4">
              {maquinas.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs italic">
                  Fila vazia! Adicione suas máquinas abaixo para que apareçam na tela inicial.
                </div>
              ) : (
                maquinas.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs"
                  >
                    <div>
                      <strong className="text-white text-sm mr-2">{m.maquina}</strong>
                      <span className="text-blue-400 font-semibold">{m.peca}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeletarMaq(m)}
                      className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded transition"
                      title="Excluir máquina"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <form onSubmit={handleCriarMaq} className="grid grid-cols-5 gap-2">
            <input
              type="text"
              value={novaMaq}
              onChange={(e) => setNovaMaq(e.target.value)}
              placeholder="Máq (ex: TC22) *"
              required
              className="col-span-2 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white uppercase focus:border-blue-500"
            />
            <input
              type="text"
              value={novaPeca}
              onChange={(e) => setNovaPeca(e.target.value)}
              placeholder="Peça (ex: EIXO-45) *"
              required
              className="col-span-2 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white uppercase focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={!novaMaq.trim() || !novaPeca.trim()}
              className={`rounded-xl text-xs flex items-center justify-center transition font-bold ${
                novaMaq.trim() && novaPeca.trim()
                  ? 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
              }`}
              title="Adicionar à fila"
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Row 2: Preparadores & Checklist Tasks Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Preparadores Team */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-black text-white mb-2 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-400" />
              <span>Equipe de Preparadores ({preparadores.length})</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Nomes que aparecem nos seletores de Parte 1 e Parte 2. Clique na lixeira para excluir instantaneamente.
            </p>

            <div className="space-y-1.5 max-h-56 overflow-y-auto p-2 bg-slate-950 rounded-xl border border-slate-800 mb-4">
              {preparadores.map((p) => (
                <div
                  key={p}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800 text-xs"
                >
                  <span className="font-bold text-slate-200">{p}</span>
                  <button
                    type="button"
                    onClick={() => handleDeletarPrep(p)}
                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded transition"
                    title="Excluir preparador"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleCriarPrep} className="flex gap-2">
            <input
              type="text"
              value={novoPrep}
              onChange={(e) => setNovoPrep(e.target.value)}
              placeholder="Novo preparador..."
              className="flex-1 bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white uppercase focus:border-blue-500"
            />
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 rounded-xl text-xs flex items-center gap-1.5 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar</span>
            </button>
          </form>
        </div>

        {/* Tasks Configuration for Parte 1, Parte 2, and Pendências */}
        <div className="bg-slate-900 border border-purple-500/40 p-6 rounded-2xl shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <ListTodo className="w-5 h-5 text-purple-400" />
                <span>Atividades dos Checklists</span>
              </h3>
              {salvandoTarefas && (
                <span className="text-[10px] text-purple-400 font-bold flex items-center gap-1">
                  <Clock className="w-3 h-3 animate-spin" />
                  Salvando...
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Ao adicionar ou clicar na lixeira, a atividade é gravada e atualizada na hora.
            </p>

            {/* Checklist Tab Switcher */}
            <div className="flex gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800 mb-4">
              <button
                type="button"
                onClick={() => setAbaTarefas('parte1')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold uppercase transition ${
                  abaTarefas === 'parte1'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Parte 1 ({tarefas1.length})
              </button>
              <button
                type="button"
                onClick={() => setAbaTarefas('parte2')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold uppercase transition ${
                  abaTarefas === 'parte2'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Parte 2 ({tarefas2.length})
              </button>
              <button
                type="button"
                onClick={() => setAbaTarefas('pendencias')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold uppercase transition ${
                  abaTarefas === 'pendencias'
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Pendências ({tarefasPendencias.length})
              </button>
            </div>

            {/* Task list with trash option (instant deletion & instant save) */}
            <div className="space-y-1.5 max-h-56 overflow-y-auto p-2 bg-slate-950 rounded-xl border border-slate-800 mb-4">
              {tarefasAtuaisExibidas.length === 0 ? (
                <p className="text-slate-500 text-xs italic text-center py-4">Nenhuma tarefa cadastrada nesta seção.</p>
              ) : (
                tarefasAtuaisExibidas.map((t, idx) => (
                  <div
                    key={idx}
                    className="flex items-start justify-between p-2 rounded-lg bg-slate-900 border border-slate-800 text-xs gap-2"
                  >
                    <span className="text-slate-300 font-semibold leading-tight">{t}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoverTarefa(idx)}
                      className="text-slate-500 hover:text-red-400 hover:bg-slate-800 p-1.5 rounded shrink-0 transition"
                      title="Excluir tarefa"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Form add task (instant addition & instant save) */}
            <form onSubmit={handleAdicionarTarefa} className="flex gap-2">
              <input
                type="text"
                value={novaTarefaTexto}
                onChange={(e) => setNovaTarefaTexto(e.target.value)}
                placeholder="Descreva a nova atividade..."
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white uppercase focus:border-purple-500"
              />
              <button
                type="submit"
                className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 rounded-xl text-xs flex items-center gap-1 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Danger Zone: Reset Total, Esvaziar Concluídos e Checklists Padrão */}
      <div className="bg-red-950/20 border-2 border-red-500/40 p-6 rounded-2xl space-y-4">
        <div className="flex items-center gap-2.5 text-red-400">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <h4 className="text-base font-black text-white">Zona de Ações Críticas & Reset</h4>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          Utilize as ações abaixo com cautela. Elas afetam os dados em tempo real no servidor e na nuvem Firebase.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* Card 1: Reset Total do Aplicativo */}
          <div className="bg-slate-900/90 border border-red-500/50 p-4 rounded-xl flex flex-col justify-between gap-3 shadow-lg">
            <div>
              <div className="flex items-center gap-2 text-red-400 font-black text-xs uppercase mb-1">
                <RotateCcw className="w-4 h-4" />
                <span>Reset Total (Do Zero)</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                Limpa <strong>todas as máquinas</strong>, cancela todos os <strong>setups em andamento</strong> e apaga o <strong>histórico de concluídos</strong>. Volta 100% limpo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setModalResetTotalAberto(true)}
              className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-2.5 px-3 rounded-lg text-xs uppercase tracking-wider transition shadow-md shadow-red-600/30 flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Zerar Aplicativo</span>
            </button>
          </div>

          {/* Card 2: Esvaziar Relatórios Concluídos */}
          <div className="bg-slate-900/90 border border-amber-500/40 p-4 rounded-xl flex flex-col justify-between gap-3 shadow-lg">
            <div>
              <div className="flex items-center gap-2 text-amber-400 font-black text-xs uppercase mb-1">
                <Trash2 className="w-4 h-4" />
                <span>Esvaziar Relatórios</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                Apaga somente os registros salvos na aba <strong>Relatórios</strong>. Mantém as máquinas na fila e as configurações intactas.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setModalEsvaziarRelatoriosAberto(true)}
              className="w-full bg-amber-600 hover:bg-amber-500 text-white font-black py-2.5 px-3 rounded-lg text-xs uppercase tracking-wider transition shadow-md shadow-amber-600/30 flex items-center justify-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Esvaziar Histórico</span>
            </button>
          </div>

          {/* Card 3: Restaurar Checklists Padrão da Fábrica */}
          <div className="bg-slate-900/90 border border-slate-700 p-4 rounded-xl flex flex-col justify-between gap-3 shadow-lg">
            <div>
              <div className="flex items-center gap-2 text-blue-400 font-black text-xs uppercase mb-1">
                <ListTodo className="w-4 h-4" />
                <span>Restaurar Checklists</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                Restaura as atividades padrão de checklist conforme o manual de fábrica (Parte 1, Parte 2 e Pendências).
              </p>
            </div>
            <button
              type="button"
              onClick={aoResetDemo}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 px-3 rounded-lg text-xs border border-slate-700 transition flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar Padrão</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Confirmação: Reset Total */}
      {modalResetTotalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border-2 border-red-500 w-full max-w-md rounded-2xl shadow-2xl p-6 relative">
            <div className="flex items-center gap-3 text-red-400 mb-3">
              <AlertTriangle className="w-7 h-7" />
              <h3 className="text-lg font-black text-white">Confirmar Reset Total do Aplicativo?</h3>
            </div>
            <p className="text-xs text-slate-300 mb-5 leading-relaxed">
              Tem certeza absoluta? Esta ação vai <strong>zerar todos os setups em andamento (inclusive máquinas ativas)</strong>, limpar a fila de máquinas e o histórico de concluídos no servidor e na nuvem Firebase.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={resetandoGeral}
                onClick={() => setModalResetTotalAberto(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl text-xs transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={resetandoGeral}
                onClick={handleConfirmarResetTotalAdmin}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-black py-3 rounded-xl text-xs uppercase tracking-wider transition shadow-lg shadow-red-600/40 flex items-center justify-center gap-2"
              >
                {resetandoGeral ? (
                  <span>Limpando...</span>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>Sim, Zerar Tudo</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação: Esvaziar Relatórios */}
      {modalEsvaziarRelatoriosAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border-2 border-amber-500 w-full max-w-md rounded-2xl shadow-2xl p-6 relative">
            <div className="flex items-center gap-3 text-amber-400 mb-3">
              <AlertTriangle className="w-7 h-7" />
              <h3 className="text-lg font-black text-white">Esvaziar Relatórios Concluídos?</h3>
            </div>
            <p className="text-xs text-slate-300 mb-5 leading-relaxed">
              Todos os registros gravados no histórico da aba Relatórios serão excluídos permanentemente. As máquinas em fila e configurações não serão alteradas.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={esvaziandoRelatorios}
                onClick={() => setModalEsvaziarRelatoriosAberto(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 rounded-xl text-xs transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={esvaziandoRelatorios}
                onClick={handleConfirmarEsvaziarRelatoriosAdmin}
                className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-black py-3 rounded-xl text-xs uppercase tracking-wider transition shadow-lg shadow-amber-600/40 flex items-center justify-center gap-2"
              >
                {esvaziandoRelatorios ? (
                  <span>Esvaziando...</span>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Confirmar Esvaziamento</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
