# Tasks

## 1. Prerrequisitos (bloquean el resto)

- [x] 1.1 Con la conexión a la base de tickets registrada, obtener del usuario los SP que usa la v1 (detalle, historial, agendas, presupuestos, tareas y adjuntos) y leer su código con `db_codigo_fuente`. Reescribir en `design.md` D8 cada `A CONFIRMAR` (tablas, columnas, charset/colación, regla de visibilidad, columna de nombre canónico). Se verifica cuando `grep "A CONFIRMAR" design.md` solo devuelve ítems aceptados por el usuario.
- [x] 1.2 Revisar cómo accede `tickets-jkmate-mcp` a Firebird y a OAuth (driver, pool, emisor/audiencia, resolución de `codDesarrollador`). Registrar la decisión en `design.md` D1/D2 (si hay que desviarse, consultar antes). Se verifica cuando D2 deja de figurar como decisión abierta.
- [x] 1.3 Presentar al usuario los scripts finales de D8 y obtener confirmación explícita antes de cualquier DDL. Ejecutarlos solo en la base de desarrollo de tickets. Se verifica con `SELECT * FROM PROC_GET_TICKET_AG(74836)`, que devuelve 1 fila con `RESULTADO = 1`.

## 2. Esqueleto del servidor

- [x] 2.1 Inicializar el proyecto TypeScript (`package.json`, `tsconfig`, ESLint, Vitest, scripts `build`/`test`/`dev`). Se verifica cuando `npm run build` y `npm test` pasan en vacío.
- [x] 2.2 Implementar `logger.ts` (Pino + transporte a Seq configurable por env, con redacción de `authorization`). Se verifica con un test que el token no aparece en el log serializado.
- [x] 2.3 Implementar el arranque por stdio (`index.ts`) con la identidad del proceso (`MCP_COD_USUARIO`, desarrollador resuelto al arrancar) y logs a stderr. Reemplaza al servidor Streamable HTTP + OAuth original (decisión del 2026-10-17, design D1). Se verifica con un test: sin configuración el proceso falla sin escribir en stdout, y con la base configurada una sesión stdio real lista las 4 tools y resuelve el contexto del #74836.
- [x] 2.4 Implementar `errores.ts` y el wrapper común de handlers (`ErrorTool` → `isError` + `structuredContent.error`, inesperados → `ERROR_INTERNO` sin traza). Se verifica con tests unitarios por cada código y con un test que confirma que el cliente del SDK acepta un resultado `isError` en una tool con `outputSchema`.
- [x] 2.5 Implementar `mapeo/` (fecha con offset según `ZONA_HORARIA_BASE`, SMALLINT → boolean, persona, omitir nulos en el historial) y el evento de log por invocación (`tool`, `codUsuario`, `duracionMs`, `llamadasBase`, `caracteresRespuesta`). Se verifica con tests unitarios, incluido `2026-09-28 15:44:11.925` → `2026-09-28T15:44:11.925-03:00` y un test de wire que confirma la ausencia de `\u00XX` con un texto "configuración".

## 3. Capa de datos

- [x] 3.1 Implementar `db/firebird.ts` con el mecanismo decidido en 1.2 (`ejecutarSp`, transacción de solo lectura compartida, mapeo de "base caída" → `BASE_NO_DISPONIBLE`). Se verifica con un test de integración contra la base de desarrollo, que se saltea si no hay `FIREBIRD_*` en el env.
- [x] 3.2 Implementar `db/sp.ts`, con wrappers tipados de los 8 SP públicos y el mapeo `RESULTADO = 0` → `PARAMETRO_INVALIDO`/`NO_AUTORIZADO`. Se verifica con tests unitarios sobre filas simuladas, incluida la fila de error.

## 4. Tools

- [x] 4.1 `obtener_contexto_ticket` (schemas y annotations de D4, 6 SP en paralelo, `TICKET_NO_ENCONTRADO`, `limiteHistorial`, `soloVisibleCliente`, resumen en texto). Se verifica con tests que cubren cada escenario de `specs/contexto-ticket` con datos simulados del #74836, y con un test de integración que valida `structuredContent` contra el `outputSchema`.
- [x] 4.2 `listar_tickets` (D5: estados → CSV, `"yo"` → sesión, validaciones de fechas y texto, paginación y recálculo de total con desplazamiento > total). Se verifica con tests por cada escenario de `specs/listado-tickets` (listado y filtros) y de paginación de `specs/contrato-tools`.
- [x] 4.3 `listar_tareas` (D6: default `desarrollador: "yo"`, sesión sin desarrollador → `PARAMETRO_INVALIDO`, `incluirDescripcion`, `incluirDescansos`). Se verifica con tests por cada escenario de `specs/listado-tareas`.
- [x] 4.4 `resumir_tickets` (D7: una llamada por dimensión, top 20 + resto en cliente, suma = total). Se verifica con tests de los escenarios de resumen de `specs/listado-tickets`.
- [x] 4.5 Escribir el `README.md` con la configuración (env), cómo correr el servidor y las 4 tools con un ejemplo cada una. Se verifica cuando los comandos del README funcionan tal como están escritos.

## 5. Medición

- [x] 5.1 Crear `medicion/tickets.json` con 74836 y los tickets que elija el usuario, más los casos de listado de tickets y de tareas. Se verifica cuando el script rechaza un conjunto sin 74836.
- [x] 5.2 Implementar `scripts/medir-eficiencia.ts` según D9 (estrategia v1, métricas de texto y estructurado, reporte JSON y Markdown sin textos de tickets ni tokens). Se verifica con tests unitarios del cálculo de reducciones y del armado del reporte con respuestas simuladas.

## 6. Integración

- [x] 6.1 Con la v2 compilada y la v1 accesible, ejecutar la medición y adjuntar el reporte a este change. Se verifica cuando el reporte tiene la fila del #74836 con `llamadasV2 = 1` y los totales agregados.
- [x] 6.2 Validación end-to-end con Claude Desktop (configurado según el README): pedir "contexto del ticket 74836" y "mis tickets agendados", y revisar que el agente resuelva cada uno con una sola tool. Se verifica con los eventos `invocacion_tool` del log (Seq o el log del servidor de Claude Desktop).
