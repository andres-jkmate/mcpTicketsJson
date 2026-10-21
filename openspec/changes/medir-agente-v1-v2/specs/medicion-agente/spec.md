# Spec Delta

## Purpose

Da evidencia del costo real, en tiempo y en dinero, de que un agente resuelva pedidos habituales de tickets con la v1 (tools que pasan la salida de los stored procedures) y con la v2 (JSON tipado), tanto en lectura como en escritura, sin modificar ninguna base de datos.

## ADDED Requirements

### Requirement: Conjunto fijo de casos
El arnés MUST leer los casos desde un archivo versionado en el repo. Cada caso MUST tener un identificador, un pedido en lenguaje natural (el mismo para las dos versiones), un tipo (`lectura` o `escritura`) y un criterio de éxito verificable. El conjunto MUST incluir como mínimo:
1. Estado del ticket 74836 y qué falta resolver.
2. Mis tickets agendados.
3. Mis tareas pendientes.
4. Crear una tarea para un desarrollador sobre el ticket 74836, con criterios de aceptación.
5. Cambiar la prioridad de un ticket a ALTA y dejar un mensaje.

La cantidad de repeticiones por caso y por versión MUST ser configurable, con 5 como valor por defecto.

#### Scenario: Conjunto incompleto
- **GIVEN** un archivo de casos que no incluye alguno de los 5 casos obligatorios
- **WHEN** se ejecuta el arnés
- **THEN** el arnés termina con error antes de llamar al modelo

#### Scenario: Corrida de prueba
- **GIVEN** el conjunto completo
- **WHEN** se ejecuta el arnés con 1 repetición
- **THEN** se ejecuta cada caso una vez por versión y se genera el reporte completo

### Requirement: Condiciones equivalentes entre versiones
En las corridas de un mismo caso, lo único que MUST cambiar entre versiones es la lista de tools. El modelo, el nivel de effort, el prompt de sistema, el pedido, el límite de tokens y la configuración de caché MUST ser iguales. La v1 MUST exponer al modelo todas las tools que publica su servidor, sin filtrar. La v2 MUST exponer las tools que publica su servidor más los schemas de escritura definidos por el arnés. A cada tool MUST pasarle al modelo solo su nombre, su descripción y su schema de entrada, y el orden de las tools MUST ser el mismo en todas las corridas de una versión.

#### Scenario: Misma configuración
- **WHEN** se ejecuta el caso 1 con v1 y con v2
- **THEN** el registro de las dos corridas muestra el mismo modelo, effort, prompt de sistema y pedido
- **AND** solo difieren las tools enviadas al modelo

#### Scenario: v1 completa
- **GIVEN** el servidor v1 publica 24 tools
- **WHEN** se ejecuta cualquier caso con v1
- **THEN** el modelo recibe las 24 tools

### Requirement: Resultado de tool tal como lo ve un cliente real
El arnés MUST pasarle al modelo, como resultado de cada tool, los bloques de texto de `content` que devuelve el servidor, igual que lo hace Claude Desktop. MUST NOT agregar `structuredContent` al resultado. Cuando el servidor responde con error, MUST pasar el resultado marcado como error, sin interrumpir la corrida.

#### Scenario: Error de parámetro
- **GIVEN** el agente llama a una tool con un parámetro inválido
- **WHEN** el servidor responde con error
- **THEN** el modelo recibe el error como resultado de la tool y la corrida continúa
- **AND** el registro cuenta un error de tool

### Requirement: Escrituras interceptadas
El arnés MUST tener, por versión, una lista explícita de tools de escritura y MUST NOT reenviar ninguna de ellas a los servidores. Cuando el agente llama a una tool de escritura, el arnés MUST:
1. Guardar los argumentos tal como los armó el agente.
2. Validarlos contra el schema de entrada de esa tool en su versión.
3. Si no son válidos, devolver un resultado de error con los motivos.
4. Si son válidos, devolver una respuesta simulada construida a partir de una plantilla obtenida de una respuesta real de esa tool.

Una tool que no está en ninguna de las dos listas (lectura ni escritura) MUST tratarse como escritura.

#### Scenario: Crear tarea en v1
- **WHEN** el agente llama a `crear_tarea` de v1 con argumentos válidos
- **THEN** el servidor v1 no recibe la llamada
- **AND** el agente recibe una respuesta con la forma de la plantilla de `crear_tarea`
- **AND** los argumentos quedan registrados en la corrida

#### Scenario: Objeto compuesto inválido en v2
- **WHEN** el agente llama a la tool de creación de tareas de v2 sin un campo obligatorio del objeto compuesto
- **THEN** el agente recibe un error que nombra el campo faltante
- **AND** el registro cuenta un error de parámetro

#### Scenario: Ninguna escritura real
- **GIVEN** una corrida completa de los 5 casos con las dos versiones
- **WHEN** termina la corrida
- **THEN** la cantidad de filas de las tablas de tareas y de mensajes de tickets no cambió

### Requirement: Registro por turno
Por cada request al modelo, el arnés MUST registrar: tokens de entrada, de salida, de lectura de caché y de escritura de caché (tal como los informa la API), duración del request, motivo de fin y las tools pedidas. Por cada llamada a tool MUST registrar su nombre, su duración, si fue interceptada y si terminó con error. El total de la corrida MUST informar turnos, tiempo total, tiempo del modelo, tiempo de las tools y la respuesta final del agente.

#### Scenario: Tiempo separado
- **WHEN** termina una corrida
- **THEN** el registro informa por separado el tiempo del modelo y el tiempo de las tools
- **AND** la suma de los dos no supera el tiempo total

