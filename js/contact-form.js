'use strict';

// Formulario de contacto: validación, limpieza de texto y protección contra envíos repetidos.
//
// IMPORTANTE: todo lo que corre en el navegador puede ser saltado por un atacante.
// Estas comprobaciones mejoran la experiencia y frenan bots simples; la defensa real
// (validación, límite de envíos, captcha) está en backend/main.py.
// Depende de utils.js ($) y config.js (SITE_CONFIG).

const CONTACT_SELECTORS = {
    form: '#contact-form',
    name: '#form-name',
    email: '#form-email',
    subject: '#form-subject',
    message: '#form-message',
    honeypot: '#form-website',
    counter: '#message-counter',
    submitButton: '#submit-btn',
    success: '#form-alert',
    error: '#form-error',
    errorText: '#form-error-text',
    turnstile: '#turnstile-container'
};

const CONTACT_LIMITS = {
    name: { min: 2, max: 80 },
    email: { max: 120 },
    subject: { min: 3, max: 120 },
    message: { min: 10, max: 2000 },
    maxLinks: 2
};

const CONTACT_GUARD = {
    minFillMs: 4000,          // una persona tarda más que esto en llenar el formulario
    cooldownMs: 60 * 1000,    // 1 envío por minuto
    maxPerDay: 3,             // máximo de envíos por día desde este navegador
    dayMs: 24 * 60 * 60 * 1000,
    requestTimeoutMs: 75000,   // el plan gratis de Render tarda ~1 min en despertar
    slowNoticeMs: 8000,
    maxServerWaitMs: 60 * 60 * 1000,
    successAlertMs: 6000,
    storageKey: 'contact:sent'
};

// Caracteres de control, de ancho cero y de dirección de texto (se usan para ocultar contenido)
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const HTML_TAG = /<\s*\/?\s*[a-z!?]/i;
const LINK = /(https?:\/\/|www\.)/gi;
const EMAIL_FORMAT = /^[^\s@<>()"',;:\\]+@[^\s@<>()"',;:\\]+\.[^\s@<>()"',;:\\]{2,}$/;

const SUBMIT_ICONS = {
    idle: 'fa-solid fa-paper-plane',
    loading: 'fa-solid fa-spinner animate-spin',
    wait: 'fa-solid fa-clock'
};

// ---------- Estado del módulo ----------
let isSending = false;            // evita envíos simultáneos
let formLoadedAt = Date.now();
let cooldownTimer = null;
let successTimer = null;
let serverBlockedUntil = 0;       // si el servidor responde 429
let turnstileWidgetId = null;
let turnstileToken = '';

