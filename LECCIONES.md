# Lecciones del prototipo

Este repo queda congelado. Sirve de modelo para el repo definitivo de MCPs de JKMate para agentes.

El documento junta lo que aprendimos al construirlo:

- qué hizo que los MCP respondieran rápido y con pocas llamadas;
- qué hay que llevar tal cual al repo nuevo y qué fue solo del prototipo;
- la forma de trabajo que dio mejores resultados: el **diseño guiado por prompts**.

## 1. Qué se logró, con números

Las mediciones están en [`apps/tickets-mcp/medicion/`](apps/tickets-mcp/medicion/). Comparan la v1 (24 tools genéricas) contra la v2 (6 tools diseñadas para agentes) sobre los mismos tickets:

| | v1 | v2 |
|---|---:|---:|
| Llamadas a tools en los 7 casos medidos | 23 | 7 |
| Llamadas para armar el contexto de un ticket | 5 | 1 |
| Caracteres de los listados (3 casos) | 100.164 | 13.448 (−87 %) |
| Tokens de definición de tools, en cada turno | ~6.450 | ~4.100 |
| Turnos del modelo en "estado de un ticket" | 3 | 2 |

Fuentes: [`resultados/2026-10-22-1211.md`](apps/tickets-mcp/medicion/resultados/2026-10-22-1211.md) y [`agente/estimaciones/2026-10-20-1521.md`](apps/tickets-mcp/medicion/agente/estimaciones/2026-10-20-1521.md). La segunda es una estimación de costo, no una medición con la API.

La ganancia **no** viene de que cada respuesta sea más chica. En 2 de los 4 tickets medidos, el contexto de la v2 ocupa más caracteres que la suma de las llamadas de la v1. Viene de tres cosas:

- **Menos idas y vueltas.** El agente llama una vez y contesta.
- **Listados mucho más compactos.**
- **Menos tools que describir en cada turno.**

En las demos eso se ve como "vuela": el agente no explora, va directo.

## 2. `outputSchema` y `structuredContent`

Son dos piezas del protocolo MCP que trabajan juntas: una es el contrato y la otra es el dato que lo cumple.

- **`outputSchema`** es un JSON Schema que cada tool publica en `tools/list`, junto al `inputSchema`. Dice qué forma tiene la respuesta: qué campos trae, de qué tipo son, cuáles son obligatorios y qué códigos de error puede haber.
- **`structuredContent`** es el campo del resultado de `tools/call` que lleva el objeto JSON real, y tiene que cumplir el `outputSchema`. Viaja junto al `content` clásico, que es una lista de bloques de texto.

En este repo, el wrapper común ([`packages/core/src/ejecutar.ts`](packages/core/src/ejecutar.ts)) devuelve siempre las dos cosas:

```ts
content: [
  { type: 'text', text: resumen },               // "Ticket #74836 'X' — EN TRÁMITE, …"
  { type: 'text', text: JSON.stringify(datos) }, // el mismo JSON, para clientes que solo leen content
],
structuredContent: datos,                         // el objeto tipado
```

Beneficios:

1. **El agente sabe de antemano qué va a recibir.** Ve el `outputSchema` antes de llamar. Puede planificar y encadenar tools sin adivinar la forma de la respuesta ni sacar datos de texto libre.
2. **El cliente valida la respuesta.** El SDK del cliente compara el `structuredContent` contra el `outputSchema`. Una respuesta mal formada se detecta como error de protocolo y no le llega al modelo como un dato raro.
3. **Los errores también son tipados.** Una falla devuelve `isError: true` y `{ error: { codigo, mensaje, detalle? } }`, con `codigo` tomado de un enum cerrado (`PARAMETRO_INVALIDO`, `MOVIMIENTO_NO_ENCONTRADO`, …). El agente decide qué hacer según el código y no tiene que interpretar mensajes.
4. **El contrato se puede testear.** El test de contrato de cada MCP verifica tools, annotations, descripciones y códigos contra la spec.
5. **Funciona con clientes viejos.** Claude Desktop solo le pasa `content` al modelo. Por eso el JSON también va como texto, después de un resumen de una línea que muchas veces alcanza para contestar.

## 3. Lo que debe permanecer, y por qué

Estos son los principios que explican los números de la sección 1. Si el repo nuevo pierde alguno, pierde parte de la ganancia.

### 3.1 Tools diseñadas por tarea del agente, no por tabla

Cada tool responde una pregunta completa. Por ejemplo, `obtener_contexto_ticket` trae en una sola llamada el detalle, el historial, las tareas, las agendas, los presupuestos y los adjuntos, y su descripción aclara que "no hace falta llamar a otras tools para lo mismo".

