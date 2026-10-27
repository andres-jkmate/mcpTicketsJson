# Proposal

## Why

Se necesita un MCP para que un agente consulte y registre movimientos de fondos en JKMate. Igual que con comprobantes de proveedores, conviene crear primero el servidor sobre la plantilla y los paquetes compartidos, para que el change de las tools se concentre en los SP `_AG`, los esquemas y las descripciones sin mezclar esa discusión con la estructura de la app.

## What Changes

- **Nueva app `apps/fondos-mcp`** (`@mcp-jkmate/fondos-mcp`), copiada de `apps/_template-mcp` siguiendo su README y su variante "arrancar sin tools":
  - servidor `mcp-fondos` por stdio, con `config.ts`, `errores.ts`, `servidor.ts` e `index.ts` sobre `@mcp-jkmate/core` y `@mcp-jkmate/firebird`;
  - **sin tools**: se borra `obtener_ejemplo` y `tools/list` devuelve una lista vacía;
  - solo los cuatro códigos de error base; los del dominio se suman junto con las tools;
  - tests de la plantilla adaptados a un servidor sin tools: contrato, arranque por stdio y tipos de los códigos de error;
  - `test/apoyo.ts` con el `AccesoDatos` simulado, listo para los tests de las tools;
  - `db/procedimientos/` vacío (con un README) para versionar los SP cuando se apliquen;
  - `.env.example` y un README propio: qué es, estado actual (sin tools), configuración y alta en Claude Desktop.
- **`README.md` raíz**: la fila de la app nueva en la tabla de contenido.

Fuera de alcance (van en el change de las tools): las tools de consulta y registro de movimientos de fondos, los SP `_AG` que las alimentan y los códigos de error del dominio. La transacción de escritura ya existe en `@mcp-jkmate/firebird` (`enTransaccionEscritura`), así que ese change no necesita tocar los paquetes para registrar.

## Capabilities

### New Capabilities
- `fondos-mcp`: el servidor MCP de movimientos de fondos. En este change cubre que exista como app propia del monorepo, arranque por stdio con su configuración, se identifique con su nombre y publique solo los códigos de error base, sin tools todavía.

### Modified Capabilities
<!-- Ninguna: plataforma-mcp ya define cómo se crea un MCP desde la plantilla y este change la cumple sin cambiarla. -->

## Impact

- **Código**: carpeta nueva `apps/fondos-mcp`. No se tocan `packages/`, las otras apps ni la plantilla.
- **Build y tests**: el workspace nuevo entra solo en `npm run build`, `npm test`, `npm run lint` y `npm run typecheck` de la raíz (`apps/*`). Hace falta `npm install` en la raíz para registrarlo en `package-lock.json`.
- **Dependencias**: las mismas de la plantilla. Ninguna nueva.
- **Base de datos**: ninguna. No se crean SP ni se ejecuta DDL.
- **Seq**: los logs de la app salen con `app: 'mcp-fondos'`.
- **Claude Desktop**: el alta queda documentada en el README; instalarlo es opcional hasta que tenga tools.
