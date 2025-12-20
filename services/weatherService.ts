import { getEnvVar } from './env';

const API_KEY = getEnvVar('OPENWEATHER_API_KEY') || 'e683f2a363784566378456637845663'; // Fallback or Placeholder

interface WeatherData {
    name: string;
    main: {
        temp: number;
    };
    weather: {
        main: string;
        description: string;
    }[];
    wind: {
        speed: number;
    };
}

export const fetchLocalWeather = async (lat: number, lng: number): Promise<string | null> => {
    // If no key is configured (and using dummy default), return null to hide widget instead of showing errors
    if (!API_KEY || API_KEY.length < 10) return null;

    try {
        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&appid=${API_KEY}`
        );

        if (!response.ok) return null;

        const data: WeatherData = await response.json();
        
        const city = data.name.toUpperCase();
        const temp = Math.round(data.main.temp);
        const desc = data.weather[0]?.main || 'Clear';
        const wind = Math.round(data.wind.speed);

        // Format: "📍 PORVOO: -5°C (Snow) 💨 Wind: 4m/s"
        return `📍 ${city}: ${temp}°C (${desc}) 💨 WIND: ${wind}m/s`;
    } catch (e) {
        console.warn("Weather fetch failed", e);
        return null;
    }
};