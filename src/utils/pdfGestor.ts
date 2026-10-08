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

function formatarHoraSimples(d: number | Date): string {
  try {
    const obj = typeof d === 'number' ? new Date(d) : d;
    return obj.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
}

/**
 * Extrai as linhas de paradas e eventos de um setup concluído exatamente como exibido na Foto 1,
 * com o horário de início e fim da parada explícitos.
 */
export function extrairLinhasParadas(c: SetupConcluido): string[] {
  if (c.eventos && Array.isArray(c.eventos) && c.eventos.length > 0) {
    const linhas: string[] = [];
    c.eventos.forEach((ev) => {
      let faixaTempo = '';
      if (ev.inicioMs && ev.fimMs) {
        const horaIni = formatarHoraSimples(ev.inicioMs);
        const horaFim = formatarHoraSimples(ev.fimMs);
        const durMs = ev.duracaoMs || Math.max(0, ev.fimMs - ev.inicioMs);
        const durMin = Math.round(durMs / 60000);
        const durStr = durMin > 0 ? `${durMin} min` : `${Math.max(1, Math.round(durMs / 1000))}s`;
        faixaTempo = `[${horaIni} às ${horaFim}] (${durStr}) `;
      } else if (ev.inicioMs) {
        const horaIni = formatarHoraSimples(ev.inicioMs);
        faixaTempo = `[Início: ${horaIni}] `;
      } else if (ev.timestamp) {
        faixaTempo = `[${ev.timestamp}] `;
      }

      if (ev.tipo === 'cafe') {
        linhas.push(`${faixaTempo}Intervalo de Café (-15 min)`);
      } else if (ev.tipo === 'almoco') {
        linhas.push(`${faixaTempo}Almoço (-1.5h)`);
      } else {
        linhas.push(`${faixaTempo}Parada: ${ev.motivo || 'Sem motivo informado'}`);
      }
    });
    if (linhas.length > 0) return linhas;
  }

  if (c.historico && c.historico.trim() !== '') {
    const partes = c.historico.split('|').map((p) => p.trim()).filter(Boolean);
    const paradas = partes.filter((p) => {
      const low = p.toLowerCase();
      if (low.includes('início do setup') || low.includes('inicio do setup') || low.includes('setup iniciado')) return false;
      if (low.includes('fim do setup') || low.includes('máquina liberada') || low.includes('maquina liberada')) return false;
      return true;
    });
    if (paradas.length > 0) return paradas;
  }

  return ['Sem paradas registradas neste setup.'];
}

/**
 * Cria o documento PDF no formato A4 RETRATO (Portrait), 100% FIEL à FOTO 1.
 * Otimizado com bordas pretas, caixas de gargalos e tabelas executivas monocromáticas.
 */
export function criarDocRelatorioGestor(dados: DadosRelatorioGestor): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 12;
  const contentWidth = pageWidth - margin * 2; // 186mm

  // Título Centralizado: Performance por Colaborador
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Performance por Colaborador', pageWidth / 2, 16, { align: 'center' });

  // Caixa Superior com Filtro e Período (Foto 1)
  const headerBoxY = 20;
  const headerBoxHeight = 8;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.35);
  doc.setFillColor(255, 255, 255);
  doc.rect(margin, headerBoxY, contentWidth, headerBoxHeight, 'S');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`Filtro: `, margin + 3, headerBoxY + 5.2);
  doc.setFont('helvetica', 'normal');
  const filtroTxt = `${dados.colabNome}   |   `;
  doc.text(filtroTxt, margin + 11, headerBoxY + 5.2);

  const filtroWidth = doc.getTextWidth(`Filtro: ${filtroTxt}`);
  doc.setFont('helvetica', 'bold');
  doc.text(`Período: `, margin + 3 + filtroWidth, headerBoxY + 5.2);
  doc.setFont('helvetica', 'normal');
  doc.text(`${dados.periodoTexto}`, margin + 3 + filtroWidth + doc.getTextWidth('Período: '), headerBoxY + 5.2);

  // 4 Caixas de KPIs (Foto 1)
  const kpiY = headerBoxY + headerBoxHeight + 4; // 32mm
  const kpiBoxWidth = (contentWidth - 9) / 4;   // 44.25mm cada
  const kpiBoxHeight = 25;

  // 1. Total Setups Feitos
  let bX = margin;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.35);
  doc.rect(bX, kpiY, kpiBoxWidth, kpiBoxHeight, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(40, 40, 40);
  doc.text('TOTAL SETUPS FEITOS', bX + kpiBoxWidth / 2, kpiY + 5, { align: 'center' });
  doc.setFontSize(15);
  doc.setTextColor(0, 0, 0);
  doc.text(String(dados.kpiTotal), bX + kpiBoxWidth / 2, kpiY + 15, { align: 'center' });

  // 2. Média de Tempo
  bX += kpiBoxWidth + 3;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.35);
  doc.rect(bX, kpiY, kpiBoxWidth, kpiBoxHeight, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(40, 40, 40);
  doc.text('MÉDIA DE TEMPO', bX + kpiBoxWidth / 2, kpiY + 5, { align: 'center' });
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text(dados.kpiMedia, bX + kpiBoxWidth / 2, kpiY + 15, { align: 'center' });

  // 3. Menor Tempo
  bX += kpiBoxWidth + 3;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.35);
  doc.rect(bX, kpiY, kpiBoxWidth, kpiBoxHeight, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(40, 40, 40);
  doc.text('MENOR TEMPO', bX + kpiBoxWidth / 2, kpiY + 5, { align: 'center' });
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text(dados.menorTempoStr, bX + kpiBoxWidth / 2, kpiY + 12, { align: 'center' });
  if (dados.setupMenorTempo) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(70, 70, 70);
    doc.text(dados.setupMenorTempo.data || '', bX + kpiBoxWidth / 2, kpiY + 16, { align: 'center' });
    doc.text(`Mod: ${dados.setupMenorTempo.peca || '-'}`, bX + kpiBoxWidth / 2, kpiY + 19.5, { align: 'center' });
    doc.text(`Prep: ${dados.setupMenorTempo.prep1 || '-'}`, bX + kpiBoxWidth / 2, kpiY + 23, { align: 'center' });
  }

  // 4. Maior Tempo (Gargalo)
  bX += kpiBoxWidth + 3;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.35);
  doc.rect(bX, kpiY, kpiBoxWidth, kpiBoxHeight, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(40, 40, 40);
  doc.text('MAIOR TEMPO (GARGALO)', bX + kpiBoxWidth / 2, kpiY + 5, { align: 'center' });
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text(dados.maiorTempoStr, bX + kpiBoxWidth / 2, kpiY + 12, { align: 'center' });
  if (dados.setupMaiorTempo) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(70, 70, 70);
    doc.text(dados.setupMaiorTempo.data || '', bX + kpiBoxWidth / 2, kpiY + 16, { align: 'center' });
    doc.text(`Mod: ${dados.setupMaiorTempo.peca || '-'}`, bX + kpiBoxWidth / 2, kpiY + 19.5, { align: 'center' });
    doc.text(`Prep: ${dados.setupMaiorTempo.prep1 || '-'}`, bX + kpiBoxWidth / 2, kpiY + 23, { align: 'center' });
  }

  let currentY = kpiY + kpiBoxHeight + 6; // ~63mm

  // SEÇÃO: Top 3 Maiores Tempos (Gargalos) - Foto 1
  if (dados.top3 && dados.top3.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    doc.text('Top 3 Maiores Tempos (Gargalos)', margin, currentY);

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(margin, currentY + 1.2, pageWidth - margin, currentY + 1.2);
    currentY += 4.5;

    dados.top3.forEach((g, gIdx) => {
      const paradasList = extrairLinhasParadas(g);
      const paradasTxt = paradasList.join('\n');

      const splitText = doc.splitTextToSize(paradasTxt, contentWidth - 10);
      const innerBoxHeight = Math.max(12, splitText.length * 3.6 + 4);
      const totalBoxHeight = 11 + innerBoxHeight;

      // Se não couber na página, cria nova página
      if (currentY + totalBoxHeight > pageHeight - 12) {
        doc.addPage();
        currentY = margin;
      }

      // Caixa externa com borda preta
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.35);
      doc.setFillColor(255, 255, 255);
      doc.rect(margin, currentY, contentWidth, totalBoxHeight, 'S');

      // Cabeçalho da máquina (#1 - Máquina: ...)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(0, 0, 0);
      doc.text(`#${gIdx + 1} - Máquina: ${g.maquina}`, margin + 3, currentY + 4.5);

      // Sub-cabeçalho com dados completos
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(30, 30, 30);
      const subInfo = `Data: ${g.data} | Preparadores: ${g.prep1} / ${g.prep2} | Mod. Anterior: ${g.modeloAnterior || '-'} | Peça (Atual): ${g.peca} | Tempo Total: ${g.tempo}`;
      doc.text(subInfo, margin + 3, currentY + 8.5);

      // Sub-caixa interna cinza com as paradas (Foto 1)
      const innerY = currentY + 10;
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.2);
      doc.setFillColor(243, 244, 246); // gray-100
      doc.rect(margin + 2.5, innerY, contentWidth - 5, innerBoxHeight - 1, 'FD');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(20, 20, 20);
      doc.text(splitText, margin + 5, innerY + 3.8);

      currentY += totalBoxHeight + 3.5;
    });
  }

  // PÁGINA 2 / SEÇÃO: Listagem de Modelos Trabalhados - Foto 1
  if (currentY > pageHeight - 65) {
    doc.addPage();
    currentY = margin;
  } else {
    currentY += 2;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text('Listagem de Modelos Trabalhados', margin, currentY);

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(margin, currentY + 1.2, pageWidth - margin, currentY + 1.2);
  currentY += 3.5;

  // Monta tabela de Modelos Trabalhados
  const tableBody = dados.filtrados.map((item) => {
    const paradasList = extrairLinhasParadas(item);
    const paradasFormatadas = paradasList.map((p) => `• ${p}`).join('\n');

    return [
      item.data || '-',
      item.maquina || '-',
      `${item.prep1 || '-'} / ${item.prep2 || '-'}`,
      item.modeloAnterior || '-',
      item.peca || '-',
      paradasFormatadas,
      item.tempo || '-'
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [['Data', 'Máquina', 'Preparadores', 'Mod. Anterior', 'Peça (Atual)', 'Paradas / Eventos', 'Tempo']],
    body: tableBody,
    theme: 'plain',
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 6.8,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
      cellPadding: 1.8,
      overflow: 'linebreak'
    },
    headStyles: {
      fillColor: [229, 231, 235], // gray-200
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      lineColor: [0, 0, 0],
      lineWidth: 0.3
    },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 14, fontStyle: 'bold' },
      2: { cellWidth: 28 },
      3: { cellWidth: 22 },
      4: { cellWidth: 25 },
      5: { cellWidth: 'auto', fontSize: 6.2 },
      6: { cellWidth: 16, halign: 'center', fontStyle: 'bold' }
    }
  });

  // @ts-expect-error autoTable adds lastAutoTable
  currentY = (doc.lastAutoTable?.finalY || currentY) + 6;

  // SEÇÃO: Top 10 Motivos de Paradas / Eventos (Frequência) - Foto 1
  if (dados.top10Paradas && dados.top10Paradas.length > 0) {
    if (currentY > pageHeight - 50) {
      doc.addPage();
      currentY = margin;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    doc.text('Top 10 Motivos de Paradas / Eventos (Frequência)', margin, currentY);

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(margin, currentY + 1.2, pageWidth - margin, currentY + 1.2);
    currentY += 3.5;

    const bodyParadas = dados.top10Paradas.map((p) => [
      `${p.count}x`,
      p.descricao
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Frequência', 'Descrição do Evento / Parada']],
      body: bodyParadas,
      theme: 'plain',
      tableWidth: contentWidth * 0.75,
      margin: { left: margin },
      styles: {
        fontSize: 7,
        textColor: [0, 0, 0],
        lineColor: [0, 0, 0],
        lineWidth: 0.25,
        cellPadding: 1.8
      },
      headStyles: {
        fillColor: [229, 231, 235],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        lineColor: [0, 0, 0],
        lineWidth: 0.3
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 20, fontStyle: 'bold' },
        1: { halign: 'left' }
      }
    });
  }

  return doc;
}

