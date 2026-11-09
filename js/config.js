'use strict';

// Configuración del sitio. Edita estos valores antes de publicar.
const SITE_CONFIG = {
    // URL del backend que recibe el formulario (ver backend/main.py).
    contactEndpoint: 'https://portafolio-ft8t.onrender.com/api/contact',

    // Clave PÚBLICA (sitekey) de Cloudflare Turnstile. Déjala vacía para desactivar el captcha.
    turnstileSiteKey: '',

    // Correo mostrado como alternativa si el formulario falla
    contactEmail: 'gaxtec@gmail.com'
};
