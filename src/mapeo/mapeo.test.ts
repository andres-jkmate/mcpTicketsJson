import { describe, expect, it } from 'vitest';
import { aFecha, aFechaHoraIso, offsetDeReloj, relojDesdeTexto } from './fecha.js';
import { aBooleano, aPersona, aTextoONull, htmlATexto, omitirNulos } from './valores.js';

const BA = 'America/Argentina/Buenos_Aires';

describe('fechas', () => {
  it('serializa la creación del #74836 con offset de Buenos Aires', () => {
    expect(aFechaHoraIso('2026-09-28 15:44:11.925', BA)).toBe('2026-09-28T15:44:11.925-03:00');
  });

  it('omite los milisegundos cuando son cero', () => {
    expect(aFechaHoraIso('2026-10-06 09:00:00', BA)).toBe('2026-10-06T09:00:00-03:00');
  });

  it('respeta los cambios de horario de la zona configurada', () => {
    expect(aFechaHoraIso('2026-01-15 10:00:00', 'Europe/Madrid')).toBe('2026-01-15T10:00:00+01:00');
    expect(aFechaHoraIso('2026-07-15 10:00:00', 'Europe/Madrid')).toBe('2026-07-15T10:00:00+02:00');
    expect(offsetDeReloj(relojDesdeTexto('2026-07-15 10:00'), 'UTC')).toBe(0);
  });

  it('no depende de la zona horaria del proceso', () => {
    const reloj = relojDesdeTexto('2026-09-28 23:30:00');
    expect(aFecha(reloj)).toBe('2026-09-28');
    expect(aFechaHoraIso(reloj, BA)).toBe('2026-09-28T23:30:00-03:00');
  });

  it('rechaza textos que no son fecha', () => {
    expect(() => relojDesdeTexto('28/09/2026')).toThrow();
  });
});

describe('valores', () => {
  it('SMALLINT → boolean', () => {
    expect(aBooleano(1)).toBe(true);
    expect(aBooleano(0)).toBe(false);
    expect(aBooleano(null)).toBe(false);
  });

  it('persona', () => {
    expect(aPersona(15169, 'Andres Pelaez ')).toEqual({ id: 15169, nombre: 'Andres Pelaez' });
    expect(aPersona(null, 'x')).toBeNull();
    expect(aPersona(7, null)).toEqual({ id: 7, nombre: '7' });
  });

  it('texto vacío → null', () => {
    expect(aTextoONull('  ')).toBeNull();
    expect(aTextoONull(' julieta ')).toBe('julieta');
  });

  it('omite nulos en el historial', () => {
    expect(omitirNulos({ id: 1, destinatario: null, evento: undefined, texto: '' })).toEqual({ id: 1, texto: '' });
  });

  it('HTML → texto plano', () => {
    expect(htmlATexto('<p>Necesitamos una alerta</p>')).toBe('Necesitamos una alerta');
    expect(htmlATexto('<p>Hola&nbsp;<b>Juan</b></p><p>configuraci&oacute;n &amp; m&aacute;s</p>')).toBe(
      'Hola Juan\nconfiguración & más',
    );
    expect(htmlATexto('línea 1<br/>línea 2<br>línea 3')).toBe('línea 1\nlínea 2\nlínea 3');
    expect(htmlATexto('texto plano sin html')).toBe('texto plano sin html');
    expect(htmlATexto(null)).toBe('');
  });
});
