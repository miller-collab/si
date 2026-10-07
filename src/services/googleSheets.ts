import type { StoreData, SetupConcluido, SetupAtivo, Maquina } from '../types';

export interface SheetInfo {
  id: string;
  title: string;
  sheets: string[];
}

export interface SheetSyncStatus {
  isSyncing: boolean;
  lastSyncTime: string | null;
  lastError: string | null;
}

export class GoogleSheetsService {
  private static abasValidadasIds = new Set<string>();
  private static isSyncing = false;
  private static pendingSyncStore: StoreData | null = null;
  private static listeners: Array<(status: SheetSyncStatus) => void> = [];
  private static lastSyncTime: string | null = null;
  private static lastError: string | null = null;

  public static subscribeStatus(listener: (status: SheetSyncStatus) => void) {
    this.listeners.push(listener);
    listener({
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      lastError: this.lastError
    });
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private static notifyStatus() {
    this.listeners.forEach((l) => {
      try {
        l({
          isSyncing: this.isSyncing,
          lastSyncTime: this.lastSyncTime,
          lastError: this.lastError
        });
      } catch (e) {
        console.error(e);
      }
    });
  }

  /**
   * Extrai o ID da planilha do Google Sheets de um link completo ou ID direto
   */
  public static extrairSpreadsheetId(input: string): string {
    if (!input) return '';
    const trimmed = input.trim();
    // Ex: https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit...
    const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      return match[1];
    }
    // Se já for o ID puro (sem barras)
    if (/^[a-zA-Z0-9-_]{15,}$/.test(trimmed)) {
      return trimmed;
    }
    return trimmed;
  }

