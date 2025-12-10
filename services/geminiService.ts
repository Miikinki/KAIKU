import { GoogleGenAI, Type } from "@google/genai";
import { DreamCategory } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeDream = async (text: string): Promise<{ category: DreamCategory, summary: string, interpretation: string }> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Analyze the following dream description: "${text}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: {
              type: Type.STRING,
              enum: Object.values(DreamCategory),
            },
            summary: {
              type: Type.STRING,
              description: "A short summary of the dream, max 1 sentence."
            },
            interpretation: {
              type: Type.STRING,
              description: "A psychological interpretation of the dream symbolism."
            }
          },
          required: ["category", "summary", "interpretation"]
        }
      }
    });

    const result = JSON.parse(response.text || '{}');
    return {
      category: result.category as DreamCategory,
      summary: result.summary,
      interpretation: result.interpretation
    };
  } catch (e) {
    console.error("Gemini Analysis Failed", e);
    // Fallback
    return {
      category: DreamCategory.ABSTRACT,
      summary: "Analysis unavailable.",
      interpretation: "The connection to the collective unconscious is momentarily weak."
    };
  }
};

export const translateDream = async (text: string, interpretation: string, targetLang: string): Promise<{ translatedText: string, translatedInterpretation: string } | null> => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Translate the following dream text and its interpretation into ${targetLang}.
            
            Dream Text: "${text}"
            Interpretation: "${interpretation}"`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        translatedText: { type: Type.STRING },
                        translatedInterpretation: { type: Type.STRING }
                    },
                    required: ["translatedText", "translatedInterpretation"]
                }
            }
        });

        return JSON.parse(response.text || 'null');
    } catch (e) {
        console.error("Gemini Translation Failed", e);
        return null;
    }
};