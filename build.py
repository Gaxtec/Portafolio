#!/usr/bin/env python3
"""Ensambla index.html a partir de layout/ y sections/.

Uso:  python3 build.py
Edita las partes y vuelve a ejecutarlo. index.html es el archivo que se publica.
"""
from pathlib import Path

ROOT = Path(__file__).parent

HEAD = ["layout/head.html", "layout/navbar.html"]
SECTIONS = [  # el orden aquí es el orden en la página
    "sections/inicio.html",
    "sections/sobre-mi.html",
    "sections/servicios.html",
    "sections/proyectos.html",
    "sections/habilidades.html",
    "sections/contacto.html",
]
TAIL = ["layout/modals.html", "layout/footer.html", "layout/scripts.html"]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8").rstrip("\n")


def build() -> str:
    parts = [
        *map(read, HEAD),
        "    <main>\n" + "\n\n".join(map(read, SECTIONS)) + "\n    </main>",
        *map(read, TAIL),
        "</body>\n</html>",
    ]
    return "\n\n".join(parts) + "\n"


if __name__ == "__main__":
    (ROOT / "index.html").write_text(build(), encoding="utf-8")
    print("index.html generado")
