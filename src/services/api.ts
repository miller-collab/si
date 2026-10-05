import type { StoreData, SetupAtivo, TurnoConfig } from '../types';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

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

  public static async pushToFirestore(data: StoreData) {
    try {
      const docRef = doc(db, 'app_state', 'main_store');
      await setDoc(docRef, {
        dataJson: JSON.stringify(data),
        updatedAt: Date.now(),
        totalAtivos: Object.keys(data.setupsAtivos || {}).length,
        totalConcluidos: (data.concluidos || []).length
      });
    } catch (err: any) {
      // Safe catch: never block app if Firestore quota is temporarily reached
      console.warn('Sincronização Firestore mirror:', err?.message || err);
    }
  }

  /**
   * Real-time listener supporting dual transport:
   * 1. Primary: Server-Sent Events (SSE) direct from backend (0ms latency, zero quota limits)
   * 2. Secondary: Cloud Firestore onSnapshot (persists across containers)
   */
  public static listenRealtime(callback: (data: StoreData) => void): () => void {
    let sseSource: EventSource | null = null;
    let isSubscribed = true;

    // 1. Connect to Backend Server-Sent Events stream
    try {
      sseSource = new EventSource('/api/setup/events');
      sseSource.onmessage = (event) => {
        if (!isSubscribed) return;
        try {
          if (event.data && event.data.trim()) {
            const parsed: StoreData = JSON.parse(event.data);
            this.setCache(parsed, false);
            callback(parsed);
          }
        } catch (e) {
          console.warn('Erro ao processar evento SSE:', e);
        }
      };
      sseSource.onerror = () => {
        // SSE automatically reconnects
      };
    } catch (e) {
      console.warn('EventSource indisponível no navegador:', e);
    }

    // 2. Also listen to Firestore as a secondary stream
    let unsubscribeFirestore = () => {};
    try {
      const docRef = doc(db, 'app_state', 'main_store');
      unsubscribeFirestore = onSnapshot(
        docRef,
        (snapshot) => {
          if (!isSubscribed) return;
          if (snapshot.exists()) {
            const raw = snapshot.data();
            if (raw && raw.dataJson) {
              try {
                const parsed: StoreData = JSON.parse(raw.dataJson);
                this.setCache(parsed, false);
                callback(parsed);
              } catch (_) {}
            }
          }
        },
        (error) => {
          console.warn('Firestore snapshot indisponível (usando SSE em tempo real):', error?.message);
        }
      );
    } catch (_) {}

    return () => {
      isSubscribed = false;
      if (sseSource) {
        sseSource.close();
      }
      unsubscribeFirestore();
    };
  }

  public static setCache(data: StoreData, pushCloud: boolean = true) {
    this.cachedData = data;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Erro ao gravar cache local:', e);
    }
    this.notify(data);
    if (pushCloud) {
      this.pushToFirestore(data);
    }
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
      const res = await fetch(`/api/setup/sync?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache'
        }
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data: StoreData = await res.json();
      this.setCache(data, false);
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
    if (json.data) this.setCache(json.data, true);
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
      const err = await res.json().catch(() => ({}));
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
    if (json.data) this.setCache(json.data, true);
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
    if (json.data) this.setCache(json.data, true);
    return json.sucesso;
  }

  public static async toggleSetupExterno(maquinaId: string, senha: string): Promise<void> {
    const res = await fetch('/api/setup/toggle-setup-externo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maquinaId, senha })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Senha incorreta');
    }
    const json = await res.json();
    if (json.data) this.setCache(json.data, true);
  }

  public static async deletarMaquina(maquinaId: string, senha: string): Promise<void> {
    const res = await fetch('/api/setup/deletar-maquina', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maquinaId, senha })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Senha incorreta');
    }
    const json = await res.json();
    if (json.data) this.setCache(json.data, true);
  }

  public static async limparMaquinas(senha: string): Promise<void> {
    const res = await fetch('/api/setup/limpar-maquinas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Senha incorreta');
    }
    const json = await res.json();
    if (json.data) this.setCache(json.data, true);
  }

  public static async deletarPreparador(nome: string, senha: string): Promise<void> {
    const res = await fetch('/api/setup/deletar-preparador', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, senha })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Senha incorreta');
    }
    const json = await res.json();
    if (json.data) this.setCache(json.data, true);
  }

  public static async salvarTarefas(grupo: 'parte1' | 'parte2' | 'pendencias', tarefas: string[], senha: string): Promise<void> {
    const res = await fetch('/api/setup/salvar-tarefas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grupo, tarefas, senha })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Senha incorreta');
    }
    const json = await res.json();
    if (json.data) this.setCache(json.data, true);
  }

  public static async salvarTurno(turnoConfig: TurnoConfig, senha: string): Promise<void> {
    const res = await fetch('/api/setup/turno', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ turnoConfig, senha })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Senha incorreta');
    }
    const json = await res.json();
    if (json.data) this.setCache(json.data, true);
  }

  public static async adicionarMaquina(maquina: string, peca: string): Promise<void> {
    const res = await fetch('/api/setup/adicionar-maquina', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maquina, peca })
    });
    if (!res.ok) throw new Error('Falha ao adicionar máquina');
    const json = await res.json();
    if (json.data) this.setCache(json.data, true);
  }

  public static async adicionarPreparador(nome: string): Promise<void> {
    const res = await fetch('/api/setup/adicionar-preparador', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome })
    });
    if (!res.ok) throw new Error('Falha ao adicionar preparador');
    const json = await res.json();
    if (json.data) this.setCache(json.data, true);
  }

  public static async esvaziarConcluidos(senha?: string): Promise<void> {
    const res = await fetch('/api/setup/esvaziar-concluidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha: senha || '8619' })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao esvaziar registros');
    }
    const json = await res.json();
    if (json.data) {
      this.setCache(json.data, true);
    } else {
      const current = this.getCachedData();
      if (current) {
        this.setCache({ ...current, concluidos: [] }, true);
      }
    }
  }

  public static async carregarDados(backup: any, senha?: string): Promise<void> {
    const res = await fetch('/api/setup/carregar-dados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backup, senha: senha || '8619' })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha ao carregar dados');
    }
    const json = await res.json();
    if (json.data) this.setCache(json.data, true);
  }

  public static async resetDemo(): Promise<void> {
    const res = await fetch('/api/setup/reset-demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error('Falha ao reiniciar demonstração');
    const json = await res.json();
    if (json.data) this.setCache(json.data, true);
  }
}
