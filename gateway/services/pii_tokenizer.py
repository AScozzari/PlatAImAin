"""
PII Tokenizer — sanitizzazione GDPR-ready prima di inviare dati ai modelli.

Approccio: regex custom, zero dipendenze esterne, tutto on-premise.
Mapping persistito in Redis con TTL 1h per ricostruzione al ritorno.

Entità rilevate (italiano + GDPR):
  CF       — Codice Fiscale italiano
  PIVA     — Partita IVA italiana
  IBAN     — IBAN italiano (IT + 25 chars)
  CC       — Carta di credito (Visa, MC, Amex, ecc.)
  EMAIL    — Indirizzo email (RFC-like)
  PHONE    — Telefono italiano (con o senza +39)
  ADDRESS  — Via/Corso/Piazza + numero civico
  PERSON   — Nome + Cognome (euristica maiuscole)

Flusso:
  tokenize(text, request_id) → (text_con_token, mapping)
  detokenize(text, request_id) → text_originale
  Il mapping è salvato in Redis: key=pii:{request_id}, TTL=3600s
"""

import json
import logging
import re
from dataclasses import asdict, dataclass
from typing import Optional

logger = logging.getLogger(__name__)

# ─── Configurazione ───────────────────────────────────────────────────────────

# Toggle per tipo: default tutti attivi. Cambiabile da platform_settings.
_enabled: dict[str, bool] = {
    "CF":      True,
    "PIVA":    True,
    "IBAN":    True,
    "CC":      True,
    "EMAIL":   True,
    "PHONE":   True,
    "ADDRESS": True,
    "PERSON":  True,
}

_redis = None  # iniettato da init()
_REDIS_TTL = 3600  # 1 ora


def init(redis_client) -> None:
    global _redis
    _redis = redis_client


def set_enabled(entity_type: str, enabled: bool) -> None:
    """Chiamato da settings_admin per toggle categoria."""
    if entity_type in _enabled:
        _enabled[entity_type] = enabled


# ─── Pattern regex ────────────────────────────────────────────────────────────

# Ordine importante: pattern più specifici prima (CF prima di PHONE/PERSON)
_PATTERNS: list[tuple[str, re.Pattern]] = [
    # Codice Fiscale italiano: 6 lettere + 2 cifre + lettera + 2 cifre + lettera + 3 cifre + lettera
    ("CF",    re.compile(
        r'\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b',
        re.IGNORECASE
    )),
    # IBAN italiano: IT + 2 cifre + 1 lettera + 10 cifre + 12 alfanum
    ("IBAN",  re.compile(
        r'\bIT\d{2}[A-Z]\d{10}[0-9A-Z]{12}\b',
        re.IGNORECASE
    )),
    # Carta di credito: 4 blocchi da 4 cifre (con separatori opzionali)
    ("CC",    re.compile(
        r'\b(?:\d{4}[\s\-]?){3}\d{4}\b'
    )),
    # Email
    ("EMAIL", re.compile(
        r'\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b'
    )),
    # Partita IVA: esattamente 11 cifre (non precedute/seguite da cifre)
    ("PIVA",  re.compile(
        r'(?<!\d)\d{11}(?!\d)'
    )),
    # Telefono italiano: opzionale +39, poi 6-12 cifre (con spazi/trattini)
    ("PHONE", re.compile(
        r'(?:\+39[\s]?)?(?:0\d{1,3}[\s\-]?)?\d{5,10}\b'
    )),
    # Indirizzo: via/corso/piazza/vicolo/viale + testo + numero civico
    ("ADDRESS", re.compile(
        r'\b(?:via|corso|piazza|vicolo|viale|largo|contrada|strada|loc\.?|localit[àa])'
        r'\s+[A-Za-zÀ-ÿ\s\.\,\']+\s*\d+[A-Za-z]?',
        re.IGNORECASE
    )),
    # Nome + Cognome: due parole con iniziale maiuscola (euristica semplice)
    # Evita falsi positivi: richiede almeno 3 char per parola
    ("PERSON", re.compile(
        r'\b[A-ZÀ-Ý][a-zà-ÿ]{2,}\s+[A-ZÀ-Ý][a-zà-ÿ]{2,}\b'
    )),
]


# ─── Dataclass mapping ────────────────────────────────────────────────────────

@dataclass
class TokenMapping:
    token: str
    original: str
    entity_type: str
    start: int
    end: int


