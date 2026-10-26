# workspace

Carpeta para **archivos de trabajo locales**: borradores, exportaciones, HTML o JSON de prueba,
capturas, notas sueltas y cualquier material de apoyo que no forma parte del código del monorepo.

Todo lo que se guarde acá está ignorado por git (ver `.gitignore`). El único archivo versionado
es este `README.md`, que existe para que la carpeta esté presente al clonar el repo y para
documentar su propósito.

## Reglas

- No pongas acá nada de lo que dependa el build, los tests o los MCPs: si algo tiene que
  versionarse, va en `apps/`, `packages/` u `openspec/`.
- No es un lugar seguro para guardar a largo plazo: lo que no esté en otro lado se pierde con
  un clon nuevo o una limpieza (`git clean -fdx`).
- Evitá dejar credenciales o datos sensibles de clientes, aunque no se commiteen.
