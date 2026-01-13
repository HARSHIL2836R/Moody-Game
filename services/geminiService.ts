import { GoogleGenAI, Type } from "@google/genai";
import { GameTheme, StoryUpdate } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const LOGIC_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-2.5-flash-image'; 

export const generateThemeFromMood = async (moodText: string): Promise<GameTheme> => {
  const prompt = `
    The user wants to play a high-end 3D stylized isometric strategy game exactly like Clash of Clans. Mood: "${moodText}".
    Create a visual theme and world concept.
    
    Asset Style Requirements:
    - High-fidelity 3D soft-body renders.
    - High-gloss materials with vibrant subsurface scattering.
    - Strong rim lighting to separate characters from the background.
    - Chibi/stylized proportions.
    - Perspective: 45-degree front-facing isometric.
  `;

  const response = await ai.models.generateContent({
    model: LOGIC_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          storyPrelude: { type: Type.STRING },
          initialObjective: { type: Type.STRING },
          worldDescription: { type: Type.STRING },
          colors: {
            type: Type.OBJECT,
            properties: {
              primary: { type: Type.STRING },
              secondary: { type: Type.STRING },
              text: { type: Type.STRING },
              background: { type: Type.STRING }
            }
          },
          assetPrompts: {
            type: Type.OBJECT,
            properties: {
              ground: { type: Type.STRING, description: "Lush stylized 3D grass terrain tile, hand-painted texture, high-fidelity render, seamless, isometric" },
              wall: { type: Type.STRING, description: "Stylized chunky stone defense tower, high-gloss stone material, rim lighting, 3D render, isometric" },
              player: { type: Type.STRING, description: "Chibi hero, soft-body 3D render, high-gloss armor, vibrant colors, 45-degree front-facing isometric view" },
              item: { type: Type.STRING, description: "Glistening treasure chest, gold and gem materials, high-fidelity 3D render, soft-body bounce, isometric" },
              npc: { type: Type.STRING, description: "Cute villager character, soft-body 3D render, high-gloss clothing, 45-degree front-facing isometric" }
            }
          }
        }
      }
    }
  });

  if (!response.text) throw new Error("Failed to generate theme");
  return JSON.parse(response.text) as GameTheme;
};

export const generateGameAsset = async (description: string): Promise<string> => {
  const refinedPrompt = `Single isolated game asset, 45-degree isometric angle, high-fidelity stylized 3D soft-body render, high-gloss materials, vibrant colors, rim lighting, soft shadows, ambient occlusion, transparent background, subject: ${description}`;

  const response = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: {
      parts: [{ text: refinedPrompt }]
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }

  throw new Error("No image generated");
};

export const updateStoryline = async (
  currentTheme: GameTheme, 
  history: string[], 
  action: string
): Promise<StoryUpdate> => {
  const prompt = `
    Roleplay Game Master for a high-end Isometric Strategy World.
    Theme: ${currentTheme.title}.
    World: ${currentTheme.worldDescription}.
    History: ${history.join('\n')}
    Player Action: ${action}
    
    Task: 
    1. Provide a narrative response.
    2. Provide a nearby description.
    3. Give a new village-building or exploration objective.
    4. Provide 2-3 interactive choices.
  `;

  const response = await ai.models.generateContent({
    model: LOGIC_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          narrative: { type: Type.STRING },
          nearbyDescription: { type: Type.STRING },
          newObjective: { type: Type.STRING },
          choices: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                effect: { type: Type.STRING }
              },
              required: ["label", "effect"]
            }
          }
        }
      }
    }
  });

  if (!response.text) throw new Error("Failed to update story");
  return JSON.parse(response.text) as StoryUpdate;
};
