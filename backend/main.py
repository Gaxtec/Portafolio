"""API del formulario de contacto.

Ejecutar:  uvicorn backend.main:app --env-file backend/.env
"""
import logging
import os

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from .mailer import send_contact_email
from .security import (
    RateLimiter,
    clean_multiline,
    clean_single_line,
    contains_html,
    count_links,
    verify_turnstile,
)

logger = logging.getLogger("contact")

# ---------- Configuración (variables de entorno) ----------
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
TRUST_PROXY = os.getenv("TRUST_PROXY", "false").lower() == "true"
TURNSTILE_SECRET = os.getenv("TURNSTILE_SECRET", "")

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
MAIL_FROM = os.getenv("MAIL_FROM", "Portafolio <onboarding@resend.dev>")
MAIL_TO = os.getenv("MAIL_TO", "")   # en el plan gratis sin dominio: el correo con el que creaste la cuenta de Resend
MAIL_READY = bool(RESEND_API_KEY and MAIL_TO)

MAX_BODY_BYTES = 32 * 1024
LIMITS = {"name": (2, 80), "subject": (3, 120), "message": (10, 2000)}
MAX_LINKS = 2

limiter = RateLimiter(min_gap_s=60, per_hour=3, per_day=5, global_per_day=100)

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)  # sin documentación pública

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,   # vacío = ningún otro sitio puede llamar a la API desde un navegador
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
    allow_credentials=False,
)


# ---------- Modelo de entrada ----------
class ContactIn(BaseModel):
    model_config = ConfigDict(extra="forbid")  # rechaza campos inesperados

    # Los max_length "amplios" cortan entradas gigantes antes de limpiar; el límite exacto va abajo.
    name: str = Field(max_length=300)
    email: EmailStr
    subject: str = Field(max_length=500)
    message: str = Field(max_length=8000)
    website: str = Field(default="", max_length=200)           # honeypot
    turnstile_token: str = Field(default="", max_length=2048)

    @field_validator("name", "subject")
    @classmethod
    def _single_line(cls, value, info):
        value = clean_single_line(value)
        _check_length(value, *LIMITS[info.field_name])
        if contains_html(value):
            raise ValueError("html_not_allowed")
        return value

    @field_validator("message")
    @classmethod
    def _message(cls, value):
        value = clean_multiline(value)
        _check_length(value, *LIMITS["message"])
        if contains_html(value):
            raise ValueError("html_not_allowed")
        if count_links(value) > MAX_LINKS:
            raise ValueError("too_many_links")
        return value

    @field_validator("email")
    @classmethod
    def _email(cls, value):
        value = value.lower()
        if len(value) > 120:
            raise ValueError("email_too_long")
        return value


def _check_length(value: str, minimum: int, maximum: int) -> None:
    if not minimum <= len(value) <= maximum:
        raise ValueError("invalid_length")


# ---------- Middleware ----------
@app.middleware("http")
async def guard_requests(request: Request, call_next):
    if request.method == "POST":
        length = request.headers.get("content-length", "")
        if not length.isdigit():
            return JSONResponse({"ok": False, "error": "length_required"}, status_code=411)
        if int(length) > MAX_BODY_BYTES:
            return JSONResponse({"ok": False, "error": "payload_too_large"}, status_code=413)

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.exception_handler(RequestValidationError)
async def invalid_data(request: Request, exc: RequestValidationError):
    # Respuesta genérica: no se devuelve lo que envió el visitante
    return JSONResponse({"ok": False, "error": "invalid_data"}, status_code=422)


def client_ip(request: Request) -> str:
    if TRUST_PROXY:
        # Con un proxy de confianza, la última IP de la lista es la que el proxy vio de verdad;
        # las anteriores las puede escribir el cliente.
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


# ---------- Endpoint ----------
@app.post("/api/contact")
def contact(data: ContactIn, request: Request):  # "def" (no async): el envío corre en un hilo aparte
    ip = client_ip(request)

    if data.website:  # honeypot relleno: es un bot. Se responde "ok" sin enviar nada.
        logger.info("Honeypot activado desde %s", ip)
        return {"ok": True}

    wait = limiter.check_and_record(ip)
    if wait:
        return JSONResponse(
            {"ok": False, "error": "rate_limited"},
            status_code=429,
            headers={"Retry-After": str(wait)},
        )

    if not verify_turnstile(TURNSTILE_SECRET, data.turnstile_token, ip):
        return JSONResponse({"ok": False, "error": "captcha_failed"}, status_code=403)

    if not MAIL_READY:
        logger.error("Falta RESEND_API_KEY o MAIL_TO")
        return JSONResponse({"ok": False, "error": "unavailable"}, status_code=503)

    try:
        send_contact_email(
            api_key=RESEND_API_KEY,
            sender=MAIL_FROM,
            recipient=MAIL_TO,
            name=data.name,
            reply_to=data.email,
            subject=data.subject,
            message=data.message,
            ip=ip,
        )
    except Exception:
        logger.exception("Fallo al enviar el correo")  # el contenido del mensaje no se registra
        return JSONResponse({"ok": False, "error": "send_failed"}, status_code=502)

    return {"ok": True}
