import { describe, expect, it } from 'vitest';
import { resolverFechas, resolverImporte } from './criterio.js';

const HOY = '2026-10-26'; // lunes

describe('resolverFechas', () => {
  it('sin criterios de fecha: el último mes', () => {
    expect(resolverFechas({ hayNumero: false }, HOY)).toEqual({ ok: true, fechaDesde: '2026-09-26', fechaHasta: '2026-10-26' });
  });

  it('número de un movimiento viejo: sin rango', () => {
    expect(resolverFechas({ hayNumero: true }, HOY)).toEqual({ ok: true, fechaDesde: null, fechaHasta: null });
  });

  it('el mes por defecto se ajusta al último día cuando el mes anterior es más corto', () => {
    expect(resolverFechas({ hayNumero: false }, '2026-03-31')).toMatchObject({ fechaDesde: '2026-02-28' });
    expect(resolverFechas({ hayNumero: false }, '2026-01-15')).toMatchObject({ fechaDesde: '2025-12-15' });
  });

  it.each([
    ['hoy', '2026-10-26', '2026-10-26'],
    ['ayer', '2026-10-25', '2026-10-25'],
    ['esta_semana', '2026-10-26', '2026-10-26'],
    ['este_mes', '2026-10-01', '2026-10-26'],
    ['mes_pasado', '2026-09-01', '2026-09-30'],
  ] as const)('periodo %s', (periodo, desde, hasta) => {
    expect(resolverFechas({ periodo, hayNumero: false }, HOY)).toEqual({ ok: true, fechaDesde: desde, fechaHasta: hasta });
  });

  it('esta_semana va de lunes a hoy', () => {
    expect(resolverFechas({ periodo: 'esta_semana', hayNumero: false }, '2026-10-29')).toMatchObject({ fechaDesde: '2026-10-26', fechaHasta: '2026-10-29' });
    expect(resolverFechas({ periodo: 'esta_semana', hayNumero: false }, '2026-11-01')).toMatchObject({ fechaDesde: '2026-10-26' }); // domingo
  });

  it('mes_pasado en enero es diciembre del año anterior', () => {
    expect(resolverFechas({ periodo: 'mes_pasado', hayNumero: false }, '2026-01-10')).toEqual({ ok: true, fechaDesde: '2025-12-01', fechaHasta: '2025-12-31' });
  });

  it('el período se aplica aunque venga número', () => {
    expect(resolverFechas({ periodo: 'ayer', hayNumero: true }, HOY)).toMatchObject({ fechaDesde: '2026-10-25' });
  });

  it('período y fechas juntos: error', () => {
    const r = resolverFechas({ periodo: 'ayer', fechaDesde: '2026-10-01', hayNumero: false }, HOY);
    expect(r.ok).toBe(false);
  });

  it('solo fechaDesde: hasta hoy; solo fechaHasta: desde un mes antes', () => {
    expect(resolverFechas({ fechaDesde: '2026-10-13', hayNumero: false }, HOY)).toEqual({ ok: true, fechaDesde: '2026-10-13', fechaHasta: HOY });
    expect(resolverFechas({ fechaHasta: '2026-08-31', hayNumero: true }, HOY)).toEqual({ ok: true, fechaDesde: '2026-07-31', fechaHasta: '2026-08-31' });
  });

  it('día completo: desde y hasta iguales', () => {
    expect(resolverFechas({ fechaDesde: '2026-10-13', fechaHasta: '2026-10-13', hayNumero: false }, HOY)).toMatchObject({ fechaDesde: '2026-10-13', fechaHasta: '2026-10-13' });
  });

  it('desde posterior a hasta: error con el motivo', () => {
    const r = resolverFechas({ fechaDesde: '2026-10-14', fechaHasta: '2026-10-13', hayNumero: false }, HOY);
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining('posterior') });
  });
});

describe('resolverImporte', () => {
  it('aproximado: ±5 %', () => {
    expect(resolverImporte(500000, false)).toEqual({ importe: 500000, importeMin: 475000, importeMax: 525000 });
    expect(resolverImporte(199.99, false)).toEqual({ importe: 199.99, importeMin: 189.991, importeMax: 209.99 });
  });

  it('exacto: mínimo y máximo iguales al importe', () => {
    expect(resolverImporte(500000, true)).toEqual({ importe: 500000, importeMin: 500000, importeMax: 500000 });
  });

  it('sin importe: todo null', () => {
    expect(resolverImporte(undefined, true)).toEqual({ importe: null, importeMin: null, importeMax: null });
  });
});
