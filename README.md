# Portafolio – Gadiel

## Estructura

```
index.html         La estructura principal
build.py            ← ensambla index.html con las partes de abajo
layout/             head, navbar, modals, footer, scripts
sections/           inicio, sobre-mi, servicios, proyectos, habilidades, contacto
css/  js/  img/
backend/            API del formulario de contacto (FastAPI)
```

## JavaScript

| Archivo | Qué hace |
|---|---|
| `config.js` | URL del backend, sitekey de Turnstile, correo alterno |
| `utils.js` | atajos `$` y `$$` |
| `ui.js` | menú, modales, visor de capturas, filtros, CV, terminal |
| `contact-form.js` | formulario: validación, anti-spam, límite de envíos |
| `main.js` | arranque |

