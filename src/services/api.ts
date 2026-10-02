import type { StoreData, SetupAtivo, TurnoConfig } from '../types';

const STORAGE_KEY = 'setup_interno_local_cache';

export class SetupApiService {
  private static cachedData: StoreData | null = null;
  private static listeners: Array<(data: StoreData) => void> = [];

  public static getCachedData(): StoreData | null {
    if (this.cachedData) return this.cachedData;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        this.cachedData = JSON.parse(saved);
        return this.cachedData;
      }
    } catch (e) {
      console.warn('Erro ao ler cache local:', e);
    }
    return null;
  }

  public static setCache(data: StoreData) {
    this.cachedData = data;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Erro ao gravar cache local:', e);
    }
    this.notify(data);
  }

  public static subscribe(listener: (data: StoreData) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private static notify(data: StoreData) {
    this.listeners.forEach(l => {
      try {
        l(data);
      } catch (err) {
        console.error('Erro em listener do SetupApiService:', err);
      }
    });
  }

  public static async fetchSync(): Promise<StoreData> {
    try {
      const res = await fetch('/api/setup/sync');
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data: StoreData = await res.json();
      this.setCache(data);
      return data;
    } catch (err) {
      const cached = this.getCachedData();
      if (cached) return cached;
      throw err;
    }
  }

  public static async iniciarSetup(rowId: string, maquina: string, peca: string, modeloAnterior: string): Promise<SetupAtivo> {
    const agora = Date.now();
    const d = new Date(agora);
    const dataInicioStr = `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

    const res = await fetch('/api/setup/iniciar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rowId,
        maquina,
        peca,
        modeloAnterior,
        inicioMs: agora,
        dataInicio: dataInicioStr
      })
    });
    if (!res.ok) throw new Error('Falha ao iniciar setup');
    const json = await res.json();
    if (json.data) this.setCache(json.data);
    return json.setup;
  }

  public static async autoSaveCard(
    id: string,
    prep1Val?: string,
    prep2Val?: string,
    checksParte1?: boolean[],
    checksParte2?: boolean[],
    checksPendencias?: boolean[],
    tempoDecorridoMs?: number
  ): Promise<SetupAtivo> {
    const res = await fetch('/api/setup/auto-save-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, prep1Val, prep2Val, checksParte1, checksParte2, checksPendencias, tempoDecorridoMs })
    });
    if (!res.ok) throw new Error('Falha ao salvar automaticamente');
    const json = await res.json();
    return json.setup;
  }

  public static async aplicarDesconto(id: string, tipo: 'cafe' | 'almoco'): Promise<SetupAtivo> {
    const res = await fetch('/api/setup/desconto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, tipo })
    });
    if (!res.ok) throw new Error('Falha ao aplicar desconto');
    const json = await res.json();
    return json.setup;
  }

  public static async iniciarParada(id: string, motivo: string = ''): Promise<SetupAtivo> {
    const res = await fetch('/api/setup/iniciar-parada', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, motivo })
    });
    if (!res.ok) throw new Error('Falha ao iniciar parada');
    const json = await res.json();
    return json.setup;
  }

  public static async finalizarParada(id: string, motivo: string): Promise<SetupAtivo> {
    const res = await fetch('/api/setup/finalizar-parada', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, motivo })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Falha ao finalizar parada');
    }
    const json = await res.json();
    return json.setup;
  }

  public static async liberarMaquina(
    id: string,
    prep1: string,
    prep2: string,
    tempoFormatado: string,
    tempoMs: number
  ): Promise<any> {
    const res = await fetch('/api/setup/liberar-maquina', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, prep1, prep2, tempoFormatado, tempoMs })
    });
    if (!res.ok) throw new Error('Falha ao liberar máquina');
    const json = await res.json();
    if (json.data) this.setCache(json.data);
    return json;
  }

  public static async encerrarPendencias(id: string): Promise<boolean> {
    const res = await fetch('/api/setup/encerrar-pendencias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    if (!res.ok) throw new Error('Falha ao encerrar pendências');
    const json = await res.json();
    if (json.data) this.setCache(json.data);
    return json.sucesso;
  }

  public static async toggleSetupExterno(maquinaId: string, senha: string): Promise<void> {
    const res = await fetch('/api/setup/toggle-setup-externo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maquinaId, senha })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Senha incorreta');
    }
    const json = await res.json();
    if (json.data) this.setCache(json.data);
  }

  public static async deletarMaquina(maquinaId: string, senha: string): Promise<void> {
    const res = await fetch('/api/setup/deletar-maquina', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maquinaId, senha })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Senha incorreta');
    }
    const json = await res.json();
    if (json.data) this.setCache(json.data);
  }

  public static async limparMaquinas(senha: string): Promise<void> {
    const res = await fetch('/api/setup/limpar-maquinas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Senha incorreta');
    }
    const json = await res.json();
    if (json.data) this.setCache(json.data);
  }

  public static async deletarPreparador(nome: string, senha: string): Promise<void> {
    const res = await fetch('/api/setup/deletar-preparador', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, senha })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Senha incorreta');
    }
    const json = await res.json();
    if (json.data) this.setCache(json.data);
  }

  public static async salvarTarefas(grupo: 'parte1' | 'parte2' | 'pendencias', tarefas: string[], senha: string): Promise<void> {
    const res = await fetch('/api/setup/salvar-tarefas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grupo, tarefas, senha })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Senha incorreta');
    }
    const json = await res.json();
    if (json.data) this.setCache(json.data);
  }

  public static async salvarTurno(turnoConfig: TurnoConfig, senha: string): Promise<void> {
    const res = await fetch('/api/setup/turno', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ turnoConfig, senha })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Senha incorreta');
    }
    const json = await res.json();
    if (json.data) this.setCache(json.data);
  }

  public static async adicionarMaquina(maquina: string, peca: string): Promise<void> {
    const res = await fetch('/api/setup/adicionar-maquina', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maquina, peca })
    });
    if (!res.ok) throw new Error('Falha ao adicionar máquina');
    const json = await res.json();
    if (json.data) this.setCache(json.data);
  }

  public static async adicionarPreparador(nome: string): Promise<void> {
    const res = await fetch('/api/setup/adicionar-preparador', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome })
    });
    if (!res.ok) throw new Error('Falha ao adicionar preparador');
    const json = await res.json();
    if (json.data) this.setCache(json.data);
  }

  public static async resetDemo(): Promise<void> {
    const res = await fetch('/api/setup/reset-demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error('Falha ao reiniciar demonstração');
    const json = await res.json();
    if (json.data) this.setCache(json.data);
  }
}
