import { GoogleGenAI } from "@google/genai";
import { getEnvVar } from './env';

const TRANSLATION_MODEL = 'gemini-3-flash-preview';

export const translateText = async (text: string, targetLang: string): Promise<string> => {
    const apiKey = getEnvVar('GOOGLE_API_KEY');

    if (!apiKey) {
        console.warn("Translation skipped: Missing VITE_GOOGLE_API_KEY");
        return text;
    }

    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `Translate the following news headline and content into ${targetLang}. 
    Maintain the original tone and keep any hashtags. 
    If the text is already in ${targetLang}, return it as is.
    
    TEXT TO TRANSLATE:
    ${text}`;

    try {
        const response = await ai.models.generateContent({
            model: TRANSLATION_MODEL,
            contents: prompt,
            config: {
                systemInstruction: "You are a professional news translator. Provide a natural, fluent translation. Return ONLY the translated text without commentary.",
                temperature: 0.2
            }
        });

        return response.text || text;
    } catch (error) {
        console.error("KAIKU: Translation Error:", error);
        return text;
    }
};