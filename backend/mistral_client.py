# backend/mistral_client.py
import os
import httpx
from dotenv import load_dotenv

load_dotenv()

MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions"

async def generate_ai_summary(risk_level: str, rain_24h: float, tide_m: float) -> dict:
    if not MISTRAL_API_KEY:
        return {
            "titulo": f"Monitoramento Nível {risk_level}",
            "mensagem_humana": f"Maré no Rio Cachoeira em {tide_m:.2f}m e chuva acumulada em {rain_24h:.1f}mm. Mantenha a atenção nas áreas rebaixadas."
        }

    system_prompt = (
        "Você é o Agente de Emergência do 'joinville-alerta-v2'. "
        "Sua função é traduzir dados pluviométricos e de maré em orientações humanas diretas. "
        "Diretrizes: Informe o Risco (BAIXO, MÉDIO, ALTO, CRÍTICO), explique a causa em 1 frase "
        "e forneça uma ação imediata ao morador. Mantenha a resposta em no máximo 3 frases concisas. "
        "Responda estritamente em formato JSON com as chaves 'titulo' e 'mensagem_humana'."
    )

    user_payload = {
        "chuva_24h_mm": rain_24h,
        "mare_m": tide_m,
        "nivel_calculado": risk_level
    }

    headers = {
        "Authorization": f"Bearer {MISTRAL_API_KEY}",
        "Content-Type": "application/json"
    }

    body = {
        "model": "mistral-small-latest",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": str(user_payload)}
        ],
        "response_format": {"type": "json_object"}
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(MISTRAL_URL, headers=headers, json=body)
            if response.status_code == 200:
                result = response.json()
                import json
                return json.loads(result["choices"][0]["message"]["content"])
    except Exception as e:
        print(f"[ERRO MISTRAL]: {e}")

    return {
        "titulo": f"Alerta Nível {risk_level}",
        "mensagem_humana": f"Maré atual no Rio Cachoeira em {tide_m:.2f}m com acúmulo de {rain_24h:.1f}mm de chuva. Atenção no Bucarein e Centro."
    }