### Requirement: Costo calculado con precios configurables
El costo de cada corrida MUST calcularse multiplicando los tokens de cada tipo por el precio de ese tipo para el modelo usado, con los precios tomados de un archivo de configuración versionado. El reporte MUST poder regenerarse desde los registros guardados sin volver a llamar al modelo.

#### Scenario: Cambio de precios
- **GIVEN** registros de una corrida ya hecha
- **WHEN** se modifica el archivo de precios y se regenera el reporte
- **THEN** los costos cambian sin que se haga ninguna llamada al modelo

### Requirement: Verificación de éxito por caso
Cada corrida MUST marcarse como exitosa o fallida según el criterio de su caso:
- **Lectura**: la respuesta final MUST contener los datos esperados, obtenidos de la base al comenzar la ejecución (el estado del ticket y las tareas abiertas en el caso 1; los identificadores de tickets o tareas en los casos 2 y 3, o el total correcto cuando hay más de 25).
- **Escritura**: los argumentos interceptados MUST indicar la operación correcta sobre el ticket correcto, con los datos pedidos (desarrollador, nombre y criterios en el caso 4; prioridad ALTA y mensaje en el caso 5), interpretados según el schema de cada versión.

Una corrida que alcanza el límite de turnos, termina por rechazo del modelo o queda sin respuesta final MUST marcarse como fallida e informar el motivo.

#### Scenario: Lectura incompleta
- **GIVEN** el caso 2 con 3 tickets agendados en la base
- **WHEN** la respuesta final del agente menciona 2 de ellos
- **THEN** la corrida se marca como fallida con el motivo "faltan datos esperados"

#### Scenario: Escritura sobre el ticket equivocado
- **WHEN** en el caso 4 el agente crea la tarea con un ticket distinto de 74836
- **THEN** la corrida se marca como fallida

### Requirement: Límites de seguridad
Cada corrida MUST tener un máximo de turnos (25 por defecto). La ejecución completa MUST tener un tope de costo acumulado configurable. Al alcanzarlo, MUST detenerse antes del siguiente request y generar el reporte con lo que se haya medido. El arnés MUST permitir ejecutar un subconjunto de casos y de versiones.

#### Scenario: Tope de costo
- **GIVEN** un tope de USD 2
- **WHEN** el costo acumulado supera USD 2 durante la ejecución
- **THEN** no se envían más requests al modelo
- **AND** el reporte indica que la ejecución se cortó por tope de costo

### Requirement: Reporte comparativo
El arnés MUST generar un reporte en JSON y en Markdown con la fecha en el nombre. Por cada caso y versión MUST informar la mediana, el mínimo y el máximo de: turnos, tokens de cada tipo, costo, tiempo total, tiempo del modelo y tiempo de las tools. También MUST informar los errores de tool, la tasa de éxito y el **costo por tarea bien resuelta** (costo total de las repeticiones dividido por las exitosas). El reporte MUST incluir el total por versión y la diferencia porcentual v1 → v2, y MUST indicar el modelo, el effort y los tamaños de las definiciones de tools de cada versión. El reporte MUST NOT incluir textos de tickets, respuestas del agente ni credenciales. Los registros completos de las corridas, que sí contienen esos textos, MUST guardarse fuera del control de versiones.

#### Scenario: Reporte generado
- **WHEN** termina la ejecución
- **THEN** existen los archivos de reporte JSON y Markdown con la fecha en el nombre
- **AND** el Markdown tiene una tabla por caso con v1, v2 y la diferencia porcentual de costo, tiempo y tasa de éxito

#### Scenario: Caso sin éxitos
- **GIVEN** un caso y una versión en que ninguna repetición fue exitosa
- **WHEN** se genera el reporte
- **THEN** el costo por tarea bien resuelta se informa como "sin éxitos", no como cero ni como infinito

### Requirement: Estimación sin API
El arnés MUST poder estimar, sin llamar a la API de Anthropic y sin credenciales, los tokens y el costo de cada caso con cada versión. La estimación MUST simular una conversación determinista definida en un archivo versionado de guiones: por cada turno, las llamadas que haría un agente razonable. Las llamadas de lectura MUST ejecutarse contra los servidores reales, para usar sus respuestas reales. Las de escritura MUST interceptarse como en el requisito "Escrituras interceptadas".

La entrada de cada turno MUST incluir las definiciones de tools de la versión (nombre, descripción y schema de entrada), el prompt de sistema y el historial acumulado. MUST separar la entrada sin caché, la lectura de caché y la escritura de caché. La salida MUST estimarse con los argumentos de cada llamada más supuestos fijos por turno, iguales para las dos versiones. Los caracteres MUST convertirse a tokens con una razón configurable. El reporte MUST:
- declarar que se trata de una estimación y sus supuestos;
- informar por caso y versión los turnos, los tokens de cada tipo y el costo;
- informar el total por versión y la diferencia porcentual v1 → v2;
- incluir un rango calculado con razones de 3 y de 4 caracteres por token.

MUST NOT incluir textos de tickets ni credenciales.

#### Scenario: Sin credenciales
- **GIVEN** no hay `ANTHROPIC_API_KEY` ni un perfil de `ant auth login`
- **WHEN** se ejecuta la estimación
- **THEN** se genera el reporte sin ninguna llamada a la API de Anthropic

#### Scenario: Condiciones equivalentes
- **WHEN** se estima el mismo caso con la v1 y con la v2
- **THEN** el prompt de sistema, el pedido y los supuestos de salida son los mismos
- **AND** solo difieren las tools, las llamadas del guion y las respuestas de los servidores

#### Scenario: Cambio de razón
- **GIVEN** una estimación ya generada
- **WHEN** se cambia la razón de caracteres por token y se vuelve a generar
- **THEN** los tokens y los costos cambian en proporción, y no se escribe nada en la base
