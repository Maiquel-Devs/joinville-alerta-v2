# backend/cache_store.py
# Cache em RAM. Guarda o último resultado VÁLIDO e o texto da IA.
from config import VALIDADE_MIN

_ultimo: dict | None = None
# (nivel, faixas ativas) do último texto gerado, para só chamar a IA quando mudar
_chave_texto: tuple | None = None
_texto: dict | None = None


def guardar(resultado: dict) -> None:
    global _ultimo
    _ultimo = resultado


def obter_texto(chave: tuple) -> dict | None:
    return _texto if chave == _chave_texto else None


def guardar_texto(chave: tuple, texto: dict) -> None:
    global _chave_texto, _texto
    _chave_texto, _texto = chave, texto


def status_geral() -> dict:
    """Cache vazio => indisponivel, nunca "normal"."""
    if _ultimo is None:
        return {
            "status": "indisponivel",
            "gerado_em": None,
            "validade_min": VALIDADE_MIN,
            "mare_efetiva_m": None,
            "mare_origem": None,
            "chuva_24h_mm": None,
            "faixas": {},
            "nivel": "indisponivel",
            "texto": None,
        }
    return _ultimo
