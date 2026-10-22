# Proposal

## Why

Viene un segundo MCP sobre la misma base de JKMate, y si el proyecto se aprueba, después vendrán más. Hoy todo lo que haría falta para un MCP nuevo está mezclado con el código de tickets dentro de `src/`: el wrapper común de tools (validación, errores uniformes y log de cada invocación), el servidor, el logger hacia Seq, el pool de Firebird y el contrato `RESULTADO`/`MENSAJE_ERROR`. Copiar esos archivos a cada MCP nuevo haría que diverjan desde el primer arreglo. Por eso conviene extraerlos ahora, antes de escribir el segundo MCP. El 2026-10-21 el usuario decidió que este repo pase a ser el monorepo propio de los MCPs "v2 para agentes", separado de `jkmate-mcp`.

## What Changes

- **Monorepo con npm workspaces** (todavía sin Nx): `packages/` para lo compartido y `apps/` para cada MCP.
- **`packages/mcp-core`**, extraído de `src/`:
  - errores uniformes con códigos base extensibles por servidor (`ErrorTool`, `normalizarError`, `resultadoError`);
  - el contrato de una tool (`DefinicionTool`, `conError`) y el wrapper común (`ejecutarTool`);
  - el servidor MCP genérico, parametrizado con nombre, versión y lista de códigos de error;
  - el logger Pino con Seq, parametrizado con el nombre de la app;
  - `Sesion` y la validación de la plantilla de descripción de tools.
- **`packages/firebird`**, extraído de `src/db/firebird.ts`, `aplicarContrato` de `src/db/sp.ts` y `src/mapeo/`: pool de `node-firebird`, transacción de solo lectura, normalización de fechas y textos, `esBaseNoDisponible` y el contrato `RESULTADO`/`MENSAJE_ERROR`.
- **`apps/tickets-mcp`**: todo lo específico de tickets se mueve con `git mv`, sin cambiar su comportamiento. Incluye tools, wrappers de los SP `_AG`, config, `db/`, `scripts/`, `medicion/`, `test/` y `docs/`.
- **`apps/_template-mcp`**: un MCP mínimo que compila y pasa sus tests, con una tool de ejemplo, un test unitario, un test de contrato y un README con los pasos para crear un MCP nuevo a partir de él.
- **Log de cada invocación con `idCorrelacion`**: un id único por invocación, presente también en los logs internos de esa invocación, para rastrear una llamada completa en Seq. El nombre del servidor ya viaja en el campo `app`.
- **Plantilla de descripción de tools** (qué hace, cuándo usarla, parámetros con un ejemplo, qué NO hacer) con un validador en `mcp-core`. Es obligatoria para la plantilla y para los MCPs nuevos. Tickets la adopta en otro change, porque cambiar sus descripciones cambia lo que ve el agente y hay que volver a medir.
- **`openspec/config.yaml`**: se actualiza la decisión de "repo independiente" del 2026-10-15 y las rutas que cambian (`db/procedimientos/` pasa a estar dentro de cada app).
- **BREAKING (solo instalación local)**: el punto de entrada pasa de `dist/index.js` a `apps/tickets-mcp/dist/index.js`. Hay que actualizar la ruta en `claude_desktop_config.json` y mover el `.env` a `apps/tickets-mcp/`. Las tools no cambian: la salida de `tools/list` y las respuestas son idénticas.

Fuera de alcance: el segundo MCP (va en su propio change), el transporte HTTP, Nx, un generador por comando y cambios en las descripciones de las tools de tickets.

## Capabilities

### New Capabilities
- `plataforma-mcp`: base común para construir MCPs en este repo. Cubre la estructura del monorepo, los paquetes compartidos, la plantilla de MCP, la plantilla de descripción de tools y su validación, y los códigos de error extensibles.

### Modified Capabilities
- `contrato-tools`: el evento de log de cada invocación suma `idCorrelacion`, y los logs internos de esa invocación lo llevan.

## Impact

- **Código**: se mueve todo `src/`, `scripts/` y `test/`. Los imports entre la app y los paquetes pasan a ser por nombre de paquete (`@mcp-jkmate/core`, `@mcp-jkmate/firebird`). La lógica de las tools no cambia.
- **Build y tests**: el `package.json` raíz tiene workspaces y los scripts `build`, `test`, `lint` y `typecheck` corren sobre todo el monorepo. Los comandos de medición pasan a ejecutarse con `-w apps/tickets-mcp`.
- **Dependencias**: las mismas, repartidas por paquete. No hay dependencias nuevas.
- **Documentación**: `README.md` raíz (qué es el monorepo y cómo crear un MCP), y `README.md` y `docs/instalacion.md` de tickets con las rutas nuevas.
- **Seq**: los eventos de invocación agregan el campo `idCorrelacion`. Los campos existentes se mantienen, así que las consultas actuales siguen funcionando.
