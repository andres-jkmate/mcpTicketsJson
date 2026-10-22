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

- [x] 4.1 Crear `packages/firebird` (`package.json` con `exports` y la condición `@mcp-jkmate/source`, `tsconfig` con `composite`, `src/index.ts`) y mover con `git mv` `db/firebird.ts` → `acceso.ts` y `mapeo/` → `mapeo/`, con sus tests. Extraer `aplicarContrato` de `db/sp.ts` a `contrato.ts`, junto con sus tests. Declarar `node-firebird` como dependencia del paquete (design D3, Risks). Se verifica con los tests del paquete en verde (`npm test -w packages/firebird`).
  - Se hizo después de 5.1, porque `firebird` usa `ErrorTool` y `Medidor` de `core`. Los movimientos van en un commit propio. Los 4 tests de integración de `db/firebird.test.ts` pasaron a `apps/tickets-mcp/test/integracion/acceso.test.ts`, porque usan SP y tablas de tickets. `npm test -w packages/firebird`: 18 en verde.
- [x] 4.2 Agregar `consultar<T>(sql, parametros)` a `AccesoDatos` con el comentario de uso restringido de D6, sacar `codDesarrolladorDeUsuario` del paquete y agregar la opción `mensajeNoDisponible` (D7) con un default genérico. Se verifica con tests: `consultar` traduce un error de red a `BASE_NO_DISPONIBLE` y el mensaje configurado aparece en el error.
  - `MENSAJE_NO_DISPONIBLE` es el default genérico. Tests en `acceso.test.ts`.
- [x] 4.3 En tickets, implementar `codDesarrolladorDeUsuario` sobre `consultar`, pasar el mensaje actual de `BASE_NO_DISPONIBLE` y cambiar los imports a `@mcp-jkmate/firebird`. Se verifica con `npm test` y `npm run typecheck` en verde.
  - `src/db/usuarios.ts`. El texto de `BASE_NO_DISPONIBLE` de tickets se pasa desde `index.ts`. `test/apoyo.ts` simula `consultar`.

## 5. Paquete `@mcp-jkmate/core`

- [x] 5.1 Crear `packages/core` y mover con `git mv` `errores.ts`, `tools/definicion.ts`, `tools/ejecutar.ts`, `servidor-mcp.ts` → `servidor.ts`, `logger.ts` y `auth/sesion.ts`, con sus tests. Parametrizar el nombre y la versión del servidor, `app` del logger y la lista de códigos de error (D3, D4). Se verifica con los tests del paquete en verde.
  - Además, `src/pruebas.ts` (subpath `@mcp-jkmate/core/pruebas`) con `conectarCliente` y `loggerEnMemoria`, que usa `test/apoyo.ts` de tickets. En tickets, el nombre, la versión y la lista quedan en `src/servidor.ts` (`crearServidorTickets`). `npm test -w packages/core`: 31 en verde, con los tests de tipos.
- [x] 5.2 Implementar los códigos extensibles (D4): `CODIGOS_BASE`, `ErrorTool<C>`, genéricos en `DefinicionTool`/`ejecutarTool`/`crearServidorMcp`, el chequeo de tipo de que la lista incluye los códigos base y la conversión a `ERROR_INTERNO` de un código no declarado. Se verifica con un test del código no declarado y con un test de tipos (`expectTypeOf`/`@ts-expect-error`) que no compila al lanzar un código ajeno.
  - El control en compilación está en el constructor de `ErrorTool<C>` (`NoInfer`); `DefinicionTool` no lleva los códigos (ver design D4). Tests: `ejecutar.test.ts` (código no declarado) y `tipos.test-d.ts` (`@ts-expect-error` y `expectTypeOf`, corre con `vitest` y con `tsc --noEmit`).
- [x] 5.3 Hacer `Sesion` genérica (D5) y definir `SesionTickets` en la app. Se verifica con `npm run typecheck`.
- [x] 5.4 Agregar `idCorrelacion` (D8): logger hijo por invocación en `ctx.logger`, con el que se emiten el error inesperado y el evento `invocacion_tool`. Actualizar `test/` de la app o el test del wrapper para cubrir los tres escenarios del delta de `contrato-tools`. Se verifica con esos tests.
  - Tests en `packages/core/src/ejecutar.test.ts` (bloque `idCorrelacion`). Bug que ya existía y no se arregla en este change: `pino.multistream` sin `level` por stream filtra todo lo que está por debajo de `info`, así que `LOG_LEVEL=debug` no saca logs de debug.
- [x] 5.5 Pasar tickets a `@mcp-jkmate/core`: `src/errores.ts` propio con `CODIGOS_ERROR` en el orden original, `SesionTickets` e imports. Agregar el test que compara `tools/list` con `tools-list-antes.json` (D12). Se verifica con `npm test` en verde, con ese test incluido y la misma cantidad de tests de antes más los nuevos.
  - El snapshot se lee de `apps/tickets-mcp/test/datos/tools-list.json`, copia idéntica de `tools-list-antes.json` (design D12). `npm test`: 249 en verde (233 de antes + 15 de core + 1 de firebird) y 16 saltados, como en 1.1. Con base: `test:integracion` en verde (17) y la medición de la v2 idéntica a `medicion-v2-antes.json`, incluido el hash de cada respuesta.

