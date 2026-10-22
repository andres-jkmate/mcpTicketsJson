# Design

## Context

La motivación está en `proposal.md` y los requisitos en `specs/`. Esta sección describe el estado actual del código que condiciona el diseño (rama `monorepo-mcps`, 2026-10-21).

- Lo genérico y lo de tickets ya están separados por archivo, aunque convivan en `src/`. Son genéricos `errores.ts`, `tools/definicion.ts`, `tools/ejecutar.ts`, `servidor-mcp.ts`, `logger.ts`, `auth/sesion.ts`, `db/firebird.ts`, `aplicarContrato` en `db/sp.ts`, y `mapeo/fecha.ts` y `mapeo/valores.ts`. Hay algunos puntos de tickets "pegados" a lo genérico:
  - `CODIGOS_ERROR` es una lista cerrada que incluye `TICKET_NO_ENCONTRADO`.
  - `NOMBRE_SERVIDOR`/`VERSION_SERVIDOR` son constantes de `servidor-mcp.ts`, y el logger fija `app: 'mcp-tickets-json'`.
  - El mensaje de `BASE_NO_DISPONIBLE` dice "La base de datos de tickets…".
  - `AccesoDatos.codDesarrolladorDeUsuario` hace una consulta de JKMate (`USUARIOS`) dentro del módulo de Firebird.
  - `Sesion` incluye `codDesarrollador`, que solo usa tickets.
- `scripts/` y `test/` importan de `src/` por ruta relativa (unos 25 imports). `scripts/agente/conexion.ts` resuelve la raíz con `'..','..'` desde su carpeta. `test/stdio.test.ts` busca `node_modules/tsx` relativo a la raíz.
- Los scripts de npm cargan `.env` con `--env-file-if-exists=.env`, relativo al directorio de trabajo.
- `test/contrato.test.ts` ya obtiene `tools/list` con un cliente MCP en memoria.

## Goals / Non-Goals

**Goals:**
- Que agregar un MCP sea copiar la plantilla y escribir tools, sin tocar los paquetes.
- Mover sin perder historial (`git log --follow` sigue funcionando).
- Poder demostrar que tickets no cambió: `tools/list` idéntico byte a byte y los mismos tests en verde.

**Non-Goals:**
- Publicar los paquetes en un registry. Se consumen solo dentro del monorepo.
- Cambiar la API interna de las tools de tickets más allá de los imports.
- Unificar `scripts/agente` como paquete. Es medición específica de tickets y se generaliza cuando otro MCP lo necesite.

## Decisions

### D1. npm workspaces, sin Nx
El `package.json` raíz declara `workspaces: ["packages/*", "apps/*"]` y sus scripts delegan con `--workspaces`. **Alternativas:** Nx (caché y "affected", útil con muchos MCPs, pero hoy suma configuración sin beneficio con 2 o 3 apps), pnpm (cambia la herramienta del equipo) y turborepo (lo mismo que Nx, a menor escala). Se reevalúa Nx al pasar de 4 o 5 apps; la estructura `apps/` + `packages/` es la que Nx espera, así que migrar no obliga a mover carpetas.

### D2. Paquetes por nombre, con una condición `@mcp-jkmate/source` para desarrollo
Los paquetes se llaman `@mcp-jkmate/core` y `@mcp-jkmate/firebird`. Su `package.json` exporta:
```json
"exports": { ".": { "@mcp-jkmate/source": "./src/index.ts", "types": "./dist/index.d.ts", "default": "./dist/index.js" } }
```
- **Build y producción:** `tsc -b` con project references compila los paquetes antes que las apps, y `node` carga `dist/`.
- **Tests y desarrollo:** Vitest (`resolve.conditions` con `@mcp-jkmate/source`, en `vitest.compartido.ts`) y `tsx` (`--conditions=@mcp-jkmate/source`) usan el código fuente directo, así que no hace falta compilar los paquetes para correr tests ni `npm run dev`. TypeScript la recibe por `customConditions` en `tsconfig.base.json`.
- **Por qué con scope:** la condición iba a llamarse `source`, pero hay dependencias de terceros que la usan para apuntar a su `.ts` (por ejemplo `eventsource-parser`, del SDK de MCP), y con `source` Vitest intentaba cargar ese `.ts` desde `node_modules`. Con el scope del monorepo solo la publican nuestros paquetes. Es el mismo patrón que usa Nx.

**Alternativas:** compilar los paquetes antes de cada test (lento y fácil de olvidar) y `paths` de TypeScript (resuelve tipos pero no el runtime de Node).

### D3. Qué va a cada lugar

