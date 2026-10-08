import React, { useRef, useState } from 'react';
import { Download, Printer, X, Eye, FileText, CheckCircle, Pencil } from 'lucide-react';
import type { DadosRelatorioGestor } from '../utils/pdfGestor';
import { baixarRelatorioGestorPdf, extrairLinhasParadas } from '../utils/pdfGestor';
import { ModalEditarTempoSetup } from './ModalEditarTempoSetup';

interface ModalVisualizarRelatorioProps {
  aberto: boolean;
  dados: DadosRelatorioGestor | null;
  aoFechar: () => void;
  aoEditarTempo?: (id: string, novoTempo: string, senha: string) => Promise<void>;
}

export const ModalVisualizarRelatorio: React.FC<ModalVisualizarRelatorioProps> = ({
  aberto,
  dados,
  aoFechar,
  aoEditarTempo
}) => {
  const [setupEditando, setSetupEditando] = useState<{
    id: string;
    maquina: string;
    peca: string;
    tempoAtual: string;
  } | null>(null);

  if (!aberto || !dados) return null;

  const dataLimpa = new Date().toISOString().slice(0, 10);
  const colabLimpo = (dados.colabNome || 'Geral').replace(/\s+/g, '_');
  const nomeArquivo = `Relatorio_Performance_${colabLimpo}_${dataLimpa}.pdf`;

  const handleBaixarPdf = () => {
    baixarRelatorioGestorPdf(dados, nomeArquivo);
  };

  const handleImprimir = () => {
    window.print();
  };

  const handleSalvarTempoRaiz = async (id: string, novoTempo: string, senha: string) => {
    if (aoEditarTempo) {
      await aoEditarTempo(id, novoTempo, senha);
      // Atualiza localmente a lista exibida na folha para refletir imediatamente
      const item = dados.filtrados.find((f) => f.id === id);
      if (item) {
        item.tempo = novoTempo;
      }
      const gItem = dados.top3.find((g) => g.id === id);
      if (gItem) {
        gItem.tempo = novoTempo;
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/90 backdrop-blur-md overflow-hidden animate-in fade-in duration-200">
      {/* Top Action Bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Eye className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <span>Visualizar Antes de Salvar</span>
              <span className="text-[10px] font-bold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30 uppercase">
                Layout Fiel à Foto 1
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Confira a folha completa abaixo exatamente como será impressa ou salva no PDF.
            </p>
          </div>
        </div>

        {/* Buttons: Baixar PDF, Imprimir, Fechar */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleBaixarPdf}
            className="flex-1 sm:flex-initial bg-blue-600 hover:bg-blue-500 text-white font-black py-2.5 px-4 rounded-xl shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
            title="Baixar arquivo em PDF idêntico à folha visualizada"
          >
            <Download className="w-4 h-4" />
            <span>Salvar em PDF</span>
          </button>

          <button
            type="button"
            onClick={handleImprimir}
            className="flex-1 sm:flex-initial bg-slate-800 hover:bg-slate-700 text-white font-black py-2.5 px-4 rounded-xl border border-slate-700 hover:border-slate-600 transition flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
            title="Enviar diretamente para a impressora"
          >
            <Printer className="w-4 h-4 text-emerald-400" />
            <span>Imprimir</span>
          </button>

          <button
            type="button"
            onClick={aoFechar}
            className="p-2.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
            title="Fechar visualização"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Sheet Canvas Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-950 flex justify-center">
        {/* Authentic White A4 Sheet (Exact layout of Photo 1) */}
        <div
          id="folha-relatorio-a4"
          className="w-full max-w-[820px] bg-white text-black p-8 sm:p-12 shadow-2xl rounded-sm border border-slate-300 font-sans my-auto"
          style={{ minHeight: '1120px' }}
        >
          {/* 1. Header Title (Foto 1) */}
          <h1 className="text-center font-bold text-lg text-black mb-3 tracking-normal">
            Performance por Colaborador
          </h1>

          {/* 2. Bordered Filter Box (Foto 1) */}
          <div className="border border-black p-2.5 mb-5 text-[12px] flex flex-wrap items-center justify-start gap-4">
            <div>
              <strong>Filtro:</strong> {dados.colabNome}
            </div>
            <span className="text-slate-400">|</span>
            <div>
              <strong>Período:</strong> {dados.periodoTexto}
            </div>
          </div>

          {/* 3. 4 KPI Boxes in a Row (Foto 1) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {/* Box 1 */}
            <div className="border border-black p-3 text-center flex flex-col justify-between min-h-[95px]">
              <span className="text-[10px] font-bold uppercase tracking-tight block text-slate-700">
                TOTAL SETUPS FEITOS
              </span>
              <span className="text-3xl font-bold my-auto text-black">
                {dados.kpiTotal}
              </span>
              <span className="text-[9px] text-slate-500 invisible">.</span>
            </div>

            {/* Box 2 */}
            <div className="border border-black p-3 text-center flex flex-col justify-between min-h-[95px]">
              <span className="text-[10px] font-bold uppercase tracking-tight block text-slate-700">
                MÉDIA DE TEMPO
              </span>
              <span className="text-2xl font-bold my-auto text-black font-mono">
                {dados.kpiMedia}
              </span>
              <span className="text-[9px] text-slate-500 invisible">.</span>
            </div>

            {/* Box 3 */}
            <div className="border border-black p-2.5 text-center flex flex-col justify-between min-h-[95px]">
              <span className="text-[10px] font-bold uppercase tracking-tight block text-slate-700">
                MENOR TEMPO
              </span>
              <span className="text-xl font-bold my-auto text-black font-mono">
                {dados.menorTempoStr}
              </span>
              {dados.setupMenorTempo ? (
                <div className="text-[9px] text-slate-700 leading-tight">
                  <p>{dados.setupMenorTempo.data}</p>
                  <p>Mod: <strong>{dados.setupMenorTempo.peca}</strong></p>
                  <p>Prep: <strong>{dados.setupMenorTempo.prep1}</strong></p>
                </div>
              ) : (
                <span className="text-[9px] text-slate-500">-</span>
              )}
            </div>

            {/* Box 4 */}
            <div className="border border-black p-2.5 text-center flex flex-col justify-between min-h-[95px]">
              <span className="text-[10px] font-bold uppercase tracking-tight block text-slate-700">
                MAIOR TEMPO (GARGALO)
              </span>
              <span className="text-xl font-bold my-auto text-black font-mono">
                {dados.maiorTempoStr}
              </span>
              {dados.setupMaiorTempo ? (
                <div className="text-[9px] text-slate-700 leading-tight">
                  <p>{dados.setupMaiorTempo.data}</p>
                  <p>Mod: <strong>{dados.setupMaiorTempo.peca}</strong></p>
                  <p>Prep: <strong>{dados.setupMaiorTempo.prep1}</strong></p>
                </div>
              ) : (
                <span className="text-[9px] text-slate-500">-</span>
              )}
            </div>
          </div>

          {/* 4. Section: Top 3 Maiores Tempos (Gargalos) (Foto 1) */}
          <div className="mb-6">
            <h2 className="text-sm font-bold text-black border-b border-black pb-1 mb-3">
              Top 3 Maiores Tempos (Gargalos)
            </h2>

            {dados.top3 && dados.top3.length > 0 ? (
              <div className="space-y-3">
                {dados.top3.map((g, idx) => {
                  const paradasList = extrairLinhasParadas(g);
                  return (
                    <div key={idx} className="border border-black p-3.5 bg-white">
                      <div className="font-bold text-[12px] text-black mb-1">
                        #{idx + 1} - Máquina: {g.maquina}
                      </div>
                      <div className="text-[10.5px] text-slate-800 mb-2.5 leading-snug flex items-center justify-between flex-wrap gap-1">
                        <div>
                          <strong>Data:</strong> {g.data} &nbsp;|&nbsp;{' '}
                          <strong>Preparadores:</strong> {g.prep1} / {g.prep2} &nbsp;|&nbsp;{' '}
                          <strong>Mod. Anterior:</strong> {g.modeloAnterior || '-'} &nbsp;|&nbsp;{' '}
                          <strong>Peça (Atual):</strong> {g.peca}
                        </div>
                        <div className="flex items-center gap-1 font-mono font-bold">
                          <span>Tempo Total: <strong>{g.tempo}</strong></span>
                          {aoEditarTempo && (
                            <button
                              type="button"
                              onClick={() =>
                                setSetupEditando({
                                  id: g.id,
                                  maquina: g.maquina,
                                  peca: g.peca,
                                  tempoAtual: g.tempo
                                })
                              }
                              className="text-slate-500 hover:text-black p-0.5 rounded transition print:hidden"
                              title="Editar tempo deste setup com senha do líder (Salvar na raiz)"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Gray Inner Box with chronological stoppage timeline (Foto 1) */}
                      <div className="bg-[#f3f4f6] border border-slate-300 p-2.5 text-[10px] space-y-1 font-mono text-slate-900 rounded-sm">
                        {paradasList.map((p, pIdx) => (
                          <div key={pIdx} className="leading-tight">
                            {p}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic p-4 border border-black text-center">
                Nenhum setup com tempo registrado no período.
              </p>
            )}
          </div>

          {/* 5. Section: Listagem de Modelos Trabalhados (Foto 1) */}
          <div className="mb-6">
            <h2 className="text-sm font-bold text-black border-b border-black pb-1 mb-3">
              Listagem de Modelos Trabalhados
            </h2>

            <table className="w-full border-collapse border border-black text-[10px]">
              <thead>
                <tr className="bg-[#e5e7eb]">
                  <th className="border border-black p-1.5 text-left font-bold w-[12%]">Data</th>
                  <th className="border border-black p-1.5 text-left font-bold w-[9%]">Máquina</th>
                  <th className="border border-black p-1.5 text-left font-bold w-[18%]">Preparadores</th>
                  <th className="border border-black p-1.5 text-left font-bold w-[13%]">Mod. Anterior</th>
                  <th className="border border-black p-1.5 text-left font-bold w-[15%]">Peça (Atual)</th>
                  <th className="border border-black p-1.5 text-left font-bold w-[23%]">Paradas / Eventos</th>
                  <th className="border border-black p-1.5 text-center font-bold w-[10%]">Tempo</th>
                </tr>
              </thead>
              <tbody>
                {dados.filtrados.map((item, idx) => {
                  const paradasList = extrairLinhasParadas(item);
                  return (
                    <tr key={idx} className="border-b border-black">
                      <td className="border border-black p-1.5 align-top">{item.data}</td>
                      <td className="border border-black p-1.5 align-top font-bold">{item.maquina}</td>
                      <td className="border border-black p-1.5 align-top">{item.prep1} / {item.prep2}</td>
                      <td className="border border-black p-1.5 align-top">{item.modeloAnterior || '-'}</td>
                      <td className="border border-black p-1.5 align-top font-bold">{item.peca}</td>
                      <td className="border border-black p-1.5 align-top text-[9.5px]">
                        {paradasList.map((p, pIdx) => {
                          const clean = p.replace(/\[.*?\]\s*/, '').trim();
                          return (
                            <div key={pIdx}>• {clean}</div>
                          );
                        })}
                      </td>
                      <td className="border border-black p-1.5 align-top text-center font-bold font-mono">
                        <div className="flex items-center justify-center gap-1 group/item">
                          <span>{item.tempo}</span>
                          {aoEditarTempo && (
                            <button
                              type="button"
                              onClick={() =>
                                setSetupEditando({
                                  id: item.id,
                                  maquina: item.maquina,
                                  peca: item.peca,
                                  tempoAtual: item.tempo
                                })
                              }
                              className="text-slate-400 hover:text-black p-0.5 rounded transition print:hidden"
                              title="Editar tempo deste setup com senha do líder (Salvar na raiz)"
                            >
                              <Pencil className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 6. Section: Top 10 Motivos de Paradas / Eventos (Frequência) (Foto 1) */}
          {dados.top10Paradas && dados.top10Paradas.length > 0 && (
            <div className="mb-4">
              <h2 className="text-sm font-bold text-black border-b border-black pb-1 mb-3">
                Top 10 Motivos de Paradas / Eventos (Frequência)
              </h2>

              <table className="w-[75%] border-collapse border border-black text-[10px]">
                <thead>
                  <tr className="bg-[#e5e7eb]">
                    <th className="border border-black p-1.5 text-center font-bold w-[18%]">Frequência</th>
                    <th className="border border-black p-1.5 text-left font-bold w-[82%]">Descrição do Evento / Parada</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.top10Paradas.map((p, pIdx) => (
                    <tr key={pIdx} className="border-b border-black">
                      <td className="border border-black p-1.5 text-center font-bold font-mono">
                        {p.count}x
                      </td>
                      <td className="border border-black p-1.5 text-left">
                        {p.descricao}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Sticky Footer */}
      <div className="bg-slate-900 border-t border-slate-800 px-6 py-3 flex items-center justify-between text-xs text-slate-400 shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-amber-400" />
          <span>Folha no padrão oficial de auditoria A4 (Foto 1)</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={aoFechar}
            className="px-4 py-2 rounded-xl text-slate-400 hover:text-white transition font-bold"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={handleBaixarPdf}
            className="bg-blue-600 hover:bg-blue-500 text-white font-black px-5 py-2.5 rounded-xl shadow-lg transition flex items-center gap-2 uppercase tracking-wider"
          >
            <Download className="w-4 h-4" />
            <span>Salvar em PDF</span>
          </button>
        </div>
      </div>

      {/* Modal para Editar Tempo e Salvar na Raiz */}
      <ModalEditarTempoSetup
        aberto={!!setupEditando}
        setup={setupEditando}
        aoFechar={() => setSetupEditando(null)}
        aoSalvar={handleSalvarTempoRaiz}
      />
    </div>
  );
};