/**
 * Gera e dispara o download do PDF.
 */
export function baixarRelatorioGestorPdf(dados: DadosRelatorioGestor, nomeArquivo?: string): void {
  const doc = criarDocRelatorioGestor(dados);
  const dataLimpa = new Date().toISOString().slice(0, 10);
  const colabLimpo = (dados.colabNome || 'Geral').replace(/\s+/g, '_');
  const nomeFinal = nomeArquivo || `Relatorio_Performance_${colabLimpo}_${dataLimpa}.pdf`;
  doc.save(nomeFinal);
}

/**
 * Gera o Blob do PDF para abertura em iframe ou preview.
 */
export function gerarRelatorioGestorBlob(dados: DadosRelatorioGestor): Blob {
  const doc = criarDocRelatorioGestor(dados);
  return doc.output('blob');
}

/**
 * Gera o PDF do Dashboard Geral (Aba Relatórios).
 */
export function baixarRelatorioDashboardPdf(dados: {
  filtrados: SetupConcluido[];
  filtroMaquina: string;
  filtroPeriodo: string;
  kpiTotal: number;
  kpiMedia: string;
  top10Paradas: Array<{ descricao: string; count: number; pct: number }>;
}): void {
  const dadosConvertidos: DadosRelatorioGestor = {
    filtrados: dados.filtrados,
    colabNome: dados.filtroMaquina === 'todas' ? 'Todas as Máquinas' : dados.filtroMaquina,
    periodoTexto: dados.filtroPeriodo === 'todos' ? 'Todo o Histórico' : dados.filtroPeriodo,
    top3: [...dados.filtrados].sort((a, b) => (b.tempoMs || 0) - (a.tempoMs || 0)).slice(0, 3),
    top10Paradas: dados.top10Paradas,
    kpiTotal: dados.kpiTotal,
    kpiMedia: dados.kpiMedia,
    menorTempoStr: dados.filtrados.length > 0 ? [...dados.filtrados].sort((a, b) => (a.tempoMs || 0) - (b.tempoMs || 0))[0].tempo : '00:00:00',
    maiorTempoStr: dados.filtrados.length > 0 ? [...dados.filtrados].sort((a, b) => (b.tempoMs || 0) - (a.tempoMs || 0))[0].tempo : '00:00:00',
    setupMenorTempo: dados.filtrados.length > 0 ? [...dados.filtrados].sort((a, b) => (a.tempoMs || 0) - (b.tempoMs || 0))[0] : null,
    setupMaiorTempo: dados.filtrados.length > 0 ? [...dados.filtrados].sort((a, b) => (b.tempoMs || 0) - (a.tempoMs || 0))[0] : null
  };

  baixarRelatorioGestorPdf(dadosConvertidos, `Dashboard_CNC_${new Date().toISOString().slice(0, 10)}.pdf`);
}
