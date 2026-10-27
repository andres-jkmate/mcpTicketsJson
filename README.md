# MCPs de JKMate v2 para agentes

Monorepo de los servidores MCP "v2" de JKMate: pocas tools diseñadas a mano para agentes, que devuelven JSON tipado (`structuredContent` + `outputSchema`) y resuelven la forma de los datos en la base, con stored procedures `_AG` de Firebird. Cada MCP corre local por stdio: Claude Desktop lo lanza como proceso hijo.

Es un repo propio, separado del monorepo Nx `jkmate-mcp`. Usa npm workspaces, sin Nx.

> **Repo congelado.** Este prototipo es el modelo del repo definitivo. Qué aprendimos, qué debe permanecer y la metodología sugerida (diseño guiado por prompts) están en [`LECCIONES.md`](LECCIONES.md).

## Contenido

| Carpeta | Paquete | Qué es |
|---|---|---|
| [`apps/tickets-mcp`](apps/tickets-mcp/README.md) | `@mcp-jkmate/tickets-mcp` | MCP de tickets: 4 tools de lectura (contexto de un ticket, listados de tickets y tareas, resúmenes). Instalación en [`docs/instalacion.md`](apps/tickets-mcp/docs/instalacion.md). |
| [`apps/comprobantes-prov-mcp`](apps/comprobantes-prov-mcp/README.md) | `@mcp-jkmate/comprobantes-prov-mcp` | MCP de comprobantes de proveedores: 2 tools para registrar una factura de proveedor en lenguaje natural (`preparar_factura_proveedor`, de lectura, y `registrar_factura_proveedor`, que escribe en una transacción). Usar solo contra una copia local de la base. |
| [`apps/fondos-mcp`](apps/fondos-mcp/README.md) | `@mcp-jkmate/fondos-mcp` | MCP de movimientos de fondos: 2 tools de lectura (`buscar_movimientos_fondos`, por número, período, importe, clase o tercero, y `ver_movimiento_fondo`, el detalle de un movimiento). |
| [`apps/_template-mcp`](apps/_template-mcp/README.md) | `@mcp-jkmate/template-mcp` | Plantilla para crear un MCP nuevo. Compila y se testea con el resto, pero no se instala. |
| [`packages/core`](packages/core/) | `@mcp-jkmate/core` | Contrato de una tool, wrapper común (validación del input, errores uniformes y log de cada invocación con `idCorrelacion`), servidor MCP, logger Pino con Seq, `Sesion` y validación de la plantilla de descripción. `@mcp-jkmate/core/pruebas` tiene los helpers para los tests de cada app. |
| [`packages/firebird`](packages/firebird/) | `@mcp-jkmate/firebird` | Pool de `node-firebird`, transacción de solo lectura, errores de conexión (`BASE_NO_DISPONIBLE`), contrato `RESULTADO`/`MENSAJE_ERROR` y conversión de fechas y valores. |

Las especificaciones y los changes están en [`openspec/`](openspec/).

## Dependencias

Las que usan los MCPs al correr:

| Paquete | Dónde | Para qué |
|---|---|---|
| [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) | apps, `core` (peer) | SDK oficial de MCP: servidor, transporte stdio, registro de tools con `outputSchema` y `structuredContent`. |
| [`zod`](https://zod.dev) | apps, `core` (peer) | Esquemas del input y del output de cada tool. El SDK los convierte a JSON Schema para `tools/list` y `core` los usa para validar el input antes de ejecutar la tool. |
| [`node-firebird`](https://www.npmjs.com/package/node-firebird) | `firebird`, `tickets-mcp` | Driver de Firebird en JavaScript puro, sin cliente nativo: pool de conexiones, transacciones y llamada a los SP. |
| [`pino`](https://getpino.io) | apps, `core` (peer) | Logger JSON estructurado. Cada invocación de tool deja un evento con su `idCorrelacion`. Escribe siempre a stderr, y también a Seq si está configurado. Nunca escribe a stdout, que es del protocolo MCP. |
| [`pino-seq`](https://www.npmjs.com/package/pino-seq) | `core` | Envía los logs de Pino a un servidor Seq cuando está definida `SEQ_URL`. |

`core` declara el SDK de MCP, Zod y Pino como `peerDependencies`. Así, cada app instala una sola copia de cada uno y la comparte con el paquete.

Las de desarrollo:

| Paquete | Dónde | Para qué |
|---|---|---|
| [`typescript`](https://www.typescriptlang.org) | raíz | Compilador: `npm run build` con referencias de proyecto (`tsc -b`) y `npm run typecheck`. |
| [`tsx`](https://tsx.is) | raíz | Corre TypeScript sin compilar: `npm run dev` y los scripts de medición. |
| [`vitest`](https://vitest.dev) | raíz | Runner de tests: unitarios, de contrato y de integración. |
| [`eslint`](https://eslint.org), [`@eslint/js`](https://www.npmjs.com/package/@eslint/js), [`typescript-eslint`](https://typescript-eslint.io) | raíz | Linter (`npm run lint`) con las reglas recomendadas de JavaScript y de TypeScript. |
| [`@types/node`](https://www.npmjs.com/package/@types/node) | raíz | Tipos de la API de Node.js. |
| [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) | `tickets-mcp` | Cliente de la API de Claude para los scripts que miden al agente contra las tools (`npm run medir:agente`, `estimar:agente`). No se usa en el servidor. |
| [`ajv`](https://ajv.js.org), [`ajv-formats`](https://www.npmjs.com/package/ajv-formats) | `tickets-mcp` | Validación con JSON Schema de los argumentos que arma el agente en esos mismos scripts. |

Las variables de entorno se cargan con `--env-file-if-exists` de Node, sin `dotenv`.

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
