import { z } from 'zod';
import type { DefinicionTool } from '@mcp-jkmate/core';
import { aBooleano, aFecha, aplicarContrato, type AccesoDatos } from '@mcp-jkmate/firebird';
import { ErrorTool } from '../errores.js';

/*
 * Tool de ejemplo: muestra la forma de una tool de lectura sobre un SP público `_AG`.
 * PROC_GET_EJEMPLO_AG no existe: al crear un MCP, reemplazar esta tool por las propias.
 */

/** Fila de PROC_GET_EJEMPLO_AG, sin RESULTADO ni MENSAJE_ERROR (los saca `aplicarContrato`). */
export interface FilaEjemplo {
  COD_EJEMPLO: number;
  NOMBRE: string;
  ACTIVO: number | null;
  FECHA_ALTA: Date;
}

export interface Ejemplo {
  id: number;
  nombre: string;
  activo: boolean;
  /** 'AAAA-MM-DD' */
  fechaAlta: string;
}

const entrada = z.object({ ejemploId: z.number().int().min(1) }).strict();
type Entrada = z.infer<typeof entrada>;

export function crearObtenerEjemplo({ acceso }: { acceso: AccesoDatos }): DefinicionTool<Entrada, { ejemplo: Ejemplo }> {
  return {
    nombre: 'obtener_ejemplo',
    titulo: 'Detalle de un ejemplo',
    descripcion: [
      'Qué hace: devuelve el detalle de un ejemplo: nombre, si está activo y su fecha de alta.',
      'Cuándo usarla: cuando ya tenés el número de un ejemplo y necesitás sus datos.',
      'Parámetros: ejemploId, el número del ejemplo (ej.: 1234).',
      'Qué NO hacer: no la uses para buscar ejemplos por nombre; no hay una tool para eso todavía.',
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: { ejemploId: { type: 'integer', minimum: 1, description: 'Número del ejemplo.' } },
      required: ['ejemploId'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        ejemplo: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            nombre: { type: 'string' },
            activo: { type: 'boolean' },
            fechaAlta: { type: 'string', format: 'date' },
          },
          required: ['id', 'nombre', 'activo', 'fechaAlta'],
          additionalProperties: false,
        },
      },
      required: ['ejemplo'],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    entrada,
    async ejecutar({ ejemploId }, ctx) {
      const [fila] = await acceso.enTransaccion(
        async (sp) => aplicarContrato<FilaEjemplo>('PROC_GET_EJEMPLO_AG', await sp('PROC_GET_EJEMPLO_AG', [ejemploId])),
        ctx.medidor,
      );
      if (!fila) throw new ErrorTool('EJEMPLO_NO_ENCONTRADO', `No existe el ejemplo ${ejemploId}.`);
      const ejemplo: Ejemplo = {
        id: fila.COD_EJEMPLO,
        nombre: fila.NOMBRE.trim(),
        activo: aBooleano(fila.ACTIVO),
        fechaAlta: aFecha(fila.FECHA_ALTA),
      };
      return { datos: { ejemplo }, resumen: `Ejemplo #${ejemplo.id}: ${ejemplo.nombre}` };
    },
  };
}
