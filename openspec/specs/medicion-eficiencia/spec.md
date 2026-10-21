# medicion-eficiencia Specification

## Purpose

Da evidencia reproducible del resultado del experimento: cuántos caracteres y cuántas llamadas necesita un agente para armar el contexto de un ticket con la v1 y con la v2.

## Requirements

### Requirement: Conjunto fijo de tickets
El script de medición MUST leer el conjunto de tickets desde un archivo versionado en el repo. El conjunto MUST incluir el ticket #74836. El resultado MUST ser reproducible: la misma versión del conjunto y el mismo estado de la base dan las mismas cifras.

#### Scenario: Ticket obligatorio
- **WHEN** se ejecuta el script con un conjunto que no incluye 74836
- **THEN** el script termina con error antes de medir

### Requirement: Medición de contexto de ticket
Para cada ticket del conjunto, el script MUST armar el contexto equivalente en las dos versiones. En v1 usa las llamadas necesarias: detalle, historial, agendas, presupuestos y las de tareas que haga falta para encontrar las del ticket. En v2 usa una llamada a `obtener_contexto_ticket`. Por versión MUST registrar la cantidad de llamadas, los caracteres totales del contenido de texto devuelto y los caracteres de `structuredContent` serializado (solo v2).

#### Scenario: Medición del #74836
- **GIVEN** los dos servidores accesibles con credenciales válidas
- **WHEN** se ejecuta el script
- **THEN** el reporte tiene una fila para 74836 con `llamadasV1`, `caracteresV1`, `llamadasV2` y `caracteresV2`
- **AND** `llamadasV2` es 1

### Requirement: Medición de listados
El script MUST medir también al menos un caso de listado de tickets y uno de listado de tareas con filtros equivalentes en ambas versiones. Cuando la v1 no soporta un filtro equivalente (por ejemplo, tareas por ticket), MUST registrar las llamadas que hacen falta para lograr el mismo resultado o marcar el caso como "no soportado en v1".

#### Scenario: Filtro no soportado en v1
- **WHEN** se mide "tareas del ticket 74836"
- **THEN** la fila de v1 informa las llamadas que hicieron falta o el marcador `noSoportadoV1: true`

### Requirement: Reporte comparativo
El script MUST generar un reporte en JSON y en Markdown. El reporte MUST tener una fila por caso, la reducción porcentual de caracteres y de llamadas, totales agregados y la fecha de ejecución. El reporte MUST NOT incluir textos de tickets ni credenciales.

#### Scenario: Reporte generado
- **WHEN** termina la ejecución
- **THEN** existen los archivos de reporte JSON y Markdown con la fecha en el nombre
- **AND** el Markdown incluye una tabla con la reducción porcentual por caso y un total
