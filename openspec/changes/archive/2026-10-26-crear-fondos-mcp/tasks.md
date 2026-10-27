# Tasks

## 1. Crear la app desde la plantilla

- [x] 1.1 Copiar `apps/_template-mcp` a `apps/fondos-mcp` sin `node_modules`, `dist` ni `.env` (design D1). Se verifica con que la carpeta nueva tiene `src/`, `test/`, `package.json`, `tsconfig*.json`, `vitest.config.ts` y `.env.example`, y no tiene `dist/`.
- [x] 1.2 Renombrar según design D2: `package.json` (`@mcp-jkmate/fondos-mcp`, `description` propia) y `NOMBRE_SERVIDOR = 'mcp-fondos'` en `src/servidor.ts`. Correr `npm install` en la raíz. Se verifica con `npm ls @mcp-jkmate/fondos-mcp` y con `package-lock.json` que incluye el workspace nuevo.

## 2. Servidor sin tools

- [x] 2.1 Borrar `src/tools/obtener-ejemplo.ts` y `test/obtener-ejemplo.test.ts`; `crearTools(_deps)` devuelve `[]` con la misma firma (design D3). Dejar `CODIGOS_ERROR` solo con los cuatro base (design D5) y actualizar `test/errores.test-d.ts` (design D4). Se verifica con `npm run typecheck -w apps/fondos-mcp` y `npm run lint -w apps/fondos-mcp` en verde, y comprobando que al quitar el `@ts-expect-error` el typecheck falla.
- [x] 2.2 Adaptar `test/contrato.test.ts` según design D4: `tools/list` vacío, nombre del servidor en el handshake, chequeos genéricos de descripciones/annotations/esquemas y `obtener_ejemplo` rechazada como tool desconocida. Se verifica con `npm test -w apps/fondos-mcp` en verde y sin base, incluido `test/stdio.test.ts` sin cambios.

## 3. Documentación

- [x] 3.1 Reemplazar el README de la app (design D6): qué es, estado actual (sin tools, se diseñan en otro change), configuración con `.env`, verificación y alta en Claude Desktop con la clave `fondos` y su log, aclarando que instalarlo es opcional hasta que haya tools. Se verifica siguiendo la sección de verificación del README tal como está escrita.
- [x] 3.2 Crear `db/README.md` con la tabla de SP vacía y cómo aplicarlos (design D6). Se verifica con el archivo presente y sin referencias a SP de otros MCPs.
- [x] 3.3 Sumar la fila de `apps/fondos-mcp` a la tabla de contenido del `README.md` raíz. Se verifica con que el link de la fila abre el README de la app.

## 4. Verificación de todo el repo

- [x] 4.1 Correr `npm run build`, `npm test`, `npm run lint` y `npm run typecheck` en la raíz. Se verifica con los cuatro en verde y con la app nueva en la salida de cada uno; anotar acá la cantidad de tests.
  - 2026-10-26: los cuatro en verde. `fondos-mcp`: 3 archivos y 9 tests (más el test de tipos). Todo el repo: 22 archivos pasan y 3 se saltan; 201 tests pasan y 16 se saltan (integración sin base).
- [x] 4.2 Con un `.env` local, correr `npx @modelcontextprotocol/inspector --cli node --env-file=apps/fondos-mcp/.env apps/fondos-mcp/dist/index.js --method tools/list` y comprobar que lista cero tools. Anotar acá cualquier paso del README de la plantilla que haya faltado o confundido, para un change aparte.
  - 2026-10-26: responde `{"tools": []}` (con el `.env` de tickets-mcp copiado). Fricciones para un change aparte:
    - La variante "arrancar sin tools" (paso 3) solo pide actualizar el tipo esperado en `test/errores.test-d.ts`, pero el primer caso usa `EJEMPLO_NO_ENCONTRADO`, que deja de existir: también hay que cambiar ese código (lo dice el paso 5, no la variante).
    - La variante termina con "Así queda `apps/comprobantes-prov-mcp`", que ya tiene tools: el ejemplo quedó desactualizado (ahora sirve `apps/fondos-mcp`).
    - El README de la plantilla no muestra el modo `--cli --method tools/list` del Inspector, útil para verificar sin abrir la interfaz.
    - En el `README.md` raíz, la fila de `apps/comprobantes-prov-mcp` sigue diciendo "Todavía sin tools".
