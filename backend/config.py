# backend/config.py
# Constantes de calibração. PROVISÓRIAS: dependem das decisões da Etapa 0
# (fonte da maré, referencial vertical, limiar pluvial). Trocar só aqui.

# Joinville (Open-Meteo)
LATITUDE = -26.3045
LONGITUDE = -48.8456

# Ciclo do scheduler e validade do dado (o dobro do ciclo)
CICLO_MIN = 15
VALIDADE_MIN = 30

# Gatilhos de maré: metros ACIMA do nível médio (não da régua). Ver 0.2/0.3.
MARE_1_6_M = 1.60
MARE_2_5_M = 2.53  # PDDU 2011: cheia de ~10 anos; a faixa mantém o nome mare_2_5

# Gatilho pluvial: chuva acumulada em 24 h (mm). Herdado da v1; a revisar (0.5).
LIMIAR_PLUVIAL_24H_MM = 30.0

# Marégrafo CIRAM/Epagri "Joinville" (uso em produção depende de autorização, 0.1)
CIRAM_MARE_URL = "https://ciram.epagri.sc.gov.br/graficos/getDataMare11_2913.php"
# Leitura medida mais antiga que isto é descartada; sem ela, usa-se a previsão
MARE_IDADE_MAX_MIN = 60

# Nível de cada faixa quando ativa. Nomes provisórios (1.4).
# Ordem crescente de gravidade: o nível global é o maior entre as faixas ativas.
NIVEIS = ("normal", "atencao", "alto")
NIVEL_DA_FAIXA = {
    "mare_1_6": "atencao",
    "mare_2_5": "alto",
    "pluvial_vila_nova": "atencao",
    "pluvial_itaum": "atencao",
}
FAIXAS = tuple(NIVEL_DA_FAIXA)
