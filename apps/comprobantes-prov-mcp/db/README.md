# Procedimientos de la base

Los SP `_AG` que usa el servidor, uno por archivo en `procedimientos/`, numerados en orden de ejecución. Primero van los privados (`PRV_*`), que son los únicos que conocen el esquema real, y después los públicos (`PROC_*`), que los usan.

> **Atención:** `registrar_factura_proveedor` **escribe** en la base configurada en `FIREBIRD_DATABASE`: crea comprobantes, detalle, crédito y cuotas, y actualiza `PLANTILLAS_PROV_ARTICULOS`, igual que el formulario de JK3. Probalo solo contra una copia local (`CREAR_JK3_20261016`), nunca en producción.

| Orden | Procedimiento | Tipo | Lo usa |
|---|---|---|---|
| 01 | `PRV_LIST_PERFIL_OPC_AG` | privado | 03 y 08 |
| 02 | `PRV_VAL_FAC_PROV_AG` | privado | 07 y 08 |
| 03 | `PROC_LIST_PERFIL_OPC_AG` | público | `preparar_factura_proveedor` |
| 04 | `PROC_LIST_PROVEEDORES_FC_AG` | público | `preparar_factura_proveedor` |
| 05 | `PROC_LIST_ARTICULOS_FC_AG` | público | `preparar_factura_proveedor` |
| 06 | `PROC_GET_CALC_LINEA_FC_AG` | público | `preparar_factura_proveedor` |
| 07 | `PROC_LIST_VAL_FAC_PROV_AG` | público | `preparar_factura_proveedor` |
| 08 | `PROC_INS_FAC_PROV_AG` | público | `registrar_factura_proveedor` (cabecera) |
| 09 | `PROC_INS_DET_FAC_PROV_AG` | público | `registrar_factura_proveedor` (una vez por ítem) |
| 10 | `PROC_INS_FIN_FAC_PROV_AG` | público | `registrar_factura_proveedor` (cierre) |
| 11 | `PROC_LIST_CUOTAS_FC_AG` | público | `preparar_factura_proveedor` (vencimiento) |

Los públicos de escritura (08 a 10) no confirman: el MCP los llama dentro de una sola transacción de escritura y la confirma o la revierte entera. Encadenan los mismos SP de JK3 que el formulario `facturaproveedor` (`PROC_INSERTAR_SEMI_CTE_PROV`, `PROC_GRA_SEM_DET_CTE_PROV_JK3`, `PROC_INSERT_SEMI_DET_PROV_ALI`, `PROC_GUARDAR_SEMI_COMPPROVEEDOR`, etc.); lo que falta confirmar de esos SP está anotado en el encabezado de cada script.

## Cómo aplicarlos

Los archivos van en UTF-8; conectate con charset UTF8 para que Firebird convierta los acentos de los comentarios.

```bash
for f in db/procedimientos/*.sql; do isql -user SYSDBA -ch UTF8 -i "$f" "127.0.0.1/3050:E:\Bases\CREAR_JK3_20261016.fdb" || break; done
```

Para volver atrás, `DROP PROCEDURE` en orden inverso (11 a 01).

## Permisos

Si el MCP no se conecta como `SYSDBA`, hay que dar:

- `EXECUTE` de los públicos al usuario de conexión del MCP.
- `EXECUTE` de cada privado a los públicos que lo usan.
- A los públicos 08 a 11, `EXECUTE` de los SP de JK3 que llaman.

## Estado

Aplicados en `CREAR_JK3_20261016` (copia local) el 2026-10-25.
