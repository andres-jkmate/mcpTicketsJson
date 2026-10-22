# mcp-tickets-json

MCP de tickets de JKMate, versión 2. Reemplaza de a poco a `tickets-jkmate-mcp` (v1): en lugar de 23 tools que pasan tal cual la salida de stored procedures, expone **4 tools de lectura diseñadas para agentes**, que devuelven JSON tipado (`structuredContent` + `outputSchema`) y un resumen en texto.

| Tool | Para qué |
|---|---|
| `obtener_contexto_ticket` | Todo el contexto de un ticket en **una** llamada: detalle, historial compacto, tareas, agendas, presupuestos y adjuntos. |
| `listar_tickets` | Listado liviano con filtros combinables, texto libre, paginación y total. |
| `listar_tareas` | Tareas de desarrollo por desarrollador, responsable, ticket o estado. |
| `resumir_tickets` | Conteos por estado, prioridad, sistema, cliente o asignado, calculados en la base. |

Es una de las apps del monorepo ([README raíz](../../README.md)): usa `@mcp-jkmate/core` y `@mcp-jkmate/firebird`. La especificación está en [`openspec/specs/`](../../openspec/specs/) y el diseño original en [`openspec/changes/archive/2026-10-17-agregar-tools-lectura-tickets/`](../../openspec/changes/archive/2026-10-17-agregar-tools-lectura-tickets/).

Todos los comandos de este README se corren en la **raíz del repo**. Los de esta app llevan `-w apps/tickets-mcp`.

## Requisitos

- Node.js 22 o superior.
- Firebird 3 con la base de tickets y los SP `_AG` creados (scripts en [`db/`](db/README.md)).

## Usarlo desde Claude Desktop

El servidor es local y habla MCP por **stdio**: Claude Desktop lo lanza como proceso hijo. No hay URL, puerto ni OAuth. La guía completa, con verificación y solución de problemas, está en [docs/instalacion.md](docs/instalacion.md).

1. Compilá una vez, en la raíz del repo (compila también los paquetes compartidos):

   ```bash
   npm install
   npm run build
   ```

2. Abrí `claude_desktop_config.json` (en Windows, `%APPDATA%\Claude\claude_desktop_config.json`; también desde Claude Desktop → Settings → Developer → Edit Config) y agregá:

   ```json
   {
     "mcpServers": {
       "tickets-v2": {
         "command": "node",
         "args": ["D:\\Desarrollo\\_Repos\\mcpTicketsJson\\apps\\tickets-mcp\\dist\\index.js"],
         "env": {
           "MCP_COD_USUARIO": "15169",
           "FIREBIRD_HOST": "127.0.0.1",
           "FIREBIRD_DATABASE": "E:\\Bases\\CREAR_JK3_20261016.fdb",
           "FIREBIRD_USER": "SYSDBA",
           "FIREBIRD_PASSWORD": "<password>"
         }
       }
     }
   }
   ```

   Si lo tenías instalado antes del monorepo, la ruta cambió: antes era `...\mcpTicketsJson\dist\index.js`.

3. Reiniciá Claude Desktop. Las 4 tools aparecen bajo `tickets-v2`. Si no arranca, el motivo queda en el log del servidor (`%APPDATA%\Claude\logs\mcp-server-tickets-v2.log`).

## Configuración

| Variable | Default | Descripción |
|---|---|---|
| `MCP_COD_USUARIO` | — | **Obligatoria.** `COD_USUARIO` de JKMate de quien usa el servidor. Es la identidad de todas las invocaciones. |
| `FIREBIRD_DATABASE` | — | **Obligatoria.** Ruta o alias de la base de tickets. |
| `FIREBIRD_HOST`, `FIREBIRD_PORT` | `127.0.0.1`, `3050` | Servidor Firebird. |
| `FIREBIRD_USER`, `FIREBIRD_PASSWORD` | `SYSDBA`, — | Credenciales. |
| `FIREBIRD_POOL_MAX` | `5` | Conexiones máximas del pool. |
| `ZONA_HORARIA_BASE` | `America/Argentina/Buenos_Aires` | Zona de los `TIMESTAMP` de Firebird; las fechas salen en ISO 8601 con ese offset. |
| `LOG_LEVEL` | `info` | Nivel de Pino. Los logs van a stderr (stdout es el canal MCP). |
| `SEQ_URL`, `SEQ_API_KEY` | — | Si hay `SEQ_URL`, los logs también van a Seq. |

