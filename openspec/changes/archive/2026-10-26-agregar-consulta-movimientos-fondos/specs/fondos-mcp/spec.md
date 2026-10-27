# Spec Delta

## ADDED Requirements

### Requirement: Tools publicadas
El servidor MUST publicar en `tools/list` exactamente las tools `buscar_movimientos_fondos` y `ver_movimiento_fondo`, especificadas en la capability `consulta-movimientos-fondos`, y MUST NOT publicar la tool de ejemplo de la plantilla. Ambas MUST declararse de solo lectura en sus annotations y sus descripciones MUST seguir la plantilla de cuatro partes de `plataforma-mcp`.

#### Scenario: tools/list
- **GIVEN** un cliente MCP conectado al servidor
- **WHEN** el cliente pide `tools/list`
- **THEN** la respuesta tiene exactamente `buscar_movimientos_fondos` y `ver_movimiento_fondo`, las dos con `readOnlyHint: true`

#### Scenario: Tool desconocida
- **GIVEN** un cliente MCP conectado al servidor
- **WHEN** el cliente llama a `obtener_ejemplo`
- **THEN** el servidor responde con un error de protocolo de tool desconocida

## MODIFIED Requirements

### Requirement: Códigos de error del servidor
El servidor MUST declarar los cuatro códigos de error base (`PARAMETRO_INVALIDO`, `NO_AUTORIZADO`, `BASE_NO_DISPONIBLE` y `ERROR_INTERNO`) y el del dominio que usan sus tools: `MOVIMIENTO_NO_ENCONTRADO`. MUST NOT declarar códigos que ninguna tool use.

#### Scenario: Código del dominio sin declarar
- **GIVEN** el servidor con sus códigos declarados
- **WHEN** el código del servidor intenta lanzar un error de tool con un código que no está entre ellos
- **THEN** el typecheck de la app falla

#### Scenario: Enum de códigos
- **WHEN** un cliente pide `tools/list`
- **THEN** el enum de `error.codigo` de cada `outputSchema` contiene los cuatro códigos base y `MOVIMIENTO_NO_ENCONTRADO`

## REMOVED Requirements

### Requirement: Sin tools hasta su diseño
**Reason**: Las tools de consulta ya están diseñadas en este change; el servidor deja de estar vacío.
**Migration**: Reemplazado por el requisito "Tools publicadas" de este spec.
