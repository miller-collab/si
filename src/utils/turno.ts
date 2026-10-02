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
  if (!startMs || endMs <= startMs) return 0;
  const diff = endMs - startMs;
  
  // Se a diferença for bem curta (menos de 2 minutos), faz checagem simples
  if (diff <= 120000) {
    if (estaNoTurno(new Date(endMs), config)) return diff;
    return 0;
  }

  let tempoValido = 0;
  let cursorMs = startMs;
  // Avança de minuto em minuto para calcular precisamente dentro dos turnos
  while (cursorMs < endMs) {
    const passoMs = Math.min(60000, endMs - cursorMs);
    const d = new Date(cursorMs);
    if (estaNoTurno(d, config)) {
      tempoValido += passoMs;
    }
    cursorMs += passoMs;
  }
  return tempoValido;
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
