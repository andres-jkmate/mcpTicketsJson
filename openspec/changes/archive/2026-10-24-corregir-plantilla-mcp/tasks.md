# Tasks

## 1. Tests nuevos en la plantilla

- [x] 1.1 Copiar `apps/comprobantes-prov-mcp/test/stdio.test.ts` a `apps/_template-mcp/test/` y adaptarlo según design D2: el nombre esperado y el texto del log de arranque salen de `NOMBRE_SERVIDOR`. Se verifica con `npm test -w apps/_template-mcp` en verde, con los dos casos de stdio corriendo (no saltados).
- [x] 1.2 Alinear `apps/comprobantes-prov-mcp/test/stdio.test.ts` para que tome el nombre de `NOMBRE_SERVIDOR`, igual que la plantilla (design D2). Se verifica con un diff entre las dos copias que no muestra diferencias, y con `npm test -w apps/comprobantes-prov-mcp` en verde.
- [x] 1.3 Agregar `apps/_template-mcp/test/errores.test-d.ts` (design D2): `EJEMPLO_NO_ENCONTRADO` compila y un código ajeno, con `@ts-expect-error`, no compila. Habilitar `typecheck` en `apps/_template-mcp/vitest.config.ts` (design D3). Se verifica con `npm run typecheck -w apps/_template-mcp` y `npm test -w apps/_template-mcp` en verde ("Type Errors no errors"), y comprobando que al quitar el `@ts-expect-error` fallan los dos.

## 2. README de la plantilla

- [x] 2.1 Paso 7: reemplazar el comando del Inspector por el de design D1 (`node --env-file=apps/clientes-mcp/.env ...`) y aclarar que necesita el `.env` del paso 6 y `npm run build`. Se verifica corriendo el comando tal como queda escrito, con el nombre de la app cambiado, en modo web contra `apps/comprobantes-prov-mcp` con un `.env` local: el Inspector conecta y muestra `mcp-comprobantes-prov`. Si el modo web no reenvía `--env-file`, anotarlo acá y documentar la variante que funcione (design, Risks).
  - Verificado el 2026-10-24 con el Inspector 2.12.0 en modo web y un `.env` local temporal (ya borrado). El modo web reenvía los argumentos sin cambios (`/api/config` devuelve `defaultArgs: ["--env-file=apps/comprobantes-prov-mcp/.env", "apps/comprobantes-prov-mcp/dist/index.js"]` y `defaultCwd` en la raíz del repo). La extensión de Chrome no estaba conectada, así que la conexión se hizo por la API del backend que usa la UI (`/api/mcp/connect`, `/send`, `/events`) con esos valores y sin `MCP_COD_USUARIO` en el entorno: el servidor arrancó con `codUsuario: 15169` (sale del `.env`), respondió el handshake como `mcp-comprobantes-prov` y `tools/list` devolvió `[]`. No hubo que documentar otra variante.
- [x] 2.2 Agregar la variante "Arrancar sin tools" (design D4) y actualizar el paso 5 de tests con los dos tests nuevos (design D5). Se verifica siguiendo esos pasos sobre una copia temporal de la plantilla (fuera de `apps/`, o borrada al terminar): typecheck, lint y tests en verde y `tools/list` vacío. La copia no queda en el repo.
  - Verificado con una copia en `apps/zz-sin-tools-tmp-mcp` (renombrada según el paso 2 para no chocar con el workspace de la plantilla, y borrada al terminar): `tsc --noEmit`, `eslint .` y `vitest run` en verde (3 archivos, 7 tests, sin errores de tipos); el test de contrato verifica `tools/list` vacío.
- [x] 2.3 Actualizar la lista "Trae:" del comienzo del README con los dos tests nuevos. Se verifica con que la lista nombra los cinco archivos de `test/`, incluidos `stdio.test.ts` y `errores.test-d.ts`.

## 3. README de comprobantes-prov

- [x] 3.1 Reemplazar el comando del Inspector de la sección "Verificar" por el de design D1 con `apps/comprobantes-prov-mcp`. Se verifica con que el comando es el mismo que se probó en 2.1.

## 4. Verificación de todo el repo

- [x] 4.1 Correr `npm run build`, `npm test`, `npm run lint` y `npm run typecheck` en la raíz. Se verifica con los cuatro en verde; anotar acá la cantidad de tests de la plantilla y de comprobantes-prov.
  - 2026-10-24: los cuatro en verde. Plantilla: 4 archivos, 13 tests (antes 9: suma 2 de stdio y 2 de tipos), sin errores de tipos. comprobantes-prov: 3 archivos, 9 tests, sin errores de tipos. El resto sin cambios (core 31, firebird 18, tickets 201 y 16 saltados que necesitan base).
