# Metales — app de precios (PWA)

App web instalable en el teléfono con el **cierre diario** de:

| Metal | Dato | Unidad | Fuente |
|---|---|---|---|
| Estaño | LME Cash-Settlement, 3 meses, inventario | USD/t | westmetall.com (publica el cierre oficial LME) |
| Plomo | LME Cash-Settlement, 3 meses, inventario | USD/t | westmetall.com |
| Plata | Cierre XAG/USD | USD/oz troy (y USD/kg) | stooq.com (respaldo: Yahoo Finance SI=F) |

Cómo funciona: una acción de GitHub corre de lunes a viernes después del cierre LME, descarga los precios y guarda `data/prices.json`. La app solo lee ese archivo, así que es gratis, no requiere claves y abre sin conexión con el último dato.

## Publicarla (unos 10 minutos, gratis)

1. Crea una cuenta en <https://github.com> si no tienes.
2. Crea un repositorio nuevo **público** llamado `metales` (GitHub Pages gratis requiere repo público).
3. En el repo: **Add file → Upload files** y arrastra todo el contenido de esta carpeta (incluida la carpeta oculta `.github`). En Mac presiona `Cmd+Shift+.` en Finder para ver carpetas ocultas. Haz *Commit*.
4. **Settings → Actions → General → Workflow permissions** → elige *Read and write permissions* → Save.
5. **Actions → Actualizar precios → Run workflow**. En ~1 min se llena `data/prices.json` con el histórico (~3 años).
6. **Settings → Pages** → Source: *Deploy from a branch*, Branch: `main` / `(root)` → Save. Tu app queda en `https://TU-USUARIO.github.io/metales/`.

## Instalarla en el teléfono

- **iPhone:** abre la liga en Safari → botón Compartir → *Agregar a pantalla de inicio*.
- **Android:** abre en Chrome → menú ⋮ → *Instalar app*.

Para ver el diseño sin datos reales: agrega `?demo=1` a la liga (datos simulados, marcados como DEMO).

## Archivos

- `index.html`, `style.css`, `app.js` — la app (sin librerías externas).
- `manifest.webmanifest`, `sw.js`, `icons/` — instalación y modo sin conexión.
- `scripts/update_prices.py` — descarga de precios (solo Python estándar).
- `.github/workflows/update-prices.yml` — horario: 18:10 y 22:10 UTC, lunes a viernes.

## Si algo falla

- Si una fuente no responde, la app conserva el último dato y muestra un aviso.
- Si la acción falla, en **Actions** abre la ejecución roja y revisa el log de “Descargar precios”: imprime cuántos días obtuvo por metal.
- Nota: los precios LME son propiedad de LME; esta app los usa con fines informativos internos a partir de la publicación pública de westmetall.
