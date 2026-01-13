import React, { useEffect, useState } from 'react';
import { GameTheme, GameAssets } from '../types';
import { generateGameAsset } from '../services/geminiService';

interface AssetLoaderProps {
  theme: GameTheme;
  onAssetsLoaded: (assets: GameAssets) => void;
}

export const AssetLoader: React.FC<AssetLoaderProps> = ({ theme, onAssetsLoaded }) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Initializing generator...");

  useEffect(() => {
    const loadAssets = async () => {
      const assets: Partial<GameAssets> = {};
      const keys = Object.keys(theme.assetPrompts) as (keyof GameTheme['assetPrompts'])[];
      const total = keys.length;

      try {
        for (let i = 0; i < total; i++) {
          const key = keys[i];
          setStatus(`Generating ${key}...`);
          
          const base64 = await generateGameAsset(theme.assetPrompts[key]);
          
          const img = new Image();
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = base64;
          });
          
          assets[key] = img;
          setProgress(((i + 1) / total) * 100);
        }
        
        onAssetsLoaded(assets as GameAssets);
      } catch (error) {
        console.error("Error generating assets:", error);
        setStatus("Error creating world. Please try again.");
      }
    };

    loadAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  return (
    <div className="flex flex-col items-center justify-center h-screen w-full bg-gray-900 text-white p-8">
      <h2 className="text-3xl font-bold mb-4 animate-pulse" style={{ color: theme.colors.primary }}>
        Building World: {theme.title}
      </h2>
      <p className="mb-8 text-xl text-gray-400">{status}</p>
      
      <div className="w-full max-w-md h-4 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
        <div 
          className="h-full transition-all duration-500 ease-out"
          style={{ 
            width: `${progress}%`,
            backgroundColor: theme.colors.secondary 
          }}
        />
      </div>
      <p className="mt-4 text-xs opacity-50">Powered by Gemini Nano Banana (Flash Image)</p>
    </div>
  );
};
