# Spec Delta

## ADDED Requirements

### Requirement: Tools publicadas
El servidor MUST publicar en `tools/list` exactamente las tools `preparar_factura_proveedor` y `registrar_factura_proveedor`, especificadas en la capability `registro-factura-proveedor`, y MUST NOT publicar la tool de ejemplo de la plantilla. Sus descripciones MUST seguir la plantilla de cuatro partes de `plataforma-mcp`.

#### Scenario: tools/list
- **GIVEN** un cliente MCP conectado al servidor
- **WHEN** el cliente pide `tools/list`
- **THEN** la respuesta tiene exactamente `preparar_factura_proveedor` y `registrar_factura_proveedor`

#### Scenario: Tool desconocida
- **GIVEN** un cliente MCP conectado al servidor
- **WHEN** el cliente llama a `obtener_ejemplo`
- **THEN** el servidor responde con un error de protocolo de tool desconocida

## MODIFIED Requirements

### Requirement: Códigos de error del servidor
El servidor MUST declarar los cuatro códigos de error base (`PARAMETRO_INVALIDO`, `NO_AUTORIZADO`, `BASE_NO_DISPONIBLE` y `ERROR_INTERNO`) y los del dominio que usan sus tools: `COMPROBANTE_DUPLICADO` y `PERIODO_CERRADO`. MUST NOT declarar códigos que ninguna tool use.

#### Scenario: Código del dominio sin declarar
- **GIVEN** el servidor con sus códigos declarados
- **WHEN** el código del servidor intenta lanzar un error de tool con un código que no está entre ellos
- **THEN** el typecheck de la app falla

#### Scenario: Enum de códigos
- **WHEN** un cliente pide `tools/list`
- **THEN** el enum de `error.codigo` de cada `outputSchema` contiene los cuatro códigos base, `COMPROBANTE_DUPLICADO` y `PERIODO_CERRADO`

## REMOVED Requirements

### Requirement: Sin tools hasta su diseño
**Reason**: Las tools ya están diseñadas en este change; el servidor deja de estar vacío.
**Migration**: Reemplazado por el requisito "Tools publicadas" de este spec.
