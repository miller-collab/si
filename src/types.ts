export interface Maquina {
  id: string;
  maquina: string;
  peca: string;
  setupExternoPronto?: boolean;
}

export interface TurnoConfig {
  dias: string[]; // ["1","2","3","4","5"] (0=Dom, 1=Seg, ..., 6=Sáb)
  inicio: string; // "07:00"
  fim: string;    // "17:00"
}

export interface ParadaEvento {
  id: string;
  timestamp: string;      // "02/10/2026 09:30:15"
  tipo: 'parada' | 'cafe' | 'almoco' | 'info';
  motivo: string;
  inicioMs: number;
  fimMs?: number;
  duracaoMs?: number;
  emAndamento?: boolean;
}

export interface SetupAtivo {
  id: string;
  rowId: string;
  maquina: string;
  peca: string;
  modeloAnterior: string;
  prep1Val: string;
  prep2Val: string;
  dataInicio: string;     // "02/10/2026 às 08:30"
  inicioMs: number;
  lastTick: number;
  tempoDecorridoMs: number;
  deductionsMs: number;
  paradaAtiva: boolean;
  paradaAtual?: ParadaEvento;
  historico: string[];    // ex: ["[02/10/2026 09:15:00] Parada: Quebra de ferramenta", "[02/10/2026 12:00:00] Almoço (-1.5h)"]
  eventos: ParadaEvento[];
  checksStateParte1: boolean[];
  checksStateParte2: boolean[];
  checksStatePendencias: boolean[];
  setupRegistrado: boolean; // True once machine is released and official setup time is locked
  tempoFormatado?: string;  // Final locked time for setup
  tempoSetupMs?: number;
  updatedAt: number;
}

export interface SetupConcluido {
  id: string;
  data: string;           // "02/10/2026 11:45"
  timestamp: number;
  maquina: string;
  peca: string;
  modeloAnterior: string;
  prep1: string;
  prep2: string;
  tempo: string;          // "01:45:20"
  tempoMs: number;
  historico: string;
  eventos?: ParadaEvento[];
  pendenciasConcluidas: boolean;
  segundosCalculados?: number;
}

export interface GoogleSheetConfig {
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle?: string;
  autoSyncAtivo: boolean;
  ultimaSync?: string;
  sincronizadoPor?: string;
}

export interface StoreData {
  maquinas: Maquina[];
  preparadores: string[];
  tarefas1: string[];
  tarefas2: string[];
  tarefasPendencias: string[];
  turnoConfig: TurnoConfig;
  setupsAtivos: Record<string, SetupAtivo>;
  concluidos: SetupConcluido[];
  serverTime?: number;
  sheetConfig?: GoogleSheetConfig;
}
