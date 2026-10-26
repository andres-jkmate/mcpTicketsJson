# Spec Delta

## ADDED Requirements

### Requirement: Escritura en Firebird desde el paquete compartido
El acceso compartido a Firebird MUST ofrecer, además de la transacción de solo lectura, una transacción de escritura en la que una tool ejecuta varios SP y que se confirma solo si todos terminan bien. Si un SP falla, o falla la confirmación, la transacción MUST revertirse y el error MUST llegar a la tool (no se descarta). La transacción de solo lectura MUST seguir sin poder escribir. Un MCP MUST NOT abrir transacciones de escritura por su cuenta.

#### Scenario: Todo o nada
- **GIVEN** una tool que en una transacción de escritura ejecuta dos SP que insertan filas
- **WHEN** el segundo SP falla
- **THEN** la tool recibe el error y no queda grabada ninguna fila del primero

#### Scenario: Solo lectura sigue siéndolo
- **GIVEN** una tool que usa la transacción de solo lectura
- **WHEN** ejecuta un SP que intenta insertar una fila
- **THEN** la tool recibe un error y la fila no se graba
