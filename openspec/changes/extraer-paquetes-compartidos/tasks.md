# Tasks

## 1. Línea base antes de mover

- [x] 1.1 Agregar un script que levante el servidor de tickets en memoria (sin base, con el `AccesoDatos` simulado de `test/apoyo.ts`) y guarde el JSON de `tools/list` en `openspec/changes/extraer-paquetes-compartidos/tools-list-antes.json` (design D12). Se verifica con el archivo generado y anotando en este change la cantidad de tests que pasan con `npm test`.
  - Script: `scripts/guardar-tools-list.ts <salida>`. Línea base de `npm test` (sin `.env`): 27 archivos en verde y 2 saltados; **233 tests en verde, 16 saltados** (249).
- [x] 1.2 Si la base de prueba está disponible, correr `npm run medir` y guardar el reporte de la v2 como referencia (design D12, punto 3). Si no está, dejarlo anotado acá y hacer la comparación cuando haya base.
  - La base estaba disponible (`npm run test:integracion`: 33 en verde), pero la v1 (`MEDICION_URL_V1`) no respondía y `npm run medir` la necesita. Se midió solo la v2 sobre `medicion/tickets.json`, con caracteres, llamadas y un sha256 del texto de cada respuesta: `medicion-v2-antes.json` (7 llamadas, 58.072 caracteres de texto). Dos corridas seguidas dieron el mismo resultado, así que la comparación de 9.2 puede ser exacta.

## 2. Estructura del monorepo (solo `git mv`)

- [x] 2.1 Mover con `git mv`, sin tocar contenidos, todo lo de tickets a `apps/tickets-mcp/` (`src/`, `scripts/`, `test/`, `db/`, `medicion/`, `docs/`, `tsconfig*.json`, `vitest.config.ts`, `.env.example`, `.mcp.json.example`, `README.md` y `package.json`) según la tabla de design D3. Hacer el commit solo con los movimientos. Se verifica con `git log --follow apps/tickets-mcp/src/tools/ejecutar.ts`, que muestra los commits anteriores.
  - Commit `513c0e8`; `git log --follow` muestra también el commit inicial. El `.gitignore` raíz pasó a usar `**/medicion/resultados/` y `**/medicion/agente/corridas/`.

## 3. Raíz del monorepo

- [x] 3.1 Crear el `package.json` raíz (`private`, `workspaces: ["packages/*", "apps/*"]`, scripts `build`, `test`, `lint` y `typecheck` que delegan con `--workspaces --if-present`), `tsconfig.base.json` con las opciones actuales, un `eslint.config.js` raíz y un `vitest.config.ts` raíz con `projects` y `resolve.conditions` con la condición de fuentes (design D1, D2). Ajustar el `package.json` de la app (nombre `@mcp-jkmate/tickets-mcp`, `tsx --conditions=@mcp-jkmate/source` en `dev` y en los scripts de medición). Se verifica con `npm install` en la raíz y `npm test` en verde, con la misma cantidad de tests que en 1.1.
  - La condición pasó a llamarse `@mcp-jkmate/source` (ver design D2). Las condiciones de Vitest están en `vitest.compartido.ts`. Resultado: 233 en verde y 16 saltados, como en 1.1. `typecheck`, `lint` y `build` en verde.
- [x] 3.2 Ajustar `test/stdio.test.ts` para resolver `tsx` con `createRequire` (design D11). Se verifica con `npm test`, que incluye ese test.

## 4. Paquete `@mcp-jkmate/firebird`

- [ ] 4.1 Crear `packages/firebird` (`package.json` con `exports` y la condición `@mcp-jkmate/source`, `tsconfig` con `composite`, `src/index.ts`) y mover con `git mv` `db/firebird.ts` → `acceso.ts` y `mapeo/` → `mapeo/`, con sus tests. Extraer `aplicarContrato` de `db/sp.ts` a `contrato.ts`, junto con sus tests. Declarar `node-firebird` como dependencia del paquete (design D3, Risks). Se verifica con los tests del paquete en verde (`npm test -w packages/firebird`).
- [ ] 4.2 Agregar `consultar<T>(sql, parametros)` a `AccesoDatos` con el comentario de uso restringido de D6, sacar `codDesarrolladorDeUsuario` del paquete y agregar la opción `mensajeNoDisponible` (D7) con un default genérico. Se verifica con tests: `consultar` traduce un error de red a `BASE_NO_DISPONIBLE` y el mensaje configurado aparece en el error.
- [ ] 4.3 En tickets, implementar `codDesarrolladorDeUsuario` sobre `consultar`, pasar el mensaje actual de `BASE_NO_DISPONIBLE` y cambiar los imports a `@mcp-jkmate/firebird`. Se verifica con `npm test` y `npm run typecheck` en verde.

