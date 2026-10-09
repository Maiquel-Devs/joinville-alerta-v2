# backend/mistral_client.py
# A IA só escreve o texto de um resultado já decidido pelo risk_engine.
import json
import os

import httpx
from dotenv import load_dotenv

load_dotenv()

MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions"

DESCRICAO_FAIXA = {
    "mare_1_6": "maré alta no Rio Cachoeira (patamar de 1,6 m)",
    "mare_2_5": "maré muito alta no Rio Cachoeira (patamar de 2,5 m)",
    "pluvial_vila_nova": "chuva acumulada na região do Vila Nova",
    "pluvial_itaum": "chuva acumulada na região do Itaum",
}

AVISO_FINAL = (
    "Áreas fora das manchas também podem alagar. "
    "Este app não substitui a Defesa Civil (199)."
)

# Expressões que a regra de linguagem proíbe (CLAUDE.md)
PROIBIDAS = ("alagad", "sem risco", "cidade segura", "situação segura", "sob controle")

SYSTEM_PROMPT = (
    "Você escreve o aviso público do 'Joinville Alerta' em português do Brasil. "
    "O nível de risco e as faixas ativas JÁ foram decididos; não os altere nem os contradiga. "
    "Regras: use sempre 'risco de alagar'; nunca diga 'alagado', 'rua alagada', 'sem risco', "
    "'cidade segura' ou 'sob controle'; não invente valores nem locais; no máximo 2 frases. "
    "Responda só em JSON com as chaves 'titulo' e 'mensagem'."
)


def texto_deterministico(nivel: str, ativas: tuple[str, ...]) -> dict:
    if nivel == "indisponivel":
        return {
            "titulo": "Dados indisponíveis",
            "mensagem": "Não foi possível avaliar o risco de alagar agora. "
            "Isso não significa que não haja risco. " + AVISO_FINAL,
        }
    if not ativas:
        return {
            "titulo": "Nenhuma faixa de risco ativa agora",
            "mensagem": "Nenhuma faixa de risco de alagar está ativa neste momento. " + AVISO_FINAL,
        }
    causas = "; ".join(DESCRICAO_FAIXA[f] for f in ativas)
    return {
        "titulo": f"Risco de alagar: nível {nivel}",
        "mensagem": f"Faixas ativas: {causas}. Evite áreas baixas das manchas de risco. " + AVISO_FINAL,
    }


def _valido(texto: object) -> bool:
    if not isinstance(texto, dict):
        return False
    titulo, msg = texto.get("titulo"), texto.get("mensagem")
    if not (isinstance(titulo, str) and isinstance(msg, str) and titulo and msg):
        return False
    junto = f"{titulo} {msg}".lower()
    return not any(p in junto for p in PROIBIDAS)


async def gerar_texto(nivel: str, ativas: tuple[str, ...]) -> dict:
    """Mistral só quando há faixa ativa; qualquer falha cai no texto determinístico."""
    reserva = texto_deterministico(nivel, ativas)
    if not MISTRAL_API_KEY or not ativas:
        return reserva

    entrada = {"nivel": nivel, "faixas_ativas": [DESCRICAO_FAIXA[f] for f in ativas]}
    body = {
        "model": "mistral-small-latest",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(entrada, ensure_ascii=False)},
        ],
        "response_format": {"type": "json_object"},
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(
                MISTRAL_URL,
                headers={"Authorization": f"Bearer {MISTRAL_API_KEY}"},
                json=body,
            )
            res.raise_for_status()
            texto = json.loads(res.json()["choices"][0]["message"]["content"])
            if _valido(texto):
                texto["mensagem"] = f"{texto['mensagem']} {AVISO_FINAL}"
                return {"titulo": texto["titulo"], "mensagem": texto["mensagem"]}
    except Exception as e:
        print(f"[ERRO MISTRAL]: {e}")
    return reserva
