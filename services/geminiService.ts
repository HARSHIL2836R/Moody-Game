import { GoogleGenAI, Type } from "@google/genai";
import { GameTheme, StoryUpdate } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const LOGIC_MODEL = 'gemini-3-flash-preview';
const IMAGE_MODEL = 'gemini-2.5-flash-image'; 

export const generateThemeFromMood = async (moodText: string): Promise<GameTheme> => {
  const prompt = `
    The user wants to play a 2D top-down exploration RPG. Mood: "${moodText}".
    Create a visual theme and world concept.
    Provide a concrete "initialObjective" (e.g., "Talk to the Village Elder at (0,0)").
    Provide prompts for pixel-art assets.
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
              ground: { type: Type.STRING },
              wall: { type: Type.STRING },
              player: { type: Type.STRING },
              item: { type: Type.STRING },
              npc: { type: Type.STRING }
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
  const refinedPrompt = `Single 2D game sprite, top-down view, ${description}. Transparent background, clean edges, isolated subject, pixel art style.`;

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
    Roleplay Game Master.
    Theme: ${currentTheme.title}.
    World: ${currentTheme.worldDescription}.
    History: ${history.join('\n')}
    Player Action: ${action}
    
    Task: 
    1. Provide a narrative response.
    2. Provide a nearby description.
    3. Give a new objective.
    4. Provide 2-3 interactive dialogue choices or actions the player can take next.
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
