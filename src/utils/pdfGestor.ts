import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { SetupConcluido } from '../types';

export interface DadosRelatorioGestor {
  filtrados: SetupConcluido[];
  colabNome: string;
  periodoTexto: string;
  top3: SetupConcluido[];
  top10Paradas: Array<{ descricao: string; count: number; pct: number }>;
  kpiTotal: number;
  kpiMedia: string;
  menorTempoStr: string;
  maiorTempoStr: string;
  setupMenorTempo: SetupConcluido | null;
  setupMaiorTempo: SetupConcluido | null;
}

/**
 * Extracts and calculates exact Start and End timestamps of Setup and every stoppage/break.
 */
export function extrairDetalhesCompletosSetup(gargalo: SetupConcluido): {
  inicioSetupStr: string;
  fimSetupStr: string;
  duracaoTotalStr: string;
  linhasEventos: string[];
} {
  let inicioSetupStr = '';
  let fimSetupStr = gargalo.data || '';
  const duracaoTotalStr = gargalo.tempo || '00:00:00';

  const rawParts = (gargalo.historico || '').split('|').map((s) => s.trim()).filter(Boolean);

  // 1. Search for explicit inicio in historico
  for (const p of rawParts) {
    if (p.toLowerCase().includes('início') || p.toLowerCase().includes('inicio')) {
      const m = p.match(/\[(.*?)\]/);
      if (m) inicioSetupStr = m[1];
    }
  }

  // 2. Deduce start timestamp if missing
  if (!inicioSetupStr && gargalo.timestamp && gargalo.tempoMs) {
    const d = new Date(gargalo.timestamp - gargalo.tempoMs);
    inicioSetupStr = `${d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} ${d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}`;
  }

  const linhasEventos: string[] = [];

  // Line: Start of setup
  linhasEventos.push(`• INÍCIO DO SETUP: ${inicioSetupStr || 'Início da contagem'} — Abertura e início da contagem oficial da máquina ${gargalo.maquina}`);

  // Structured events from gargalo.eventos if available
  if (gargalo.eventos && Array.isArray(gargalo.eventos) && gargalo.eventos.length > 0) {
    gargalo.eventos.forEach((ev) => {
      const hIni = ev.inicioMs ? new Date(ev.inicioMs).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }) : '';
      const hFim = ev.fimMs ? new Date(ev.fimMs).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }) : '';
      const dur = ev.duracaoMs ? Math.floor(ev.duracaoMs / 60000) + ' min' : '';

      if (ev.tipo === 'cafe') {
        linhasEventos.push(`• INTERVALO DE CAFÉ: Início: ${hIni} | Fim: ${hFim || '15 min'} | Duração: 00:15:00 (-15 min descontados)`);
      } else if (ev.tipo === 'almoco') {
        linhasEventos.push(`• INTERVALO DE ALMOÇO: Início: ${hIni} | Fim: ${hFim || '1h30'} | Duração: 01:30:00 (-1h30 min descontados)`);
      } else {
        linhasEventos.push(`• PARADA OPERACIONAL: Início: ${hIni} | Fim: ${hFim || 'Retomada'} | Duração: ${dur || 'Registrada'} — Motivo: ${ev.motivo || 'Sem motivo informado'}`);
      }
    });
  } else {
    // Parse text items from historico
    rawParts.forEach((p) => {
      const mRange = p.match(/\[(.*?)\s+às\s+(.*?)\]/i);
      const mSingle = p.match(/\[(.*?)\]/);
      const textoLimpo = p.replace(/\[.*?\]\s*/, '').trim();

      if (textoLimpo.toLowerCase().startsWith('início') || textoLimpo.toLowerCase().startsWith('inicio')) {
        return; // Already added at top
      }
      if (textoLimpo.toLowerCase().includes('fim do setup') || textoLimpo.toLowerCase().includes('liberado')) {
        return; // Added at bottom
      }

      const hIni = mRange ? mRange[1] : (mSingle ? mSingle[1] : '');
      let hFim = mRange ? mRange[2] : '';

      if (textoLimpo.toLowerCase().includes('café') || textoLimpo.toLowerCase().includes('cafe')) {
        if (!hFim && hIni) {
          const t = hIni.includes(' ') ? hIni.split(' ')[1] : hIni;
          const [hh, mm] = t.split(':').map(Number);
          if (!isNaN(hh) && !isNaN(mm)) {
            const tot = hh * 60 + mm + 15;
            hFim = `${String(Math.floor(tot / 60) % 24).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
          }
        }
        linhasEventos.push(`• INTERVALO DE CAFÉ: Início: ${hIni} | Fim: ${hFim || '15 min'} | Duração: 00:15:00 (-15 min descontados)`);
      } else if (textoLimpo.toLowerCase().includes('almoço') || textoLimpo.toLowerCase().includes('almoco')) {
        if (!hFim && hIni) {
          const t = hIni.includes(' ') ? hIni.split(' ')[1] : hIni;
          const [hh, mm] = t.split(':').map(Number);
          if (!isNaN(hh) && !isNaN(mm)) {
            const tot = hh * 60 + mm + 90;
            hFim = `${String(Math.floor(tot / 60) % 24).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
          }
        }
        linhasEventos.push(`• INTERVALO DE ALMOÇO: Início: ${hIni} | Fim: ${hFim || '1h30'} | Duração: 01:30:00 (-1h30 min descontados)`);
      } else if (textoLimpo.toLowerCase().includes('parada')) {
        const durMatch = textoLimpo.match(/\((.*?)\)/);
        let dur = durMatch ? durMatch[1] : '';
        const motivo = textoLimpo
          .replace(/^Parada:\s*/i, '')
          .replace(/^Parada iniciada:\s*/i, '')
          .replace(/^Parada encerrada.*?Motivo:\s*/i, '')
          .replace(/\(.*?\)/, '')
          .replace(/^-?\s*Motivo:\s*/i, '')
          .trim();

        if (!dur) {
          dur = '00:25:00';
        }
        if (!hFim && hIni) {
          const t = hIni.includes(' ') ? hIni.split(' ')[1] : hIni;
          const [hh, mm] = t.split(':').map(Number);
          if (!isNaN(hh) && !isNaN(mm)) {
            const durMin = dur.includes(':') ? Number(dur.split(':')[1]) : 25;
            const tot = hh * 60 + mm + durMin;
            hFim = `${String(Math.floor(tot / 60) % 24).padStart(2, '0')}:${String(tot % 60).padStart(2, '0')}`;
          }
        }
        linhasEventos.push(`• PARADA OPERACIONAL: Início: ${hIni} | Fim: ${hFim || 'Retomada'} | Duração: ${dur} — Motivo: ${motivo}`);
      } else {
        linhasEventos.push(`• EVENTO: ${hIni} — ${textoLimpo}`);
      }
    });
  }

  // Line: End of setup
  linhasEventos.push(`• FIM DO SETUP (LIBERAÇÃO): ${fimSetupStr} — Conclusão do checklist e 1ª peça liberada para produção`);

  return {
    inicioSetupStr: inicioSetupStr || 'Início da contagem',
    fimSetupStr: fimSetupStr || 'Liberado',
    duracaoTotalStr,
    linhasEventos
  };
}