**Por qué:** cada llamada de más es un turno del modelo, y el turno es lo que más cuesta en tiempo y en tokens. Pocas tools compuestas también achican la definición que viaja en cada request.

### 3.2 La forma del dato se resuelve en la base, con SP `_AG`

Los SP para agentes filtran, paginan, cuentan el total y devuelven ya las columnas que la tool necesita. Reutilizan los SP de JK3 cuando sirven (ver D7 en `agregar-consulta-movimientos-fondos`) y siguen el contrato `RESULTADO`/`MENSAJE_ERROR` ([`packages/firebird/src/contrato.ts`](packages/firebird/src/contrato.ts)). Los SP viven versionados en `apps/<mcp>/db/procedimientos/`.

**Por qué:** no se trae de más para filtrar en Node, el optimizador de Firebird usa los índices, y las reglas de negocio quedan en un solo lugar.

### 3.3 Una transacción de solo lectura con consultas en paralelo

`enTransaccion` abre un snapshot de solo lectura y la tool lanza ahí sus SP con `Promise.all`. Un pool de conexiones queda abierto entre invocaciones.

**Por qué:** las consultas en paralelo dan velocidad y el snapshot da consistencia. Todos los datos de la respuesta son del mismo momento.

### 3.4 Respuestas compactas, pensadas para el modelo

- Se omiten los campos que no aplican (`omitirNulos`), y algunos datos aparecen solo cuando cambian (por ejemplo, `resultado` en el historial).
- Se le quita el HTML a los textos y no se escapa el Unicode.
- No hay campos duplicados, datos de presentación ni códigos internos que el operador no usa.
- Cuando el dato crudo obliga a razonar (por ejemplo, la partida doble), se agrega un resumen ya razonado, como `resumen.entroA` / `salioDe` en `ver_movimiento_fondo`.

**Por qué:** cada carácter se paga y se relee en los turnos siguientes. Lo que el modelo no tiene que deducir no lo deduce mal.

### 3.5 Un contrato uniforme entre tools y entre MCP

- Un mismo dato tiene el mismo nombre y el mismo tipo en todas partes.
- Los campos van en camelCase y en español.
- Los ids son enteros y los booleanos son reales.
- Las personas se representan como `{ id, nombre }`.
- Las fechas van en ISO 8601 con offset.
- Los listados se paginan y devuelven el total.

Las `$defs` compartidas y los enums de dominio van dentro del `outputSchema`. Ver la spec [`contrato-tools`](openspec/specs/contrato-tools/spec.md).

**Por qué:** el agente aprende una sola forma y la reutiliza. No hay dudas ni reintentos.

### 3.6 El servidor resuelve lo que el modelo hace mal

Períodos relativos (`hoy`, `ayer`, `este_mes`), importes aproximados ordenados por cercanía, números de comprobante "como los dice el usuario" (`X1 9463`), y `"yo"` en lugar del id de usuario.

**Por qué:** el modelo no siempre sabe qué día es y no conoce los formatos internos. Si el servidor lo resuelve, el modelo no inventa fechas ni ids.

### 3.7 Descripciones con plantilla obligatoria

La plantilla tiene cuatro partes: "Qué hace", "Cuándo usarla", "Parámetros" con un ejemplo, y "Qué NO hacer" indicando qué tool usar en su lugar. Un test la verifica ([`packages/core/src/descripcion.ts`](packages/core/src/descripcion.ts)).

**Por qué:** la descripción es lo único que el modelo lee para elegir la tool y armar los argumentos. "Qué NO hacer" es donde se corrigen los desvíos observados (ver la sección 5).

### 3.8 Defaults y límites razonables en el input

Cada input trae defaults y topes razonables (por ejemplo, `limiteHistorial` vale 50 por defecto y como máximo 200), es cerrado (`additionalProperties: false`), y la identidad sale de la configuración del proceso, nunca de un parámetro.

**Por qué:** hay menos parámetros para adivinar, las respuestas quedan acotadas y no se puede suplantar al usuario.

### 3.9 Un wrapper común y la plantilla de MCP

`packages/core` concentra la validación, los errores, los logs con `idCorrelacion` y el servidor. Cada MCP nuevo sale de copiar `apps/_template-mcp`.

**Por qué:** cada MCP nuevo hereda todo lo anterior sin tener que acordarse de nada.

### 3.10 Medir siempre

Cada invocación loguea su duración, las llamadas a la base y los caracteres de la respuesta. Hay scripts que comparan versiones y estiman el costo por agente.