## 5. Paquete `@mcp-jkmate/core`

- [ ] 5.1 Crear `packages/core` y mover con `git mv` `errores.ts`, `tools/definicion.ts`, `tools/ejecutar.ts`, `servidor-mcp.ts` → `servidor.ts`, `logger.ts` y `auth/sesion.ts`, con sus tests. Parametrizar el nombre y la versión del servidor, `app` del logger y la lista de códigos de error (D3, D4). Se verifica con los tests del paquete en verde.
- [ ] 5.2 Implementar los códigos extensibles (D4): `CODIGOS_BASE`, `ErrorTool<C>`, genéricos en `DefinicionTool`/`ejecutarTool`/`crearServidorMcp`, el chequeo de tipo de que la lista incluye los códigos base y la conversión a `ERROR_INTERNO` de un código no declarado. Se verifica con un test del código no declarado y con un test de tipos (`expectTypeOf`/`@ts-expect-error`) que no compila al lanzar un código ajeno.
- [ ] 5.3 Hacer `Sesion` genérica (D5) y definir `SesionTickets` en la app. Se verifica con `npm run typecheck`.
- [ ] 5.4 Agregar `idCorrelacion` (D8): logger hijo por invocación en `ctx.logger`, con el que se emiten el error inesperado y el evento `invocacion_tool`. Actualizar `test/` de la app o el test del wrapper para cubrir los tres escenarios del delta de `contrato-tools`. Se verifica con esos tests.
- [ ] 5.5 Pasar tickets a `@mcp-jkmate/core`: `src/errores.ts` propio con `CODIGOS_ERROR` en el orden original, `SesionTickets` e imports. Agregar el test que compara `tools/list` con `tools-list-antes.json` (D12). Se verifica con `npm test` en verde, con ese test incluido y la misma cantidad de tests de antes más los nuevos.

## 6. Plantilla de descripción de tools

- [ ] 6.1 Implementar `verificarDescripcion` en core (D9) y un helper de test que recorre las tools de un servidor. Se verifica con tests: descripción completa, parte faltante, partes desordenadas, falta de ejemplo y `Parámetros: ninguno.`

## 7. Plantilla de MCP

- [ ] 7.1 Crear `apps/_template-mcp` (D10): tool de ejemplo sobre `AccesoDatos` con descripción según D9, `config.ts`, `errores.ts`, `index.ts` stdio, `.env.example`, un test unitario con acceso simulado y un test de contrato (input inválido, input válido, descripciones, `tools/list`). Se verifica con `npm test -w apps/_template-mcp` en verde.
- [ ] 7.2 Escribir el README de la plantilla con los pasos para crear `apps/<nombre>-mcp` (copiar, renombrar el paquete, implementar los SP y las tools, `.env`, tests, alta en `claude_desktop_config.json`). Se verifica siguiendo los pasos en una copia temporal (`apps/prueba-mcp`), que compila, pasa sus tests y responde `tools/list`. Después se borra la copia.

## 8. Documentación y configuración del repo

- [ ] 8.1 Escribir el `README.md` raíz: qué es el monorepo, la tabla de apps y paquetes, los comandos raíz y cómo crear un MCP (con un link al README de la plantilla). Actualizar en el README y en `docs/instalacion.md` de tickets las rutas (`apps/tickets-mcp/dist/index.js`), el `.env` dentro de la app y los comandos con `-w`. Se verifica revisando que ningún documento siga apuntando a `dist/index.js` en la raíz (`grep`).
- [ ] 8.2 Actualizar `openspec/config.yaml`: el propósito pasa a ser el monorepo de MCPs v2 para agentes, la decisión del 2026-10-15 se reemplaza por la del 2026-10-21 (monorepo propio, separado de `jkmate-mcp`), `db/procedimientos/` pasa a ser `apps/<mcp>/db/procedimientos/` y se agrega la regla de la plantilla de descripción para MCPs nuevos. Se verifica con `openspec validate --specs` en verde y revisión del usuario.
- [ ] 8.3 Mover el `.env` local a `apps/tickets-mcp/.env` y actualizar la ruta en `claude_desktop_config.json` (avisar al usuario: son archivos de su máquina, no del repo). Se verifica arrancando el MCP desde Claude Desktop y viendo las 4 tools.

## 9. Verificación de integración

- [ ] 9.1 En un clon limpio de la rama (sin `dist/` ni `node_modules`): `npm install`, `npm run build`, `npm run lint`, `npm run typecheck` y `npm test` en verde (design D2, riesgo de la condición `@mcp-jkmate/source`).
- [ ] 9.2 Con la base de prueba: `npm run test:integracion -w apps/tickets-mcp` en verde y `npm run medir -w apps/tickets-mcp` con las mismas cifras de la v2 que en 1.2.