## 6. Plantilla de descripción de tools

- [x] 6.1 Implementar `verificarDescripcion` en core (D9) y un helper de test que recorre las tools de un servidor. Se verifica con tests: descripción completa, parte faltante, partes desordenadas, falta de ejemplo y `Parámetros: ninguno.`
  - `verificarDescripcion` en `core/src/descripcion.ts`; el helper es `problemasDeDescripcion` en `@mcp-jkmate/core/pruebas`.

## 7. Plantilla de MCP

- [x] 7.1 Crear `apps/_template-mcp` (D10): tool de ejemplo sobre `AccesoDatos` con descripción según D9, `config.ts`, `errores.ts`, `index.ts` stdio, `.env.example`, un test unitario con acceso simulado y un test de contrato (input inválido, input válido, descripciones, `tools/list`). Se verifica con `npm test -w apps/_template-mcp` en verde.
  - Tool `obtener_ejemplo` sobre `PROC_GET_EJEMPLO_AG` (no existe; solo muestra la forma) y código propio `EJEMPLO_NO_ENCONTRADO`. `npm test -w apps/_template-mcp`: 9 en verde. El `dist` responde `tools/list` por stdio sin base.
- [x] 7.2 Escribir el README de la plantilla con los pasos para crear `apps/<nombre>-mcp` (copiar, renombrar el paquete, implementar los SP y las tools, `.env`, tests, alta en `claude_desktop_config.json`). Se verifica siguiendo los pasos en una copia temporal (`apps/prueba-mcp`), que compila, pasa sus tests y responde `tools/list`. Después se borra la copia.
  - Se siguieron los pasos en `apps/prueba-mcp` (copia con robocopy, renombre y `npm install`): typecheck, lint, 9 tests y build en verde, y `tools/list` respondió `obtener_ejemplo`. La copia se borró después.

## 8. Documentación y configuración del repo

- [x] 8.1 Escribir el `README.md` raíz: qué es el monorepo, la tabla de apps y paquetes, los comandos raíz y cómo crear un MCP (con un link al README de la plantilla). Actualizar en el README y en `docs/instalacion.md` de tickets las rutas (`apps/tickets-mcp/dist/index.js`), el `.env` dentro de la app y los comandos con `-w`. Se verifica revisando que ningún documento siga apuntando a `dist/index.js` en la raíz (`grep`).
  - `grep` sin rutas a `dist/index.js` en la raíz: solo quedan las relativas a cada app (`start` en `package.json`) y el aviso de la ruta anterior en el README de tickets. `docs/instalacion.md` suma la nota de migración y el error de paquetes sin compilar.
- [x] 8.2 Actualizar `openspec/config.yaml`: el propósito pasa a ser el monorepo de MCPs v2 para agentes, la decisión del 2026-10-15 se reemplaza por la del 2026-10-21 (monorepo propio, separado de `jkmate-mcp`), `db/procedimientos/` pasa a ser `apps/<mcp>/db/procedimientos/` y se agrega la regla de la plantilla de descripción para MCPs nuevos. Se verifica con `openspec validate --specs` en verde y revisión del usuario.
  - `openspec validate --specs`: 6 en verde. **Falta la revisión del usuario** del texto de `openspec/config.yaml`.
- [ ] 8.3 Mover el `.env` local a `apps/tickets-mcp/.env` y actualizar la ruta en `claude_desktop_config.json` (avisar al usuario: son archivos de su máquina, no del repo). Se verifica arrancando el MCP desde Claude Desktop y viendo las 4 tools.
  - Pendiente del usuario. El `.env` se movió a `apps/tickets-mcp/.env`. No se encontró `claude_desktop_config.json` en esta máquina (ni en `%APPDATA%\Claude` ni en el paquete MSIX de Claude), así que no se pudo actualizar la ruta ni verificar las 4 tools en Claude Desktop.

## 9. Verificación de integración

- [x] 9.1 En un clon limpio de la rama (sin `dist/` ni `node_modules`): `npm install`, `npm run build`, `npm run lint`, `npm run typecheck` y `npm test` en verde (design D2, riesgo de la condición `@mcp-jkmate/source`).
  - Clon limpio de `monorepo-mcps`: `npm install`, `build`, `lint` y `typecheck` en verde, y `npm test` en verde después de borrar todos los `dist/` (31 + 18 + 9 + 201, 16 saltados). `npx vitest run` desde la raíz (projects) también en verde, después de corregir un test que leía `medicion/tickets.json` relativo al directorio de trabajo.
- [ ] 9.2 Con la base de prueba: `npm run test:integracion -w apps/tickets-mcp` en verde y `npm run medir -w apps/tickets-mcp` con las mismas cifras de la v2 que en 1.2.
  - Pendiente: `npm run test:integracion -w apps/tickets-mcp` da 17 en verde, y la medición de solo la v2 es idéntica a `medicion-v2-antes.json` (ver 1.2 y 5.5). `npm run medir -w apps/tickets-mcp` compila y arranca, pero corta con `fetch failed` porque la v1 no está levantada. Falta correrlo con la v1 disponible.
