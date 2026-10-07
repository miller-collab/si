import React, { useState, useEffect } from 'react';
import {
  X,
  QrCode,
  Copy,
  Check,
  Tablet,
  Wifi,
  Sparkles,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';

interface ModalConectarTabletsProps {
  aberto: boolean;
  aoFechar: () => void;
  tabletsConectados: number;
  online: boolean;
}

export const ModalConectarTablets: React.FC<ModalConectarTabletsProps> = ({
  aberto,
  aoFechar,
  tabletsConectados,
  online
}) => {
  const [copiado, setCopiado] = useState(false);

  // Target production URL or current window URL
  const publicUrl = typeof window !== 'undefined'
    ? (window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
        ? 'https://ais-pre-nqcvyd3bnkck2qksczzs5i-795025193395.us-east1.run.app'
        : window.location.origin)
    : 'https://ais-pre-nqcvyd3bnkck2qksczzs5i-795025193395.us-east1.run.app';

  const qrCodeDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&data=${encodeURIComponent(publicUrl)}`;

  if (!aberto) return null;

  const handleCopiar = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={aoFechar}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
          title="Fechar"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
            <Tablet className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-black text-white">Conectar Tablets em Tempo Real</h3>
            <p className="text-xs text-slate-400">
              Sincronização instantânea na nuvem em todos os dispositivos da fábrica
            </p>
          </div>
        </div>

        {/* Live Status Badge */}
        <div className="mb-5 p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
            <span className="text-xs font-bold text-slate-200">
              {online ? 'Servidor Ativo em Tempo Real' : 'Reconectando...'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-extrabold">
            <Wifi className="w-3.5 h-3.5" />
            <span>{tabletsConectados} {tabletsConectados === 1 ? 'dispositivo conectado' : 'dispositivos conectados'}</span>
          </div>
        </div>

        {/* QR Code Card */}
        <div className="flex flex-col items-center justify-center p-5 bg-slate-950 rounded-xl border border-slate-800 mb-5 text-center">
          <p className="text-xs text-slate-300 font-bold mb-3 flex items-center gap-1.5">
            <QrCode className="w-4 h-4 text-blue-400" />
            Aponte a câmera do tablet para escanear:
          </p>

          <div className="bg-white p-3 rounded-xl shadow-lg border border-slate-200 inline-block mb-3">
            {qrCodeDataUrl ? (
              <img src={qrCodeDataUrl} alt="QR Code de Conexão" className="w-48 h-48 object-contain" />
            ) : (
              <div className="w-48 h-48 flex items-center justify-center text-slate-400 text-xs">
                Gerando QR Code...
              </div>
            )}
          </div>

          <p className="text-[11px] text-slate-400 max-w-sm">
            Abra a câmera de qualquer tablet ou celular para abrir o link instantaneamente, sem precisar digitar.
          </p>
        </div>

        {/* Copy Link Section */}
        <div className="mb-5 space-y-1.5">
          <label className="text-xs font-bold text-slate-300">Link Direto de Acesso:</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-blue-400 truncate select-all">
              {publicUrl}
            </div>
            <button
              onClick={handleCopiar}
              className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition ${
                copiado
                  ? 'bg-emerald-600 text-white'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30'
              }`}
            >
              {copiado ? (
                <>
                  <Check className="w-4 h-4" /> Copiado!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" /> Copiar
                </>
              )}
            </button>
          </div>
        </div>

        {/* Practical Shop Floor Tips */}
        <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-500/20 text-xs space-y-2 text-slate-300">
          <div className="font-bold text-blue-300 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" /> Como funciona na fábrica:
          </div>
          <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-300/90 leading-relaxed">
            <li><strong className="text-white">Sincronização Instantânea:</strong> Qualquer checklist marcado, máquina iniciada ou parada registrada aparece imediatamente em todos os outros tablets.</li>
            <li><strong className="text-white">Sem necessidade de cadastro extra:</strong> Não precisa configurar Firebase ou contas externas — o sistema já roda centralizado no servidor em nuvem.</li>
            <li><strong className="text-white">Dica para tela cheia:</strong> No tablet, toque no menu do navegador (três pontinhos) e selecione <span className="text-blue-400 font-semibold">"Adicionar à Tela de Início"</span> para abrir como um app completo.</li>
          </ul>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={aoFechar}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
