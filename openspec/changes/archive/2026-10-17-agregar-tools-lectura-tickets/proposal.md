# Proposal

## Why

Para que un agente entienda un ticket con `tickets-jkmate-mcp` (v1) hoy hacen falta 5 llamadas o más, y las respuestas vienen con mucho ruido. En el ticket #74836, el historial de 5 mensajes ocupa ~4.300 caracteres con ~35 campos por fila (duplicados como `FECHA_HORA`/`FECHA_ORDEN` y `RESULTADO_RECLAMO`/`ESTADO_RECLAMO`, y datos de UI como `COLOR_PERFIL_JK`). Lo útil no pasa de ~600 caracteres. Además las tareas no se pueden filtrar por ticket, no hay búsqueda por texto ni agregaciones, y los listados no informan el total. Esta primera etapa es un experimento. Tiene que demostrar con mediciones cuánto bajan los caracteres y las llamadas si las tools se diseñan para agentes.

## What Changes

- Nuevo servidor MCP local en TypeScript con transporte stdio, para usarlo desde Claude Desktop. Sin autenticación (es una evaluación): la identidad es el usuario configurado en el proceso.
- Contrato común para todas las tools: `outputSchema` + `structuredContent` + resumen en texto, campos camelCase estables, tipos consistentes, fechas ISO 8601 con offset, JSON sin escapado Unicode, annotations MCP y errores con código estable.
- Tool `obtener_contexto_ticket`. En una sola llamada devuelve detalle, historial compacto, tareas, agendas, presupuestos y lista de adjuntos (solo metadatos).
- Tool `listar_tickets`. Listado liviano con filtros por estados (varios a la vez), asignado, cliente, rango de fechas y texto libre. Pagina e informa el total.
- Tool `listar_tareas`. Filtros por desarrollador, responsable, ticket y estados. No trae la descripción completa salvo que se pida.
- Tool `resumir_tickets`. Conteos por estado, prioridad y cliente, calculados en SQL.
- SP de lectura nuevos, específicos para agentes (`PROC_GET_*_AG` / `PROC_LIST_*_AG`). Se proponen como scripts en `design.md` y no se crean sin confirmación.
- Script de medición. Compara v1 contra v2 en caracteres y cantidad de llamadas sobre un conjunto fijo de tickets, que incluye el #74836.

Fuera de alcance: escrituras, migrar el resto de las tools de v1, intérprete genérico de contratos y lectura del contenido de adjuntos. La v1 sigue funcionando sin cambios: no hay **BREAKING**.

## Capabilities

### New Capabilities
- `contrato-tools`: reglas transversales que cumple toda tool. Cubre la forma de la respuesta, tipos, fechas, Unicode, annotations, identidad por sesión, paginación y errores uniformes.
- `contexto-ticket`: tool `obtener_contexto_ticket`, que arma el contexto completo de un ticket en una sola llamada.
- `listado-tickets`: tools `listar_tickets` (listado paginado con filtros y texto libre) y `resumir_tickets` (agregaciones).
- `listado-tareas`: tool `listar_tareas`, con filtros por desarrollador, responsable, ticket y estado.
- `medicion-eficiencia`: script reproducible que mide caracteres y llamadas de v1 contra v2.

### Modified Capabilities
(ninguna: el repo no tiene specs previas)

## Impact

- **Código nuevo**: todo el repo `mcpTicketsJson` (servidor MCP, capa de datos, tests Vitest y script de medición).
- **Base de datos (Firebird 3.x)**: 11 SP de lectura nuevos (8 públicos `PROC_*_AG` y 3 privados `PRV_*_AG`), propuestos en `design.md`. Requieren que el usuario confirme los SP y columnas reales de la base de tickets y que apruebe el DDL de forma explícita.
- **Dependencias**: SDK MCP de TypeScript, Pino con transporte a Seq, Vitest y `node-firebird`. El código de `tickets-jkmate-mcp` no estaba disponible: el driver se eligió sin él (ver design D2).
- **Operación**: un proceso local por usuario, configurado en `claude_desktop_config.json` (usuario de JKMate y conexión a la base). No se toca la v1.
