# Procedimientos de la base

Los SP `_AG` que usa el servidor, uno por archivo en `procedimientos/`, numerados en orden de ejecución. Primero van los privados (`PRV_*`), que son los únicos que conocen el esquema real, y después los públicos (`PROC_*`), que los usan.

Los cuatro son públicos y de solo lectura (no hay privados: reusan los SP de JK3 del formulario `ver_movimientos_fondos`). Salieron del change `agregar-consulta-movimientos-fondos`.

| Orden | Procedimiento | Tipo | Lo usa |
|---|---|---|---|
| 01 | `PROC_LIST_MOV_FONDOS_AG` | público | `buscar_movimientos_fondos` |
| 02 | `PROC_GET_MOV_FONDO_AG` | público | `ver_movimiento_fondo` (cabecera; envuelve `PROC_GET_MOV_FONDOS_X_CODIGO`) |
| 03 | `PROC_LIST_DET_MOV_FONDO_AG` | público | `ver_movimiento_fondo` (debe y haber; envuelve `PROC_GET_M_FONDO_C_DEBE` y `PROC_GET_M_FONDO_C_HABER`) |
| 04 | `PROC_LIST_CHEQUES_MOV_FON_AG` | público | `ver_movimiento_fondo` (cheques; envuelve `PROC_GET_CHEQUES_X_MOV_FON`) |

## Cómo aplicarlos

Los archivos van en UTF-8; conectate con charset UTF8 para que Firebird convierta los acentos de los comentarios.

```bash
for f in db/procedimientos/*.sql; do isql -user SYSDBA -ch UTF8 -i "$f" "127.0.0.1/3050:E:\Bases\CREAR_JK3_20261016.fdb" || break; done
```

Para volver atrás, `DROP PROCEDURE` en orden inverso (04 a 01).

## Permisos

Si el MCP no se conecta como `SYSDBA`, hay que dar:

- `EXECUTE` de los públicos al usuario de conexión del MCP.
- `EXECUTE` de cada privado a los públicos que lo usan.
- A los públicos 02 a 04, `EXECUTE` de los SP de JK3 que envuelven (`PROC_GET_MOV_FONDOS_X_CODIGO`, `PROC_GET_M_FONDO_C_DEBE`, `PROC_GET_M_FONDO_C_HABER` y `PROC_GET_CHEQUES_X_MOV_FON`).

## Estado

Aplicados en `CREAR_JK3_20261016` el 2026-10-26.
