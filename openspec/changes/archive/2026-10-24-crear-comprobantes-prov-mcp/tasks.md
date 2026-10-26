# Tasks

## 1. Crear la app desde la plantilla

- [x] 1.1 Copiar `apps/_template-mcp` a `apps/comprobantes-prov-mcp` sin `node_modules`, `dist` ni `.env` (design D1). Se verifica con que la carpeta nueva tiene `src/`, `test/`, `package.json`, `tsconfig*.json`, `vitest.config.ts` y `.env.example`, y no tiene `dist/`.
- [x] 1.2 Renombrar según design D2: `package.json` (`@mcp-jkmate/comprobantes-prov-mcp`, `description` propia) y `NOMBRE_SERVIDOR = 'mcp-comprobantes-prov'` en `src/servidor.ts`. Correr `npm install` en la raíz. Se verifica con `npm ls @mcp-jkmate/comprobantes-prov-mcp` y con `package-lock.json` que incluye el workspace nuevo.

## 2. Servidor sin tools

- [x] 2.1 Borrar `src/tools/obtener-ejemplo.ts` y `test/obtener-ejemplo.test.ts`; `crearTools(_deps)` devuelve `[]` con la misma firma (design D3). Dejar `CODIGOS_ERROR` solo con los cuatro base (design D5). Se verifica con `npm run typecheck -w apps/comprobantes-prov-mcp` y `npm run lint -w apps/comprobantes-prov-mcp` en verde.
- [x] 2.2 Adaptar `test/contrato.test.ts` según design D4: `tools/list` vacío, nombre del servidor en el handshake, chequeos genéricos de descripciones/annotations/esquemas y llamada a `obtener_ejemplo` rechazada como tool desconocida. Se verifica con `npm test -w apps/comprobantes-prov-mcp` en verde y sin base.
- [x] 2.3 Agregar un test de tipos con `@ts-expect-error` que construye `ErrorTool` con un código que no es base (design D5, escenario "Código del dominio sin declarar"). Se verifica con `npm run typecheck -w apps/comprobantes-prov-mcp` en verde y comprobando que, al quitar el `@ts-expect-error`, falla.
- [x] 2.4 Copiar `apps/tickets-mcp/test/stdio.test.ts` y recortarlo a los dos casos de design D7 (falta `MCP_COD_USUARIO`; arranque completo con handshake y stdout limpio). Se verifica con `npm test -w apps/comprobantes-prov-mcp` en verde; si el caso de arranque necesita base, queda saltado sin ella y se anota acá. El caso de arranque no necesita base (el pool conecta recién con la primera tool): corre siempre, con una base inexistente.

## 3. Documentación

- [x] 3.1 Reemplazar el README de la app (design D6): qué es, estado actual (sin tools, se diseñan en otro change), configuración con `.env`, verificación y alta en Claude Desktop con la clave `comprobantes-prov` y su log, aclarando que instalarlo es opcional hasta que haya tools. Se verifica siguiendo la sección de verificación del README tal como está escrita.
- [x] 3.2 Crear `db/README.md` con la tabla de SP vacía y cómo aplicarlos (design D6). Se verifica con el archivo presente y sin referencias a SP de tickets.
- [x] 3.3 Sumar la fila de `apps/comprobantes-prov-mcp` a la tabla de contenido del `README.md` raíz. Se verifica con que el link de la fila abre el README de la app.

## 4. Verificación de todo el repo

- [x] 4.1 Correr `npm run build`, `npm test`, `npm run lint` y `npm run typecheck` en la raíz. Se verifica con los cuatro en verde y con la app nueva en la salida de cada uno; anotar acá la cantidad de tests.
  - 2026-10-24: los cuatro en verde con `comprobantes-prov-mcp` en cada salida. Tests: core 31, firebird 18, plantilla 9, comprobantes-prov 9 (más el test de tipos sin errores), tickets 201 (+16 saltados sin base); 268 en total.
- [x] 4.2 Correr `npx @modelcontextprotocol/inspector node apps/comprobantes-prov-mcp/dist/index.js` con un `.env` local y comprobar que el servidor se identifica como `mcp-comprobantes-prov` y lista cero tools. Anotar acá cualquier paso del README de la plantilla que haya faltado o confundido (design, Risks) para un change aparte.
  - 2026-10-24: con `npx @modelcontextprotocol/inspector --cli ... --method tools/list` (variables con `-e`, base inexistente) la lista es `[]`. El modo CLI no muestra `serverInfo`, así que el nombre se comprobó con un cliente del SDK contra `dist/index.js`: `mcp-comprobantes-prov` 0.1.0.
  - Fricciones de la plantilla, para un change aparte:
    - El paso 7 del README propone `npx @modelcontextprotocol/inspector node apps/<mcp>/dist/index.js`, pero `node dist/index.js` no lee el `.env` (solo `npm run dev`/`npm start` usan `--env-file-if-exists`): así, el servidor no arranca por falta de configuración. Hace falta `node --env-file=apps/<mcp>/.env ...` o pasar las variables con `-e` del Inspector.
    - El README no cubre arrancar sin tools: no dice que `crearTools` puede devolver `[]` con el parámetro renombrado a `_deps` (por el lint) ni qué casos del test de contrato quitar.
    - La plantilla no trae el test de arranque por stdio ni el test de tipos de los códigos de error: se copiaron de `apps/tickets-mcp/test/stdio.test.ts` y `packages/core/src/tipos.test-d.ts`, y hubo que habilitar `typecheck` en `vitest.config.ts`.
