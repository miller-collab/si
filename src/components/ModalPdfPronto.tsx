import React from 'react';
import { FileText, Download, Printer, CheckCircle, X, ExternalLink } from 'lucide-react';
import type { DadosRelatorioGestor } from '../utils/pdfGestor';
import { baixarRelatorioGestorPdf, gerarRelatorioGestorBlob } from '../utils/pdfGestor';

interface ModalPdfProntoProps {
  aberto: boolean;
  dados: DadosRelatorioGestor | null;
  aoFechar: () => void;
}

export const ModalPdfPronto: React.FC<ModalPdfProntoProps> = ({
  aberto,
  dados,
  aoFechar
}) => {
  if (!aberto || !dados) return null;

  const dataLimpa = new Date().toISOString().slice(0, 10);
  const colabLimpo = (dados.colabNome || 'Geral').replace(/\s+/g, '_');
  const nomeArquivoSugerido = `Relatorio_CNC_Gestor_${colabLimpo}_${dataLimpa}.pdf`;

  const handleBaixarNovamente = () => {
    baixarRelatorioGestorPdf(dados, nomeArquivoSugerido);
  };

  const handleAbrirParaImprimir = () => {
    try {
      const blob = gerarRelatorioGestorBlob(dados);
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (!win) {
        // If popup was blocked, fallback to direct download
        baixarRelatorioGestorPdf(dados, nomeArquivoSugerido);
      }
    } catch (e) {
      console.error('Erro ao abrir PDF:', e);
      baixarRelatorioGestorPdf(dados, nomeArquivoSugerido);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden relative">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-6 border-b border-slate-800 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <CheckCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-black text-white tracking-tight">
                PDF em Preto e Branco Gerado!
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Otimizado para impressoras P&B e tons de cinza.
              </p>
            </div>
          </div>
          <button
            onClick={aoFechar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-4">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <FileText className="w-8 h-8 text-blue-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">
                  Arquivo Gerado
                </span>
                <p className="text-sm font-mono font-bold text-white truncate">
                  {nomeArquivoSugerido}
                </p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap gap-2 text-[11px] text-slate-400">
              <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300 font-semibold">
                Formato A4 Paisagem
              </span>
              <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300 font-semibold">
                Alto Contraste P&B
              </span>
              <span className="bg-slate-800 px-2 py-0.5 rounded text-slate-300 font-semibold">
                {dados.kpiTotal} setups auditados
              </span>
            </div>
          </div>

          <div className="p-3 bg-emerald-950/40 border border-emerald-600/30 rounded-xl text-xs text-emerald-300 flex items-start gap-2.5">
            <span className="text-base leading-none">💡</span>
            <p className="leading-relaxed">
              O arquivo foi enviado para download com a caixa <strong>"Salvar Como"</strong> do seu navegador. Você pode salvar no seu computador ou abrir direto na guia para enviar para sua impressora.
            </p>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={handleBaixarNovamente}
              className="bg-blue-600 hover:bg-blue-500 text-white font-black py-3 px-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
            >
              <Download className="w-4 h-4" />
              <span>Salvar Como / Baixar</span>
            </button>

            <button
              type="button"
              onClick={handleAbrirParaImprimir}
              className="bg-slate-800 hover:bg-slate-700 text-white font-black py-3 px-4 rounded-xl border border-slate-700 hover:border-slate-600 transition flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
            >
              <Printer className="w-4 h-4 text-emerald-400" />
              <span>Visualizar / Imprimir</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-950 p-4 border-t border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={aoFechar}
            className="px-5 py-2 text-xs font-bold text-slate-400 hover:text-white transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
