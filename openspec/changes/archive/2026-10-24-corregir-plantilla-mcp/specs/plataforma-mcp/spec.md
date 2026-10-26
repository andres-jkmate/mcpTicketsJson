# Spec Delta

## MODIFIED Requirements

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
