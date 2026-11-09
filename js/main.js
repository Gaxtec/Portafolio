'use strict';

// Punto de entrada: inicializa cada módulo cuando el DOM está listo.
function init() {
    initMobileMenu();
    initModals();
    initLightbox();
    initSkillFilters();
    initContactForm();
    initCvDownload();
    initTerminalTyping();
}

document.addEventListener('DOMContentLoaded', init);
