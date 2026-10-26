# Proposal

## Why

Se necesita un MCP para que un agente consulte y registre comprobantes de proveedores en JKMate. Antes de diseñar sus tools conviene tener el servidor creado sobre la plantilla y los paquetes compartidos: así el change de las tools se concentra en los SP `_AG`, los esquemas y las descripciones, y no mezcla esa discusión con la estructura de la app. Es además el primer MCP que se crea con `apps/_template-mcp`, lo que sirve para probar que la plantilla alcanza.

## What Changes

- **Nueva app `apps/comprobantes-prov-mcp`** (`@mcp-jkmate/comprobantes-prov-mcp`), copiada de `apps/_template-mcp` según su README:
  - servidor `mcp-comprobantes-prov` por stdio, con `config.ts`, `errores.ts`, `servidor.ts` e `index.ts` sobre `@mcp-jkmate/core` y `@mcp-jkmate/firebird`;
  - **sin tools**: se borra `obtener_ejemplo` y `tools/list` devuelve una lista vacía;
  - solo los cuatro códigos de error base; los del dominio se suman junto con las tools;
  - test de contrato adaptado a un servidor sin tools, que sigue verificando descripciones, annotations y códigos cuando se agreguen;
  - `test/apoyo.ts` con el `AccesoDatos` simulado, listo para los tests de las tools;
  - `db/procedimientos/` vacío (con un README) para versionar los SP cuando se apliquen;
  - `.env.example` y un README propio: qué es, estado actual (sin tools), configuración y alta en Claude Desktop.
- **`README.md` raíz**: la fila de la app nueva en la tabla de contenido.

Fuera de alcance (van en el change de las tools): las tools de consulta y registro, los SP `_AG` que las alimentan, los códigos de error del dominio y la escritura en la base. `@mcp-jkmate/firebird` hoy solo abre transacciones de solo lectura; cómo registrar comprobantes (transacción de escritura en el paquete o SP que confirma por su cuenta) se decide en ese change.

## Capabilities

### New Capabilities
- `comprobantes-prov-mcp`: el servidor MCP de comprobantes de proveedores. En este change cubre que exista como app propia del monorepo, arranque por stdio con su configuración, se identifique con su nombre y publique solo los códigos de error base, sin tools todavía.

### Modified Capabilities
<!-- Ninguna: plataforma-mcp ya define cómo se crea un MCP desde la plantilla y este change la cumple sin cambiarla. -->

## Impact

- **Código**: carpeta nueva `apps/comprobantes-prov-mcp`. No se tocan `packages/`, `apps/tickets-mcp` ni la plantilla.
- **Build y tests**: el workspace nuevo entra solo en `npm run build`, `npm test`, `npm run lint` y `npm run typecheck` de la raíz (`apps/*`). Hace falta `npm install` en la raíz para registrarlo en `package-lock.json`.
- **Dependencias**: las mismas de la plantilla. Ninguna nueva.
- **Base de datos**: ninguna. No se crean SP ni se ejecuta DDL.
- **Seq**: los logs de la app salen con `app: 'mcp-comprobantes-prov'`.
- **Claude Desktop**: el alta queda documentada en el README; instalarlo es opcional hasta que tenga tools.
