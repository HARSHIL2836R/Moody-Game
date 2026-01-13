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

  const processImageTransparency = (img: HTMLImageElement): Promise<HTMLImageElement> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(img);
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Threshold for "white-ish" pixels (RGB > 240)
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r > 240 && g > 240 && b > 240) {
          data[i + 3] = 0; // Set alpha to transparent
        }
      }

      ctx.putImageData(imageData, 0, 0);
      const newImg = new Image();
      newImg.onload = () => resolve(newImg);
      newImg.src = canvas.toDataURL();
    });
  };

  useEffect(() => {
    const loadAssets = async () => {
      const assets: Partial<GameAssets> = {};
      const keys = Object.keys(theme.assetPrompts) as (keyof GameTheme['assetPrompts'])[];
      const total = keys.length;

      try {
        for (let i = 0; i < total; i++) {
          const key = keys[i];
          setStatus(`Rendering 3D ${key}...`);
          
          const base64 = await generateGameAsset(theme.assetPrompts[key]);
          
          const rawImg = new Image();
          await new Promise((resolve, reject) => {
            rawImg.onload = resolve;
            rawImg.onerror = reject;
            rawImg.src = base64;
          });
          
          // Apply transparency filter for non-ground tiles (ground should keep its background usually)
          if (key !== 'ground') {
            assets[key] = await processImageTransparency(rawImg);
          } else {
            assets[key] = rawImg;
          }
          
          setProgress(((i + 1) / total) * 100);
        }
        
        onAssetsLoaded(assets as GameAssets);
      } catch (error) {
        console.error("Error generating assets:", error);
        setStatus("Error creating world. Check your internet or API key.");
      }
    };

    loadAssets();
  }, [theme, onAssetsLoaded]);

  return (
    <div className="flex flex-col items-center justify-center h-screen w-full bg-[#1e3a1e] text-white p-8 font-['Luckiest_Guy']">
      <div className="bg-[#4a4a4a] border-[8px] border-[#c5a059] rounded-[3rem] p-12 shadow-[0_20px_60px_rgba(0,0,0,0.6)] text-center max-w-xl">
        <h2 className="text-4xl font-bold mb-4 uppercase tracking-widest text-[#f4d03f] drop-shadow-lg">
          Forging: {theme.title}
        </h2>
        <p className="mb-8 text-xl text-white/70 uppercase tracking-wider">{status}</p>
        
        <div className="w-full h-8 bg-black/40 rounded-full border-4 border-[#c5a059] overflow-hidden shadow-inner mb-4">
          <div 
            className="h-full bg-gradient-to-r from-[#d4af37] via-[#f4d03f] to-[#d4af37] transition-all duration-700 ease-out shadow-[0_0_15px_#f4d03f]"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-[10px] opacity-40 uppercase tracking-[0.4em]">Proprietary 3D Asset Engine v4.0</p>
      </div>
    </div>
  );
};
