# Procedimientos de la base

Los SP `_AG` que usa el servidor. Son de solo lectura: no crean tablas ni modifican datos.

Se ejecutan en el orden del número del archivo. Primero van los privados (`PRV_*`), que son los únicos que conocen el esquema real, y después los públicos (`PROC_*`), que los usan.

| Orden | Procedimiento | Lo usa |
|---|---|---|
| 01 | `PRV_LIST_TICKETS_BASE_AG` | `PROC_GET_TICKET_AG`, `PROC_LIST_TICKETS_AG`, `PROC_LIST_RESUMEN_TICKETS_AG` |
| 02 | `PRV_LIST_HIST_BASE_AG` | `PROC_LIST_HIST_TICKET_AG` |
| 03 | `PRV_LIST_TAREAS_BASE_AG` | `PROC_LIST_TAREAS_AG` |
| 04 | `PROC_GET_TICKET_AG` | `obtener_contexto_ticket` |
| 05 | `PROC_LIST_HIST_TICKET_AG` | `obtener_contexto_ticket` |
| 06 | `PROC_LIST_TICKETS_AG` | `listar_tickets` |
| 07 | `PROC_LIST_TAREAS_AG` | `obtener_contexto_ticket`, `listar_tareas` |
| 08 | `PROC_LIST_RESUMEN_TICKETS_AG` | `resumir_tickets` |
| 09 | `PROC_LIST_AGENDAS_TICKET_AG` | `obtener_contexto_ticket` |
| 10 | `PROC_LIST_PRESUP_TICKET_AG` | `obtener_contexto_ticket` |
| 11 | `PROC_LIST_ADJUNTOS_TICKET_AG` | `obtener_contexto_ticket` |

Dependen de dos SP que ya existen en la base de la v1: `PROC_GET_HITOS_TICKET_PORTAL` (historial) y `PROC_GET_ARCHIVO_ADJ_SAC_X_RECL` (adjuntos).

## Cómo aplicarlos

Los archivos están en UTF-8 y la base usa `ISO8859_1`; conectate con charset UTF8 para que Firebird convierta los acentos de los comentarios.

```bash
for f in db/procedimientos/*.sql; do isql -user SYSDBA -ch UTF8 -i "$f" "127.0.0.1/3050:E:\Bases\CREAR_JK3_20261016.fdb" || break; done
```

## Permisos

Si el MCP no se conecta como `SYSDBA`, hay que dar:

- `EXECUTE` de los públicos al usuario de conexión del MCP.
- `EXECUTE` de cada privado a los públicos que lo usan.
- `EXECUTE` sobre `PROC_GET_HITOS_TICKET_PORTAL` y `PROC_GET_ARCHIVO_ADJ_SAC_X_RECL` a los SP que los envuelven.

## Estado

Aplicados en la base de testing `E:\Bases\CREAR_JK3_20261016.fdb`. El 2026-10-17 se comparó el código de los 11 contra estos archivos y coincide (cuerpo y parámetros).
