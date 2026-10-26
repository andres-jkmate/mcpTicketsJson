# plataforma-mcp Specification

## Purpose

Define cómo se organiza el monorepo de los MCPs v2 para agentes: cada MCP en su app sobre los paquetes compartidos, códigos de error extensibles por servidor, la plantilla de descripción de tools y la plantilla de MCP. Así un MCP nuevo se crea sin copiar código común y sin que diverja del resto.

## Requirements

### Requirement: Un MCP por app sobre paquetes compartidos
Cada MCP del repo MUST vivir en su propia carpeta bajo `apps/` y MUST obtener de los paquetes compartidos de `packages/` la validación del input, la forma de los errores, el log de cada invocación, el registro de tools en el servidor y el acceso a Firebird. Un MCP MUST NOT reimplementar ninguna de esas piezas. Un MCP MUST poder compilarse, testearse y arrancarse por separado.

#### Scenario: Arreglo en un paquete compartido
- **GIVEN** dos MCPs en `apps/` que usan el mismo paquete compartido
- **WHEN** se corrige el manejo de errores en ese paquete
- **THEN** los dos MCPs toman la corrección al recompilar, sin cambios en sus carpetas

#### Scenario: Comandos de todo el repo
- **WHEN** se ejecuta `npm run build`, `npm test`, `npm run lint` o `npm run typecheck` en la raíz
- **THEN** el comando corre sobre todos los paquetes y apps, y falla si falla en cualquiera de ellos

### Requirement: Extracción sin cambio de comportamiento en tickets
Al pasar a la estructura de monorepo, el MCP de tickets MUST publicar en `tools/list` exactamente las mismas tools, con los mismos nombres, títulos, descripciones, `inputSchema`, `outputSchema` y annotations que antes del cambio. Para los mismos argumentos y el mismo estado de la base, cada tool MUST devolver la misma respuesta.

#### Scenario: tools/list idéntico
- **GIVEN** el JSON de `tools/list` del MCP de tickets, guardado antes del cambio
- **WHEN** se lo compara con el `tools/list` del MCP de tickets después del cambio
- **THEN** los dos JSON son iguales

#### Scenario: Respuestas idénticas
- **GIVEN** la base de prueba sin cambios
- **WHEN** se ejecuta la medición de caracteres (`medicion-eficiencia`) antes y después del cambio
- **THEN** los caracteres y la cantidad de llamadas de la v2 son los mismos en todos los tickets del conjunto

### Requirement: Códigos de error extensibles por servidor
Todos los MCPs MUST compartir los códigos de error base `PARAMETRO_INVALIDO`, `NO_AUTORIZADO`, `BASE_NO_DISPONIBLE` y `ERROR_INTERNO`, con el mismo significado. Cada MCP MAY sumar códigos propios de su dominio (por ejemplo `TICKET_NO_ENCONTRADO`). El `outputSchema` de cada tool MUST enumerar exactamente los códigos de su servidor. Una tool MUST NOT poder devolver un código que su servidor no declaró.

#### Scenario: Código propio de un servidor
- **GIVEN** el MCP de tickets declara `TICKET_NO_ENCONTRADO` además de los códigos base
- **WHEN** se lista `tools/list`
- **THEN** el enum de `error.codigo` de cada `outputSchema` contiene los cuatro códigos base y `TICKET_NO_ENCONTRADO`

#### Scenario: Código no declarado
- **GIVEN** un MCP que no declaró `TICKET_NO_ENCONTRADO`
- **WHEN** una de sus tools intenta lanzar un error con ese código
- **THEN** el typecheck del MCP falla

### Requirement: Plantilla de descripción de tools
La descripción de toda tool de un MCP nuevo y de la plantilla MUST tener, en este orden, cuatro partes rotuladas: "Qué hace", "Cuándo usarla", "Parámetros" (con al menos un ejemplo concreto de valor) y "Qué NO hacer" (indicando la tool a usar en su lugar, si existe). El repo MUST ofrecer una verificación automática de esas partes, que cada MCP corre en su test de contrato. Las tools de tickets quedan exceptuadas hasta un change que reescriba sus descripciones y vuelva a medir.

#### Scenario: Descripción completa
- **GIVEN** una tool cuya descripción tiene las cuatro partes en orden y un ejemplo en "Parámetros"
- **WHEN** corre el test de contrato de su MCP
- **THEN** la verificación pasa

#### Scenario: Falta una parte
- **GIVEN** una tool cuya descripción no tiene la parte "Qué NO hacer"
- **WHEN** corre el test de contrato de su MCP
- **THEN** el test falla e informa el nombre de la tool y la parte que falta

### Requirement: Plantilla de MCP
El repo MUST incluir en `apps/_template-mcp` un MCP mínimo que se usa como molde. MUST tener al menos una tool de ejemplo construida sobre los paquetes compartidos, un test unitario de esa tool que no necesita base, un test de contrato (input inválido rechazado, input válido aceptado y descripción según la plantilla), un test de arranque por stdio (configuración faltante informada en stderr; con la configuración completa, stdout limpio y handshake con el nombre del servidor), un test de tipos que verifica que un código de error no declarado no compila, y un README con los pasos para crear un MCP nuevo a partir de ella. Ninguno de esos tests MUST necesitar una base. El README MUST explicar cómo dejar el MCP nuevo sin tools mientras se diseñan, y sus comandos de verificación MUST funcionar tal como están escritos con la configuración local de la app. La plantilla MUST compilar y pasar sus tests como parte de los comandos de todo el repo. La plantilla MUST NOT publicarse ni instalarse como MCP.

#### Scenario: La plantilla no se rompe
- **GIVEN** un cambio en un paquete compartido que rompe el uso que hace la plantilla
- **WHEN** se ejecuta `npm test` o `npm run typecheck` en la raíz
- **THEN** el comando falla en `apps/_template-mcp`

#### Scenario: MCP nuevo desde la plantilla
- **GIVEN** un desarrollador que sigue el README de la plantilla para crear `apps/<nombre>-mcp`
- **WHEN** termina los pasos sin escribir tools propias
- **THEN** el MCP nuevo compila, pasa sus tests y responde `tools/list` con la tool de ejemplo

#### Scenario: MCP nuevo sin tools
- **GIVEN** un desarrollador que sigue el README de la plantilla y elige arrancar sin tools
- **WHEN** termina los pasos de ese caso
- **THEN** el MCP nuevo compila, pasa lint y sus tests, y responde `tools/list` con una lista vacía

#### Scenario: Arranque por stdio sin configuración
- **GIVEN** la plantilla o un MCP copiado de ella
- **WHEN** corre su test de arranque por stdio
- **THEN** el servidor lanzado sin `MCP_COD_USUARIO` termina con código distinto de 0, stderr nombra la variable y stdout queda vacío

#### Scenario: Código de error no declarado en la plantilla
- **GIVEN** la plantilla con sus códigos declarados en `src/errores.ts`
- **WHEN** se quita el `@ts-expect-error` del test de tipos que lanza un error con un código no declarado
- **THEN** `npm run typecheck` y `npm test` de la plantilla fallan

#### Scenario: Inspector con la configuración local
- **GIVEN** un MCP compilado con su `.env` completo en `apps/<nombre>-mcp/.env`
- **WHEN** se corre el comando del Inspector tal como lo escribe el README
- **THEN** el servidor arranca y el Inspector muestra su nombre y sus tools