  /**
   * Testa a conexão com uma planilha existente e obtém informações das abas
   */
  public static async testarConexao(spreadsheetId: string, token: string): Promise<SheetInfo> {
    const cleanId = this.extrairSpreadsheetId(spreadsheetId);
    if (!cleanId) {
      throw new Error('ID ou Link da Planilha inválido.');
    }

    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${cleanId}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('Planilha não encontrada. Verifique se o ID ou link está correto.');
      }
      if (res.status === 403) {
        throw new Error('Acesso negado. Certifique-se de que sua conta Google tem permissão de edição nesta planilha.');
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Erro ao acessar planilha (${res.status})`);
    }

    const data = await res.json();
    const sheets = (data.sheets || []).map((s: any) => s.properties?.title).filter(Boolean);

    return {
      id: cleanId,
      title: data.properties?.title || 'Planilha Google',
      sheets
    };
  }

  /**
   * Cria uma nova planilha formatada no Google Drive do usuário com as abas corretas
   */
  public static async criarNovaPlanilhaCNC(token: string, titulo: string = 'Setup Interno CNC - Registros'): Promise<SheetInfo> {
    const body = {
      properties: {
        title: titulo
      },
      sheets: [
        {
          properties: {
            title: 'SETUPS_CONCLUIDOS',
            gridProperties: { frozenRowCount: 1 }
          }
        },
        {
          properties: {
            title: 'MAQUINAS_FILA',
            gridProperties: { frozenRowCount: 1 }
          }
        },
        {
          properties: {
            title: 'SETUPS_ATIVOS',
            gridProperties: { frozenRowCount: 1 }
          }
        }
      ]
    };

    const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Erro ao criar nova planilha no Google Drive');
    }

    const created = await res.json();
    const spreadsheetId = created.spreadsheetId;

    // Inicializar os cabeçalhos das abas
    await this.inicializarCabecalhos(spreadsheetId, token);

    return {
      id: spreadsheetId,
      title: created.properties?.title || titulo,
      sheets: ['SETUPS_CONCLUIDOS', 'MAQUINAS_FILA', 'SETUPS_ATIVOS']
    };
  }

  /**
   * Garante que as abas necessárias existam na planilha informada
   */
  public static async garantirAbas(spreadsheetId: string, token: string): Promise<void> {
    const info = await this.testarConexao(spreadsheetId, token);
    const abasNecessarias = ['SETUPS_CONCLUIDOS', 'MAQUINAS_FILA', 'SETUPS_ATIVOS'];
    const abasFaltantes = abasNecessarias.filter(aba => !info.sheets.includes(aba));

    if (abasFaltantes.length > 0) {
      const requests = abasFaltantes.map(title => ({
        addSheet: {
          properties: {
            title,
            gridProperties: { frozenRowCount: 1 }
          }
        }
      }));

      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requests })
      });
    }

    await this.inicializarCabecalhos(spreadsheetId, token);
  }

  /**
   * Escreve os cabeçalhos padrão caso as abas estejam vazias
   */
  private static async inicializarCabecalhos(spreadsheetId: string, token: string): Promise<void> {
    const headersConcluidos = [
      'Data/Hora',
      'Máquina',
      'Peça/Modelo',
      'Modelo Anterior',
      'Preparador 1',
      'Preparador 2',
      'Tempo de Setup',
      'Tempo (ms)',
      'Pendências Concluídas',
      'Histórico de Paradas e Intercorrências',
      'ID Registro'
    ];

    const headersMaquinas = [
      'ID',
      'Máquina',
      'Peça',
      'Setup Externo Pronto',
      'Status'
    ];

    const headersAtivos = [
      'ID',
      'Máquina',
      'Peça',
      'Modelo Anterior',
      'Prep 1',
      'Prep 2',
      'Data Início',
      'Tempo Decorrido',
      'Status Parada',
      'Última Atualização'
    ];

    const data = [
      {
        range: 'SETUPS_CONCLUIDOS!A1:K1',
        values: [headersConcluidos]
      },
      {
        range: 'MAQUINAS_FILA!A1:E1',
        values: [headersMaquinas]
      },
      {
        range: 'SETUPS_ATIVOS!A1:J1',
        values: [headersAtivos]
      }
    ];

    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data
      })
    });
  }

  /**
   * Registra um setup concluído instantaneamente na aba SETUPS_CONCLUIDOS
   */
  public static async registrarSetupConcluido(
    spreadsheetId: string,
    token: string,
    setup: SetupConcluido
  ): Promise<boolean> {
    const cleanId = this.extrairSpreadsheetId(spreadsheetId);
    if (!cleanId || !token) return false;

    const row = [
      setup.data,
      setup.maquina,
      setup.peca,
      setup.modeloAnterior || '-',
      setup.prep1 || '-',
      setup.prep2 || '-',
      setup.tempo,
      setup.tempoMs,
      setup.pendenciasConcluidas ? 'SIM' : 'NÃO',
      setup.historico || '',
      setup.id
    ];

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/SETUPS_CONCLUIDOS!A:K:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [row]
        })
      }
    );

    return res.ok;
  }

  /**
   * Sincroniza todo o estado da fábrica para a planilha Google
   */
  public static async sincronizarTudoParaPlanilha(
    spreadsheetId: string,
    token: string,
    store: StoreData
  ): Promise<{ sucesso: boolean; mensagem: string }> {
    const cleanId = this.extrairSpreadsheetId(spreadsheetId);
    if (!cleanId) throw new Error('ID da Planilha não configurado.');

    if (this.isSyncing) {
      this.pendingSyncStore = store;
      return { sucesso: true, mensagem: 'Sincronização em andamento, próxima gravação agendada.' };
    }

    this.isSyncing = true;
    this.notifyStatus();

    try {
      if (!this.abasValidadasIds.has(cleanId)) {
        await this.garantirAbas(cleanId, token);
        this.abasValidadasIds.add(cleanId);
      }

      // 1. Atualizar SETUPS_CONCLUIDOS
      const concluidosRows = (store.concluidos || []).map((c) => [
        c.data,
        c.maquina,
        c.peca,
        c.modeloAnterior || '-',
        c.prep1 || '-',
        c.prep2 || '-',
        c.tempo,
        c.tempoMs,
        c.pendenciasConcluidas ? 'SIM' : 'NÃO',
        c.historico || '',
        c.id
      ]);

      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/SETUPS_CONCLUIDOS!A2:K1000:clear`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (concluidosRows.length > 0) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/SETUPS_CONCLUIDOS!A2?valueInputOption=USER_ENTERED`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ values: concluidosRows })
        });
      }

      // 2. Atualizar MAQUINAS_FILA
      const maquinasRows = (store.maquinas || []).map((m) => [
        m.id,
        m.maquina,
        m.peca,
        m.setupExternoPronto ? 'SIM' : 'NÃO',
        'AGUARDANDO INÍCIO'
      ]);

      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/MAQUINAS_FILA!A2:E200:clear`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (maquinasRows.length > 0) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/MAQUINAS_FILA!A2?valueInputOption=USER_ENTERED`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ values: maquinasRows })
        });
      }

      // 3. Atualizar SETUPS_ATIVOS
      const ativosList = Object.values(store.setupsAtivos || {});
      const ativosRows = ativosList.map((a) => {
        const horaDh = new Date(a.updatedAt).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const historicoResumo = (a.historico || []).slice(-3).join(' | ');
        return [
          a.id,
          a.maquina,
          a.peca,
          a.modeloAnterior || '-',
          a.prep1Val || '-',
          a.prep2Val || '-',
          a.dataInicio,
          `${Math.floor(a.tempoDecorridoMs / 60000)} min`,
          a.paradaAtiva ? `PARADA: ${a.paradaAtual?.motivo || 'Em andamento'}` : 'EM PRODUÇÃO',
          historicoResumo || '-',
          horaDh
        ];
      });

      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/SETUPS_ATIVOS!A2:K100:clear`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (ativosRows.length > 0) {
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/SETUPS_ATIVOS!A2?valueInputOption=USER_ENTERED`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ values: ativosRows })
        });
      }

      const horaNow = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      this.lastSyncTime = horaNow;
      this.lastError = null;
      this.notifyStatus();

      return {
        sucesso: true,
        mensagem: `Sincronizado automaticamente às ${horaNow}`
      };
    } catch (err: any) {
      this.lastError = err.message || 'Erro ao sincronizar com Google Sheets';
      this.notifyStatus();
      throw err;
    } finally {
      this.isSyncing = false;
      this.notifyStatus();

      if (this.pendingSyncStore) {
        const next = this.pendingSyncStore;
        this.pendingSyncStore = null;
        this.sincronizarTudoParaPlanilha(cleanId, token, next).catch((e) =>
          console.warn('Erro na sincronização em fila Google Sheets:', e)
        );
      }
    }
  }

  /**
   * Puxa os dados registrados na planilha Google para restaurar a memória do sistema
   */
  public static async puxarDadosDaPlanilha(
    spreadsheetId: string,
    token: string
  ): Promise<{ concluidos: SetupConcluido[]; maquinas: Maquina[] }> {
    const cleanId = this.extrairSpreadsheetId(spreadsheetId);
    if (!cleanId) throw new Error('ID da Planilha não configurado.');

    // 1. Ler SETUPS_CONCLUIDOS
    const resConc = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/SETUPS_CONCLUIDOS!A2:K1000`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const concluidos: SetupConcluido[] = [];
    if (resConc.ok) {
      const dataConc = await resConc.json();
      const rows = dataConc.values || [];
      rows.forEach((r: any[]) => {
        if (!r || !r[0] || !r[1]) return;
        const [
          data,
          maquina,
          peca,
          modeloAnterior,
          prep1,
          prep2,
          tempo,
          tempoMsStr,
          pendenciasStr,
          historico,
          idStr
        ] = r;

        const id = idStr || `sheet_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const tempoMs = Number(tempoMsStr) || 0;
        const pendenciasConcluidas = String(pendenciasStr).toUpperCase() === 'SIM';

        concluidos.push({
          id,
          data: String(data || ''),
          timestamp: Date.now(),
          maquina: String(maquina || '').toUpperCase(),
          peca: String(peca || '').toUpperCase(),
          modeloAnterior: String(modeloAnterior || '-'),
          prep1: String(prep1 || '-'),
          prep2: String(prep2 || '-'),
          tempo: String(tempo || '00:00:00'),
          tempoMs,
          historico: String(historico || ''),
          pendenciasConcluidas
        });
      });
    }

    // 2. Ler MAQUINAS_FILA
    const resMaq = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/MAQUINAS_FILA!A2:E200`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const maquinas: Maquina[] = [];
    if (resMaq.ok) {
      const dataMaq = await resMaq.json();
      const rows = dataMaq.values || [];
      rows.forEach((r: any[]) => {
        if (!r || !r[1] || !r[2]) return;
        const [idStr, maquina, peca, extProntoStr] = r;
        maquinas.push({
          id: idStr || String(Date.now() + Math.random()),
          maquina: String(maquina || '').toUpperCase(),
          peca: String(peca || '').toUpperCase(),
          setupExternoPronto: String(extProntoStr).toUpperCase() === 'SIM'
        });
      });
    }

    return { concluidos, maquinas };
  }
}