**Por qué:** sin medición no se sabe si un cambio empeora la eficiencia. La regla es que ninguna tool nueva entra sin medir.

## 4. Lo que fue propio del prototipo y puede cambiar

- **Identidad por `MCP_COD_USUARIO`, sin autenticación, con un proceso por usuario y transporte stdio.** La spec lo marca como "proyecto de evaluación". Si el repo definitivo pasa a un servidor remoto (HTTP con OAuth), cambian el transporte y la sesión, pero no el contrato de las tools.
- **`outputSchema` escrito a mano.** Hoy Zod valida el input, pero el JSON Schema de salida se escribe a mano. Conviene derivar los dos de una sola fuente, sin perder precisión en lo que se publica.
- **Enums de dominio fijos en el código** (`ESTADOS_TICKET`, …). Hay que sincronizarlos con la base a mano. Lo que debe permanecer es que exista un enum en el schema; cómo se genera puede cambiar.
- **Infraestructura:** `node-firebird`, Seq como destino de los logs y npm workspaces. Son reemplazables.
- **Los scripts de medición de `tickets-mcp`.** Lo que vale es la práctica de medir, no estos scripts en particular.
- **Excepciones heredadas:** `tickets-mcp` quedó exceptuado de la plantilla de descripción. En el repo nuevo no debería haber excepciones.

### A revisar en el repo nuevo

- **El JSON viaja dos veces**, en `content` y en `structuredContent`. Hoy hace falta por Claude Desktop. Cuando los clientes lean `structuredContent`, se puede dejar solo el resumen en `content`.
- **Los defaults de las tools de contexto** (por ejemplo, 50 movimientos de historial) pesan en los tickets largos. Conviene medirlos con casos reales y ajustarlos.

## 5. La forma de trabajo: diseño guiado por prompts

La idea central es **hacer lo que Claude necesita para contestar lo que el operador pregunta**, no exponer lo que hay en la base. El punto de partida de cada tool son los prompts que escribe la gente que usa el sistema, no las tablas ni los SP.

### Cómo se hizo `fondos-mcp`

Se hizo en dos changes de OpenSpec (ver `openspec/changes/archive/2026-10-26-*`):

1. **`crear-fondos-mcp`.** Arma el MCP vacío, copiado de la plantilla, sin tools. Separarlo deja el andamiaje revisado y en verde antes de discutir el dominio.
2. **`agregar-consulta-movimientos-fondos`.** Empezó con un `/openspec-explore` que llevaba:
   - la base a usar;
   - los SP de JK3 más importantes;
   - el formulario JK3 equivalente;
   - un `SELECT` con datos reales para analizar;
   - **los prompts habituales del operador**: "quiero ver el movimiento X1 9463", "¿qué pagos hice ayer?" y "estoy buscando un movimiento de 500000 que hice este mes".

Esos tres prompts guiaron todo el change:

| Paso | Qué salió de los prompts |
|---|---|
| proposal, *Why* | Los prompts textuales como motivación y como casos de aceptación |
| Reglas de búsqueda | "X1 9463" llevó a normalizar el número. "Ayer" llevó a que el servidor resuelva los períodos relativos. "Un movimiento de 500000" llevó al importe ±5 % ordenado por cercanía. "Que hice" llevó a no filtrar por usuario |
| design, *Goals* | "Resolver los tres prompts con una llamada a `buscar`, más una a `ver` si hace falta" |
| Forma de las tools | Dos tools con formas fijas (`buscar`, que siempre devuelve una lista, y `ver`, que recibe un id), porque el número se repite entre talonarios |
| Descripciones | "Cuándo usarla" cita los prompts |
| Tests | Por cada prompt, qué parámetros llegan al SP |
| Verificación | Cada prompt en Claude Desktop, un chat nuevo por prompt, anotando qué llamadas hizo el modelo y si le preguntó algo de más al operador |
| Ajuste | En el prompt de 500000, el modelo repitió la búsqueda sin el importe y "eligió" de una muestra. Se corrigió en "Qué NO hacer" y se volvió a probar |

Lo importante es que los prompts cumplen tres funciones a la vez: son el **requisito**, son el **caso de prueba** y son el **mecanismo para afinar las descripciones**.

## 6. Metodología sugerida para el repo nuevo

### 6.1 El ciclo de una tool o un grupo de tools

1. **Juntar los prompts reales** de quienes van a usar el MCP: textuales, con sus errores y su jerga. Entre 5 y 10, cubriendo estas categorías:
   - por identificador, como lo dice el usuario;
   - por período relativo;
   - por valor aproximado;
   - por persona o tercero;
   - un seguimiento ("mostrame el detalle del segundo");
   - uno que debería dar 0 resultados.
