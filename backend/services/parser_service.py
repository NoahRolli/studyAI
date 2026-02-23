# Parser-Service: Liest Text aus verschiedenen Dateiformaten
# Unterstützt PDF, Word (.docx) und Textdateien (.txt)

import fitz  # PyMuPDF — Library zum PDF-Lesen
from docx import Document as DocxDocument  # python-docx — Library zum Word-Lesen
from pathlib import Path


def parse_file(file_path: str) -> str:
    """
    Liest eine Datei und gibt den extrahierten Text zurück.
    Erkennt automatisch das Format anhand der Dateiendung.
    """
    path = Path(file_path)
    suffix = path.suffix.lower()

    if suffix == ".pdf":
        return _parse_pdf(path)
    elif suffix == ".docx":
        return _parse_docx(path)
    elif suffix == ".txt":
        return _parse_txt(path)
    else:
        raise ValueError(f"Dateityp '{suffix}' wird nicht unterstützt")


def _parse_pdf(path: Path) -> str:
    """
    Extrahiert Text aus einer PDF-Datei.
    Geht Seite für Seite durch und sammelt den Text.
    """
    text = ""
    doc = fitz.open(str(path))

    for page in doc:
        text += page.get_text()
        text += "\n\n"  # Seitenumbruch als Trennung

    doc.close()
    return text.strip()


def _parse_docx(path: Path) -> str:
    """
    Extrahiert Text aus einer Word-Datei (.docx).
    Liest jeden Absatz einzeln aus.
    """
    doc = DocxDocument(str(path))
    paragraphs = []

    for paragraph in doc.paragraphs:
        if paragraph.text.strip():  # Leere Absätze überspringen
            paragraphs.append(paragraph.text)

    return "\n\n".join(paragraphs)


def _parse_txt(path: Path) -> str:
    """
    Liest eine einfache Textdatei.
    Versucht verschiedene Encodings falls UTF-8 nicht klappt.
    """
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="latin-1")