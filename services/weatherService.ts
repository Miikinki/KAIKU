import { getEnvVar } from './env';

const API_KEY = getEnvVar('OPENWEATHER_API_KEY');

interface WeatherData {
    name: string;
    main: {
        temp: number;
    };
    weather: {
        main: string;
        description: string;
    }[];
}

export const fetchLocalWeather = async (lat: number, lng: number): Promise<string | null> => {
    // Require a valid API Key. If missing, fail silently (hide weather).
    if (!API_KEY) return null;

    try {
        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&lang=fi&appid=${API_KEY}`
        );

        if (!response.ok) return null;

        const data: WeatherData = await response.json();
        
        const city = data.name;
        const temp = Math.round(data.main.temp);
        const desc = data.weather[0]?.description || '';
        
        // Capitalize description (e.g. "pilvistä" -> "Pilvistä")
        const formattedDesc = desc.charAt(0).toUpperCase() + desc.slice(1);

        // Format: "📍 Porvoo: -2°C (Lumikuuroja)"
        return `📍 ${city}: ${temp}°C (${formattedDesc})`;
    } catch (e) {
        console.warn("Weather fetch failed", e);
        return null;
    }
};