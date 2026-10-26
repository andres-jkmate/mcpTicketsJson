# comprobantes-prov-mcp Specification

## Purpose

Servidor MCP de JKMate v2 para que un agente consulte y registre comprobantes de proveedores. Define cómo se identifica, cómo arranca y qué contrato de errores publica; las tools se especifican en changes posteriores.

## Requirements

### Requirement: Servidor propio del monorepo
El MCP de comprobantes de proveedores MUST vivir en su propia app del monorepo, construida sobre los paquetes compartidos según la capability `plataforma-mcp`. MUST compilarse, testearse y arrancarse por separado, y MUST formar parte de los comandos de todo el repo (`build`, `test`, `lint`, `typecheck`).

#### Scenario: Comandos de todo el repo
- **GIVEN** el repo con la app de comprobantes de proveedores
- **WHEN** se ejecuta `npm test` o `npm run typecheck` en la raíz
- **THEN** el comando corre también sobre esa app y falla si falla en ella

#### Scenario: Comandos de la app sola
- **GIVEN** el repo con la app de comprobantes de proveedores
- **WHEN** se ejecuta `npm test -w apps/comprobantes-prov-mcp`
- **THEN** corren solo los tests de esa app y pasan sin necesitar una base

### Requirement: Identidad del servidor
El servidor MUST informar el nombre `mcp-comprobantes-prov` en el handshake MCP, y todo evento de log que emita MUST llevar ese mismo nombre en el campo `app`.

#### Scenario: Handshake
- **GIVEN** un cliente MCP conectado al servidor
- **WHEN** el cliente lee la información del servidor tras inicializar
- **THEN** el nombre informado es `mcp-comprobantes-prov`

### Requirement: Configuración y arranque por stdio
El servidor MUST correr por stdio y MUST tomar su configuración de variables de entorno: `MCP_COD_USUARIO` (identidad de todas las invocaciones) y la conexión a Firebird son obligatorias. Si falta un valor obligatorio o alguno es inválido, el servidor MUST NOT arrancar y MUST informar en stderr qué variable falló. MUST NOT escribir en stdout nada que no sea el protocolo MCP.

#### Scenario: Falta el usuario
- **GIVEN** un entorno sin `MCP_COD_USUARIO`
- **WHEN** se arranca el servidor
- **THEN** el proceso termina con código distinto de 0 y stderr menciona `MCP_COD_USUARIO`

#### Scenario: Configuración completa
- **GIVEN** un entorno con `MCP_COD_USUARIO` y la conexión a Firebird
- **WHEN** se arranca el servidor
- **THEN** el proceso queda esperando mensajes MCP por stdin y no escribe nada en stdout hasta recibir uno

### Requirement: Sin tools hasta su diseño
Mientras no se especifiquen tools para este servidor, `tools/list` MUST devolver una lista vacía. El servidor MUST NOT publicar la tool de ejemplo de la plantilla ni ninguna tool que dependa de un SP inexistente.

#### Scenario: tools/list vacío
- **GIVEN** un cliente MCP conectado al servidor
- **WHEN** el cliente pide `tools/list`
- **THEN** la respuesta tiene la lista de tools vacía

#### Scenario: Tool desconocida
- **GIVEN** un cliente MCP conectado al servidor
- **WHEN** el cliente llama a `obtener_ejemplo`
- **THEN** el servidor responde con un error de protocolo de tool desconocida

### Requirement: Códigos de error del servidor
El servidor MUST declarar los cuatro códigos de error base (`PARAMETRO_INVALIDO`, `NO_AUTORIZADO`, `BASE_NO_DISPONIBLE` y `ERROR_INTERNO`) y MUST NOT declarar códigos propios del dominio hasta que una tool los use.

#### Scenario: Código del dominio sin declarar
- **GIVEN** el servidor solo con los códigos base
- **WHEN** el código del servidor intenta lanzar un error de tool con un código que no es base
- **THEN** el typecheck de la app falla
