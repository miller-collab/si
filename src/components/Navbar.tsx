import React from 'react';
import {
  Play,
  Clock,
  BarChart3,
  UserCheck,
  Lock,
  Cog,
  CalendarClock,
  Database,
  Search,
  Cloud
} from 'lucide-react';

interface NavbarProps {
  abaAtiva: 'dashboard' | 'ativos' | 'concluidos' | 'gestor' | 'admin';
  aoMudarAba: (aba: 'dashboard' | 'ativos' | 'concluidos' | 'gestor' | 'admin') => void;
  qtdAtivos: number;
  turnoAtivo: boolean;
  online: boolean;
  shiftScheduleStr: string;
  aoBackupTudo: () => void;
  aoAbrirBusca: () => void;
  aoAbrirReset?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  abaAtiva,
  aoMudarAba,
  qtdAtivos,
  turnoAtivo,
  shiftScheduleStr: _shiftScheduleStr,
  aoBackupTudo,
  aoAbrirBusca
}) => {
  return (
    <nav className="w-20 md:w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between py-5 shadow-2xl z-30 select-none">
      <div>
        {/* Brand Header */}
        <div className="px-4 md:px-6 mb-6 flex items-center justify-center md:justify-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
            <Cog className="w-6 h-6 animate-[spin_10s_linear_infinite]" />
          </div>
          <div className="hidden md:block">
            <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-1.5">
              Setup<span className="text-blue-500">Interno</span>
            </h1>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
              CNC Shop Floor
            </p>
          </div>
        </div>

        {/* Navigation Items */}
        <div className="space-y-1.5 px-2 md:px-3">
          <button
            type="button"
            onClick={() => aoMudarAba('dashboard')}
            className={`w-full flex items-center gap-3.5 px-3 md:px-4 py-3 rounded-xl font-bold text-sm transition-all duration-200 ${
              abaAtiva === 'dashboard'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
            }`}
            title="Iniciar Setup"
          >
            <Play className="w-5 h-5 shrink-0" />
            <span className="hidden md:inline">Iniciar Setup</span>
          </button>

          <button
            type="button"
            onClick={() => aoMudarAba('ativos')}
            className={`w-full flex items-center justify-between px-3 md:px-4 py-3 rounded-xl font-bold text-sm transition-all duration-200 relative ${
              abaAtiva === 'ativos'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
            }`}
            title="Setups Ativos"
          >
            <div className="flex items-center gap-3.5">
              <Clock className="w-5 h-5 shrink-0" />
              <span className="hidden md:inline">Setups Ativos</span>
            </div>
            {qtdAtivos > 0 && (
              <span className="bg-red-500 text-white text-[11px] font-extrabold px-2 py-0.5 rounded-full shadow-md animate-pulse">
                {qtdAtivos}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => aoMudarAba('concluidos')}
            className={`w-full flex items-center gap-3.5 px-3 md:px-4 py-3 rounded-xl font-bold text-sm transition-all duration-200 ${
              abaAtiva === 'concluidos'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
            }`}
            title="Relatórios & Histórico"
          >
            <BarChart3 className="w-5 h-5 shrink-0" />
            <span className="hidden md:inline">Relatórios</span>
          </button>

          <button
            type="button"
            onClick={() => aoMudarAba('gestor')}
            className={`w-full flex items-center gap-3.5 px-3 md:px-4 py-3 rounded-xl font-bold text-sm transition-all duration-200 ${
              abaAtiva === 'gestor'
                ? 'bg-amber-500 text-slate-950 font-black shadow-lg shadow-amber-500/30'
                : 'text-amber-400/90 hover:text-amber-300 hover:bg-amber-500/10'
            }`}
            title="Painel do Gestor"
          >
            <UserCheck className="w-5 h-5 shrink-0" />
            <span className="hidden md:inline">Painel do Gestor</span>
          </button>

          <button
            type="button"
            onClick={() => aoMudarAba('admin')}
            className={`w-full flex items-center gap-3.5 px-3 md:px-4 py-3 rounded-xl font-bold text-sm transition-all duration-200 ${
              abaAtiva === 'admin'
                ? 'bg-slate-800 text-blue-400 border border-blue-500/30 shadow-lg'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
            }`}
            title="Painel do Líder"
          >
            <Lock className="w-5 h-5 shrink-0" />
            <span className="hidden md:inline">Painel do Líder</span>
          </button>
        </div>
      </div>

      {/* Bottom Actions: Backup, Busca, Reset & Status */}
      <div className="px-2 md:px-3 pt-3 border-t border-slate-800/80 space-y-2">
        {/* Botão de BACKUP (Salvar Tudo) */}
        <button
          type="button"
          onClick={aoBackupTudo}
          className="w-full flex items-center justify-between p-2.5 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/40 border border-emerald-500/30 hover:border-emerald-500/60 text-[11px] text-emerald-300 transition group active:scale-95 shadow-sm"
          title="Backup Completo: Salvar tudo no Firebase e baixar arquivo JSON de segurança"
        >
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-400 shrink-0 group-hover:scale-110 transition-transform" />
            <span className="font-bold hidden md:inline">Backup (Salvar Tudo)</span>
          </div>
          <span className="text-[9px] font-bold bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/30 hidden md:inline">
            Salvar
          </span>
        </button>

        {/* Botão de BUSCA (Buscar Gravados) */}
        <button
          type="button"
          onClick={aoAbrirBusca}
          className="w-full flex items-center justify-between p-2.5 rounded-xl bg-blue-950/40 hover:bg-blue-900/40 border border-blue-500/30 hover:border-blue-500/60 text-[11px] text-blue-300 transition group active:scale-95 shadow-sm"
          title="Buscar nos registros gravados por máquina, peça, preparador ou data"
        >
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-blue-400 shrink-0 group-hover:scale-110 transition-transform" />
            <span className="font-bold hidden md:inline">Buscar Registros</span>
          </div>
          <span className="text-[9px] font-bold bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/30 hidden md:inline">
            Filtro
          </span>
        </button>

        {/* Firebase Cloud Storage Status */}
        <div className="hidden md:flex items-center justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-800 text-[10px] text-slate-400">
          <div className="flex items-center gap-1.5 truncate">
            <Cloud className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="truncate font-semibold text-slate-300">Nuvem Firebase</span>
          </div>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
        </div>

        {/* Shift indicator */}
        <div className="hidden md:flex items-center justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-800 text-[10px]">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                turnoAtivo ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
              }`}
            />
            <span className="font-semibold text-slate-300">
              {turnoAtivo ? 'Turno Ativo' : 'Turno Pausado'}
            </span>
          </div>
          <CalendarClock className="w-3.5 h-3.5 text-slate-500" />
        </div>
      </div>
    </nav>
  );
};
