# Instalación en Claude Desktop

Cómo instalar el MCP de tickets v2 (`mcp-tickets-json`) para usarlo desde Claude Desktop en Windows.

El servidor corre en tu máquina: Claude Desktop lo lanza como proceso local y se comunica con él por stdio. No necesita URL, puerto ni OAuth. Es una instalación de evaluación y no tiene autenticación: el servidor consulta con el usuario de JKMate que pongas en la configuración.

## Requisitos

- Node.js 22 o superior (`node -v` para verificarlo).
- Claude Desktop instalado.
- Acceso a la base de tickets en Firebird 3, con los SP `_AG` ya creados. En la base de testing `E:\Bases\CREAR_JK3_20261016.fdb` ya están. Para otra base, los scripts y el orden para aplicarlos están en [`db/README.md`](../db/README.md).
- Tu `COD_USUARIO` de JKMate.

## 1. Compilar

Desde la raíz del repo (no desde `apps\tickets-mcp`):

```bash
npm install
npm run build
```

Esto compila los paquetes compartidos y genera `apps\tickets-mcp\dist\index.js`, que es lo que ejecuta Claude Desktop. Después de cada cambio en el código hay que volver a correr `npm run build`.

> **Si ya lo tenías instalado antes del monorepo:** la ruta cambió de `...\mcpTicketsJson\dist\index.js` a `...\mcpTicketsJson\apps\tickets-mcp\dist\index.js`. Actualizala en `claude_desktop_config.json` (paso 2) y, si usás un `.env` para correrlo desde la terminal, movelo a `apps\tickets-mcp\.env`.

## 2. Configurar Claude Desktop

Abrí el archivo de configuración. Podés hacerlo desde Claude Desktop → **Settings** → **Developer** → **Edit Config**, o directamente en:

```
%APPDATA%\Claude\claude_desktop_config.json
```

Agregá el servidor dentro de `mcpServers`. Si el archivo ya tiene otros servidores, sumalo a la lista sin borrarlos.

```json
{
  "mcpServers": {
    "tickets-v2": {
      "command": "node",
      "args": ["D:\\Desarrollo\\_Repos\\mcpTicketsJson\\apps\\tickets-mcp\\dist\\index.js"],
      "env": {
        "MCP_COD_USUARIO": "15169",
        "FIREBIRD_HOST": "127.0.0.1",
        "FIREBIRD_PORT": "3050",
        "FIREBIRD_DATABASE": "E:\\Bases\\CREAR_JK3_20261016.fdb",
        "FIREBIRD_USER": "SYSDBA",
        "FIREBIRD_PASSWORD": "<password>"
      }
    }
  }
}
```

Reemplazá:

- La ruta de `args` por la ubicación de tu copia del proyecto.
- `MCP_COD_USUARIO` por tu `COD_USUARIO` de JKMate.
- Los datos de `FIREBIRD_*` por los de tu base.

En JSON las barras invertidas van dobles (`\\`), o podés usar barras normales (`D:/Desarrollo/...`).

### Variables disponibles

| Variable | Obligatoria | Default | Descripción |
|---|---|---|---|
| `MCP_COD_USUARIO` | Sí | — | `COD_USUARIO` de JKMate. Es la identidad de todas las consultas y lo que significa `"yo"` en los filtros. |
| `FIREBIRD_DATABASE` | Sí | — | Ruta o alias de la base de tickets. |
| `FIREBIRD_HOST` | No | `127.0.0.1` | Servidor Firebird. |
| `FIREBIRD_PORT` | No | `3050` | Puerto de Firebird. |
| `FIREBIRD_USER` | No | `SYSDBA` | Usuario de la base. |
| `FIREBIRD_PASSWORD` | No | — | Contraseña de la base. |
| `FIREBIRD_POOL_MAX` | No | `5` | Conexiones máximas a la base. |
| `ZONA_HORARIA_BASE` | No | `America/Argentina/Buenos_Aires` | Zona horaria en la que la base guarda las fechas. |
| `LOG_LEVEL` | No | `info` | Nivel de log: `debug`, `info`, `warn` o `error`. |
| `SEQ_URL`, `SEQ_API_KEY` | No | — | Si hay `SEQ_URL`, los logs también se envían a Seq. |

## 3. Reiniciar Claude Desktop

Cerrá Claude Desktop por completo, incluido el ícono de la bandeja del sistema, y volvé a abrirlo. Claude Desktop lee la configuración solo al arrancar.

## 4. Verificar

En el ícono de herramientas del chat tiene que aparecer `tickets-v2` con estas 4 tools:

| Tool | Para qué |
|---|---|
| `obtener_contexto_ticket` | Todo el contexto de un ticket en una sola llamada. |
| `listar_tickets` | Listado de tickets con filtros, texto libre y paginación. |
| `listar_tareas` | Tareas de desarrollo por desarrollador, responsable o ticket. |
| `resumir_tickets` | Conteos por estado, prioridad, sistema, cliente o asignado. |

Para probarlo, pedile a Claude:

- "Dame el contexto del ticket 74836"
- "¿Qué tickets tengo agendados?"
- "Resumime mis tickets abiertos por estado"

## Si algo no funciona

El servidor deja su log en:

```
%APPDATA%\Claude\logs\mcp-server-tickets-v2.log
```

| Síntoma o mensaje en el log | Causa | Solución |
|---|---|---|
| `Configuración inválida: MCP_COD_USUARIO ...` o `... FIREBIRD_DATABASE ...` | Falta una variable obligatoria o tiene un valor inválido. | Revisá el bloque `env` de la configuración. |
| `Cannot find module ...dist\index.js` | La ruta de `args` es incorrecta (por ejemplo, la anterior al monorepo, sin `apps\tickets-mcp`) o no compilaste el proyecto. | Corregí la ruta y corré `npm run build` en la raíz del repo. |
| `Cannot find module ...@mcp-jkmate\core\dist\index.js` | Los paquetes compartidos no están compilados. | Corré `npm run build` en la raíz del repo, no dentro de `apps\tickets-mcp`. |
| Las tools responden `BASE_NO_DISPONIBLE` | No se puede conectar a Firebird. | Verificá que el servicio de Firebird esté levantado y revisá host, puerto, ruta, usuario y contraseña. |
| Las tools responden `ERROR_INTERNO` | Error inesperado, por ejemplo que la base no tenga los SP `_AG`. | El detalle queda en el log del servidor. |
| `"yo" no aplica: el usuario de la sesión no tiene un desarrollador asociado` | Tu usuario no tiene `USUARIOS.COD_DESARROLLADOR`. | En `listar_tareas`, indicá el código de desarrollador o filtrá por `ticketId`. |
| `tickets-v2` no aparece | Claude Desktop no se reinició, o el JSON de configuración tiene un error de sintaxis. | Validá el JSON y reiniciá Claude Desktop por completo. |

## Probar sin Claude Desktop

Para revisar el servidor con una interfaz:

```bash
npx @modelcontextprotocol/inspector node apps/tickets-mcp/dist/index.js
```

Cargá las mismas variables de entorno en la pantalla del inspector, conectá y probá las tools desde ahí.
