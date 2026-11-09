'use strict';

// Configuración del sitio. Edita estos valores antes de publicar.
const SITE_CONFIG = {
    // URL del backend que recibe el formulario (ver backend/main.py).
    // Ejemplo: 'https://api.tudominio.com/api/contact'
    contactEndpoint: '',

    // Clave PÚBLICA (sitekey) de Cloudflare Turnstile. Déjala vacía para desactivar el captcha.
    turnstileSiteKey: '',

    // Correo mostrado como alternativa si el formulario falla
    contactEmail: 'gaxtec@gmail.com'
};
