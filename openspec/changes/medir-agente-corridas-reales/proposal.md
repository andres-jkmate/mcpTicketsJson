# Proposal

## Why

`medir-agente-v1-v2` dejó implementado y probado con clientes simulados el arnés de medición con agente real (`npm run medir:agente`), y su estimación sin API ya da un aproximado: la v2 cuesta alrededor de un 55 % menos que la v1 con caché caliente y un 50 % menos sin caché. Las cifras con un agente real (costo por tarea bien resuelta, tiempos, reintentos y tasa de éxito) no se pudieron sacar porque no había credenciales de la API. Ese change se archivó el 2026-10-21 para liberar la reestructuración del repo en monorepo, y sus tareas pendientes pasan a este.

## What Changes

- Correr el arnés existente con credenciales de la API: primero una corrida de prueba con tope de costo y después la corrida completa con el presupuesto que confirme el usuario.
- Completar las verificaciones que necesitaban la API: tamaño de las tools en tokens con `count_tokens` y los pasos del README de punta a punta.
- Resumir los resultados reales para la decisión de migrar.

No se agrega ni cambia código del arnés. Si una corrida muestra un defecto del arnés, se corrige acá y se documenta.

## Capabilities

### New Capabilities
(ninguna)

### Modified Capabilities
(ninguna: el comportamiento está especificado en `medicion-agente`, que este change solo ejecuta)

## Impact

- **Requisitos**: `ANTHROPIC_API_KEY` en `.env`, la v1 (`tickets-jkmate-mcp`) levantada en local y la base de prueba.
- **Costo**: llamadas reales a la API. La corrida de prueba tiene tope de US$ 5; la completa necesita confirmación explícita del usuario.
- **Rutas**: si para cuando se ejecute el repo ya es monorepo, los comandos y rutas de `scripts/` y `medicion/` son los de la app de tickets.
