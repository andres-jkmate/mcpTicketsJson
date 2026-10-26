# Design

## Context

Motivación en `proposal.md`; requisito modificado en `specs/plataforma-mcp/spec.md`. Estado actual (rama `monorepo-mcps`, 2026-10-24):

- `apps/_template-mcp/test/` tiene `apoyo.ts`, `contrato.test.ts` y `obtener-ejemplo.test.ts`. Su `vitest.config.ts` no habilita `typecheck`.
- `apps/comprobantes-prov-mcp/test/` ya tiene las dos piezas que faltan, probadas en ese change: `stdio.test.ts` (dos casos, sin base) y `errores.test-d.ts`, con `typecheck` habilitado en su `vitest.config.ts` igual que `packages/core`.
- `crearAccesoFirebird` abre el pool de forma perezosa: el servidor arranca y responde el handshake con una base inexistente.
- `npx @modelcontextprotocol/inspector` reenvía sin cambios los argumentos que siguen al comando. El 2026-10-24 se probó en modo `--cli` que `node --env-file=<archivo> apps/comprobantes-prov-mcp/dist/index.js` arranca con esa configuración y lista las tools.
- `apps/tickets-mcp` documenta el Inspector cargando las variables en su pantalla. Esa variante funciona y no se toca.

Este change no agrega tools ni SP: no hay `inputSchema`, `outputSchema` ni scripts de base que documentar.

## Goals / Non-Goals

**Goals:**
- Que quien siga el README de la plantilla, con o sin tools, llegue a un MCP en verde sin copiar nada de otras apps.
- Que la plantilla y comprobantes-prov tengan los mismos tests de arranque y de tipos, para que no diverjan.

**Non-Goals:**
- Mover esos tests a `@mcp-jkmate/core/pruebas` como helpers compartidos. Ver D2.
- Cambiar tickets: su test de stdio depende de sus SP y su README ya funciona.
- Cambiar el comportamiento de la tool de ejemplo o del servidor de la plantilla.

## Decisions

### D1. Comando del Inspector con `--env-file`
El README de la plantilla (paso 7) y el de comprobantes-prov pasan a:

```bash
npx @modelcontextprotocol/inspector node --env-file=apps/<mcp>/.env apps/<mcp>/dist/index.js
```

Es la misma fuente de configuración que ya usan `npm run dev` y `npm start` (`--env-file-if-exists=.env`). Se usa `--env-file` y no `--env-file-if-exists`: si falta el `.env`, `node` falla enseguida con un mensaje claro en lugar de arrancar sin configuración. **Alternativas:** cargar las variables en la pantalla del Inspector, como tickets, se descarta porque hay que tipearlas a mano cada vez; `-e KEY=VAL` en el Inspector repite el `.env` en la línea de comando y expone la password en el historial de la terminal.

### D2. Tests copiados, no helpers compartidos
`test/stdio.test.ts` y `test/errores.test-d.ts` se copian de comprobantes-prov a la plantilla y se adaptan:
- **stdio**: el nombre esperado sale de `NOMBRE_SERVIDOR` (importado de `src/servidor.ts`), no de un literal, para que una copia nueva no tenga que tocar el test. El texto del log de arranque se arma igual: `${NOMBRE_SERVIDOR} listo (stdio)`.
- **tipos**: el código declarado de ejemplo es `EJEMPLO_NO_ENCONTRADO` y el rechazado es uno ajeno, por ejemplo `CLIENTE_NO_ENCONTRADO`. El comentario indica que, al cambiar los códigos del dominio, hay que actualizar el tipo esperado.

Después de copiarlos a la plantilla, el `stdio.test.ts` de comprobantes-prov se alinea para tomar el nombre de `NOMBRE_SERVIDOR`, así las dos copias quedan iguales. **Alternativa:** un helper `probarArranqueStdio(entrada, nombre)` en `@mcp-jkmate/core/pruebas`. Se descarta por ahora: hay dos usos, el de tickets tiene casos propios y mover lógica de proceso hijo a `core` amplía su superficie. Si un tercer MCP lo copia, se reevalúa.

### D3. `typecheck` en Vitest
`vitest.config.ts` de la plantilla agrega `typecheck: { enabled: true, include: ['test/**/*.test-d.ts'], tsconfig: './tsconfig.json' }`, como comprobantes-prov. `tsc --noEmit` ya lo cubría porque `tsconfig.json` incluye `test`. Con esto, `npm test` también falla.

### D4. Paso "Arrancar sin tools" en el README
Es una variante del paso 4 (Tools), para cuando las tools se diseñan en otro change:
1. Borrar `src/tools/obtener-ejemplo.ts` y `test/obtener-ejemplo.test.ts`.
2. `crearTools(_deps: DependenciasTools)` devuelve `[]`. El prefijo `_` es necesario porque el lint de la raíz rechaza un parámetro sin usar.
3. En `src/errores.ts`, dejar solo los cuatro códigos base y actualizar el tipo esperado en `test/errores.test-d.ts`.
4. En `test/contrato.test.ts`, esperar `[]` en `tools/list`, quitar los casos de input inválido y válido (vuelven con la primera tool) y conservar los que recorren todas las tools. Opcional: probar que `obtener_ejemplo` responde como tool desconocida, como hace comprobantes-prov.

El README de comprobantes-prov se cita como ejemplo de cómo queda una app en ese estado.

### D5. Paso de tests del README
El paso 5 suma qué adaptar en cada test nuevo: `stdio.test.ts` no se toca (toma el nombre del servidor), y en `errores.test-d.ts` se actualizan los códigos esperados y el ajeno.

## Risks / Trade-offs

- [El test de stdio lanza un proceso hijo con `tsx` y suma unos segundos a `npm test`] → Son dos procesos cortos, ya medidos en comprobantes-prov (~2 s en total).
- [Las copias de los tests en la plantilla y en cada MCP pueden divergir] → Mitigado por D2: no tienen literales propios de la app. Si aparece un tercer uso, se evalúa el helper en `core`.
- [El modo web del Inspector podría tratar los argumentos distinto que `--cli`] → La tarea de verificación lo prueba en modo web. Si fallara, el README documenta la variante que funcione.

## Migration Plan

No aplica: son cambios de documentación y tests, sin despliegue. Para volver atrás alcanza con revertir el commit.
