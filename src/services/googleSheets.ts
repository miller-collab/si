import type { StoreData, SetupConcluido, SetupAtivo, Maquina } from '../types';
import { SetupApiService } from './api';

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
  private static lastSyncTimestamp = 0;
  private static readonly INTERVALO_MINIMO_MS = 10000; // Intervalo de 10 segundos para não sobrecarregar
  private static debounceTimer: any = null;
  private static lastMaxRows = {
    maquinas: 25,
    ativos: 15,
    concluidos: 50
  };

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
        },
        {
          properties: {
            title: 'PREPARADORES',
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
      sheets: ['SETUPS_CONCLUIDOS', 'MAQUINAS_FILA', 'SETUPS_ATIVOS', 'PREPARADORES']
    };
  }

  /**
   * Garante que as abas necessárias existam na planilha informada
   */
  public static async garantirAbas(spreadsheetId: string, token: string): Promise<void> {
    const info = await this.testarConexao(spreadsheetId, token);
    const abasNecessarias = ['SETUPS_CONCLUIDOS', 'MAQUINAS_FILA', 'SETUPS_ATIVOS', 'PREPARADORES'];
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
      'Status',
      'Senha Liberação (1152)'
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
      'Histórico de Paradas',
      'Última Atualização'
    ];

    const headersPrep = [
      'Nome do Preparador',
      'Status'
    ];

    const data = [
      {
        range: 'SETUPS_CONCLUIDOS!A1:K1',
        values: [headersConcluidos]
      },
      {
        range: 'MAQUINAS_FILA!A1:F1',
        values: [headersMaquinas]
      },
      {
        range: 'SETUPS_ATIVOS!A1:K1',
        values: [headersAtivos]
      },
      {
        range: 'PREPARADORES!A1:B1',
        values: [headersPrep]
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
   * Sincroniza o estado da fábrica para a planilha Google utilizando escrita atômica contínua.
   * Preenche com linhas em branco para garantir que linhas excluídas no app ou planilha sejam limpas.
   */
  public static async sincronizarTudoParaPlanilha(
    spreadsheetId: string,
    token: string,
    store: StoreData
  ): Promise<{ sucesso: boolean; mensagem: string }> {
    const cleanId = this.extrairSpreadsheetId(spreadsheetId);
    if (!cleanId) throw new Error('ID da Planilha não configurado.');

    if (!this.abasValidadasIds.has(cleanId)) {
      await this.garantirAbas(cleanId, token);
      this.abasValidadasIds.add(cleanId);
    }

    // 1. SETUPS_CONCLUIDOS
    // A Planilha é soberana: respeita exclusões e edições feitas diretamente na planilha pelo usuário!
    let listaConcluidos = store.concluidos || [];
    try {
      const dadosPlanilha = await this.puxarDadosDaPlanilha(cleanId, token);
      if (dadosPlanilha && Array.isArray(dadosPlanilha.concluidos)) {
        const idsPlanilha = new Set(dadosPlanilha.concluidos.map((c) => c.id));
        const novosDoApp = (store.concluidos || []).filter(
          (c: SetupConcluido) => !idsPlanilha.has(c.id) && c.timestamp && Date.now() - c.timestamp < 60000
        );
        listaConcluidos = [...dadosPlanilha.concluidos, ...novosDoApp];
      }
    } catch {
      // Caso não consiga ler, usa lista atual
    }

    const concluidosRows = listaConcluidos.map((c: SetupConcluido) => [
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

    // 2. MAQUINAS_FILA
    const maquinasRows = (store.maquinas || []).map((m: Maquina, idx: number) => [
      m.id || String(idx + 1),
      m.maquina,
      m.peca,
      m.setupExternoPronto ? 'SIM' : 'NÃO',
      m.setupExternoPronto ? 'LIBERADO PARA SETUP' : 'AGUARDANDO INÍCIO',
      m.setupExternoPronto ? '1152' : ''
    ]);

    // 3. SETUPS_ATIVOS
    const ativosList: SetupAtivo[] = Object.values(store.setupsAtivos || {});
    const ativosRows = ativosList.map((a: SetupAtivo) => {
      const horaDh = new Date(a.updatedAt).toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo'
      });
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

    // 4. PREPARADORES
    const preparadoresRows = (store.preparadores || []).map((p: string) => [p, 'ATIVO']);

    const dataToBatch: any[] = [];

    // Limpeza e Gravação de SETUPS_CONCLUIDOS
    const maxRowsConc = Math.max(concluidosRows.length, this.lastMaxRows.concluidos, 50);
    this.lastMaxRows.concluidos = maxRowsConc;
    const paddedConcRows: (string | number)[][] = [];
    for (let i = 0; i < maxRowsConc; i++) {
      if (i < concluidosRows.length) {
        paddedConcRows.push(concluidosRows[i]);
      } else {
        paddedConcRows.push(['', '', '', '', '', '', '', '', '', '', '']);
      }
    }
    dataToBatch.push({
      range: `SETUPS_CONCLUIDOS!A2:K${1 + maxRowsConc}`,
      values: paddedConcRows
    });

    // Limpeza e Gravação de MAQUINAS_FILA
    const maxRowsMaq = Math.max(maquinasRows.length, this.lastMaxRows.maquinas, 25);
    this.lastMaxRows.maquinas = maxRowsMaq;
    const paddedMaqRows: (string | number)[][] = [];
    for (let i = 0; i < maxRowsMaq; i++) {
      if (i < maquinasRows.length) {
        paddedMaqRows.push(maquinasRows[i]);
      } else {
        paddedMaqRows.push(['', '', '', '', '', '']);
      }
    }
    dataToBatch.push({
      range: `MAQUINAS_FILA!A2:F${1 + maxRowsMaq}`,
      values: paddedMaqRows
    });

    // Limpeza e Gravação de SETUPS_ATIVOS
    const maxRowsAtivos = Math.max(ativosRows.length, this.lastMaxRows.ativos, 15);
    this.lastMaxRows.ativos = maxRowsAtivos;
    const paddedAtivosRows: (string | number)[][] = [];
    for (let i = 0; i < maxRowsAtivos; i++) {
      if (i < ativosRows.length) {
        paddedAtivosRows.push(ativosRows[i]);
      } else {
        paddedAtivosRows.push(['', '', '', '', '', '', '', '', '', '', '']);
      }
    }
    dataToBatch.push({
      range: `SETUPS_ATIVOS!A2:K${1 + maxRowsAtivos}`,
      values: paddedAtivosRows
    });

    // Limpeza e Gravação de PREPARADORES
    const maxRowsPrep = Math.max(preparadoresRows.length, 20);
    const paddedPrepRows: (string | number)[][] = [];
    for (let i = 0; i < maxRowsPrep; i++) {
      if (i < preparadoresRows.length) {
        paddedPrepRows.push(preparadoresRows[i]);
      } else {
        paddedPrepRows.push(['', '']);
      }
    }
    dataToBatch.push({
      range: `PREPARADORES!A2:B${1 + maxRowsPrep}`,
      values: paddedPrepRows
    });

    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: dataToBatch
      })
    });

    this.lastSyncTimestamp = Date.now();
    const horaNow = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    this.lastSyncTime = horaNow;
    this.lastError = null;
    this.notifyStatus();

    return {
      sucesso: true,
      mensagem: `Gravado na Planilha Google com sucesso às ${horaNow}.`
    };
  }

  /**
   * Adiciona uma máquina diretamente na aba MAQUINAS_FILA da planilha Google
   */
  public static async adicionarMaquinaNaPlanilha(
    spreadsheetId: string,
    token: string,
    maquina: { id?: string; maquina: string; peca: string; setupExternoPronto?: boolean }
  ): Promise<boolean> {
    const cleanId = this.extrairSpreadsheetId(spreadsheetId);
    if (!cleanId) return false;

    const row = [
      maquina.id || '1',
      maquina.maquina.toUpperCase(),
      maquina.peca.toUpperCase(),
      maquina.setupExternoPronto ? 'SIM' : 'NÃO',
      maquina.setupExternoPronto ? 'LIBERADO PARA SETUP' : 'AGUARDANDO INÍCIO',
      maquina.setupExternoPronto ? '1152' : ''
    ];

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/MAQUINAS_FILA!A:F:append?valueInputOption=USER_ENTERED`,
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
   * Atualiza unicamente a aba MAQUINAS_FILA sem alterar nenhuma outra aba da planilha
   */
  public static async atualizarMaquinasFilaNaPlanilha(
    spreadsheetId: string,
    token: string,
    maquinas: Maquina[]
  ): Promise<boolean> {
    const cleanId = this.extrairSpreadsheetId(spreadsheetId);
    if (!cleanId || !token) return false;

    const rows = (maquinas || []).map((m: Maquina, idx: number) => [
      m.id || String(idx + 1),
      m.maquina.toUpperCase(),
      m.peca.toUpperCase(),
      m.setupExternoPronto ? 'SIM' : 'NÃO',
      m.setupExternoPronto ? 'LIBERADO PARA SETUP' : 'AGUARDANDO INÍCIO',
      m.setupExternoPronto ? '1152' : ''
    ]);

    const maxRows = Math.max(rows.length, this.lastMaxRows.maquinas, 25);
    this.lastMaxRows.maquinas = maxRows;
    const paddedRows: (string | number)[][] = [];
    for (let i = 0; i < maxRows; i++) {
      if (i < rows.length) {
        paddedRows.push(rows[i]);
      } else {
        paddedRows.push(['', '', '', '', '', '']);
      }
    }

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/MAQUINAS_FILA!A2:F${1 + maxRows}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: paddedRows
        })
      }
    );

    return res.ok;
  }

  /**
   * Atualiza unicamente a aba SETUPS_ATIVOS sem alterar nenhuma outra aba da planilha
   */
  public static async atualizarSetupsAtivosNaPlanilha(
    spreadsheetId: string,
    token: string,
    setupsAtivos: Record<string, SetupAtivo>
  ): Promise<boolean> {
    const cleanId = this.extrairSpreadsheetId(spreadsheetId);
    if (!cleanId || !token) return false;

    const ativosList: SetupAtivo[] = Object.values(setupsAtivos || {});
    const rows = ativosList.map((a: SetupAtivo) => {
      const horaDh = new Date(a.updatedAt || Date.now()).toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo'
      });
      const historicoResumo = (a.historico || []).slice(-3).join(' | ');
      return [
        a.id,
        a.maquina,
        a.peca,
        a.modeloAnterior || '-',
        a.prep1Val || '-',
        a.prep2Val || '-',
        a.dataInicio,
        `${Math.floor((a.tempoDecorridoMs || 0) / 60000)} min`,
        a.paradaAtiva ? `PARADA: ${a.paradaAtual?.motivo || 'Em andamento'}` : 'EM PRODUÇÃO',
        historicoResumo || '-',
        horaDh
      ];
    });

    const maxRows = Math.max(rows.length, this.lastMaxRows.ativos, 15);
    this.lastMaxRows.ativos = maxRows;
    const paddedRows: (string | number)[][] = [];
    for (let i = 0; i < maxRows; i++) {
      if (i < rows.length) {
        paddedRows.push(rows[i]);
      } else {
        paddedRows.push(['', '', '', '', '', '', '', '', '', '', '']);
      }
    }

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/SETUPS_ATIVOS!A2:K${1 + maxRows}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: paddedRows
        })
      }
    );

    return res.ok;
  }

  /**
   * Atualiza unicamente a aba PREPARADORES sem alterar nenhuma outra aba da planilha
   */
  public static async atualizarPreparadoresNaPlanilha(
    spreadsheetId: string,
    token: string,
    preparadores: string[]
  ): Promise<boolean> {
    const cleanId = this.extrairSpreadsheetId(spreadsheetId);
    if (!cleanId || !token) return false;

    const rows = (preparadores || []).map((p: string) => [p, 'ATIVO']);
    const maxRows = Math.max(rows.length, 20);
    const paddedRows: (string | number)[][] = [];
    for (let i = 0; i < maxRows; i++) {
      if (i < rows.length) {
        paddedRows.push(rows[i]);
      } else {
        paddedRows.push(['', '']);
      }
    }

    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/PREPARADORES!A2:B${1 + maxRows}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: paddedRows
        })
      }
    );

    return res.ok;
  }

  /**
   * Puxa todos os dados das 4 abas da Planilha Google (A Planilha é a Fonte Soberana da Verdade).
   * Se o usuário editou células ou apagou linhas na planilha, o app acata 100%!
   */
  public static async puxarDadosDaPlanilha(
    spreadsheetId: string,
    token: string
  ): Promise<{
    concluidos: SetupConcluido[];
    maquinas: Maquina[];
    preparadores: string[];
    ativos: Record<string, SetupAtivo>;
  }> {
    const cleanId = this.extrairSpreadsheetId(spreadsheetId);
    if (!cleanId) throw new Error('ID da Planilha não configurado.');

    if (!this.abasValidadasIds.has(cleanId)) {
      await this.garantirAbas(cleanId, token);
      this.abasValidadasIds.add(cleanId);
    }

    const ranges = [
      'SETUPS_CONCLUIDOS!A2:K',
      'MAQUINAS_FILA!A2:G',
      'SETUPS_ATIVOS!A2:K',
      'PREPARADORES!A2:B'
    ];

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values:batchGet?${ranges
      .map((r) => `ranges=${encodeURIComponent(r)}`)
      .join('&')}`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      throw new Error(`Erro ao ler dados da planilha (${res.status})`);
    }

    const json = await res.json();
    const valueRanges = json.valueRanges || [];

    const rowsConc: any[][] = valueRanges[0]?.values || [];
    const rowsMaq: any[][] = valueRanges[1]?.values || [];
    const rowsAtivos: any[][] = valueRanges[2]?.values || [];
    const rowsPrep: any[][] = valueRanges[3]?.values || [];

    // 1. SETUPS_CONCLUIDOS
    const concluidos: SetupConcluido[] = [];
    rowsConc.forEach((r, idx) => {
      if (!r || r.length === 0) return;
      if (r.every((c) => !c || String(c).trim() === '')) return;

      const data = String(r[0] || '').trim();
      const maquina = String(r[1] || '').trim().toUpperCase();
      const peca = String(r[2] || '').trim().toUpperCase();
      if (!maquina && !peca) return;

      const modeloAnterior = String(r[3] || '-').trim();
      const prep1 = String(r[4] || '-').trim();
      const prep2 = String(r[5] || '-').trim();
      const tempo = String(r[6] || '00:00:00').trim();
      const tempoMsStr = String(r[7] || '0').trim();
      const pendenciasStr = String(r[8] || '').trim().toUpperCase();
      const historico = String(r[9] || '').trim();
      const idStr = String(r[10] || '').trim();

      const pendenciasConcluidas =
        pendenciasStr === 'SIM' ||
        pendenciasStr === 'OK' ||
        pendenciasStr === 'LIBERADO' ||
        pendenciasStr === 'CONCLUÍDO' ||
        pendenciasStr === 'CONCLUIDO';
      const tempoMs = Number(tempoMsStr) || 0;
      const id = idStr && idStr !== '-' ? idStr : `conc_${maquina}_${peca}_${idx + 1}`;

      concluidos.push({
        id,
        data: data || new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        timestamp: Date.now() - idx * 1000,
        maquina,
        peca: peca || 'PRODUÇÃO',
        modeloAnterior,
        prep1,
        prep2,
        tempo,
        tempoMs,
        historico,
        pendenciasConcluidas
      });
    });

    // 2. MAQUINAS_FILA
    const maquinas: Maquina[] = [];
    const vistos = new Set<string>();
    rowsMaq.forEach((r, idx) => {
      if (!r || r.length === 0) return;
      if (r.every((c) => !c || String(c).trim() === '')) return;

      let maqName = '';
      let pecaName = '';
      let rowId = '';

      const colA = String(r[0] || '').trim();
      const colB = String(r[1] || '').trim();
      const colC = String(r[2] || '').trim();

      const colAEhId =
        /^\d+$/.test(colA) ||
        colA.toLowerCase().startsWith('sheet_') ||
        colA.toLowerCase().startsWith('id_') ||
        colA.toLowerCase().startsWith('maq_');

      if (colAEhId && colB) {
        rowId = colA;
        maqName = colB;
        pecaName = colC;
      } else if (
        colA &&
        colA.toUpperCase() !== 'ID' &&
        colA.toUpperCase() !== 'MÁQUINA' &&
        colA.toUpperCase() !== 'MAQUINA'
      ) {
        rowId = `maq_${idx + 1}`;
        maqName = colA;
        pecaName = colB;
      } else if (colB && colB.toUpperCase() !== 'MÁQUINA' && colB.toUpperCase() !== 'MAQUINA') {
        rowId = colA || `maq_${idx + 1}`;
        maqName = colB;
        pecaName = colC;
      }

      const maqUpper = maqName.toUpperCase().trim();
      if (!maqUpper || maqUpper === '-' || maqUpper === 'MÁQUINA' || maqUpper === 'MAQUINA' || maqUpper === 'ID') return;

      if (vistos.has(maqUpper)) return;
      vistos.add(maqUpper);

      // Senha e Setup Externo:
      // Se contiver '1152' ou 'SIM', 'LIBERADO', 'OK', 'PRONTO', 'ATIVADO':
      // A luz verde de EXT. PRONTO é ligada!
      // Se o usuário apagou a senha ou deixou vazio ou colocou 'NÃO':
      // O setup externo fica DESLIGADO! A planilha manda 100%!
      const temSenha1152 = r.some((c) => String(c || '').trim() === '1152');
      const temSim = r.some((c) => {
        const v = String(c || '').trim().toUpperCase();
        return v === 'SIM' || v === 'LIBERADO' || v === 'OK' || v === 'PRONTO' || v === 'ATIVADO';
      });

      const extPronto = temSenha1152 || temSim;

      maquinas.push({
        id: rowId || `maq_${idx + 1}`,
        maquina: maqUpper,
        peca: (pecaName || 'PRODUÇÃO').toUpperCase().trim(),
        setupExternoPronto: extPronto
      });
    });

    // 3. SETUPS_ATIVOS
    const ativos: Record<string, SetupAtivo> = {};
    rowsAtivos.forEach((r, idx) => {
      if (!r || r.length === 0) return;
      if (r.every((c) => !c || String(c).trim() === '')) return;

      const [idStr, maquina, peca, modeloAnterior, prep1, prep2, dataInicio, tempoDecorrido, statusParada, historicoStr] = r;
      const maqUpper = String(maquina || '').trim().toUpperCase();
      if (!maqUpper || maqUpper === 'MÁQUINA' || maqUpper === 'MAQUINA' || maqUpper === 'ID') return;

      const id = String(idStr || '').trim() || `ativo_${maqUpper}_${idx + 1}`;
      ativos[id] = {
        id,
        rowId: id,
        maquina: maqUpper,
        peca: String(peca || 'PRODUÇÃO').trim().toUpperCase(),
        modeloAnterior: String(modeloAnterior || '-').trim(),
        prep1Val: String(prep1 || '-').trim(),
        prep2Val: String(prep2 || '-').trim(),
        dataInicio: String(dataInicio || '').trim() || new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        inicioMs: Date.now(),
        lastTick: Date.now(),
        tempoDecorridoMs: 0,
        deductionsMs: 0,
        paradaAtiva: String(statusParada || '').includes('PARADA'),
        historico: historicoStr ? [String(historicoStr)] : [],
        eventos: [],
        checksStateParte1: [],
        checksStateParte2: [],
        checksStatePendencias: [],
        setupRegistrado: false,
        updatedAt: Date.now()
      };
    });

    // 4. PREPARADORES
    const preparadores: string[] = [];
    rowsPrep.forEach((r) => {
      if (!r || r.length === 0) return;
      const nome = String(r[0] || '').trim().toUpperCase();
      if (nome && nome !== 'NOME DO PREPARADOR' && nome !== 'PREPARADOR' && nome !== 'NOME' && nome !== '-') {
        if (!preparadores.includes(nome)) {
          preparadores.push(nome);
        }
      }
    });

    return { concluidos, maquinas, preparadores, ativos };
  }

  /**
   * Sincronização Bidirecional Soberana:
   * - Quando chamada em segundo plano / intervalo de 30 segundos (origemMudancaApp = false):
   *   Puxa da planilha Google e alinha o app 100% de acordo com as informações da planilha.
   *   NUNCA sobrescreve a planilha durante a leitura periódica! Assim você pode editar e apagar
   *   qualquer linha na planilha sem que valores antigos voltem.
   * - Quando chamada por ação no app (origemMudancaApp = true):
   *   Grava imediatamente as alterações feitas no app diretamente na Planilha Google.
   */
  public static async sincronizacaoBidirecional(
    spreadsheetId: string,
    token: string,
    store: StoreData,
    forcarImediato: boolean = false,
    origemMudancaApp: boolean = false
  ): Promise<{ sucesso: boolean; mensagem: string; storeAtualizado: StoreData }> {
    const cleanId = this.extrairSpreadsheetId(spreadsheetId);
    if (!cleanId) throw new Error('ID da Planilha não configurado.');

    if (this.isSyncing) {
      return { sucesso: true, mensagem: 'Sincronização em andamento.', storeAtualizado: store };
    }

    // Se a alteração partiu do app (ex: iniciou setup, finalizou setup, liberou senha 1152),
    // grava na planilha diretamente!
    if (origemMudancaApp) {
      this.isSyncing = true;
      this.notifyStatus();
      try {
        await this.sincronizarTudoParaPlanilha(cleanId, token, store);
        const storeAtualizado = await SetupApiService.fetchSync();
        return {
          sucesso: true,
          mensagem: 'Alterações gravadas na Planilha Google com sucesso!',
          storeAtualizado
        };
      } finally {
        this.isSyncing = false;
        this.notifyStatus();
      }
    }

    // Leitura / Sincronização Periódica a cada 30 segundos (ou manual):
    // A Planilha Manda em Tudo: lê da planilha e alinha o app!
    this.isSyncing = true;
    this.notifyStatus();

    try {
      // 1. Ler da Planilha Google (A PLANILHA É A FONTE SOBERANA DA VERDADE)
      const dadosPlanilha = await this.puxarDadosDaPlanilha(cleanId, token);

      // 2. Alinhar o backend e a memória do app com a planilha
      await SetupApiService.mesclarPlanilha(
        dadosPlanilha.concluidos,
        dadosPlanilha.maquinas,
        true,
        dadosPlanilha.preparadores,
        dadosPlanilha.ativos
      );
      const storeAtualizado = await SetupApiService.fetchSync();

      // NUNCA escreve de volta na planilha durante o ciclo de leitura periódica!
      // Isso garante que você pode editar a planilha livremente sem que o app devolva valores antigos.

      this.lastSyncTimestamp = Date.now();
      const horaNow = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      this.lastSyncTime = horaNow;
      this.lastError = null;
      this.notifyStatus();

      return {
        sucesso: true,
        mensagem: `Alinhado com a planilha às ${horaNow}.`,
        storeAtualizado
      };
    } catch (err: any) {
      this.lastError = err.message || 'Erro na sincronização bidirecional';
      this.notifyStatus();
      throw err;
    } finally {
      this.isSyncing = false;
      this.notifyStatus();
    }
  }
}
