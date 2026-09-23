# backend/mistral_client.py
import os
import httpx
import json
from dotenv import load_dotenv

load_dotenv()

MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions"

async def generate_ai_summary(risk_level: str, rain_24h: float, tide_m: float) -> dict:
    # 1. Fallback / Contingência (Se não houver API Key configurada)
    if not MISTRAL_API_KEY:
        if risk_level == "NORMAL":
            msg = f"Situação sob controle em Joinville. Maré em {tide_m:.2f}m e chuva em {rain_24h:.1f}mm sem risco de alagamentos no momento."
        else:
            msg = f"Maré no Rio Cachoeira em {tide_m:.2f}m e chuva acumulada em {rain_24h:.1f}mm. Mantenha a atenção nas áreas rebaixadas."
            
        return {
            "titulo": f"Monitoramento Nível {risk_level}",
            "mensagem_humana": msg
        }

    # 2. Prompt Calibrado para Respostas Positivas em Nível NORMAL
    system_prompt = (
        "Você é o Agente de Emergência e Prevenção do 'joinville-alerta-v2'. "
        "Sua função é traduzir dados pluviométricos e de maré em orientações humanas e diretas. "
        "DIRETRIZES DE TOM E MENSAGEM:\n"
        "- Se o 'nivel_calculado' for 'NORMAL': Gere uma mensagem tranquila e positiva, informando que a cidade está em situação segura e sem riscos de alagamento no momento.\n"
        "- Se o 'nivel_calculado' for 'ATENCAO', 'ALTO' ou 'CRITICO': Informe o risco, explique a causa pontual em 1 frase e forneça uma ação preventiva ao morador.\n"
        "- Responda em no máximo 2 ou 3 frases concisas.\n"
        "- Responda estritamente em formato JSON com as chaves 'titulo' e 'mensagem_humana'."
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
                return json.loads(result["choices"][0]["message"]["content"])
    except Exception as e:
        print(f"[ERRO MISTRAL]: {e}")

    # 3. Fallback / Contingência (Se houver erro de conexão com a Mistral)
    if risk_level == "NORMAL":
        fallback_msg = f"Condições meteorológicas e de maré estáveis em Joinville ({tide_m:.2f}m de maré e {rain_24h:.1f}mm de chuva). Sem risco de alagamento."
    else:
        fallback_msg = f"Maré atual no Rio Cachoeira em {tide_m:.2f}m com acúmulo de {rain_24h:.1f}mm de chuva. Atenção nas áreas de cota baixa."

    return {
        "titulo": f"Alerta Nível {risk_level}",
        "mensagem_humana": fallback_msg
    }