2. **Explorar** (`/openspec-explore`) con el brief de 6.2. El objetivo es entender cómo resuelve hoy JK3 esas preguntas y qué datos reales hay.
3. **Proponer** (`/openspec-propose`). Por cada prompt: qué tool o tools se llaman, con qué argumentos y la cantidad máxima de llamadas. Por cada tool: el SP que la alimenta, el `inputSchema`, el `outputSchema` y un ejemplo de respuesta.
4. **Implementar** (`/openspec-apply-change`). Primero la lógica pura con tests, después las tools con acceso simulado. Los SP se aplican en la base solo con confirmación explícita.
5. **Verificar con el modelo.** Cada prompt en Claude Desktop, en un chat nuevo. Se anota qué llamadas hizo el modelo, con qué argumentos y si preguntó algo innecesario.
6. **Ajustar y repetir.** Cada desvío se corrige en la descripción ("Qué NO hacer"), en un default o en una regla del servidor, y se vuelve a correr el prompt.
7. **Medir y archivar.** Se registran las llamadas y los caracteres, y se archiva el change.

Si el MCP es nuevo, antes va un change aparte que lo crea vacío desde la plantilla.

### 6.2 Brief para el explore

```
/openspec-explore
MCP: <app>   Base: <entorno MCP>
Objetivo: que el operador pueda <…> desde Claude Desktop, con un JSON óptimo.
JK3: SP clave <…>; formulario <archivo>.html
Datos de muestra: <SELECT acotado>
Prompts habituales (textuales, de usuarios reales):
- por identificador, como lo dice el usuario: "…"
- por período relativo: "…"
- por valor aproximado: "…"
- por persona o tercero: "…"
- seguimiento: "…"
- uno que debería dar 0 resultados: "…"
Fuera de alcance: …
```

### 6.3 Reglas para el `openspec/config.yaml` del repo nuevo

Estas reglas hacen que `openspec-propose` y `openspec-explore` apliquen el método sin que nadie tenga que acordarse:

```yaml
rules:
  proposal:
    - En un change de tools, listar en Why los prompts habituales del operador, textuales. Son los casos de aceptación.
  design:
    - Por cada prompt habitual, indicar qué tool(s) llama, con qué argumentos y la cantidad máxima de llamadas.
    - Por cada tool, documentar el SP que la alimenta, el inputSchema, el outputSchema y un ejemplo de respuesta.
    - Cada regla de interpretación (períodos, importes, identificadores) cita el prompt que la motiva.
    - Marcar como "A CONFIRMAR" toda tabla o columna no verificada contra la base real.
  tasks:
    - Última sección: correr cada prompt en Claude Desktop, un chat nuevo por prompt, y anotar las llamadas y si el modelo preguntó algo de más. Cada desvío se corrige en "Qué NO hacer" y se vuelve a probar.
```

### 6.4 Prompts versionados por MCP

Cada MCP lleva sus prompts en `apps/<mcp>/prompts.md` (o en un `casos.json` con el formato de [`tickets-mcp/medicion/agente/casos.json`](apps/tickets-mcp/medicion/agente/casos.json)), con la cantidad de llamadas esperada por prompt. Es el set de regresión: si alguien cambia una descripción, un default o un SP, sabe qué tiene que volver a correr. La plantilla de MCP trae el archivo vacío con las categorías de 6.1.

En este repo, los prompts quedaron en `workspace/`, que git ignora, y en los changes archivados. En el repo nuevo tienen que estar versionados desde el principio.

### 6.5 Definición de terminado de una tool

- [ ] Cada prompt habitual se resuelve con la cantidad de llamadas del design, verificado en Claude Desktop.
- [ ] El modelo no le pide al operador datos que el servidor puede resolver (fechas, ids, formatos).
- [ ] Hay `outputSchema` con `$defs` y enums compartidos, y la respuesta trae `structuredContent` y `content` con resumen.
- [ ] La descripción cumple la plantilla de cuatro partes, y "Qué NO hacer" incluye los desvíos observados.
- [ ] Los SP `_AG` están versionados, con el contrato `RESULTADO`/`MENSAJE_ERROR`, y aplicados con confirmación.
- [ ] Hay tests de lógica pura, de la tool con acceso simulado y de contrato, y build, lint y typecheck están en verde.
- [ ] Los tiempos de los SP en una base con volumen real quedaron medidos y anotados.
- [ ] Los prompts están en `apps/<mcp>/prompts.md`.
