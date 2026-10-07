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
      'Última Atualização'
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
   * Sincroniza o estado da fábrica para a planilha Google utilizando escrita atômica contínua sem piscar
   */
  public static async sincronizarTudoParaPlanilha(
    spreadsheetId: string,
    token: string,
    store: StoreData
  ): Promise<{ sucesso: boolean; mensagem: string }> {
    const res = await this.sincronizacaoBidirecional(spreadsheetId, token, store, true);
    return { sucesso: res.sucesso, mensagem: res.mensagem };
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
   * Puxa os dados registrados na planilha Google para restaurar e sincronizar a memória do sistema
   */
  public static async puxarDadosDaPlanilha(
    spreadsheetId: string,
    token: string
  ): Promise<{ concluidos: SetupConcluido[]; maquinas: Maquina[] }> {
    const cleanId = this.extrairSpreadsheetId(spreadsheetId);
    if (!cleanId) throw new Error('ID da Planilha não configurado.');

    // 1. Ler SETUPS_CONCLUIDOS (Sem limite de quantidade - leitura contínua infinita)
    const resConc = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/SETUPS_CONCLUIDOS!A2:K`,
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

        const id =
          idStr && String(idStr).trim() !== '' && String(idStr).trim() !== '-'
            ? String(idStr).trim()
            : `conc_${String(maquina || '').trim()}_${String(peca || '').trim()}_${tempoMsStr || '0'}`;
        const tempoMs = Number(tempoMsStr) || 0;
        const pendenciasConcluidas = String(pendenciasStr || '').toUpperCase().trim() === 'SIM';

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

    // 2. Ler MAQUINAS_FILA (Sem limite de linhas - lê todas as máquinas em fila)
    const resMaq = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/MAQUINAS_FILA!A2:G`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const maquinas: Maquina[] = [];
    if (resMaq.ok) {
      const dataMaq = await resMaq.json();
      const rows = dataMaq.values || [];
      rows.forEach((r: any[], idx: number) => {
        if (!r || r.length === 0) return;

        let maqName = '';
        let pecaName = '';
        let rowId = '';

        const colA = String(r[0] || '').trim();
        const colB = String(r[1] || '').trim();
        const colC = String(r[2] || '').trim();

        // Identifica se a coluna A é ID do sistema ou se já é o nome da máquina
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
          rowId = `sheet_maq_${idx}_${colA}`;
          maqName = colA;
          pecaName = colB;
        }

        // LÓGICA CIRÚRGICA DE SENHA E STATUS DE SETUP EXTERNO:
        // Se a coluna "Senha Liberação (1152)" ou qualquer célula contiver a senha '1152'
        // OU contiver 'SIM', 'LIBERADO', 'OK', 'PRONTO', 'ATIVADO':
        // -> A luz do Setup Externo fica ATIVADA no app!
        const temSenha1152 = r.some((c) => String(c || '').trim() === '1152');
        const temSim = r.some((c) => {
          const v = String(c || '').trim().toUpperCase();
          return v === 'SIM' || v === 'LIBERADO' || v === 'OK' || v === 'PRONTO' || v === 'ATIVADO';
        });
        const temNao = !temSenha1152 && r.some((c) => {
          const v = String(c || '').trim().toUpperCase();
          return v === 'NÃO' || v === 'NAO';
        });

        const extPronto = temSenha1152 || temSim;

        const maqUpper = maqName.toUpperCase();
        if (
          maqUpper &&
          maqUpper !== '-' &&
          maqUpper !== 'MÁQUINA' &&
          maqUpper !== 'MAQUINA' &&
          maqUpper !== 'ID'
        ) {
          maquinas.push({
            id: rowId,
            maquina: maqUpper,
            peca: (pecaName || 'PRODUÇÃO').toUpperCase(),
            setupExternoPronto: extPronto,
            desativadoExplicitamenteNaPlanilha: temNao && !extPronto
          } as any);
        }
      });
    }

    return { concluidos, maquinas };
  }

  /**
   * Sincronização Bidirecional Total:
   * A Planilha é o Centro de Tudo. Lê a fila de máquinas e setups da planilha e mescla com o app em tempo real.
   */
  public static async sincronizacaoBidirecional(
    spreadsheetId: string,
    token: string,
    store: StoreData,
    forcarImediato: boolean = false
  ): Promise<{ sucesso: boolean; mensagem: string; storeAtualizado: StoreData }> {
    const cleanId = this.extrairSpreadsheetId(spreadsheetId);
    if (!cleanId) throw new Error('ID da Planilha não configurado.');

    if (this.isSyncing) {
      return { sucesso: true, mensagem: 'Sincronização em andamento.', storeAtualizado: store };
    }

    // Regra dos 10 segundos para não salvar a todo instante nem sobrecarregar a planilha
    const agora = Date.now();
    const tempoDesdeUltimaSync = agora - this.lastSyncTimestamp;
    if (!forcarImediato && tempoDesdeUltimaSync < this.INTERVALO_MINIMO_MS) {
      const tempoRestante = this.INTERVALO_MINIMO_MS - tempoDesdeUltimaSync;
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        SetupApiService.fetchSync().then((latest) => {
          this.sincronizacaoBidirecional(cleanId, token, latest, true).catch((e) =>
            console.warn('Erro na sincronização agendada:', e)
          );
        });
      }, tempoRestante);

      return {
        sucesso: true,
        mensagem: `Próximo salvamento em ${Math.ceil(tempoRestante / 1000)}s`,
        storeAtualizado: store
      };
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.isSyncing = true;
    this.notifyStatus();

    try {
      if (!this.abasValidadasIds.has(cleanId)) {
        await this.garantirAbas(cleanId, token);
        this.abasValidadasIds.add(cleanId);
      }

      // 1. Ler da Planilha Google (A PLANILHA É A FONTE DA VERDADE SOBERANA)
      const dadosPlanilha = await this.puxarDadosDaPlanilha(cleanId, token);

      // A Planilha manda em tudo: Se o usuário apagou ou alterou linhas na planilha, o app acata 100%!
      // Não ressuscita linhas apagadas pelo usuário na planilha.
      // Desduplica por nome de máquina (cada torno/centro físico só pode aparecer uma única vez na fila).
      const localMaqMap = new Map<string, Maquina>();
      (store.maquinas || []).forEach((lm) => {
        localMaqMap.set(lm.maquina.toUpperCase(), lm);
      });

      const listaMaquinasFinal: Maquina[] = [];
      const vistos = new Set<string>();
      (dadosPlanilha.maquinas || []).forEach((m: any) => {
        const chave = m.maquina.toUpperCase();
        if (!vistos.has(chave)) {
          vistos.add(chave);

          const mLocal = localMaqMap.get(chave);
          const desativadoPelaPlanilha = Boolean(m.desativadoExplicitamenteNaPlanilha);

          // Se o usuário digitou explicitamente NÃO e tirou a senha na planilha, desativa.
          // Caso contrário, se a planilha contém 1152 ou SIM OU se o app local já autorizou com 1152:
          // A luz do setup externo FICA ATIVADA! Impede que apareça e apague em instantes.
          let extAtivado = false;
          if (desativadoPelaPlanilha) {
            extAtivado = false;
          } else {
            extAtivado = m.setupExternoPronto || Boolean(mLocal?.setupExternoPronto);
          }

          listaMaquinasFinal.push({
            id: m.id,
            maquina: m.maquina,
            peca: m.peca,
            setupExternoPronto: extAtivado
          });
        }
      });

      // Se a planilha estiver vazia, preenche com as máquinas da memória
      if (dadosPlanilha.maquinas.length === 0 && (store.maquinas || []).length > 0) {
        (store.maquinas || []).forEach((mLocal) => {
          const chave = mLocal.maquina.toUpperCase();
          if (!vistos.has(chave)) {
            vistos.add(chave);
            listaMaquinasFinal.push(mLocal);
          }
        });
      }

      // 2. Mesclar no backend da aplicação adotando a planilha soberana
      await SetupApiService.mesclarPlanilha(dadosPlanilha.concluidos, listaMaquinasFinal, true);
      const storeAtualizado = await SetupApiService.fetchSync();

      // 3. Atualizar a Planilha com o estado completo consolidado
      const concluidosRows = (storeAtualizado.concluidos || []).map((c: SetupConcluido) => [
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

      // 6 Colunas na Fila: ID | Máquina | Peça | Setup Externo | Status | Senha Liberação (1152)
      const maquinasRows: (string | number)[][] = (storeAtualizado.maquinas || []).map((m: Maquina, idx: number) => [
        m.id || String(idx + 1),
        m.maquina,
        m.peca,
        m.setupExternoPronto ? 'SIM' : 'NÃO',
        m.setupExternoPronto ? 'LIBERADO PARA SETUP' : 'AGUARDANDO INÍCIO',
        m.setupExternoPronto ? '1152' : ''
      ]);

      const ativosList: SetupAtivo[] = Object.values(storeAtualizado.setupsAtivos || {});
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

      // Gravar abas na Planilha Google de forma 100% ATÔMICA SEM RESTRIÇÃO DE QUANTIDADE
      const dataToBatch: any[] = [];

      // 1. SETUPS_CONCLUIDOS (Sem limite de registros)
      if (concluidosRows.length > 0) {
        dataToBatch.push({
          range: `SETUPS_CONCLUIDOS!A2:K${concluidosRows.length + 1}`,
          values: concluidosRows
        });
      }

      // 2. MAQUINAS_FILA (Todas as máquinas gravadas sem limites: ID | Máquina | Peça | Setup Externo | Status | Senha)
      const maxRowsMaq = Math.max(maquinasRows.length, this.lastMaxRows.maquinas, 20);
      this.lastMaxRows.maquinas = maxRowsMaq;
      const paddedMaquinasRows: (string | number)[][] = [];
      for (let i = 0; i < maxRowsMaq; i++) {
        if (i < maquinasRows.length) {
          paddedMaquinasRows.push(maquinasRows[i]);
        } else {
          paddedMaquinasRows.push(['', '', '', '', '', '']);
        }
      }
      dataToBatch.push({
        range: `MAQUINAS_FILA!A2:F${1 + maxRowsMaq}`,
        values: paddedMaquinasRows
      });

      // 3. SETUPS_ATIVOS (Gravação atômica contínua sem piscar)
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

      if (dataToBatch.length > 0) {
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
      }

      this.lastSyncTimestamp = Date.now();
      const horaNow = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      this.lastSyncTime = horaNow;
      this.lastError = null;
      this.notifyStatus();

      return {
        sucesso: true,
        mensagem: `Sincronização realizada com sucesso às ${horaNow}.`,
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
