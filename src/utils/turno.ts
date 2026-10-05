import type { TurnoConfig } from '../types';

export function estaNoTurno(dataObj: Date, config: TurnoConfig): boolean {
  if (!config || !config.dias) return true;
  const hStr =
    dataObj.getHours().toString().padStart(2, '0') +
    ':' +
    dataObj.getMinutes().toString().padStart(2, '0');
  
  const diaOk = config.dias.includes(dataObj.getDay().toString());
  let horaOk = false;

  if (config.inicio <= config.fim) {
    horaOk = hStr >= config.inicio && hStr <= config.fim;
  } else {
    // Turno que vira a noite (ex: 22:00 às 06:00)
    horaOk = hStr >= config.inicio || hStr <= config.fim;
  }

  return diaOk && horaOk;
}

export function calcularTempoValidoTurno(startMs: number, endMs: number, config: TurnoConfig): number {
  if (!startMs || endMs <= startMs || !config || !config.dias || config.dias.length === 0) {
    return Math.max(0, endMs - startMs);
  }

  const [hIni, mIni] = (config.inicio || '07:00').split(':').map(Number);
  const [hFim, mFim] = (config.fim || '17:00').split(':').map(Number);
  const isOvernight = hIni > hFim || (hIni === hFim && mIni > mFim);

  let totalMs = 0;

  const curDate = new Date(startMs);
  curDate.setHours(0, 0, 0, 0);

  const finalDate = new Date(endMs);
  finalDate.setHours(23, 59, 59, 999);

  while (curDate.getTime() <= finalDate.getTime()) {
    const y = curDate.getFullYear();
    const m = curDate.getMonth();
    const d = curDate.getDate();
    const diaSemana = curDate.getDay().toString();

    if (config.dias.includes(diaSemana)) {
      if (!isOvernight) {
        const winStart = new Date(y, m, d, hIni, mIni, 0, 0).getTime();
        const winEnd = new Date(y, m, d, hFim, mFim, 0, 0).getTime();
        const actStart = Math.max(startMs, winStart);
        const actEnd = Math.min(endMs, winEnd);
        if (actEnd > actStart) {
          totalMs += (actEnd - actStart);
        }
      } else {
        // Overnight shift: segment 1 on day D
        const win1Start = new Date(y, m, d, hIni, mIni, 0, 0).getTime();
        const win1End = new Date(y, m, d, 23, 59, 59, 999).getTime() + 1;
        const a1 = Math.max(startMs, win1Start);
        const b1 = Math.min(endMs, win1End);
        if (b1 > a1) totalMs += (b1 - a1);

        // Overnight shift: segment 2 on day D + 1
        const win2Start = new Date(y, m, d + 1, 0, 0, 0, 0).getTime();
        const win2End = new Date(y, m, d + 1, hFim, mFim, 0, 0).getTime();
        const a2 = Math.max(startMs, win2Start);
        const b2 = Math.min(endMs, win2End);
        if (b2 > a2) totalMs += (b2 - a2);
      }
    }

    curDate.setDate(curDate.getDate() + 1);
  }

  return totalMs;
}

export function formatarTempo(ms: number): string {
  if (!ms || ms < 0 || isNaN(ms)) return '00:00:00';
  const totalSeg = Math.floor(ms / 1000);
  const h = Math.floor(totalSeg / 3600);
  const m = Math.floor((totalSeg % 3600) / 60);
  const s = totalSeg % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function parseDataBR(dataStr: string): number {
  if (!dataStr || dataStr === '-') return 0;
  // Format: "DD/MM/YYYY HH:mm" or "DD/MM/YYYY HH:mm:ss"
  const partes = dataStr.split(' ');
  if (partes.length < 2) return 0;
  const dataP = partes[0].split('/');
  const horaP = partes[1].split(':');
  if (dataP.length < 3 || horaP.length < 2) return 0;
  
  const dia = parseInt(dataP[0], 10);
  const mes = parseInt(dataP[1], 10) - 1;
  const ano = parseInt(dataP[2], 10);
  const hora = parseInt(horaP[0], 10);
  const minuto = parseInt(horaP[1], 10);
  const segundo = horaP[2] ? parseInt(horaP[2], 10) : 0;

  return new Date(ano, mes, dia, hora, minuto, segundo).getTime();
}
