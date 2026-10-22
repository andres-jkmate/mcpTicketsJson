# MCPs de JKMate v2 para agentes

Monorepo de los servidores MCP "v2" de JKMate: pocas tools diseñadas a mano para agentes, que devuelven JSON tipado (`structuredContent` + `outputSchema`) y resuelven la forma de los datos en la base, con stored procedures `_AG` de Firebird. Cada MCP corre local por stdio: Claude Desktop lo lanza como proceso hijo.

Es un repo propio, separado del monorepo Nx `jkmate-mcp`. Usa npm workspaces, sin Nx.

## Contenido

| Carpeta | Paquete | Qué es |
|---|---|---|
| [`apps/tickets-mcp`](apps/tickets-mcp/README.md) | `@mcp-jkmate/tickets-mcp` | MCP de tickets: 4 tools de lectura (contexto de un ticket, listados de tickets y tareas, resúmenes). Instalación en [`docs/instalacion.md`](apps/tickets-mcp/docs/instalacion.md). |
| [`apps/_template-mcp`](apps/_template-mcp/README.md) | `@mcp-jkmate/template-mcp` | Plantilla para crear un MCP nuevo. Compila y se testea con el resto, pero no se instala. |
| [`packages/core`](packages/core/) | `@mcp-jkmate/core` | Contrato de una tool, wrapper común (validación del input, errores uniformes y log de cada invocación con `idCorrelacion`), servidor MCP, logger Pino con Seq, `Sesion` y validación de la plantilla de descripción. `@mcp-jkmate/core/pruebas` tiene los helpers para los tests de cada app. |
| [`packages/firebird`](packages/firebird/) | `@mcp-jkmate/firebird` | Pool de `node-firebird`, transacción de solo lectura, errores de conexión (`BASE_NO_DISPONIBLE`), contrato `RESULTADO`/`MENSAJE_ERROR` y conversión de fechas y valores. |

Las especificaciones y los changes están en [`openspec/`](openspec/).

## Comandos

Requiere Node.js 22 o superior. Todo se corre en la raíz:

```bash
npm install          # instala y enlaza los paquetes y las apps
npm run build        # compila paquetes y apps (los paquetes primero)
npm test             # tests de todos los paquetes y apps; no necesitan base
npm run lint
npm run typecheck
```

Cada comando corre sobre todos los paquetes y apps, y falla si falla en cualquiera de ellos. Para uno solo, `-w <carpeta>`:

```bash
npm test -w apps/tickets-mcp
npm run dev -w apps/tickets-mcp      # corre el servidor desde src/, lee apps/tickets-mcp/.env
```

Los scripts de una app corren con la carpeta de la app como directorio de trabajo, así que su `.env` va dentro de ella (`apps/<mcp>/.env`).

En tests y en `npm run dev`, los paquetes se usan desde su código fuente (condición `@mcp-jkmate/source` de sus `exports`), así que no hace falta compilarlos antes. En producción, `node` carga su `dist/`: por eso, antes de usar un MCP desde Claude Desktop hay que correr `npm run build` en la raíz.

## Crear un MCP

Se copia la plantilla, se renombra y se reemplaza la tool de ejemplo por las propias. Los pasos completos (SP, tools, descripción obligatoria, tests y alta en Claude Desktop) están en el [README de la plantilla](apps/_template-mcp/README.md).

Toda tool de un MCP nuevo describe, en este orden: qué hace, cuándo usarla, los parámetros con un ejemplo y qué NO hacer. El test de contrato de cada MCP lo verifica.