// ---------- Limpieza y validación ----------
function cleanSingleLine(value) {
    return value
        .normalize('NFC')
        .replace(CONTROL_CHARS, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanMultiline(value) {
    return value
        .normalize('NFC')
        .replace(/\r\n?/g, '\n')
        .replace(CONTROL_CHARS, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function collectValues() {
    return {
        name: cleanSingleLine($(CONTACT_SELECTORS.name).value),
        email: cleanSingleLine($(CONTACT_SELECTORS.email).value).toLowerCase(),
        subject: cleanSingleLine($(CONTACT_SELECTORS.subject).value),
        message: cleanMultiline($(CONTACT_SELECTORS.message).value)
    };
}

function lengthError(label, value, { min = 0, max }) {
    if (value.length < min) return `${label}: mínimo ${min} caracteres.`;
    if (value.length > max) return `${label}: máximo ${max} caracteres.`;
    return '';
}

// Devuelve un texto de error, o '' si todo está bien
function validateValues(values) {
    const lengthProblem =
        lengthError('Nombre', values.name, CONTACT_LIMITS.name) ||
        lengthError('Asunto', values.subject, CONTACT_LIMITS.subject) ||
        lengthError('Mensaje', values.message, CONTACT_LIMITS.message);
    if (lengthProblem) return lengthProblem;

    if (values.email.length > CONTACT_LIMITS.email.max || !EMAIL_FORMAT.test(values.email)) {
        return 'Escribe un correo electrónico válido.';
    }

    const allText = [values.name, values.subject, values.message].join('\n');
    if (HTML_TAG.test(allText)) {
        return 'No se permite código HTML en el formulario. Escribe solo texto.';
    }

    const linkCount = (values.message.match(LINK) || []).length;
    if (linkCount > CONTACT_LIMITS.maxLinks) {
        return `Máximo ${CONTACT_LIMITS.maxLinks} enlaces por mensaje.`;
    }

    return '';
}

// ---------- Límite de envíos en el navegador ----------
function readSendLog() {
    try {
        const stored = JSON.parse(localStorage.getItem(CONTACT_GUARD.storageKey));
        const now = Date.now();
        if (Array.isArray(stored)) {
            return stored.filter((time) => Number.isFinite(time) && now - time < CONTACT_GUARD.dayMs);
        }
    } catch (error) {
        // localStorage no disponible o con datos corruptos: se ignora
    }
    return [];
}

function recordSend() {
    try {
        localStorage.setItem(CONTACT_GUARD.storageKey, JSON.stringify([...readSendLog(), Date.now()]));
    } catch (error) {
        // Modo privado o almacenamiento lleno: el servidor sigue aplicando su propio límite
    }
}

// Devuelve { until, daily } si el envío está bloqueado, o null si se puede enviar
function getBlockedState() {
    const now = Date.now();
    const log = readSendLog();
    let blocked = null;

    if (log.length >= CONTACT_GUARD.maxPerDay) {
        blocked = { until: Math.min(...log) + CONTACT_GUARD.dayMs, daily: true };
    } else if (log.length > 0) {
        const until = Math.max(...log) + CONTACT_GUARD.cooldownMs;
        if (until > now) blocked = { until, daily: false };
    }

    if (serverBlockedUntil > now && (!blocked || serverBlockedUntil > blocked.until)) {
        blocked = { until: serverBlockedUntil, daily: false };
    }

    return blocked;
}

// ---------- Botón de envío ----------
function setSubmitState({ disabled, icon, label }) {
    const button = $(CONTACT_SELECTORS.submitButton);
    const iconElement = document.createElement('i');
    const labelElement = document.createElement('span');

    iconElement.className = icon;
    iconElement.setAttribute('aria-hidden', 'true');
    labelElement.textContent = label;
    button.disabled = disabled;
    button.replaceChildren(iconElement, labelElement);
}

function formatWait(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes > 0 ? `${minutes} min ${seconds} s` : `${seconds} s`;
}

// Deja el botón en el estado correcto: normal, en espera o bloqueado por límite diario
function refreshSubmitState() {
    clearInterval(cooldownTimer);
    cooldownTimer = null;

    const blocked = getBlockedState();
    if (!blocked) {
        setSubmitState({ disabled: false, icon: SUBMIT_ICONS.idle, label: 'Enviar Mensaje' });
        return;
    }

    if (blocked.daily) {
        setSubmitState({ disabled: true, icon: SUBMIT_ICONS.wait, label: 'Límite de envíos alcanzado' });
        return;
    }

    const tick = () => {
        const secondsLeft = Math.ceil((blocked.until - Date.now()) / 1000);
        if (secondsLeft <= 0) {
            refreshSubmitState();
            return;
        }
        setSubmitState({ disabled: true, icon: SUBMIT_ICONS.wait, label: `Espera ${formatWait(secondsLeft)}` });
    };

    tick();
    cooldownTimer = setInterval(tick, 1000);
}

// ---------- Mensajes ----------
function hideMessages() {
    $(CONTACT_SELECTORS.error).classList.add('hidden');
    $(CONTACT_SELECTORS.success).classList.add('hidden');
    clearTimeout(successTimer);
}

function showError(message) {
    $(CONTACT_SELECTORS.errorText).textContent = message; // textContent: nunca interpreta HTML
    $(CONTACT_SELECTORS.error).classList.remove('hidden');
}

function showSuccess() {
    const alertBox = $(CONTACT_SELECTORS.success);
    alertBox.classList.remove('hidden');
    successTimer = setTimeout(() => alertBox.classList.add('hidden'), CONTACT_GUARD.successAlertMs);
}

function messageForStatus(status) {
    if (status === 429) return 'Has enviado demasiados mensajes. Inténtalo de nuevo más tarde.';
    if (status === 403) return 'No se pudo verificar que eres una persona. Recarga la página e inténtalo de nuevo.';
    if (status === 400 || status === 413 || status === 422) return 'El servidor rechazó los datos. Revisa los campos e inténtalo de nuevo.';
    return `No se pudo enviar el mensaje. Inténtalo más tarde o escribe a ${SITE_CONFIG.contactEmail}.`;
}

// ---------- Captcha (Cloudflare Turnstile, opcional) ----------
function initTurnstile() {
    if (!SITE_CONFIG.turnstileSiteKey) return;

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => {
        turnstileWidgetId = window.turnstile.render(CONTACT_SELECTORS.turnstile, {
            sitekey: SITE_CONFIG.turnstileSiteKey,
            theme: 'dark',
            callback: (token) => { turnstileToken = token; },
            'expired-callback': () => { turnstileToken = ''; },
            'error-callback': () => { turnstileToken = ''; }
        });
    };
    document.head.appendChild(script);
}

function resetTurnstile() {
    turnstileToken = '';
    if (turnstileWidgetId !== null && window.turnstile) {
        window.turnstile.reset(turnstileWidgetId);
    }
}

// ---------- Envío ----------
async function sendContactRequest(payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONTACT_GUARD.requestTimeoutMs);

    try {
        return await fetch(SITE_CONFIG.contactEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
            credentials: 'omit',
            referrerPolicy: 'no-referrer'
        });
    } finally {
        clearTimeout(timeout);
    }
}

function applyServerWait(response) {
    const seconds = Number.parseInt(response.headers.get('Retry-After'), 10);
    if (Number.isFinite(seconds) && seconds > 0) {
        serverBlockedUntil = Date.now() + Math.min(seconds * 1000, CONTACT_GUARD.maxServerWaitMs);
    }
}

async function handleSubmit(event) {
    event.preventDefault();
    if (isSending) return; // ya hay un envío en curso

    const form = event.currentTarget;
    hideMessages();

    const blocked = getBlockedState();
    if (blocked) {
        refreshSubmitState();
        showError(blocked.daily
            ? 'Alcanzaste el límite de mensajes por hoy. Inténtalo mañana.'
            : 'Espera un momento antes de enviar otro mensaje.');
        return;
    }

    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const values = collectValues();
    const problem = validateValues(values);
    if (problem) {
        showError(problem);
        return;
    }

    // Campo trampa: un humano no lo ve. Se simula éxito para no darle pistas al bot.
    if ($(CONTACT_SELECTORS.honeypot).value) {
        form.reset();
        showSuccess();
        return;
    }

    if (Date.now() - formLoadedAt < CONTACT_GUARD.minFillMs) {
        showError('Espera unos segundos antes de enviar el formulario.');
        return;
    }

    if (!SITE_CONFIG.contactEndpoint) {
        showError(`El formulario aún no está disponible. Escríbeme a ${SITE_CONFIG.contactEmail}.`);
        return;
    }

    if (SITE_CONFIG.turnstileSiteKey && !turnstileToken) {
        showError('Completa la verificación de seguridad antes de enviar.');
        return;
    }

    isSending = true;
    setSubmitState({ disabled: true, icon: SUBMIT_ICONS.loading, label: 'Enviando...' });
    const slowNotice = setTimeout(() => {
        setSubmitState({ disabled: true, icon: SUBMIT_ICONS.loading, label: 'Despertando el servidor, puede tardar 1 min...' });
    }, CONTACT_GUARD.slowNoticeMs);

    try {
        const response = await sendContactRequest({
            ...values,
            website: '',
            turnstile_token: turnstileToken
        });

        if (response.ok) {
            recordSend();
            form.reset();
            updateMessageCounter();
            showSuccess();
        } else {
            if (response.status === 429) applyServerWait(response);
            showError(messageForStatus(response.status));
        }
    } catch (error) {
        showError(error.name === 'AbortError'
            ? 'El servidor tardó demasiado en responder. Inténtalo de nuevo.'
            : messageForStatus(0));
    } finally {
        clearTimeout(slowNotice);
        isSending = false;
        formLoadedAt = Date.now();
        resetTurnstile();
        refreshSubmitState();
    }
}

// ---------- Contador de caracteres ----------
function updateMessageCounter() {
    const length = $(CONTACT_SELECTORS.message).value.length;
    $(CONTACT_SELECTORS.counter).textContent = `${length} / ${CONTACT_LIMITS.message.max}`;
}

// ---------- Inicio ----------
function initContactForm() {
    const form = $(CONTACT_SELECTORS.form);
    if (!form) return;

    formLoadedAt = Date.now();
    form.addEventListener('submit', handleSubmit);
    $(CONTACT_SELECTORS.message).addEventListener('input', updateMessageCounter);

    initTurnstile();
    refreshSubmitState(); // respeta un bloqueo previo si la página se recargó
}
