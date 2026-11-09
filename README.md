# Portafolio – Gadiel

## Estructura

```
index.html          ← GENERADO, es el que se publica (no lo edites a mano)
build.py            ← ensambla index.html con las partes de abajo
layout/             head, navbar, modals, footer, scripts
sections/           inicio, sobre-mi, servicios, proyectos, habilidades, contacto
css/  js/  img/
backend/            API del formulario de contacto (FastAPI)
```

**Flujo de trabajo:** edita el archivo de la sección que quieras → `python3 build.py` → listo.

## JavaScript

| Archivo | Qué hace |
|---|---|
| `config.js` | URL del backend, sitekey de Turnstile, correo alterno |
| `utils.js` | atajos `$` y `$$` |
| `ui.js` | menú, modales, visor de capturas, filtros, CV, terminal |
| `contact-form.js` | formulario: validación, anti-spam, límite de envíos |
| `main.js` | arranque |

## Publicar gratis

Guía completa en la conversación; resumen:

1. **Resend** (correo): crea cuenta con el correo donde quieres recibir mensajes → API Keys → copia la clave.
2. **GitHub**: sube esta carpeta a un repositorio público.
3. **Render** (API): New → Web Service → tu repositorio → plan Free.
   Build: `pip install -r backend/requirements.txt`
   Start: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
   Variables: `ALLOWED_ORIGINS`, `RESEND_API_KEY`, `MAIL_TO`, `TRUST_PROXY=true`.
4. En `js/config.js` pon `contactEndpoint: 'https://TU-SERVICIO.onrender.com/api/contact'`,
   ejecuta `python3 build.py`, haz commit y push.
5. **GitHub Pages**: Settings → Pages → rama `main`, carpeta `/ (root)`.

Pruebas de la lógica de seguridad: `cd backend && python3 test_security.py`
