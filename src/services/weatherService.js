// src/services/weatherService.js

const JOINVILLE_COORDS = {
  lat: -26.3045,
  lon: -48.8456
};

/**
 * Busca a telemetria meteorológica em tempo real na Open-Meteo
 */
export async function fetchWeatherData() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${JOINVILLE_COORDS.lat}&longitude=${JOINVILLE_COORDS.lon}&current=precipitation&hourly=precipitation&past_days=1&forecast_days=1&timezone=America%2FSao_Paulo`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Erro Open-Meteo: ${res.status}`);
    const data = await res.json();

    const currentRain = data.current?.precipitation ?? 0.0;
    const currentTimeISO = data.current?.time;

    let currentIndex = data.hourly.time.findIndex(t => 
      t.startsWith(currentTimeISO ? currentTimeISO.slice(0, 13) : "")
    );
    if (currentIndex === -1) currentIndex = 24;

    // Acumulado das últimas 24 horas
    const past24Slice = data.hourly.precipitation.slice(Math.max(0, currentIndex - 24), currentIndex);
    const rain24h = past24Slice.reduce((acc, val) => acc + (val || 0), 0);

    // Previsão para as próximas 6 horas
    const forecast6Slice = data.hourly.precipitation.slice(currentIndex, currentIndex + 6);
    const forecast6h = forecast6Slice.reduce((acc, val) => acc + (val || 0), 0);

    return {
      rain24h,
      currentRain,
      forecast6h,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
  } catch (err) {
    console.error("Falha ao consultar a Open-Meteo:", err);
    return {
      rain24h: 0.0,
      currentRain: 0.0,
      forecast6h: 0.0,
      timestamp: "Indisponível"
    };
  }
}