# Resumo do controle de qualidade — joinville_meteo (derivado)

Gerado por `scripts/analise_mare_qc.py`. **Resultados derivados**; os dados brutos não estão no repositório.

**Fonte:** Dos Santos-Silva, J. C. (2026). Joinville hydrometeorological dataset (SEPROT / Defesa Civil de Joinville). Zenodo, versão data-2026-07-29, DOI 10.5281/zenodo.21682712. Licença CC BY 4.0. Termos da SEPROT ainda sem confirmação formal.

**Achado:** o nível do Iate Clube fica **travado em 2,5 m** por milhares de horas (2022, 2023 e 2025). Os anos 2022–2023, que o plano previa como teste do ajuste, perdem boa parte da cobertura. Ver a tabela por ano.

**Cuidados:** o zero da régua de cada estação não está documentado e é diferente do referencial do PDDU. Os números abaixo estão na régua de cada estação e **não** são comparáveis com os gatilhos de 1,6 m e 2,5 m. Nada aqui foi ajustado a um modelo de maré (critérios da D2.C ainda não fixados).

**QC do nível:** descarta fora de [-3.0; 4.0] m, sensor travado (mesmo valor por 6 h ou mais), zero exato isolado e picos (hora que foge em mais de 0.6 m da média das duas vizinhas, em duas passadas). O inválido vira ausente, nunca zero.

## Nível por estação

| Estação | Primeiro | Último | Horas após QC | Fora da faixa | Travado | Zeros | Picos | Mediana (m) | p99 − mediana (m) | Amplitude diária mediana (m) |
|---|---|---|--:|--:|--:|--:|--:|--:|--:|--:|
| Iate Clube (estuário) | 2011-08-29 | 2025-03-30 | 71,283 | 2779 | 13829 | 11 | 420 | 0.297 | 1.697 | 1.691 |
| Flotflux (Cachoeira Central) | 2011-01-18 | 2024-06-02 | 100,940 | 675 | 102 | 1 | 1258 | 1.202 | 0.803 | 0.157 |
| Águas de Joinville (Bucarein) | 2011-03-14 | 2021-10-23 | 51,139 | 164 | 36 | 0 | 100 | 0.92 | 1.233 | 1.527 |

## Cobertura de nível por ano (horas com nível / horas registradas, após QC)

| Ano | Iate Clube (estuário) | Flotflux (Cachoeira Central) | Águas de Joinville (Bucarein) |
|---|--:|--:|--:|
| 2011 | 2,998 / 5,894 | 6,175 / 6,188 | 4,926 / 5,524 |
| 2012 | 8,775 / 8,784 | 8,769 / 8,779 | 6,173 / 6,175 |
| 2013 | 8,758 / 8,760 | 8,743 / 8,760 | 8,731 / 8,737 |
| 2014 | 8,759 / 8,760 | 8,746 / 8,760 | 1,422 / 1,423 |
| 2015 | 7,448 / 7,486 | 5,711 / 5,730 | 2,707 / 2,709 |
| 2016 | 8,752 / 8,770 | 8,682 / 8,711 | 6,634 / 6,638 |
| 2017 | 8,290 / 8,669 | 8,592 / 8,648 | 5,359 / 5,363 |
| 2018 | 2,318 / 4,297 | 5,976 / 5,992 | 2,667 / 2,670 |
| 2019 | 445 / 7,216 | 7,819 / 7,848 | 5,067 / 5,067 |
| 2020 | 7 / 8,784 | 6,930 / 7,428 | 4,383 / 4,384 |
| 2021 | 5,336 / 6,560 | 4,971 / 5,773 | 3,070 / 4,834 |
| 2022 | 1,811 / 8,758 | 8,314 / 8,760 | 0 / 7,314 |
| 2023 | 2,100 / 8,613 | 8,162 / 8,755 | 0 / 7,416 |
| 2024 | 3,918 / 6,598 | 3,350 / 4,191 | 0 / 3,727 |
| 2025 | 1,568 / 7,791 | 0 / 7,816 | — |
| 2026 | 0 / 5,808 | 0 / 5,808 | — |

## Chuva diária (ordem de grandeza para o limiar pluvial)

- **Iate Clube (estuário):** 4,669 dias válidos; p99 = 55.3 mm/dia; máximo = 142.5 mm/dia; 0 dias removidos no QC.
- **Flotflux (Cachoeira Central):** 4,502 dias válidos; p99 = 67.8 mm/dia; máximo = 136.1 mm/dia; 0 dias removidos no QC.
- **Águas de Joinville (Bucarein):** 2,788 dias válidos; p99 = 47.0 mm/dia; máximo = 120.6 mm/dia; 0 dias removidos no QC.

_Chuva diária (dia civil), não janela móvel de 24 h; serve de ordem de grandeza para o limiar pluvial._
