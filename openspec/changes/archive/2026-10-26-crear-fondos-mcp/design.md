# Design

## Context

Motivación en `proposal.md`; requisitos en `specs/fondos-mcp/spec.md`. Estado actual que condiciona el diseño (rama `monorepo-mcps`, 2026-10-26):

- `apps/comprobantes-prov-mcp` se creó de la misma forma (change archivado `2026-10-24-crear-comprobantes-prov-mcp`). Las fricciones que dejó anotadas se corrigieron en `2026-10-24-corregir-plantilla-mcp`: la plantilla ya trae `test/stdio.test.ts`, `test/errores.test-d.ts`, el `typecheck` habilitado en `vitest.config.ts` y, en su README, la variante "arrancar sin tools" y el `--env-file` para el Inspector.
- `crearServidorMcp` de `@mcp-jkmate/core` acepta una lista de tools vacía: `tools/list` devuelve `[]` y una tool desconocida lanza `McpError(InvalidParams)`. `problemasDeDescripcion([])` devuelve `[]`.
- El `package.json` raíz toma `apps/*` como workspaces: la app nueva entra en los comandos de todo el repo sin tocar la raíz, salvo `package-lock.json` tras `npm install`.
- `@mcp-jkmate/firebird` ya ofrece `enTransaccionEscritura` además de la de lectura; registrar movimientos no va a requerir cambios en los paquetes.

## Goals / Non-Goals

**Goals:**
- Un servidor que compila, pasa sus tests, arranca por stdio y responde `tools/list` vacío.
- Dejar listo lo que el change de las tools va a reusar: `test/apoyo.ts`, el test de contrato genérico y `db/procedimientos/`.

**Non-Goals:**
- Tools, SP, códigos de error del dominio y relevamiento de las tablas de fondos.
- Cambios en `packages/`, en la plantilla o en las otras apps. Si aparece una fricción de la plantilla, se anota en `tasks.md` para un change aparte.

## Decisions

### D1. Copiar la plantilla siguiendo su README
Se copia con `robocopy apps\_template-mcp apps\fondos-mcp /E /XD node_modules dist /XF .env` y se aplican los pasos 2, 4 (variante "arrancar sin tools"), 6 y 7 del README de la plantilla. **Alternativa:** copiar `apps/comprobantes-prov-mcp` y vaciarlo; se descarta porque arrastraría sus tools, SP y códigos de error, y la plantilla es la fuente mantenida.

### D2. Nombres
| Qué | Valor |
|---|---|
| Carpeta | `apps/fondos-mcp` |
| Paquete npm | `@mcp-jkmate/fondos-mcp` |
| `NOMBRE_SERVIDOR` (handshake y `app` en Seq) | `mcp-fondos` |
| Clave en `claude_desktop_config.json` | `fondos` |
| Log de Claude Desktop | `%APPDATA%\Claude\logs\mcp-server-fondos.log` |

Se sigue el patrón de la plantilla (`mcp-<nombre>`), como `mcp-comprobantes-prov`.

### D3. Arrancar sin tools
Según la variante del README de la plantilla: se borran `src/tools/obtener-ejemplo.ts` y `test/obtener-ejemplo.test.ts`, y `crearTools(_deps: DependenciasTools)` devuelve `[]`. Se mantienen la firma y `DependenciasTools { acceso }` para que `index.ts` no cambie cuando lleguen las tools. **Alternativa:** conservar `obtener_ejemplo` hasta el change de tools; se descarta porque un agente vería una tool que siempre falla (el SP no existe).

### D4. Tests
- `test/contrato.test.ts`: `accesoSimulado({})`, `tools/list` devuelve `[]`, el handshake informa `mcp-fondos`, se conservan los chequeos que recorren todas las tools (descripciones, annotations, `inputSchema` cerrado, códigos del outputSchema) y se agrega que `obtener_ejemplo` falla como tool desconocida. Los casos de input inválido y válido se quitan: vuelven con la primera tool.
- `test/stdio.test.ts`: no se toca; toma el nombre de `NOMBRE_SERVIDOR`.
- `test/errores.test-d.ts`: se actualiza el tipo esperado de `CodigoError` a los cuatro base y el código declarado del primer caso, manteniendo el `@ts-expect-error` con un código ajeno.
- `test/apoyo.ts`: igual a la plantilla.

### D5. Códigos de error
`CODIGOS_ERROR` queda con los cuatro base, en el orden de la plantilla, sin `EJEMPLO_NO_ENCONTRADO`. Los del dominio (por ejemplo `MOVIMIENTO_NO_ENCONTRADO`, `CUENTA_FONDO_NO_ENCONTRADA`) se definen con las tools.

### D6. `db/` y README
Se crea `apps/fondos-mcp/db/README.md` con la tabla de SP vacía y cómo aplicarlos (misma forma que comprobantes-prov), para que el change de tools solo agregue filas. El README de la app reemplaza al de la plantilla: qué es, estado (sin tools), configuración (`.env`), verificación y alta en Claude Desktop con los nombres de D2, aclarando que instalarlo es opcional hasta que haya tools.

## Risks / Trade-offs

- [Un servidor sin tools instalado en Claude Desktop no aporta nada y puede confundir] → El README dice que el alta es opcional hasta que haya tools.
- [El test de contrato pasa "vacío" y podría dar falsa seguridad] → El chequeo `toEqual([])` de `tools/list` obliga a tocar el test al agregar la primera tool, y ahí vuelven los casos de input inválido y válido.

## Open Questions

- Qué tablas y SP de JK3 modelan los movimientos de fondos (cajas, bancos, valores) y si "registrar" encadena SP existentes como en facturas de proveedor. No cambia este change; se releva al diseñar las tools.
