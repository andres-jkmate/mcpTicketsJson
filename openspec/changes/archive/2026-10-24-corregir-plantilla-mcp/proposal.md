# Proposal

## Why

Al crear `apps/comprobantes-prov-mcp`, el primer MCP hecho con `apps/_template-mcp`, aparecieron tres fricciones (anotadas en la tarea 4.2 de `archive/2026-10-24-crear-comprobantes-prov-mcp/tasks.md`):

1. El comando del Inspector del README no arranca el servidor, porque `node dist/index.js` no lee el `.env`.
2. El README no explica cómo dejar un MCP sin tools mientras se diseñan.
3. La plantilla no trae los tests de arranque por stdio ni de tipos de los códigos de error, y hubo que copiarlos de tickets y de core.

Conviene corregirlo ahora, antes de que el próximo MCP vuelva a tropezar con lo mismo y mientras comprobantes-prov todavía repite el comando roto en su README.

## What Changes

- **README de la plantilla**:
  - el comando del Inspector carga la configuración (el `.env` de la app), así funciona tal como está escrito;
  - un paso nuevo para arrancar sin tools: `crearTools` devuelve `[]` con el parámetro `_deps`, qué casos del test de contrato se quitan y qué se conserva;
  - el paso de tests nombra los dos tests nuevos y qué hay que adaptar en cada uno.
- **Test de arranque por stdio en la plantilla** (`test/stdio.test.ts`), con los casos que ya probó comprobantes-prov: sin `MCP_COD_USUARIO` falla y lo informa en stderr; con la configuración completa no escribe en stdout hasta recibir un mensaje y responde el handshake con su nombre. No necesita base.
- **Test de tipos de los códigos de error en la plantilla** (`test/errores.test-d.ts`): un código declarado compila y uno no declarado no compila. `vitest.config.ts` habilita `typecheck` para que también lo corra `npm test`.
- **README de `apps/comprobantes-prov-mcp`**: el mismo arreglo del comando del Inspector.

## Capabilities

### New Capabilities
<!-- Ninguna. -->

### Modified Capabilities
- `plataforma-mcp`: el requisito "Plantilla de MCP" pide además el test de arranque por stdio y el de tipos de los códigos de error, y que el README cubra un MCP sin tools y una verificación con el Inspector que funcione tal como está escrita.

## Impact

- **Código**: `apps/_template-mcp` (README, `test/stdio.test.ts`, `test/errores.test-d.ts`, `vitest.config.ts`) y el README de `apps/comprobantes-prov-mcp`. No se tocan `packages/` ni `apps/tickets-mcp`.
- **Tests**: la plantilla suma tests que corren con `npm test` en la raíz, sin base. El de stdio lanza un proceso hijo con `tsx` y suma unos segundos.
- **Dependencias**: ninguna nueva.
- **Base de datos**: ninguna.