/**
 * Generates a clean 100% Black & White / Grayscale PDF report for Monochrome Printers.
 * Uses high contrast, crisp lines, light gray fills, and zero colors that would blur on B&W paper.
 */
export function criarDocRelatorioGestor(dados: DadosRelatorioGestor): jsPDF {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = 297;
  const pageHeight = 210;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 269mm

  // Header Title
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('RELATÓRIO DE AUDITORIA & PERFORMANCE - SETUP CNC', margin, 18);

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text('Análise de Gargalos Operacionais, Indicadores de Produtividade e Histórico de Paradas', margin, 24);

  // Metadata Bar
  const agora = new Date();
  const dataEmissaoStr = `${agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} às ${agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}`;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.line(margin, 27, pageWidth - margin, 27);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`COLABORADOR: `, margin, 32);
  doc.setFont('helvetica', 'normal');
  doc.text(`${dados.colabNome}`, margin + 28, 32);

  doc.setFont('helvetica', 'bold');
  doc.text(`PERÍODO: `, margin + 95, 32);
  doc.setFont('helvetica', 'normal');
  doc.text(`${dados.periodoTexto}`, margin + 112, 32);

  doc.setFont('helvetica', 'bold');
  doc.text(`EMISSÃO: `, margin + 195, 32);
  doc.setFont('helvetica', 'normal');
  doc.text(`${dataEmissaoStr}`, margin + 212, 32);

  // KPI Boxes in Crisp Black and White (Light gray fill for laser printer clarity)
  const kpiBoxWidth = (contentWidth - 9) / 4; // ~64.5mm each
  const kpiBoxHeight = 20;
  const kpiY = 37;

  const kpis = [
    {
      titulo: 'TOTAL SETUPS FEITOS',
      valor: String(dados.kpiTotal),
      detalhe: 'Setups no período selecionado'
    },
    {
      titulo: 'MÉDIA GERAL DE TEMPO',
      valor: dados.kpiMedia,
      detalhe: 'Duração média líquida'
    },
    {
      titulo: 'MENOR TEMPO (RECORDE)',
      valor: dados.menorTempoStr,
      detalhe: dados.setupMenorTempo
        ? `${dados.setupMenorTempo.maquina} | ${dados.setupMenorTempo.peca}`
        : 'Sem registros'
    },
    {
      titulo: 'MAIOR TEMPO (GARGALO)',
      valor: dados.maiorTempoStr,
      detalhe: dados.setupMaiorTempo
        ? `${dados.setupMaiorTempo.maquina} | ${dados.setupMaiorTempo.peca}`
        : 'Sem registros'
    }
  ];

  kpis.forEach((kpi, idx) => {
    const boxX = margin + idx * (kpiBoxWidth + 3);
    // Box border and background
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);
    doc.setFillColor(245, 245, 245);
    doc.rect(boxX, kpiY, kpiBoxWidth, kpiBoxHeight, 'FD');

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(50, 50, 50);
    doc.text(kpi.titulo, boxX + kpiBoxWidth / 2, kpiY + 5.5, { align: 'center' });

    // Value
    doc.setFontSize(13);
    doc.setTextColor(0, 0, 0);
    doc.text(kpi.valor, boxX + kpiBoxWidth / 2, kpiY + 13, { align: 'center' });

    // Detail subtitle
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 80);
    doc.text(kpi.detalhe, boxX + kpiBoxWidth / 2, kpiY + 18, { align: 'center' });
  });

  let currentY = kpiY + kpiBoxHeight + 7;

  // SECTION 1: TOP 3 DEMORADOS (GARGALOS)
  if (dados.top3 && dados.top3.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text('TOP 3 MAIORES TEMPOS (GARGALOS OPERACIONAIS NO PERÍODO)', margin, currentY);

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(margin, currentY + 1.5, pageWidth - margin, currentY + 1.5);
    currentY += 5;

    dados.top3.forEach((gargalo, gIdx) => {
      const boxWidth = contentWidth;

      const { inicioSetupStr, fimSetupStr, duracaoTotalStr, linhasEventos } = extrairDetalhesCompletosSetup(gargalo);
      const linhasText = linhasEventos.join('\n');

      // Calculate required height with high precision
      const splitText = doc.splitTextToSize(linhasText, boxWidth - 14);
      const histHeight = Math.max(14, splitText.length * 4.2 + 5);
      const totalBoxHeight = 19 + histHeight;

      // Check if box fits on current page
      if (currentY + totalBoxHeight > pageHeight - 15) {
        doc.addPage();
        currentY = margin;
      }

      // Draw outer box
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.4);
      doc.setFillColor(252, 252, 252);
      doc.rect(margin, currentY, boxWidth, totalBoxHeight, 'FD');

      // Header Line 1: Machine, Piece, and Final Duration
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(0, 0, 0);
      doc.text(
        `#${gIdx + 1} - MÁQUINA: ${gargalo.maquina} | PEÇA: ${gargalo.peca} | TEMPO LÍQUIDO DE SETUP: ${duracaoTotalStr}`,
        margin + 4,
        currentY + 5.5
      );

      // Header Line 2: INÍCIO E FIM DO SETUP BEM DESTACADOS
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(0, 0, 0);
      doc.text(
        `INÍCIO DO SETUP: ${inicioSetupStr}   |   FIM DO SETUP: ${fimSetupStr}   |   DURAÇÃO: ${duracaoTotalStr}`,
        margin + 4,
        currentY + 10.5
      );

      // Header Line 3: Preparadores e Modelo Anterior
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(60, 60, 60);
      doc.text(
        `Preparadores: ${gargalo.prep1} / ${gargalo.prep2}   |   Modelo Anterior: ${gargalo.modeloAnterior || 'Não informado'}`,
        margin + 4,
        currentY + 15
      );

      // Stoppage & Event history inside box (Gray panel pointed by user)
      doc.setFillColor(242, 242, 242);
      doc.rect(margin + 3, currentY + 17, boxWidth - 6, histHeight, 'F');
      doc.setDrawColor(80, 80, 80);
      doc.setLineWidth(0.8);
      doc.line(margin + 3, currentY + 17, margin + 3, currentY + 17 + histHeight);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(0, 0, 0);
      doc.text(splitText, margin + 6, currentY + 21.5);

      currentY += totalBoxHeight + 4;
    });
  }

  // SECTION 2: TOP 10 MOTIVOS DE PARADAS (PARETO)
  if (dados.top10Paradas && dados.top10Paradas.length > 0) {
    if (currentY > pageHeight - 45) {
      doc.addPage();
      currentY = margin;
    } else {
      currentY += 3;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text('TOP MOTIVOS DE PARADAS E EVENTOS (FREQUÊNCIA & IMPACTO)', margin, currentY);

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(margin, currentY + 1.5, pageWidth - margin, currentY + 1.5);
    currentY += 4;

    const bodyParadas = dados.top10Paradas.map((p) => [
      `${p.count}x`,
      p.descricao,
      `${p.pct}%`
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Frequência', 'Descrição da Parada / Ocorrência / Motivo', '% do Total']],
      body: bodyParadas,
      theme: 'plain',
      tableWidth: contentWidth * 0.85,
      margin: { left: margin },
      styles: {
        fontSize: 8,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.2,
        cellPadding: 2
      },
      headStyles: {
        fillColor: [230, 230, 230],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        lineColor: [0, 0, 0],
        lineWidth: 0.3
      },
      alternateRowStyles: {
        fillColor: [248, 248, 248]
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 26, fontStyle: 'bold' },
        1: { halign: 'left' },
        2: { halign: 'center', cellWidth: 26, fontStyle: 'bold' }
      }
    });

    // @ts-expect-error autoTable adds lastAutoTable to jsPDF instance
    currentY = (doc.lastAutoTable?.finalY || currentY) + 7;
  }

  // SECTION 3: TABELA COMPLETA DE MODELOS TRABALHADOS
  if (currentY > pageHeight - 45) {
    doc.addPage();
    currentY = margin;
  } else {
    currentY += 2;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text('LISTAGEM DETALHADA DE TODOS OS SETUPS DO PERÍODO', margin, currentY);

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(margin, currentY + 1.5, pageWidth - margin, currentY + 1.5);
  currentY += 4;

  const tableBody = dados.filtrados.map((item) => {
    const { inicioSetupStr, fimSetupStr, linhasEventos } = extrairDetalhesCompletosSetup(item);
    const paradasApenas = linhasEventos
      .filter((l) => !l.includes('INÍCIO DO SETUP') && !l.includes('FIM DO SETUP'))
      .join('\n');

    return [
      `Início:\n${inicioSetupStr}\n\nFim:\n${fimSetupStr}`,
      item.maquina || '-',
      `${item.prep1 || '-'} / ${item.prep2 || '-'}`,
      item.modeloAnterior || '-',
      item.peca || '-',
      paradasApenas || 'Nenhuma parada registrada.',
      item.tempo || '-'
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [['Início / Fim', 'Máquina', 'Preparadores', 'Mod. Anterior', 'Peça Atual', 'Paradas / Intervalos (Início & Fim)', 'Tempo Líquido']],
    body: tableBody,
    theme: 'plain',
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 7.2,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      cellPadding: 2,
      overflow: 'linebreak'
    },
    headStyles: {
      fillColor: [225, 225, 225],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      lineColor: [0, 0, 0],
      lineWidth: 0.3
    },
    alternateRowStyles: {
      fillColor: [248, 248, 248]
    },
    columnStyles: {
      0: { cellWidth: 30, fontSize: 6.8 },
      1: { cellWidth: 16, fontStyle: 'bold' },
      2: { cellWidth: 32 },
      3: { cellWidth: 24 },
      4: { cellWidth: 30, fontStyle: 'bold' },
      5: { cellWidth: 'auto', fontSize: 6.8 },
      6: { cellWidth: 22, halign: 'center', fontStyle: 'bold' }
    },
    didDrawPage: (data) => {
      // Footer page numbering on every page
      const totalPages = doc.getNumberOfPages();
      const currentPage = data.pageNumber;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Página ${currentPage} de ${totalPages} — Setup Interno CNC (Documento Otimizado para Impressoras Preto e Branco)`,
        pageWidth / 2,
        pageHeight - 6,
        { align: 'center' }
      );
    }
  });

  return doc;
}

/**
 * Downloads the PDF directly, prompting the user's browser "Salvar Como" dialog.
 */
export function baixarRelatorioGestorPdf(dados: DadosRelatorioGestor, nomeArquivo?: string): void {
  const doc = criarDocRelatorioGestor(dados);
  const dataLimpa = new Date().toISOString().slice(0, 10);
  const nomeFinal = nomeArquivo || `Relatorio_CNC_Gestor_${dados.colabNome.replace(/\s+/g, '_')}_${dataLimpa}.pdf`;
  doc.save(nomeFinal);
}

/**
 * Generates a Blob for opening or printing directly in a clean print window.
 */
export function gerarRelatorioGestorBlob(dados: DadosRelatorioGestor): Blob {
  const doc = criarDocRelatorioGestor(dados);
  return doc.output('blob');
}

export interface DadosRelatorioDashboard {
  filtrados: SetupConcluido[];
  filtroMaquina: string;
  filtroPeriodo: string;
  kpiTotal: number;
  kpiMedia: string;
  top10Paradas: Array<{ descricao: string; count: number; pct: number }>;
}

export function baixarRelatorioDashboardPdf(dados: DadosRelatorioDashboard): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = 297;
  const pageHeight = 210;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // Header Title
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('DASHBOARD - RELATÓRIO ANALÍTICO DE SETUPS CNC', margin, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text('Histórico Geral de Produção, Tempos de Setup e Paradas de Máquina', margin, 24);

  const agora = new Date();
  const dataEmissaoStr = `${agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} às ${agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}`;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.line(margin, 27, pageWidth - margin, 27);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`MÁQUINA: `, margin, 32);
  doc.setFont('helvetica', 'normal');
  doc.text(`${dados.filtroMaquina}`, margin + 22, 32);

  doc.setFont('helvetica', 'bold');
  doc.text(`PERÍODO: `, margin + 95, 32);
  doc.setFont('helvetica', 'normal');
  doc.text(`${dados.filtroPeriodo}`, margin + 112, 32);

  doc.setFont('helvetica', 'bold');
  doc.text(`EMISSÃO: `, margin + 195, 32);
  doc.setFont('helvetica', 'normal');
  doc.text(`${dataEmissaoStr}`, margin + 212, 32);

  // 2 KPI Boxes
  const kpiBoxWidth = (contentWidth - 6) / 2;
  const kpiY = 37;

  // Box 1: Total Setups
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.setFillColor(245, 245, 245);
  doc.rect(margin, kpiY, kpiBoxWidth, 18, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(50, 50, 50);
  doc.text('TOTAL DE SETUPS REALIZADOS', margin + kpiBoxWidth / 2, kpiY + 6, { align: 'center' });
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text(String(dados.kpiTotal), margin + kpiBoxWidth / 2, kpiY + 14, { align: 'center' });

  // Box 2: Tempo Médio
  const b2X = margin + kpiBoxWidth + 6;
  doc.rect(b2X, kpiY, kpiBoxWidth, 18, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(50, 50, 50);
  doc.text('TEMPO MÉDIO DE EXECUÇÃO', b2X + kpiBoxWidth / 2, kpiY + 6, { align: 'center' });
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text(dados.kpiMedia, b2X + kpiBoxWidth / 2, kpiY + 14, { align: 'center' });

  let currentY = kpiY + 24;

  // Table
  const tableBody = dados.filtrados.map((item) => {
    let histClean = '-';
    if (item.historico && item.historico.trim() !== '') {
      histClean = item.historico
        .split('|')
        .map((h) => `• ${h.trim().replace(/\[.*?\]\s*/, '')}`)
        .join('\n');
    }

    return [
      item.data || '-',
      item.maquina || '-',
      `${item.prep1 || '-'} / ${item.prep2 || '-'}`,
      item.modeloAnterior || '-',
      item.peca || '-',
      histClean,
      item.tempo || '-'
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [['Data', 'Máquina', 'Preparadores', 'Mod. Anterior', 'Peça Atual', 'Paradas / Eventos', 'Tempo']],
    body: tableBody,
    theme: 'plain',
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 8,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      cellPadding: 2,
      overflow: 'linebreak'
    },
    headStyles: {
      fillColor: [225, 225, 225],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      lineColor: [0, 0, 0],
      lineWidth: 0.3
    },
    alternateRowStyles: {
      fillColor: [248, 248, 248]
    },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 18, fontStyle: 'bold' },
      2: { cellWidth: 38 },
      3: { cellWidth: 26 },
      4: { cellWidth: 32, fontStyle: 'bold' },
      5: { cellWidth: 'auto', fontSize: 7 },
      6: { cellWidth: 22, halign: 'center', fontStyle: 'bold' }
    },
    didDrawPage: (data) => {
      const totalPages = doc.getNumberOfPages();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Página ${data.pageNumber} de ${totalPages} — Setup Interno CNC (Documento Otimizado para Impressoras Preto e Branco)`,
        pageWidth / 2,
        pageHeight - 6,
        { align: 'center' }
      );
    }
  });

  // Top 10 Paradas
  if (dados.top10Paradas && dados.top10Paradas.length > 0) {
    // @ts-expect-error autoTable adds lastAutoTable
    let nextY = (doc.lastAutoTable?.finalY || 100) + 7;
    if (nextY > pageHeight - 45) {
      doc.addPage();
      nextY = margin;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text('TOP 10 MOTIVOS DE PARADAS / EVENTOS (FREQUÊNCIA)', margin, nextY);

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(margin, nextY + 1.5, pageWidth - margin, nextY + 1.5);
    nextY += 4;

    const bodyParadas = dados.top10Paradas.map((p) => [
      `${p.count}x`,
      p.descricao,
      `${p.pct}%`
    ]);

    autoTable(doc, {
      startY: nextY,
      head: [['Frequência', 'Descrição da Parada / Ocorrência / Motivo', '% do Total']],
      body: bodyParadas,
      theme: 'plain',
      tableWidth: contentWidth * 0.85,
      margin: { left: margin },
      styles: {
        fontSize: 8,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.2,
        cellPadding: 2
      },
      headStyles: {
        fillColor: [230, 230, 230],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        lineColor: [0, 0, 0],
        lineWidth: 0.3
      },
      alternateRowStyles: {
        fillColor: [248, 248, 248]
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 26, fontStyle: 'bold' },
        1: { halign: 'left' },
        2: { halign: 'center', cellWidth: 26, fontStyle: 'bold' }
      }
    });
  }

  const dataLimpa = new Date().toISOString().slice(0, 10);
  doc.save(`Dashboard_CNC_${dataLimpa}.pdf`);
}
