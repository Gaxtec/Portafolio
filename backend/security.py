"""Limpieza de texto, límite de envíos y verificación de captcha.

Solo usa la librería estándar para poder probarse sin instalar nada.
"""
import json
import math
import re
import threading
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import deque

# Caracteres de control, de ancho cero y de dirección de texto (sirven para ocultar contenido)
_CONTROL_CHARS = re.compile(
    r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]"
)
_HTML_TAG = re.compile(r"<\s*/?\s*[a-zA-Z!?]")
_LINK = re.compile(r"(?i)(https?://|www\.)")


def clean_single_line(value: str) -> str:
    """Una sola línea: sin caracteres de control ni saltos de línea (evita inyección en cabeceras)."""
    value = unicodedata.normalize("NFC", value)
    value = _CONTROL_CHARS.sub("", value)
    return " ".join(value.split())


def clean_multiline(value: str) -> str:
    """Texto de varias líneas sin caracteres de control y con saltos normalizados."""
    value = unicodedata.normalize("NFC", value)
    value = value.replace("\r\n", "\n").replace("\r", "\n").replace("\u2028", "\n").replace("\u2029", "\n")
    value = _CONTROL_CHARS.sub("", value)
    value = re.sub(r"[ \t]+\n", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def contains_html(value: str) -> bool:
    return _HTML_TAG.search(value) is not None


def count_links(value: str) -> int:
    return len(_LINK.findall(value))


HOUR = 3600
DAY = 86400


class RateLimiter:
    """Límite de envíos por IP (en memoria) más un tope global diario.

    check_and_record() es atómico: revisa y registra dentro del mismo candado, así que dos
    peticiones simultáneas de la misma IP no pueden pasar ambas.
    Con varios procesos/servidores usa Redis en lugar de memoria.
    """

    def __init__(self, min_gap_s=60, per_hour=3, per_day=5, global_per_day=100):
        self.min_gap_s = min_gap_s
        self.per_hour = per_hour
        self.per_day = per_day
        self.global_per_day = global_per_day
        self._hits = {}
        self._global = deque()
        self._lock = threading.Lock()

    def check_and_record(self, key: str, now: float | None = None) -> int:
        """Devuelve 0 si se permite (y lo registra), o los segundos que hay que esperar."""
        now = time.monotonic() if now is None else now

        with self._lock:
            while self._global and now - self._global[0] >= DAY:
                self._global.popleft()
            if len(self._global) >= self.global_per_day:
                return math.ceil(DAY - (now - self._global[0]))

            hits = self._hits.setdefault(key, deque())
            while hits and now - hits[0] >= DAY:
                hits.popleft()

            if hits:
                gap_left = self.min_gap_s - (now - hits[-1])
                if gap_left > 0:
                    return math.ceil(gap_left)

                last_hour = [t for t in hits if now - t < HOUR]
                if len(last_hour) >= self.per_hour:
                    return math.ceil(HOUR - (now - last_hour[0]))

                if len(hits) >= self.per_day:
                    return math.ceil(DAY - (now - hits[0]))

            hits.append(now)
            self._global.append(now)
            self._prune(now)
            return 0

    def _prune(self, now: float) -> None:
        if len(self._hits) < 5000:
            return
        for key in [k for k, v in self._hits.items() if not v or now - v[-1] >= DAY]:
            del self._hits[key]


TURNSTILE_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def verify_turnstile(secret: str, token: str, ip: str) -> bool:
    """Confirma el captcha con Cloudflare. Si no hay secreto configurado, no se exige."""
    if not secret:
        return True
    if not token:
        return False

    body = urllib.parse.urlencode({"secret": secret, "response": token, "remoteip": ip}).encode()
    request = urllib.request.Request(TURNSTILE_URL, data=body, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return json.load(response).get("success") is True
    except Exception:
        return False  # ante la duda, se rechaza