Ninguna tool recibe la identidad como parámetro. Los filtros por persona aceptan `"yo"`: en tickets es `MCP_COD_USUARIO`; en tareas, su `USUARIOS.COD_DESARROLLADOR`, que se resuelve en la base al arrancar.

Esto es para evaluación: no hay autenticación. Quien configura el proceso decide con qué usuario consulta.

## Desde la terminal

Para correrlo a mano, copiá `apps/tickets-mcp/.env.example` a `apps/tickets-mcp/.env` y completalo. El `.env` va dentro de la app: los scripts corren con la carpeta de la app como directorio de trabajo.

```bash
npm run dev -w apps/tickets-mcp     # corre src/ con tsx (lee .env)
npm start -w apps/tickets-mcp       # corre dist/ (lee .env)
```

Queda esperando mensajes MCP por stdin. Para explorarlo con una interfaz: `npx @modelcontextprotocol/inspector node apps/tickets-mcp/dist/index.js` (las variables se cargan en la pantalla del inspector).

## Tests

```bash
npm test -w apps/tickets-mcp                  # unitarios y de contrato; no necesitan base
npm run test:integracion -w apps/tickets-mcp  # contra Firebird (incluye una sesión stdio real); usa FIREBIRD_* del .env y se saltea si no están
npm run lint -w apps/tickets-mcp
npm run typecheck -w apps/tickets-mcp
```

Los tests de integración que usan los SP `_AG` se saltean solos mientras esos SP no existan en la base. `test/contrato.test.ts` compara `tools/list` con `test/datos/tools-list.json`: si un cambio modifica el contrato publicado, tiene que actualizar ese archivo a propósito.

## Medición v1 contra v2

