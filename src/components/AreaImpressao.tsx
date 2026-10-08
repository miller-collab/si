import React from 'react';
import type { SetupConcluido } from '../types';

export interface DadosImpressaoGestor {
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

export interface DadosImpressaoDashboard {
  filtrados: SetupConcluido[];
  filtroMaquina: string;
  filtroPeriodo: string;
  kpiTotal: number;
  kpiMedia: string;
  top10Paradas: Array<{ descricao: string; count: number; pct: number }>;
}

interface AreaImpressaoProps {
  modoImpressao: 'dashboard' | 'gestor' | null;
  dadosDashboard: DadosImpressaoDashboard | null;
  dadosGestor: DadosImpressaoGestor | null;
}

export const AreaImpressao: React.FC<AreaImpressaoProps> = ({
  modoImpressao,
  dadosDashboard,
  dadosGestor
}) => {
  if (!modoImpressao) return null;

  if (modoImpressao === 'dashboard' && dadosDashboard) {
    return (
      <div id="area-impressao-dashboard" className="print-area-active">
        <div style={{ fontFamily: 'Arial, sans-serif', color: '#000', width: '100%', fontSize: '13px' }}>
          <h1 style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '8px', margin: '0 0 10px 0', fontSize: '20px' }}>
            Dashboard - Relatório Analítico de Setups CNC
          </h1>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f3f4f6', padding: '10px', border: '1px solid #000', marginBottom: '15px' }}>
            <div>
              <strong>Máquina:</strong> {dadosDashboard.filtroMaquina} &nbsp;|&nbsp; <strong>Período:</strong> {dadosDashboard.filtroPeriodo}
            </div>
            <div style={{ fontSize: '15px' }}>
              <strong>Total de Setups:</strong> {dadosDashboard.kpiTotal} &nbsp;|&nbsp; <strong>Tempo Médio:</strong> {dadosDashboard.kpiMedia}
            </div>
          </div>

          <h3 style={{ margin: '15px 0 5px 0', fontSize: '14px', borderBottom: '1px solid #000', paddingBottom: '3px' }}>
            Histórico Detalhado dos Setups
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginBottom: '20px' }}>
            <thead>
              <tr style={{ backgroundColor: '#e5e7eb' }}>
                <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'left', width: '11%' }}>Data</th>
                <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'left', width: '9%' }}>Máquina</th>
                <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'left', width: '17%' }}>Preparadores</th>
                <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'left', width: '13%' }}>Mod. Anterior</th>
                <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'left', width: '15%' }}>Peça (Atual)</th>
                <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'left', width: '25%' }}>Paradas / Eventos</th>
                <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'center', width: '10%' }}>Tempo</th>
              </tr>
            </thead>
            <tbody>
              {dadosDashboard.filtrados.map((c, i) => (
                <tr key={i}>
                  <td style={{ border: '1px solid #000', padding: '4px 5px' }}>{c.data}</td>
                  <td style={{ border: '1px solid #000', padding: '4px 5px', fontWeight: 'bold' }}>{c.maquina}</td>
                  <td style={{ border: '1px solid #000', padding: '4px 5px' }}>{c.prep1} / {c.prep2}</td>
                  <td style={{ border: '1px solid #000', padding: '4px 5px' }}>{c.modeloAnterior || '-'}</td>
                  <td style={{ border: '1px solid #000', padding: '4px 5px' }}>{c.peca}</td>
                  <td style={{ border: '1px solid #000', padding: '4px 5px', fontSize: '10px', color: '#333' }}>
                    {c.historico && c.historico.trim() !== ''
                      ? c.historico.split('|').map((e, idx) => (
                          <div key={idx}>• {e.trim()}</div>
                        ))
                      : '-'}
                  </td>
                  <td style={{ border: '1px solid #000', padding: '4px 5px', textAlign: 'center', fontWeight: 'bold' }}>
                    {c.tempo}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {dadosDashboard.top10Paradas.length > 0 && (
            <div style={{ pageBreakInside: 'avoid' }}>
              <h3 style={{ borderBottom: '1px solid #000', paddingBottom: '3px', margin: '20px 0 5px 0', fontSize: '14px' }}>
                Top 10 Motivos de Paradas / Eventos (Frequência)
              </h3>
              <table style={{ width: '70%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#e5e7eb' }}>
                    <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'center', width: '15%' }}>Frequência</th>
                    <th style={{ border: '1px solid #000', padding: '5px', textAlign: 'left', width: '85%' }}>Descrição do Evento / Parada</th>
                  </tr>
                </thead>
                <tbody>
                  {dadosDashboard.top10Paradas.map((p, idx) => (
                    <tr key={idx}>
                      <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center', fontWeight: 'bold' }}>
                        {p.count}x
                      </td>
                      <td style={{ border: '1px solid #000', padding: '4px 6px' }}>{p.descricao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (modoImpressao === 'gestor' && dadosGestor) {
    return (
      <div id="area-impressao-gestor" className="print-area-active">
        <div style={{ fontFamily: 'Arial, sans-serif', color: '#000', width: '100%', fontSize: '13px' }}>
          <h1 style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '8px', margin: '0 0 10px 0', fontSize: '20px' }}>
            Relatório de Performance por Colaborador & Análise de Gargalos
          </h1>

          <div style={{ backgroundColor: '#f3f4f6', padding: '10px', margin: '10px 0 15px 0', border: '1px solid #000', fontSize: '14px' }}>
            <strong>Colaborador:</strong> {dadosGestor.colabNome} &nbsp;|&nbsp; <strong>Período:</strong> {dadosGestor.periodoTexto}
          </div>

          {/* 4 KPI Boxes */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
            <div style={{ border: '2px solid #000', padding: '10px', width: '23%', textAlign: 'center', backgroundColor: '#f9fafb' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold' }}>Total Setups Feitos</div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', marginTop: '4px' }}>{dadosGestor.kpiTotal}</div>
            </div>

            <div style={{ border: '2px solid #000', padding: '10px', width: '23%', textAlign: 'center', backgroundColor: '#f9fafb' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold' }}>Média de Tempo</div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', marginTop: '4px' }}>{dadosGestor.kpiMedia}</div>
            </div>

            <div style={{ border: '2px solid #000', padding: '10px', width: '23%', textAlign: 'center', backgroundColor: '#f9fafb' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold' }}>Menor Tempo (Recorde)</div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', marginTop: '4px' }}>{dadosGestor.menorTempoStr}</div>
              {dadosGestor.setupMenorTempo && (
                <div style={{ fontSize: '9px', color: '#333', marginTop: '4px', lineHeight: '1.2' }}>
                  {dadosGestor.setupMenorTempo.data}<br />
                  Máq: <strong>{dadosGestor.setupMenorTempo.maquina}</strong> | Mod: <strong>{dadosGestor.setupMenorTempo.peca}</strong>
                </div>
              )}
            </div>

            <div style={{ border: '2px solid #000', padding: '10px', width: '23%', textAlign: 'center', backgroundColor: '#f9fafb' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold' }}>Maior Tempo (Gargalo)</div>
              <div style={{ fontSize: '22px', fontWeight: 'bold', marginTop: '4px' }}>{dadosGestor.maiorTempoStr}</div>
              {dadosGestor.setupMaiorTempo && (
                <div style={{ fontSize: '9px', color: '#333', marginTop: '4px', lineHeight: '1.2' }}>
                  {dadosGestor.setupMaiorTempo.data}<br />
                  Máq: <strong>{dadosGestor.setupMaiorTempo.maquina}</strong> | Mod: <strong>{dadosGestor.setupMaiorTempo.peca}</strong>
                </div>
              )}
            </div>
          </div>

          {/* Top 3 Bottlenecks */}
          {dadosGestor.top3.length > 0 && (
            <div style={{ marginBottom: '15px' }}>
              <h3 style={{ borderBottom: '1px solid #000', paddingBottom: '3px', margin: '15px 0 10px 0', fontSize: '13px' }}>
                Top 3 Maiores Tempos (Gargalos)
              </h3>
              {dadosGestor.top3.map((c, index) => (
                <div key={index} style={{ border: '1px solid #000', padding: '10px', marginBottom: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
                    #{index + 1} - Máquina: {c.maquina} | Tempo: {c.tempo}
                  </div>
                  <div style={{ fontSize: '11px', marginBottom: '6px' }}>
                    <strong>Data:</strong> {c.data} | <strong>Preparadores:</strong> {c.prep1} / {c.prep2} | <strong>Mod. Ant:</strong> {c.modeloAnterior || '-'} | <strong>Peça Atual:</strong> {c.peca}
                  </div>
                  <div style={{ fontSize: '10px', paddingLeft: '10px', borderLeft: '3px solid #666', backgroundColor: '#f9fafb', padding: '6px' }}>
                    {c.historico && c.historico.trim() !== ''
                      ? c.historico.split('|').map((ev, i) => <div key={i}>• {ev.trim()}</div>)
                      : 'Sem histórico detalhado.'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Table of Worked Models */}
          <h3 style={{ borderBottom: '1px solid #000', paddingBottom: '3px', margin: '15px 0 5px 0', fontSize: '13px' }}>
            Listagem de Modelos Trabalhados
          </h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', marginBottom: '15px' }}>
            <thead>
              <tr style={{ backgroundColor: '#e5e7eb' }}>
                <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left', width: '11%' }}>Data</th>
                <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left', width: '9%' }}>Máquina</th>
                <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left', width: '17%' }}>Preparadores</th>
                <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left', width: '13%' }}>Mod. Anterior</th>
                <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left', width: '15%' }}>Peça (Atual)</th>
                <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left', width: '25%' }}>Paradas / Eventos</th>
                <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', width: '10%' }}>Tempo</th>
              </tr>
            </thead>
            <tbody>
              {dadosGestor.filtrados.map((c, i) => (
                <tr key={i}>
                  <td style={{ border: '1px solid #000', padding: '3px 4px' }}>{c.data}</td>
                  <td style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: 'bold' }}>{c.maquina}</td>
                  <td style={{ border: '1px solid #000', padding: '3px 4px' }}>{c.prep1} / {c.prep2}</td>
                  <td style={{ border: '1px solid #000', padding: '3px 4px' }}>{c.modeloAnterior || '-'}</td>
                  <td style={{ border: '1px solid #000', padding: '3px 4px' }}>{c.peca}</td>
                  <td style={{ border: '1px solid #000', padding: '3px 4px', fontSize: '9px', color: '#333' }}>
                    {c.historico && c.historico.trim() !== ''
                      ? c.historico.split('|').map((e, idx) => (
                          <div key={idx}>• {e.trim().replace(/\[.*?\]\s*/, '')}</div>
                        ))
                      : '-'}
                  </td>
                  <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center', fontWeight: 'bold' }}>
                    {c.tempo}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Top 10 Stoppages */}
          {dadosGestor.top10Paradas.length > 0 && (
            <div style={{ pageBreakInside: 'avoid' }}>
              <h3 style={{ borderBottom: '1px solid #000', paddingBottom: '3px', margin: '15px 0 5px 0', fontSize: '13px' }}>
                Top 10 Motivos de Paradas / Eventos (Frequência & Impacto)
              </h3>
              <table style={{ width: '70%', borderCollapse: 'collapse', fontSize: '10px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#e5e7eb' }}>
                    <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', width: '15%' }}>Frequência</th>
                    <th style={{ border: '1px solid #000', padding: '4px', textAlign: 'left', width: '85%' }}>Descrição do Evento / Parada</th>
                  </tr>
                </thead>
                <tbody>
                  {dadosGestor.top10Paradas.map((p, idx) => (
                    <tr key={idx}>
                      <td style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'center', fontWeight: 'bold' }}>
                        {p.count}x
                      </td>
                      <td style={{ border: '1px solid #000', padding: '3px 5px' }}>{p.descricao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
};
