"""Envío del mensaje de contacto con la API web de Resend (HTTPS, sin SMTP), siempre como texto plano."""
import json
import urllib.request

RESEND_URL = "https://api.resend.com/emails"


def send_contact_email(*, api_key, sender, recipient, name, reply_to, subject, message, ip):
    payload = {
        "from": sender,
        "to": [recipient],
        "reply_to": reply_to,                  # al responder en tu correo, le contestas al visitante
        "subject": f"[Portafolio] {subject}",
        "text": f"Nombre: {name}\nCorreo: {reply_to}\nIP: {ip}\n\n{message}\n",  # solo texto: sin HTML ni adjuntos
    }
    request = urllib.request.Request(
        RESEND_URL,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "portafolio-contacto/1.0",  # sin esto algunos filtros rechazan el User-Agent de Python
        },
    )
    # urlopen lanza HTTPError si Resend responde con error; main.py lo captura
    with urllib.request.urlopen(request, timeout=10) as response:
        response.read()
