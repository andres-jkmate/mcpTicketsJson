Tareas diferidas de `medir-agente-v1-v2` (archivado el 2026-10-21). La numeración original va entre paréntesis; las referencias a decisiones (D4, D8, D9) son del design de ese change.

## 1. Verificaciones con la API

- [ ] 1.1 (5.1) Registrar el tamaño de las tools en tokens con `count_tokens` (v1 = 24 tools y 22.582 caracteres; v2 = 6 y 14.337, ya comprobados). Se verifica en una ejecución real.
- [ ] 1.2 (6.3) Seguir de punta a punta, en una terminal nueva, los pasos de la sección "Medición con agente" del `README.md` (v1 local, token, API key, comandos, cómo leer el reporte) y corregir lo que no funcione.

## 2. Corridas

- [ ] 2.1 (7.1) Corrida de prueba: `npm run medir:agente -- --repeticiones 1 --tope-usd 5`. Revisar con el usuario los registros (argumentos de escritura que armó el agente y verificadores) y el costo real por corrida, y **confirmar con el usuario** el presupuesto de la corrida completa. Se verifica cuando hay un reporte con 10 corridas y el usuario aprueba seguir.
- [ ] 2.2 (7.2) Corrida completa con N = 5 y el tope acordado. Se verifica con el reporte en `medicion/agente/resultados/` y un conteo de filas de tareas y mensajes de tickets igual antes y después (spec "Ninguna escritura real").
- [ ] 2.3 (7.3) Resumir los resultados para la decisión de migrar (diferencia de costo y tiempo por tarea bien resuelta, por caso y en total, más lo observado sobre los objetos compuestos) en un `design.md` de este change, comparándolos con la estimación sin API. Se verifica cuando el usuario revisa el resumen.
