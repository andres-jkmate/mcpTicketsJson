# Design

## Context

Motivación en `proposal.md`; requisitos en `specs/comprobantes-prov-mcp/spec.md`. Estado actual que condiciona el diseño (rama `monorepo-mcps`, 2026-10-22):

- `apps/_template-mcp` es un MCP mínimo con una tool de ejemplo (`obtener_ejemplo` sobre `PROC_GET_EJEMPLO_AG`, que no existe), su test unitario, un test de contrato y un README con los pasos para crear un MCP nuevo. Es el primer uso real de esos pasos.
- `crearServidorMcp` de `@mcp-jkmate/core` acepta cualquier lista de tools, incluida la vacía: `tools/list` devuelve `[]` y una llamada a una tool desconocida lanza `McpError(InvalidParams)`.
- `problemasDeDescripcion([])` devuelve `[]`, así que los chequeos del test de contrato que recorren todas las tools pasan sin tools y vuelven a morder cuando se agregue la primera.
- El `package.json` raíz toma `apps/*` como workspaces: la app nueva entra en los comandos de todo el repo sin tocar la raíz, salvo `package-lock.json` tras `npm install`.
- `AccesoDatos.enTransaccion` de `@mcp-jkmate/firebird` es de solo lectura. Registrar comprobantes va a necesitar escritura, pero eso se resuelve con las tools.

## Goals / Non-Goals

**Goals:**
- Un servidor que compila, pasa sus tests, arranca por stdio y responde `tools/list` vacío.
- Dejar listo lo que el change de las tools va a reusar: `test/apoyo.ts`, el test de contrato genérico y `db/procedimientos/`.
- Detectar fricciones de la plantilla al usarla por primera vez.

**Non-Goals:**
- Tools, SP, códigos de error del dominio y escritura en la base.
- Cambios en `packages/`, en la plantilla o en tickets. Si aparece una fricción de la plantilla, se anota en `tasks.md` para un change aparte.

## Decisions

### D1. Copiar la plantilla siguiendo su README
Se copia con `robocopy apps\_template-mcp apps\comprobantes-prov-mcp /E /XD node_modules dist /XF .env` y se aplican los pasos 2, 6 y 7 del README de la plantilla. **Alternativa:** escribir la app desde cero; se descarta porque divergiría de la plantilla y no probaría sus pasos.

### D2. Nombres
| Qué | Valor |
|---|---|
| Carpeta | `apps/comprobantes-prov-mcp` |
| Paquete npm | `@mcp-jkmate/comprobantes-prov-mcp` |
| `NOMBRE_SERVIDOR` (handshake y `app` en Seq) | `mcp-comprobantes-prov` |
| Clave en `claude_desktop_config.json` | `comprobantes-prov` |
| Log de Claude Desktop | `%APPDATA%\Claude\logs\mcp-server-comprobantes-prov.log` |

Se sigue el patrón de la plantilla (`mcp-<nombre>`). Tickets usa `mcp-tickets-json` por historia; no se replica el sufijo.

### D3. Arrancar sin tools
Se borran `src/tools/obtener-ejemplo.ts` y `test/obtener-ejemplo.test.ts`, y `crearTools` devuelve `[]`. Se mantienen la firma `crearTools(deps: DependenciasTools)` y `DependenciasTools { acceso }`, para que `index.ts` no cambie cuando lleguen las tools. **Alternativa:** conservar `obtener_ejemplo` hasta el change de tools; se descarta porque un agente vería una tool que siempre falla (el SP no existe) si alguien instala el MCP antes. Como `deps` queda sin usar, el parámetro se llama `_deps` (el `eslint.config.js` raíz ignora argumentos con prefijo `_`).

### D4. Test de contrato sin tools
`test/contrato.test.ts` queda con:
- `tools/list` devuelve `[]` (se actualiza a la lista real en el change de tools);
- el handshake informa `mcp-comprobantes-prov`;
- descripciones, annotations, `inputSchema` cerrado y enum de códigos recorriendo todas las tools (pasan vacíos hoy y aplican solos después);
- una llamada a `obtener_ejemplo` falla como tool desconocida.

Los casos "input inválido → `PARAMETRO_INVALIDO`" e "input válido" se quitan porque no hay tool sobre la cual probarlos; vuelven con la primera tool. `test/apoyo.ts` se mantiene igual (`accesoSimulado`, `conectarCliente`) aunque hoy no lo use ningún SP simulado.

### D5. Códigos de error
`CODIGOS_ERROR` queda con los cuatro base, en el orden de la plantilla sin `EJEMPLO_NO_ENCONTRADO`. Los del dominio (por ejemplo `COMPROBANTE_NO_ENCONTRADO`, `PROVEEDOR_NO_ENCONTRADO`) se definen con las tools. El escenario de typecheck del spec se cubre con un test de tipos (`@ts-expect-error` al construir `ErrorTool` con un código ajeno), como `packages/core/src/tipos.test-d.ts`.

### D6. `db/procedimientos/` y README
Se crea `apps/comprobantes-prov-mcp/db/README.md` con la tabla de SP vacía y la forma de aplicarlos (igual a la de tickets), para que el change de tools solo agregue filas. El README de la app reemplaza al de la plantilla: qué es, estado (sin tools), configuración (`.env`), verificación y alta en Claude Desktop con los nombres de D2.

### D7. Prueba de arranque por stdio
`apps/tickets-mcp/test/stdio.test.ts` ya lanza el servidor como proceso hijo con `tsx` (`spawnSync`, entorno mínimo sin `FIREBIRD_*` ni `MCP_*`). Se copia y se recorta a dos casos de los escenarios de configuración: sin `MCP_COD_USUARIO` el proceso termina con código ≠ 0 y stderr nombra la variable; con la configuración completa (base inexistente, porque el pool no conecta hasta la primera tool) el handshake por stdio responde `mcp-comprobantes-prov` y stdout no tiene nada fuera del protocolo. Los casos de tickets que dependen de sus SP no se copian. **Alternativa:** verificar a mano con `npm run dev`; se descarta porque el test ya existe y es barato de adaptar. Si resultara que el pool sí conecta al arrancar, el caso "configuración completa" se marca como de integración (se salta sin base), como hace tickets.

## Risks / Trade-offs

- [Un servidor sin tools instalado en Claude Desktop no aporta nada y puede confundir] → El README dice que el alta es opcional hasta que haya tools.
- [El test de contrato pasa "vacío" y podría dar falsa seguridad] → El chequeo `toEqual([])` del nombre de tools obliga a tocar el test al agregar la primera tool, y ahí se suman los casos de input inválido y válido.
- [La plantilla puede tener pasos incompletos para un MCP sin tools] → Se anotan en `tasks.md` y se corrigen en un change de la plantilla, no en este.

## Open Questions

- Si registrar comprobantes requiere una transacción de escritura en `@mcp-jkmate/firebird` o un SP que confirma por su cuenta. No cambia este change; se decide al diseñar las tools.