`medicion/tickets.json` define el conjunto fijo (debe incluir el #74836): tickets para comparar el contexto completo y casos de listado con los argumentos de cada versión. Con `MEDICION_URL_V1` y `MEDICION_TOKEN_V1` (la v1 es remota) y las variables de la v2 en el `.env`:

```bash
npm run medir -w apps/tickets-mcp
```

La v2 se lanza sola por stdio desde `dist/`.

Por cada ticket, la estrategia v1 es la que seguiría un agente: `detalle_ticket`, `historial_ticket`, `agendas_ticket`, `presupuestos_ticket` y `listar_tareas_responsable` desde la creación del ticket. La v2 es una sola llamada a `obtener_contexto_ticket`. Se miden las llamadas y los caracteres de `content[].text` en las dos versiones, más los de `structuredContent` en la v2. El reporte queda en `medicion/resultados/AAAA-MM-DD-HHmm.{json,md}`, solo con números: sin textos de tickets ni tokens.

## Medición con agente

Mide el **tiempo y el costo** de un agente real (Claude Opus 5.5, effort `medium`, caché de prompts activo) resolviendo 5 pedidos habituales con la v1 y con la v2. Lo único que cambia entre las dos es la lista de tools. Los casos están en `medicion/agente/casos.json`: 3 de lectura (estado del #74836, mis tickets agendados y mis tareas pendientes) y 2 de escritura (crear una tarea, y subir la prioridad de un ticket con un mensaje).

**Ninguna escritura llega a la base.** El arnés intercepta las tools de escritura (`medicion/agente/tools.json`), valida los argumentos que armó el agente y responde con una plantilla tomada de una respuesta real (`medicion/agente/plantillas/`). Las tools de escritura de la v2 (`crear_tarea` y `actualizar_ticket`, con objetos compuestos) existen solo en el arnés (`medicion/agente/escritura-v2.json`).

### Requisitos

- La v1 (`mcp-tickets`) corriendo local con `MCP_FUNCTIONS_FILE=tickets-functions.json` y sin `MCP_INSTRUCTIONS_FILE`, sobre la misma base que la v2. En el `.env`: `MEDICION_URL_V1` y `MEDICION_TOKEN_V1`. El token dura 15 días y se renueva con `client_credentials`.
- Las variables de la v2 en el `.env` (`MCP_COD_USUARIO` y `FIREBIRD_*`). La base se usa en modo lectura para la verdad de referencia de cada caso.
- Credenciales de la API de Anthropic: `ANTHROPIC_API_KEY` en el `.env`, o un perfil de `ant auth login`.

Antes de la primera llamada al modelo, el arnés comprueba la conexión a la v1 y a la API, y falla con un mensaje claro si algo falta.

### Comandos

```bash
# Corrida de prueba: 1 repetición (10 corridas), corta a los US$ 5
npm run medir:agente -w apps/tickets-mcp -- --repeticiones 1 --tope-usd 5

# Corrida completa: 5 repeticiones por caso y versión (50 corridas)
npm run medir:agente -w apps/tickets-mcp -- --tope-usd 30

# Subconjunto de casos o versiones
npm run medir:agente -w apps/tickets-mcp -- --casos estado-ticket,crear-tarea --versiones v2

# Regenerar el reporte sin volver a llamar al modelo (por ejemplo, después de cambiar precios.json)
npm run medir:agente -w apps/tickets-mcp -- --solo-reporte                     # el último registro
npm run medir:agente -w apps/tickets-mcp -- --solo-reporte medicion/agente/corridas/2026-10-20-1200.jsonl
```

**Costo estimado:** entre US$ 5 y 25 para la corrida completa de 50 corridas. Primero hay que hacer la corrida de prueba para conocer el costo real por corrida. `--tope-usd` corta la ejecución antes del siguiente request cuando el costo acumulado llega al tope. Los precios (USD por millón de tokens) están en `medicion/agente/precios.json`.

### Cómo leer el reporte

El reporte queda en `medicion/agente/resultados/AAAA-MM-DD-HHmm.{json,md}`. Tiene una tabla por caso y otra con el total. Cada fila compara la v1 con la v2:

- **Costo por tarea bien resuelta**: el costo total de las repeticiones dividido por las que resolvieron bien el caso. Es la cifra para decidir. Si ninguna repetición tuvo éxito, dice "sin éxitos".
- **Éxito**: cuántas corridas resolvieron bien el caso. Las lecturas se comparan con datos tomados de la base al empezar. En las escrituras se revisan los argumentos que armó el agente.
- Costo, tiempo total, tiempo del modelo, tiempo de las tools, turnos y tokens por tipo (entrada, salida, lectura y escritura de caché): **mediana (mínimo–máximo)**.
- **Diferencia v1 → v2** = (v2 − v1) / v1 sobre la mediana. Un valor negativo significa que la v2 cuesta o tarda menos. La diferencia de éxito está en puntos porcentuales.
- Errores de tool, con los de parámetros entre paréntesis, y cómo terminó cada corrida (`end_turn`, `max_turnos`, `refusal`, …).

El encabezado informa el modelo, el effort y el tamaño de las tools de cada versión (cantidad, caracteres y tokens). Las cifras absolutas son menores que en Claude Desktop, porque el prompt de sistema es corto y neutro. La comparación sigue siendo válida porque el prompt es el mismo para las dos versiones. El reporte no tiene textos de tickets ni respuestas del agente. Los registros completos, que sí los tienen, quedan en `medicion/agente/corridas/` y están fuera de git.

### Estimación sin API

Sirve mientras no haya credenciales de la API de Anthropic. Da un aproximado de tokens y costo **sin llamar al modelo**: simula una conversación fija por caso y versión (`medicion/agente/guiones.json`) con las definiciones de tools y las respuestas reales de los dos servidores. Las escrituras se interceptan igual que en la medición con agente. Necesita la v1 y la v2 (mismos requisitos de arriba, salvo la API key).

```bash
npm run estimar:agente -w apps/tickets-mcp     # los 5 casos con v1 y v2
npm run estimar:agente -w apps/tickets-mcp -- --razon 3.2           # otra razón de caracteres por token
npm run estimar:agente -w apps/tickets-mcp -- --casos estado-ticket --versiones v2
```

El reporte queda en `medicion/agente/estimaciones/AAAA-MM-DD-HHmm.{json,md}`, con dos escenarios: **sesión caliente** (tools y sistema ya en caché, el principal) y **sin caché** (cota superior). Los supuestos (razón de caracteres por token, thinking por turno, respuesta final y prompt de tool use) están en `medicion/agente/estimacion.json` y se declaran en el reporte, que incluye además un rango con razones de 3 y 4. No mide el thinking real, los reintentos ni la tasa de éxito.

## Tools

Todas son de solo lectura (`readOnlyHint: true`). Las fechas salen en ISO 8601 con offset; los booleanos son `true`/`false`; las personas son `{ id, nombre }`. Los errores tienen siempre la forma `{ "error": { "codigo", "mensaje", "detalle"? } }`, con `codigo` igual a `PARAMETRO_INVALIDO`, `TICKET_NO_ENCONTRADO`, `NO_AUTORIZADO`, `BASE_NO_DISPONIBLE` o `ERROR_INTERNO`.

### `obtener_contexto_ticket`

```json
{ "ticketId": 74836 }
```

Opcionales: `soloVisibleCliente` (oculta las notas internas) y `limiteHistorial` (50 por defecto, máximo 200; si hay más, trae los movimientos más recientes y `totalHistorial` informa el total).

```text
Ticket #74836 "error al cargar asiento" — AGENDADO, prioridad CRITICA, asignado a Andres Pelaez. 5 movimientos, 0 tareas, 1 agenda, 0 presupuestos, 2 adjuntos.
```

### `listar_tickets`

```json
{ "asignadoA": "yo", "estados": ["AGENDADO", "EN TRÁMITE"], "texto": "asiento", "limite": 10 }
```

Filtros: `estados`, `soloAbiertos` (`true` por defecto), `prioridades`, `sistema`, `asignadoA`, `agendadoA`, `clienteId`, `creadoDesde`/`creadoHasta` (`AAAA-MM-DD`), `texto` (en título y pedido normalizado, sin distinguir mayúsculas ni acentos) y `buscarEnMensajes`. Orden: `actualizacion` (por defecto), `creacion` o `agenda`. Paginación: `limite` (20 por defecto, máximo 100) y `desplazamiento`. Devuelve `total` y `hayMas`.

### `listar_tareas`

```json
{ "ticketId": 74703, "soloPendientes": false }
```

Filtros: `desarrollador`, `responsable` (código de desarrollador o `"yo"`), `ticketId`, `estados`, `soloPendientes` (`true` por defecto: excluye `FINALIZADA` y `ARCHIVADO`), `prioridad`, `creadaDesde`/`creadaHasta`, `incluirDescansos` e `incluirDescripcion`. Sin desarrollador, responsable ni ticket, trae las tareas propias.

### `resumir_tickets`

```json
{ "asignadoA": "yo", "agruparPor": ["estado", "prioridad"] }
```

Acepta los mismos filtros que `listar_tickets` y `agruparPor` (`estado`, `prioridad`, `sistema`, `cliente`, `asignado`; por defecto los tres primeros). En `cliente` y `asignado` trae los 20 con más tickets y una fila con `clave: null` que acumula el resto (y los sin asignar).

```text
12 tickets abiertos. Por estado: AGENDADO 7, EN TRÁMITE 5. Por prioridad: BAJA 6, CRITICA 4, MEDIA 2.
```

## Estructura

```
src/
  index.ts              arranque: config, logger, base, sesión y transporte stdio
  servidor.ts           nombre, versión y códigos de error del servidor (sobre crearServidorMcp de core)
  sesion.ts             SesionTickets: identidad del proceso (MCP_COD_USUARIO) y su desarrollador
  errores.ts            CODIGOS_ERROR de tickets y su ErrorTool
  db/sp.ts              wrappers tipados de los SP públicos _AG
  db/usuarios.ts        desarrollador del usuario (consulta fija, se resuelve al arrancar)
  tools/                una definición por tool, más esquemas y filtros compartidos
test/                   apoyo, datos simulados, snapshot de tools/list, contrato e integración
scripts/                medición v1 contra v2 y arnés de agente
```

El wrapper de tools, los errores uniformes, el logger y el servidor MCP están en [`packages/core`](../../packages/core/); el pool de Firebird, el contrato `RESULTADO`/`MENSAJE_ERROR` y la conversión de fechas y valores, en [`packages/firebird`](../../packages/firebird/).
