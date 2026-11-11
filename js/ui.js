'use strict';

// Interfaz general: menú, modales, visor de capturas, filtros, CV y terminal.
// Depende de utils.js ($, $$).

const UI_SELECTORS = {
    menuButton: '#mobile-menu-btn',
    menu: '#mobile-menu',
    menuIcon: '#menu-icon',
    menuLink: '.mobile-link',
    modal: '[data-modal]',
    modalOpen: '[data-modal-open]',
    modalClose: '[data-modal-close]',
    lightboxTrigger: '[data-lightbox]',
    lightbox: '#modal-lightbox',
    lightboxImage: '#lightbox-image',
    filterButton: '[data-filter]',
    skillCard: '.skill-card',
    cvDownload: '[data-cv-download]',
    typingText: '#typing-text'
};

const FILTER_CLASSES = {
    active: ['bg-emerald-500', 'text-slate-950'],
    inactive: ['glass-card', 'text-slate-300']
};

const UI_TIMING = {
    toastMs: 3500,
    typingSpeedMs: 80,
    typingPauseMs: 2000
};

const TERMINAL_PHRASES = [
    'FastAPI backend online...',
    'Deep Learning models loaded.',
    'PostgreSQL schemas normalized.',
    'Ready for system architecture.'
];

const TOAST_CLASSES =
    'fixed bottom-6 right-6 z-50 glass-card border border-emerald-500/40 text-emerald-400 ' +
    'px-5 py-3 rounded-xl shadow-xl text-xs font-mono flex items-center space-x-3';

// ---------- Menú móvil ----------
function setMenuOpen(isOpen) {
    $(UI_SELECTORS.menu).classList.toggle('hidden', !isOpen);
    $(UI_SELECTORS.menuButton).setAttribute('aria-expanded', String(isOpen));

    const icon = $(UI_SELECTORS.menuIcon);
    icon.classList.toggle('fa-xmark', isOpen);
    icon.classList.toggle('fa-bars', !isOpen);
}

function initMobileMenu() {
    const menu = $(UI_SELECTORS.menu);

    $(UI_SELECTORS.menuButton).addEventListener('click', () => {
        setMenuOpen(menu.classList.contains('hidden'));
    });

    $$(UI_SELECTORS.menuLink).forEach((link) => {
        link.addEventListener('click', () => setMenuOpen(false));
    });
}

// ---------- Modales ----------
let lastFocusedElement = null;

function openModal(modal) {
    lastFocusedElement = document.activeElement;
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    $(UI_SELECTORS.modalClose, modal).focus();
}

function closeModal(modal) {
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    lastFocusedElement?.focus();
}

function initModals() {
    document.addEventListener('click', (event) => {
        const openTrigger = event.target.closest(UI_SELECTORS.modalOpen);
        if (openTrigger) {
            const modal = document.getElementById(openTrigger.dataset.modalOpen);
            if (modal) openModal(modal);
            return;
        }

        const closeTrigger = event.target.closest(UI_SELECTORS.modalClose);
        if (closeTrigger) {
            closeModal(closeTrigger.closest(UI_SELECTORS.modal));
            return;
        }

        // Clic en el fondo del modal
        if (event.target.matches(UI_SELECTORS.modal)) {
            closeModal(event.target);
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        $$(UI_SELECTORS.modal)
            .filter((modal) => !modal.classList.contains('hidden'))
            .forEach(closeModal);
    });
}

// ---------- Visor de capturas ----------
function initLightbox() {
    const lightbox = $(UI_SELECTORS.lightbox);
    const image = $(UI_SELECTORS.lightboxImage);

    $$(UI_SELECTORS.lightboxTrigger).forEach((trigger) => {
        trigger.addEventListener('click', () => {
            const source = trigger.dataset.lightbox;
            if (!source.startsWith('img/')) return;
            image.src = source;
            image.alt = $('img', trigger).alt;
            openModal(lightbox);
        });
    });
}

// ---------- Filtro de habilidades ----------
function setActiveFilterButton(activeButton) {
    $$(UI_SELECTORS.filterButton).forEach((button) => {
        const isActive = button === activeButton;
        button.classList.remove(...FILTER_CLASSES[isActive ? 'inactive' : 'active']);
        button.classList.add(...FILTER_CLASSES[isActive ? 'active' : 'inactive']);
        button.setAttribute('aria-pressed', String(isActive));
    });
}

function filterSkills(category) {
    $$(UI_SELECTORS.skillCard).forEach((card) => {
        const isVisible = category === 'all' || card.dataset.category === category;
        card.classList.toggle('hidden', !isVisible);
    });
}

function initSkillFilters() {
    $$(UI_SELECTORS.filterButton).forEach((button) => {
        button.addEventListener('click', () => {
            setActiveFilterButton(button);
            filterSkills(button.dataset.filter);
        });
    });
}

// ---------- Descarga de CV ----------
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = TOAST_CLASSES;
    toast.setAttribute('role', 'status');
    toast.innerHTML = '<i class="fa-solid fa-file-pdf text-lg"></i>';

    const text = document.createElement('span');
    text.textContent = message;
    toast.appendChild(text);

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), UI_TIMING.toastMs);
}

function initCvDownload() {
    $$(UI_SELECTORS.cvDownload).forEach((link) => {
        link.addEventListener('click', () => {
            // el navegador hace la descarga por el atributo download del enlace
            showToast(link.hreflang === 'en' ? 'Downloading CV...' : 'Descargando CV...');
        });
    });
}

// ---------- Terminal animada ----------
function initTerminalTyping() {
    const target = $(UI_SELECTORS.typingText);
    if (!target) return;

    let phraseIndex = 0;
    let charIndex = 0;

    function typeNextChar() {
        const phrase = TERMINAL_PHRASES[phraseIndex];

        if (charIndex < phrase.length) {
            charIndex++;
            target.textContent = phrase.slice(0, charIndex);
            setTimeout(typeNextChar, UI_TIMING.typingSpeedMs);
            return;
        }

        setTimeout(() => {
            charIndex = 0;
            phraseIndex = (phraseIndex + 1) % TERMINAL_PHRASES.length;
            typeNextChar();
        }, UI_TIMING.typingPauseMs);
    }

    typeNextChar();
}
