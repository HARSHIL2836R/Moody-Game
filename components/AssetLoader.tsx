import React, { useEffect, useState } from 'react';
import { GameTheme, GameAssets } from '../types';
import { generateGameAsset } from '../services/geminiService';

interface AssetLoaderProps {
  theme: GameTheme;
  onAssetsLoaded: (assets: GameAssets) => void;
}

export const AssetLoader: React.FC<AssetLoaderProps> = ({ theme, onAssetsLoaded }) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Initializing world generation...");

  // Helper: Removes white background from an image
  const processImage = async (base64: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(img); return; }

        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        // Simple Chromakey: Turn white/near-white pixels transparent
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          if (r > 230 && g > 230 && b > 230) {
            data[i + 3] = 0; // Set Alpha to 0
          }
        }

        ctx.putImageData(imgData, 0, 0);
        const processedImg = new Image();
        processedImg.onload = () => resolve(processedImg);
        processedImg.src = canvas.toDataURL();
      };
      img.onerror = reject;
      img.src = base64;
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
          setStatus(`Forging ${key}...`);
          
          const base64 = await generateGameAsset(theme.assetPrompts[key]);
          const processedImage = await processImage(base64);
          
          assets[key] = processedImage;
          setProgress(((i + 1) / total) * 100);
        }
        
        onAssetsLoaded(assets as GameAssets);
      } catch (error) {
        console.error("Error generating assets:", error);
        setStatus("The Aether is unstable. Retrying...");
      }
    };

    loadAssets();
  }, [theme, onAssetsLoaded]);

  return (
    <div className="flex flex-col items-center justify-center h-screen w-full bg-[#1a1a1a] text-white p-8 font-sans">
      <h2 className="text-4xl font-black mb-6 tracking-wider uppercase text-transparent bg-clip-text bg-gradient-to-br from-[#ffd700] to-[#c5a059]" style={{ textShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
        {theme.title}
      </h2>
      <p className="mb-8 text-lg text-[#a3a3a3] font-mono tracking-widest uppercase">{status}</p>
      
      <div className="w-full max-w-xl h-6 bg-[#000] rounded-full overflow-hidden border-2 border-[#333] shadow-[0_0_20px_rgba(0,0,0,0.8)_inset]">
        <div 
          className="h-full bg-gradient-to-r from-[#ffd700] to-[#f4d03f] transition-all duration-300 ease-out shadow-[0_0_15px_#ffd700]"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};