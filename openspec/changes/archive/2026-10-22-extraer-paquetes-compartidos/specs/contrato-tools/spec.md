## MODIFIED Requirements

### Requirement: Logging estructurado de cada invocación
Cada invocación de tool MUST registrar un evento estructurado con: nombre de la tool, usuario de la sesión, duración en ms, cantidad de llamadas a la base, tamaño en caracteres de la respuesta, un identificador de correlación único por invocación y código de error si lo hubo. Todo otro log emitido durante esa invocación (por ejemplo, un error inesperado) MUST llevar el mismo identificador de correlación. El evento MUST NOT incluir el token ni los textos de los tickets.

#### Scenario: Evento de log por llamada
- **WHEN** se invoca `listar_tickets`
- **THEN** se emite un evento con los campos `tool`, `codUsuario`, `duracionMs`, `llamadasBase`, `caracteresRespuesta` e `idCorrelacion`

#### Scenario: Correlación de un error inesperado
- **GIVEN** una invocación que falla con un error inesperado
- **WHEN** se buscan en el log los eventos de esa invocación
- **THEN** el log del error y el evento de invocación tienen el mismo `idCorrelacion`

#### Scenario: Invocaciones distintas
- **WHEN** se invoca dos veces la misma tool con los mismos argumentos
- **THEN** los dos eventos de invocación tienen `idCorrelacion` distintos
