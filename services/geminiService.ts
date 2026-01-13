import { GoogleGenAI, Type } from "@google/genai";
import { GameTheme, StoryUpdate } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const LOGIC_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-2.5-flash-image'; 

export const generateThemeFromMood = async (moodText: string): Promise<GameTheme> => {
  const prompt = `
    The user wants to play a stylized isometric strategy/RPG game similar to Clash of Clans. Mood: "${moodText}".
    Create a visual theme and world concept. 
    Provide a concrete "initialObjective" (e.g., "Clear the ancient debris from the village square").
    
    Assets must be in the Clash of Clans style:
    - Stylized, high-fidelity 3D renders.
    - Chibi proportions for characters.
    - Vibrant, saturated colors.
    - Soft, hand-painted textures for environments.
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
              ground: { type: Type.STRING, description: "Stylized hand-painted lush green grass terrain tile, seamless, top-down-isometric view" },
              wall: { type: Type.STRING, description: "Chunky beveled stone wall or defensive structure, isometric 45 degree angle" },
              player: { type: Type.STRING, description: "Chibi hero character, stylized 3D render, vibrant armor, isometric view, rim lighting" },
              item: { type: Type.STRING, description: "Golden treasure chest or glowing resource crystal, stylized high-fidelity 3D" },
              npc: { type: Type.STRING, description: "Simple village worker character, chibi style, friendly appearance, isometric 45 degree angle" }
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
  const refinedPrompt = `Single isolated game asset, isometric 45-degree angle, high-quality stylized 3D render style, chibi, vibrant colors, rim lighting, soft ambient occlusion, clean edges, transparent background. Subject: ${description}`;

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
    Roleplay Game Master for an Isometric Strategy World.
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