| Destino | Contenido (origen) |
|---|---|
| `packages/core/src/` | `errores.ts`, `definicion.ts` (`DefinicionTool`, `ContextoTool`, `RespuestaTool`, `Medidor`, `conError`), `ejecutar.ts`, `servidor.ts` (de `servidor-mcp.ts`), `logger.ts`, `sesion.ts`, `descripcion.ts` (nuevo, D9) |
| `packages/firebird/src/` | `acceso.ts` (de `db/firebird.ts`, sin `codDesarrolladorDeUsuario`), `contrato.ts` (`aplicarContrato` de `db/sp.ts`), `mapeo/fecha.ts`, `mapeo/valores.ts` |
| `apps/tickets-mcp/` | el resto de `src/` (tools, `db/sp.ts` sin `aplicarContrato`, `config.ts`, `index.ts`, `errores.ts` propio, D4), `db/`, `scripts/`, `medicion/`, `test/`, `docs/`, el README de tickets y `.env.example` |
| `apps/_template-mcp/` | nuevo (D10) |
| raíz | `package.json` (workspaces), `tsconfig.base.json`, `eslint.config.js`, `vitest.config.ts` (projects), `openspec/`, `.claude/`, `README.md` del monorepo |

`mapeo/` va a `firebird` y no a `core` porque convierte lo que devuelve el driver (la "hora de reloj" de `relojDesdeDriver`, 0/1, HTML de los mensajes) a los tipos del contrato. Un MCP que no use Firebird no lo necesita.

### D4. Códigos de error: base en core, propios en cada app
`core` exporta `CODIGOS_BASE = ['PARAMETRO_INVALIDO', 'NO_AUTORIZADO', 'BASE_NO_DISPONIBLE', 'ERROR_INTERNO']` y `ErrorTool<C extends string>`. Cada app declara su lista completa **en el orden que publica** y la pasa al servidor, que arma el `ESQUEMA_ERROR` con ella:
```ts
// apps/tickets-mcp/src/errores.ts
export const CODIGOS_ERROR = ['PARAMETRO_INVALIDO', 'TICKET_NO_ENCONTRADO', 'NO_AUTORIZADO', 'BASE_NO_DISPONIBLE', 'ERROR_INTERNO'] as const;
```
Tickets conserva el orden original, así que el enum del `outputSchema` queda igual byte a byte.
- **Control en compilación:** `DefinicionTool`, `ejecutarTool` y `crearServidorMcp` son genéricos en el código, y una app que lanza un código que no está en su lista no compila. Además, la lista declarada tiene que incluir los códigos base (se verifica con un tipo).
- **Control en ejecución:** si a `ejecutarTool` le llega un `ErrorTool` con un código que el servidor no declaró, lo convierte en `ERROR_INTERNO` y lo loguea. Así se cumple el contrato aunque se haya saltado el tipo.

**Alternativa descartada:** un enum global con todos los códigos de todos los MCPs. Acopla todos los servidores y publica códigos que una tool nunca devuelve.

### D5. `Sesion` genérica
`core` define `Sesion = { codUsuario: number }`, y `ContextoTool`/`DefinicionTool` aceptan `S extends Sesion`. Tickets define `SesionTickets = Sesion & { codDesarrollador: number | null }`. **Alternativa:** dejar `codDesarrollador` en core porque el próximo MCP usa la misma base. Se descarta porque core no debe asumir JKMate; si el segundo MCP lo necesita, se comparte desde un helper en `firebird` o en la app.

### D6. Consultas fijas fuera de los SP
`codDesarrolladorDeUsuario` pasa a la app de tickets. Para eso, `AccesoDatos` en `firebird` suma `consultar<T>(sql, parametros)`, documentado como **solo para SQL constante escrito en el código**: nunca se arma con input de una tool. `ejecutarSp` sigue siendo la vía para todo lo que viene de una tool. **Alternativa:** un SP `PROC_GET_DESARROLLADOR_USUARIO_AG`. Es más limpio, pero exige DDL y la regla del repo pide confirmación del usuario; queda para cuando se toque la sesión.

### D7. Mensaje de `BASE_NO_DISPONIBLE` configurable
`crearAccesoFirebird(config, { mensajeNoDisponible?, connectTimeout? })`. El default es genérico ("La base de datos no está disponible…") y tickets pasa su texto actual, así que la respuesta no cambia.

### D8. `idCorrelacion` con un logger hijo
`ejecutarTool` genera `randomUUID()` por invocación, crea `logger.child({ idCorrelacion })` y pasa ese logger en `ctx.logger`. El error inesperado y el evento `invocacion_tool` salen de ese mismo hijo, así que todos los logs de una invocación comparten el id. No se agrega un campo `server`: el nombre ya viaja en `app` (base del logger), y duplicarlo rompería la consistencia de las consultas de Seq. Los campos siguen en camelCase y en español, como los que ya existen.

