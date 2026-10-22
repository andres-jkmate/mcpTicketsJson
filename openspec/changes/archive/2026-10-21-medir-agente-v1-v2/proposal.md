# Proposal

## Why

El experimento tiene que responder una pregunta: ¿conviene migrar los MCP que solo pasan la salida de los stored procedures (v1) a MCP con JSON tipado para lectura y escritura (v2)? La respuesta se mide en **tiempo y dinero**. La medición actual (`medicion-eficiencia`) cuenta caracteres y llamadas con un script que decide las llamadas por su cuenta. Es útil como referencia, pero deja afuera justo lo que más cuesta en una sesión real:

- Las definiciones de tools que el modelo recibe en cada turno. Hoy son 22.582 caracteres en v1 contra 11.203 en v2.
- El historial, que se vuelve a leer en todos los turnos siguientes.
- El thinking y los argumentos que genera el agente, que se cobran como tokens de salida.
- Las llamadas de más, los parámetros equivocados y los reintentos que comete un agente real.
- La escritura, donde el objeto compuesto lo arma el agente.

Además, la línea base del 2026-10-20 muestra casos en que la v2 responde **más** que la v1: el #74703 pasa de 4.547 a 17.053 caracteres y el #74836 crece un 26 %. Hay que entender esa diferencia antes de atribuirle un costo al diseño.

## What Changes

- **Investigar el tamaño del contexto de la v2** en el #74703 y el #74836. Se desglosa la respuesta de `obtener_contexto_ticket` por sección y se compara con las 5 llamadas de la v1, para saber si la diferencia es información que el agente necesita o ruido. Si hace falta corregir la v2, esa corrección va en un change aparte y este documenta el hallazgo.
- **Arnés de medición con agente real** (`npm run medir:agente`). Corre un loop de agente con Claude Opus 5.5 (effort `medium`, caché de prompts activo) contra la v1 (Streamable HTTP local) y la v2 (stdio), las dos sobre la misma base de prueba. Con el mismo pedido en lenguaje natural, la única diferencia entre las dos corridas es la lista de tools.
- **Escrituras interceptadas.** El arnés no reenvía ninguna tool de escritura a los servidores: guarda los argumentos que armó el agente, los valida contra el schema de su versión y devuelve una respuesta simulada a partir de una respuesta real tomada como plantilla. Ninguna base se modifica durante una corrida.
- **Schemas de escritura de la v2 con objetos compuestos**, para `crear_tarea` y para el caso de prioridad y mensaje sobre un ticket. Viven en el arnés, que los agrega a la lista de tools de la v2. El servidor v2 no cambia.
- **Conjunto de 5 casos**, 3 de lectura y 2 de escritura, cada uno con un criterio verificable de "bien resuelto". Se corren 5 repeticiones por caso y por versión.
- **Reporte comparativo** en JSON y Markdown. Por caso y versión informa: turnos, tokens por tipo (entrada, salida, lectura y escritura de caché), costo en USD calculado con una tabla de precios configurable, tiempo del modelo y tiempo de las tools por separado, errores de parámetros, tasa de éxito y **costo por tarea bien resuelta**, con mediana y dispersión.

- **Estimador de tokens y costo sin API** (`npm run estimar:agente`), agregado el 2026-10-20 porque el jefe de proyecto necesita por ahora un aproximado en función de la cantidad de tokens, y no hay credenciales de la API. Simula, sin modelo, una conversación determinista por caso y versión: las llamadas que haría un agente razonable, con las definiciones de tools y las respuestas reales de los dos servidores, caché y una salida supuesta. Convierte caracteres a tokens con una razón configurable. No mide el thinking real, los reintentos ni la tasa de éxito.
- **Corridas del arnés con agente real diferidas.** El código está implementado y probado con clientes simulados. Las corridas y las verificaciones que llaman a la API se hacen cuando haya credenciales.

Fuera de alcance: implementar tools de escritura reales en la v2, cambiar la v1 y medir otros modelos o niveles de effort (el arnés lo permite, pero no se corren en este change). El script de caracteres actual sigue igual. No hay **BREAKING**.

## Capabilities

### New Capabilities
- `medicion-agente`: arnés que mide tiempo, tokens y costo de un agente real resolviendo un conjunto fijo de casos contra v1 y v2. Incluye la interceptación de escrituras, los schemas compuestos de escritura de la v2, los criterios de éxito y el reporte comparativo.

### Modified Capabilities
(ninguna: `medicion-eficiencia` no cambia y sigue siendo la referencia barata y determinista. Si la investigación del #74703 lleva a cambiar `contexto-ticket`, eso se hace en otro change)

## Impact

- **Código nuevo**: `scripts/medir-agente.ts` y `scripts/agente/` (loop, clientes MCP, interceptación, casos, verificadores y reporte), y `medicion/agente/` (casos, schemas de escritura de la v2, plantillas de respuesta y precios). Reutiliza la conexión a v1 y v2 de `scripts/medir-eficiencia.ts`.
- **Dependencias**: `@anthropic-ai/sdk` como dependencia de desarrollo.
- **Costo del estimador**: ninguno. No llama a la API ni necesita `ANTHROPIC_API_KEY`.
- **Costo**: cada corrida completa consume tokens reales de la API. Estimación previa: entre USD 5 y 25 para 50 corridas. Primero se hace una corrida de prueba con N = 1 para medir el costo real.
- **Configuración**: `ANTHROPIC_API_KEY` (o un perfil de `ant auth login`) y las variables de la v1 que ya existen (`MEDICION_URL_V1` y `MEDICION_TOKEN_V1`).
- **Entorno**: la v1 corre local (`mcp-tickets`, `run.ps1`) con `MCP_FUNCTIONS_FILE=tickets-functions.json`, sin `MCP_INSTRUCTIONS_FILE`, sobre `CREAR_JK3_20261016.fdb`. A esa base ya se le agregó lo que le faltaba del esquema de autenticación de la v1 (`PROC_GET_AUTH_CREDENCIAL` actualizado y `MCP_OAUTH_TOKENS_REVOCADOS`).
- **Base de datos**: no hay DDL. Lo único que escribe en la base es una ejecución manual de `crear_tarea` y otra del caso de mensaje en la v1, para obtener las plantillas de respuesta. Las dos requieren confirmación explícita.