# ─── Core functions ───────────────────────────────────────────────────────────

def tokenize_sync(text: str, request_id: str) -> tuple[str, list[TokenMapping]]:
    """
    Tokenize PII in text. Returns (tokenized_text, mappings).
    Chiamato in executor per testi grandi.
    """
    if not text or not text.strip():
        return text, []

    mappings: list[TokenMapping] = []
    counters: dict[str, int] = {}

    # Prima passata: trova tutti i match con le loro posizioni
    all_matches: list[tuple[int, int, str, str]] = []  # (start, end, entity_type, original)

    for entity_type, pattern in _PATTERNS:
        if not _enabled.get(entity_type, True):
            continue
        for m in pattern.finditer(text):
            start, end = m.start(), m.end()
            original = m.group()
            # Salta match troppo corti (evita falsi positivi)
            if len(original.strip()) < 4:
                continue
            all_matches.append((start, end, entity_type, original))

    # Rimuovi overlap: mantieni il match più specifico (più lungo)
    all_matches.sort(key=lambda x: (x[0], -(x[1] - x[0])))
    non_overlapping: list[tuple[int, int, str, str]] = []
    last_end = -1
    for start, end, entity_type, original in all_matches:
        if start >= last_end:
            non_overlapping.append((start, end, entity_type, original))
            last_end = end

    # Seconda passata: sostituisci in ordine inverso (per mantenere gli indici)
    result = text
    for start, end, entity_type, original in reversed(non_overlapping):
        counters[entity_type] = counters.get(entity_type, 0) + 1
        token = f"[{entity_type}_{counters[entity_type]}]"
        mapping = TokenMapping(
            token=token,
            original=original,
            entity_type=entity_type,
            start=start,
            end=end,
        )
        mappings.append(mapping)
        result = result[:start] + token + result[end:]

    # Rimetti le mappings in ordine naturale (start crescente)
    mappings.reverse()
    return result, mappings


async def tokenize(text: str, request_id: str) -> tuple[str, list[TokenMapping]]:
    """
    Tokenize PII asynchronously.
    Salva il mapping in Redis per la detokenizzazione.
    """
    import asyncio
    loop = asyncio.get_event_loop()
    tokenized, mappings = await loop.run_in_executor(None, tokenize_sync, text, request_id)

    if mappings and _redis:
        key = f"pii:{request_id}"
        await _redis.setex(
            key,
            _REDIS_TTL,
            json.dumps([asdict(m) for m in mappings]),
        )
        logger.debug("PII: tokenized %d entities for request %s", len(mappings), request_id)

    return tokenized, mappings


async def detokenize(text: str, request_id: str) -> str:
    """
    Ripristina il testo originale sostituendo i token con i valori reali.
    Usa il mapping salvato in Redis.
    """
    if not _redis or not text:
        return text

    key = f"pii:{request_id}"
    raw = await _redis.get(key)
    if not raw:
        return text

    try:
        mappings = json.loads(raw)
        result = text
        for m in mappings:
            result = result.replace(m["token"], m["original"])
        return result
    except Exception as e:
        logger.warning("PII detokenize error for %s: %s", request_id, e)
        return text


async def tokenize_messages(
    messages: list[dict],
    request_id: str,
) -> tuple[list[dict], bool]:
    """
    Tokenize il campo 'content' di tutti i messaggi OpenAI.
    Ritorna (messages_tokenizzati, pii_found: bool).
    """
    pii_found = False
    result = []
    for msg in messages:
        content = msg.get("content")
        if isinstance(content, str) and content:
            tokenized, mappings = await tokenize(content, request_id)
            if mappings:
                pii_found = True
            result.append({**msg, "content": tokenized})
        elif isinstance(content, list):
            # Content array (vision: mix di text + image_url)
            new_parts = []
            for part in content:
                if part.get("type") == "text":
                    tokenized, mappings = await tokenize(part["text"], request_id)
                    if mappings:
                        pii_found = True
                    new_parts.append({**part, "text": tokenized})
                else:
                    new_parts.append(part)
            result.append({**msg, "content": new_parts})
        else:
            result.append(msg)
    return result, pii_found


def has_pii(text: str) -> bool:
    """
    Quick check: ritorna True se il testo contiene PII.
    Usato per logging/audit senza alterare il testo.
    """
    for entity_type, pattern in _PATTERNS:
        if not _enabled.get(entity_type, True):
            continue
        if pattern.search(text):
            return True
    return False
