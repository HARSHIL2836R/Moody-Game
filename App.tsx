import React, { useState } from 'react';
import { GameState, GameTheme, GameAssets } from './types';
import { generateThemeFromMood } from './services/geminiService';
import { AssetLoader } from './components/AssetLoader';
import { GameLoop } from './components/GameLoop';

export default function App() {
  const [currentState, setCurrentState] = useState<GameState>(GameState.START);
  const [moodInput, setMoodInput] = useState('');
  const [theme, setTheme] = useState<GameTheme | null>(null);
  const [assets, setAssets] = useState<GameAssets | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moodInput.trim()) return;

    setCurrentState(GameState.ANALYZING_MOOD);
    setError(null);

    try {
      const generatedTheme = await generateThemeFromMood(moodInput);
      setTheme(generatedTheme);
      setCurrentState(GameState.GENERATING_ASSETS);
    } catch (err) {
      console.error(err);
      setError("Failed to interpret your mood. The Aether is cloudy. Try again.");
      setCurrentState(GameState.START);
    }
  };

  const handleAssetsLoaded = (loadedAssets: GameAssets) => {
    setAssets(loadedAssets);
    setCurrentState(GameState.PLAYING);
  };

  return (
    <div className="w-full h-screen bg-gray-900 overflow-hidden relative font-sans">
      
      {/* 1. Start Screen */}
      {currentState === GameState.START && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[url('https://picsum.photos/1920/1080?blur=10')] bg-cover bg-center">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          
          <div className="relative z-10 p-8 max-w-2xl w-full text-center">
            <h1 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-6 pixel-font">
              SKY METROPOLIS
            </h1>
            <p className="text-xl text-gray-300 mb-12 font-light">
              Enter the Infinite Aether. Your world changes with your mind.
            </p>

            <form onSubmit={handleStart} className="flex flex-col gap-4">
              <label className="text-left text-sm text-gray-400 uppercase tracking-widest">
                How are you feeling right now?
              </label>
              <textarea
                value={moodInput}
                onChange={(e) => setMoodInput(e.target.value)}
                placeholder="e.g. I feel energetic and want chaos, or I feel lonely and want a quiet mystery..."
                className="w-full p-4 rounded-lg bg-gray-800 border border-gray-700 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all h-32 resize-none"
              />
              <button
                type="submit"
                disabled={!moodInput.trim()}
                className="w-full py-4 px-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold rounded-lg transform transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                INITIALIZE WORLD
              </button>
            </form>
            
            {error && (
              <div className="mt-4 p-3 bg-red-900/50 border border-red-500 text-red-200 rounded">
                {error}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Loading / Analyzing States */}
      {currentState === GameState.ANALYZING_MOOD && (
        <div className="absolute inset-0 flex items-center justify-center bg-black text-white">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
            <h2 className="text-2xl font-bold animate-pulse">Consulting the Oracle...</h2>
            <p className="text-gray-500 mt-2">Interpreting "{moodInput}"</p>
          </div>
        </div>
      )}

      {/* 3. Generating Assets */}
      {currentState === GameState.GENERATING_ASSETS && theme && (
        <AssetLoader theme={theme} onAssetsLoaded={handleAssetsLoaded} />
      )}

      {/* 4. Gameplay */}
      {currentState === GameState.PLAYING && theme && assets && (
        <GameLoop theme={theme} assets={assets} />
      )}
      
    </div>
  );
}
