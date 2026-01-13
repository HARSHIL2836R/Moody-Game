import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameAssets, GameTheme, Coordinates, StoryUpdate, DialogueChoice } from '../types';
import { updateStoryline } from '../services/geminiService';

interface GameLoopProps {
  assets: GameAssets;
  theme: GameTheme;
}

const TILE_SIZE = 64;
const INTERACTION_RANGE = 1.5;

export const GameLoop: React.FC<GameLoopProps> = ({ assets, theme }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compassNeedleRef = useRef<HTMLDivElement>(null);
  const distanceTextRef = useRef<HTMLSpanElement>(null);
  
  // Player & Movement
  const playerPos = useRef<Coordinates>({ x: 0, y: 0 }); 
  const keysPressed = useRef<Set<string>>(new Set());
  const lastUpdate = useRef<number>(Date.now());
  
  // Game State
  const [activeDialogue, setActiveDialogue] = useState<StoryUpdate | null>(null);
  const [objectivePos, setObjectivePos] = useState<Coordinates | null>(null);
  const [objectiveText, setObjectiveText] = useState<string>(theme.initialObjective);
  const [isThinking, setIsThinking] = useState(false);
  const [history, setHistory] = useState<string[]>([theme.storyPrelude]);
  const [nearbyNpc, setNearbyNpc] = useState<Coordinates | null>(null);

  // Procedural World Persistence
  const tileOverrides = useRef<Map<string, number>>(new Map());

  const getTileType = useCallback((x: number, y: number): number => {
    const key = `${x},${y}`;
    if (tileOverrides.current.has(key)) return tileOverrides.current.get(key)!;

    const sinX = Math.sin(x * 12.9898 + y * 78.233);
    const noise = (Math.sin(sinX * 43758.5453) + 1) / 2;
    
    if (noise > 0.88) return 1; // Wall
    if (noise > 0.99) return 3; // NPC
    return 0; // Ground
  }, []);

  const spawnNewObjective = useCallback(() => {
    const radius = 25 + Math.floor(Math.random() * 15);
    const angle = Math.random() * Math.PI * 2;
    let tx = Math.round(playerPos.current.x + Math.cos(angle) * radius);
    let ty = Math.round(playerPos.current.y + Math.sin(angle) * radius);
    
    while (getTileType(tx, ty) === 1) { tx++; ty++; }

    const key = `${tx},${ty}`;
    tileOverrides.current.set(key, 2); 
    setObjectivePos({ x: tx, y: ty });
  }, [getTileType]);

  useEffect(() => {
    if (!objectivePos) spawnNewObjective();
  }, [objectivePos, spawnNewObjective]);

  const handleInteraction = useCallback(async (choiceEffect?: string) => {
    if (isThinking) return;
    setIsThinking(true);
    
    try {
      const recentHistory = history.slice(-5);
      const action = choiceEffect || (nearbyNpc ? "talked to a local resident." : "reached the objective site.");
      
      const update = await updateStoryline(theme, recentHistory, action);
      
      setHistory(prev => [...prev, update.narrative]);
      setObjectiveText(update.newObjective);
      setActiveDialogue(update);
      
      if (objectivePos) {
        const dist = Math.sqrt(Math.pow(objectivePos.x - playerPos.current.x, 2) + Math.pow(objectivePos.y - playerPos.current.y, 2));
        if (dist < INTERACTION_RANGE) {
          tileOverrides.current.delete(`${objectivePos.x},${objectivePos.y}`);
          setObjectivePos(null);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsThinking(false);
    }
  }, [theme, history, isThinking, objectivePos, nearbyNpc, spawnNewObjective]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const render = () => {
      const now = Date.now();
      const dt = (now - lastUpdate.current) / 1000;
      lastUpdate.current = now;

      // 1. Movement Logic
      if (!activeDialogue && !isThinking) {
        const speed = 7 * dt; 
        let dx = 0, dy = 0;
        if (keysPressed.current.has('ArrowUp') || keysPressed.current.has('w')) dy = -1;
        if (keysPressed.current.has('ArrowDown') || keysPressed.current.has('s')) dy = 1;
        if (keysPressed.current.has('ArrowLeft') || keysPressed.current.has('a')) dx = -1;
        if (keysPressed.current.has('ArrowRight') || keysPressed.current.has('d')) dx = 1;

        if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }

        const nextX = playerPos.current.x + dx * speed;
        const nextY = playerPos.current.y + dy * speed;
        
        if (getTileType(Math.round(nextX), Math.round(nextY)) !== 1) {
          playerPos.current.x = nextX;
          playerPos.current.y = nextY;
        }

        // Update HUD Directly (Performance Optimization)
        if (objectivePos) {
          const odx = objectivePos.x - playerPos.current.x;
          const ody = objectivePos.y - playerPos.current.y;
          const dist = Math.sqrt(odx * odx + ody * ody);
          const angle = Math.atan2(ody, odx) * (180 / Math.PI) + 90;

          if (compassNeedleRef.current) {
            compassNeedleRef.current.style.transform = `rotate(${angle}deg)`;
          }
          if (distanceTextRef.current) {
            distanceTextRef.current.innerText = `${Math.round(dist)}m`;
          }

          // Auto-trigger proximity interaction check for NPCs
          let foundNpc = false;
          const visRad = 2;
          for (let y = Math.round(playerPos.current.y) - visRad; y <= Math.round(playerPos.current.y) + visRad; y++) {
            for (let x = Math.round(playerPos.current.x) - visRad; x <= Math.round(playerPos.current.x) + visRad; x++) {
              if (getTileType(x, y) === 3) {
                const npcDist = Math.sqrt(Math.pow(x - playerPos.current.x, 2) + Math.pow(y - playerPos.current.y, 2));
                if (npcDist < INTERACTION_RANGE) {
                  setNearbyNpc({ x, y });
                  foundNpc = true;
                }
              }
            }
          }
          if (!foundNpc) setNearbyNpc(null);
        }
      }

      // 2. Canvas Rendering
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
      ctx.fillStyle = theme.colors.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const visX = Math.ceil(canvas.width / TILE_SIZE / 2) + 1;
      const visY = Math.ceil(canvas.height / TILE_SIZE / 2) + 1;
      const startX = Math.floor(playerPos.current.x - visX);
      const endX = Math.floor(playerPos.current.x + visX);
      const startY = Math.floor(playerPos.current.y - visY);
      const endY = Math.floor(playerPos.current.y + visY);

      for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
          const type = getTileType(x, y);
          const drawX = centerX + (x - playerPos.current.x) * TILE_SIZE - TILE_SIZE/2;
          const drawY = centerY + (y - playerPos.current.y) * TILE_SIZE - TILE_SIZE/2;

          if (assets.ground) ctx.drawImage(assets.ground, drawX, drawY, TILE_SIZE, TILE_SIZE);
          if (type === 1 && assets.wall) ctx.drawImage(assets.wall, drawX, drawY, TILE_SIZE, TILE_SIZE);
          if (type === 2 && assets.item) {
            const b = Math.sin(Date.now() / 250) * 8;
            ctx.drawImage(assets.item, drawX + 8, drawY + 8 + b, TILE_SIZE - 16, TILE_SIZE - 16);
          }
          if (type === 3 && assets.npc) {
            const move = Math.sin(Date.now() / 400 + (x + y)) * 4;
            ctx.drawImage(assets.npc, drawX, drawY + move, TILE_SIZE, TILE_SIZE);
          }
        }
      }

      // Player
      if (assets.player) {
        ctx.drawImage(assets.player, centerX - TILE_SIZE/2, centerY - TILE_SIZE/2, TILE_SIZE, TILE_SIZE);
      } else {
        ctx.fillStyle = theme.colors.primary;
        ctx.beginPath(); ctx.arc(centerX, centerY, TILE_SIZE/3, 0, Math.PI*2); ctx.fill();
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    const onKeyDown = (e: KeyboardEvent) => {
      keysPressed.current.add(e.key);
      if (e.key.toLowerCase() === 'e') {
        const distToObj = objectivePos ? Math.sqrt(Math.pow(objectivePos.x - playerPos.current.x, 2) + Math.pow(objectivePos.y - playerPos.current.y, 2)) : 999;
        if (!activeDialogue && !isThinking && (nearbyNpc || distToObj < INTERACTION_RANGE)) {
          handleInteraction();
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keysPressed.current.delete(e.key);
    
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [assets, theme, activeDialogue, isThinking, getTileType, nearbyNpc, objectivePos, handleInteraction]);

  return (
    <div className="relative w-full h-full overflow-hidden select-none">
      <canvas ref={canvasRef} className="block w-full h-full" />
      
      {/* Minimalist HUD */}
      <div className="absolute top-6 left-6 flex flex-col gap-2">
        <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-lg border border-white/10">
          <h2 className="text-[10px] uppercase tracking-widest text-white/50 font-bold mb-1">Current Goal</h2>
          <p className="text-white font-semibold text-sm drop-shadow-sm" style={{ color: theme.colors.primary }}>{objectiveText}</p>
        </div>
        
        {/* Subtle Compass */}
        {objectivePos && (
          <div className="flex items-center gap-3 bg-black/40 backdrop-blur-sm p-2 rounded-full border border-white/5 w-fit">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center relative overflow-hidden">
               <div ref={compassNeedleRef} className="w-0.5 h-4 bg-red-500 rounded-full transition-transform duration-75" />
               <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-white/40 rounded-full" />
            </div>
            <span ref={distanceTextRef} className="text-[10px] font-mono text-white/70">
              0m
            </span>
          </div>
        )}
      </div>

      {/* Interaction Prompt (Minecraft Style) */}
      {(nearbyNpc || (objectivePos && Math.sqrt(Math.pow(objectivePos.x - playerPos.current.x, 2) + Math.pow(objectivePos.y - playerPos.current.y, 2)) < INTERACTION_RANGE)) && !activeDialogue && !isThinking && (
        <div className="absolute bottom-1/3 left-1/2 -translate-x-1/2 text-center pointer-events-none">
          <div className="bg-black/80 px-4 py-2 rounded border-2 border-white/20 animate-bounce">
            <p className="text-white font-bold text-sm tracking-widest uppercase">Press [E] to interact</p>
          </div>
        </div>
      )}

      {/* Dialogue System */}
      {activeDialogue && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-4xl bg-slate-900/95 border-t-4 backdrop-blur-xl p-8 rounded-2xl shadow-2xl flex flex-col gap-6" style={{ borderColor: theme.colors.primary }}>
          <div className="space-y-4">
             <p className="text-lg text-slate-100 font-medium leading-relaxed italic">"{activeDialogue.narrative}"</p>
             <p className="text-sm text-slate-400 font-semibold">{activeDialogue.nearbyDescription}</p>
          </div>

          <div className="flex flex-wrap gap-4 pt-4 border-t border-white/10">
             {activeDialogue.choices?.map((choice, i) => (
               <button
                 key={i}
                 onClick={() => {
                   handleInteraction(choice.effect);
                   setActiveDialogue(null);
                 }}
                 className="px-6 py-3 rounded-lg border-2 border-white/20 hover:border-white/50 bg-white/5 hover:bg-white/10 text-white font-bold transition-all text-sm uppercase tracking-wider"
               >
                 {choice.label}
               </button>
             ))}
             <button
               onClick={() => setActiveDialogue(null)}
               className="px-6 py-3 rounded-lg bg-red-900/40 text-red-200 font-bold border-2 border-red-900/50 hover:bg-red-800/60 transition-all text-sm uppercase tracking-wider"
             >
               Close
             </button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isThinking && (
        <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center">
            <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin mb-4" style={{ borderColor: theme.colors.primary, borderTopColor: 'transparent' }} />
            <p className="text-white font-bold text-xs uppercase tracking-widest animate-pulse">The Oracle is speaking...</p>
          </div>
        </div>
      )}

      {/* Bottom Tooltip */}
      <div className="absolute bottom-4 right-4 flex gap-4 text-[10px] text-white/30 font-bold uppercase tracking-widest">
        <span>[WASD] Move</span>
        <span>[E] Interact</span>
        <span className="text-white/10">Infinite Aether v2.6</span>
      </div>
    </div>
  );
};