### D9. Plantilla de descripción y su verificación
El formato es de cuatro rótulos, en este orden y separados por salto de línea:
```
Qué hace: …
Cuándo usarla: …
Parámetros: … (ej.: …)
Qué NO hacer: …
```
`core` exporta `verificarDescripcion(texto): string[]`, que devuelve las partes faltantes o desordenadas, más un "ejemplo" faltante si "Parámetros" no contiene `ej.:`, `ej:` ni `por ejemplo`. Una tool sin parámetros escribe `Parámetros: ninguno.` y no necesita ejemplo. Cada app tiene un test de contrato que recorre sus tools. Tickets no lo corre en este change (ver spec).

### D10. Plantilla de MCP
`apps/_template-mcp` (paquete `@mcp-jkmate/template-mcp`, `private: true`) tiene:
- una tool de ejemplo que llama a un SP a través de `AccesoDatos`;
- un test unitario con un `AccesoDatos` simulado, sin base;
- un test de contrato que levanta el servidor en memoria, lista las tools, prueba un input inválido y uno válido, y verifica las descripciones;
- `index.ts` (stdio), `config.ts`, `errores.ts`, `.env.example` y un README con los pasos para crear un MCP nuevo.

Está dentro de `workspaces`, así que compila y se testea con el resto y no se pudre. No tiene `bin` y no se documenta como instalable.

### D11. Rutas y `.env` de la app de tickets
- La estructura interna de tickets se conserva (`scripts/agente` → raíz de la app con `'..','..'`), así que `conexion.ts` y las rutas a `medicion/` siguen valiendo con la app como directorio de trabajo.
- Los scripts de npm de la app corren con `npm run <x> -w apps/tickets-mcp`, que usa la carpeta de la app como directorio de trabajo, y por eso `.env` vive en `apps/tickets-mcp/.env`.
- `test/stdio.test.ts` resuelve `tsx` con `createRequire(...).resolve('tsx/cli')` en lugar de la ruta fija, porque con workspaces `node_modules` queda en la raíz.

### D12. Cómo se demuestra que tickets no cambió
1. **Antes de mover nada:** un script guarda el JSON de `tools/list` (servidor en memoria, sin base) en `openspec/changes/extraer-paquetes-compartidos/tools-list-antes.json` y se anota la cantidad de tests que pasan.
2. **Después:** un test de la app compara el `tools/list` actual con ese archivo, byte a byte con `JSON.stringify`. Al archivar el change, el archivo pasa a `apps/tickets-mcp/test/datos/` como snapshot del contrato.
3. **Con la base de prueba disponible:** `npm run medir -w apps/tickets-mcp` da las mismas cifras de la v2 que la corrida previa.

## Risks / Trade-offs

- **[`git mv` masivo con edición de imports en el mismo commit]** → Git puede no detectar el rename y el historial se corta. Mitigación: hacer un commit solo con los `git mv` y otro con los cambios de contenido.
- **[La condición `@mcp-jkmate/source` mal configurada en alguna herramienta]** → Los tests usarían `dist/` viejo o fallarían al resolver. Mitigación: `npm test` en un clon limpio sin `dist/` tiene que pasar; se agrega como paso de verificación.
- **[Dos copias de `node-firebird` o del SDK de MCP]** → Con versiones distintas entre paquetes, los tipos de `CallToolResult` dejan de ser compatibles. Mitigación: las dependencias compartidas se declaran como `peerDependencies` en los paquetes, con una sola versión en la app.
- **[El snapshot de `tools/list` frena cambios legítimos futuros]** → Es intencional: cambiar el contrato tiene que ser explícito. El change que lo cambie actualiza el snapshot.
- **[Usuarios con la ruta vieja en `claude_desktop_config.json`]** → El MCP deja de arrancar. Mitigación: aviso en el README y en `docs/instalacion.md`. Hoy el único usuario es el autor.

## Migration Plan

1. Mergear la rama `monorepo-mcps`.
2. En cada máquina que usa el MCP: `npm install` y `npm run build` en la raíz, mover `.env` a `apps/tickets-mcp/.env` y cambiar la ruta en `claude_desktop_config.json` a `…\apps\tickets-mcp\dist\index.js`.
3. Reiniciar Claude Desktop y verificar que aparecen las 4 tools.

**Rollback:** volver a `master` (o revertir el merge) y restaurar la ruta anterior en `claude_desktop_config.json`. No hay cambios en la base.

## Open Questions

- Si el repo se renombra (por ejemplo, `mcp-jkmate-v2`) para reflejar que ya no es solo de tickets. No afecta el código: se puede decidir después del merge.
