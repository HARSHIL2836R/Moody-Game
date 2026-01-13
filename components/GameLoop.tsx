import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameAssets, GameTheme, Coordinates, StoryUpdate, DialogueChoice } from '../types';
import { updateStoryline } from '../services/geminiService';

interface GameLoopProps {
  assets: GameAssets;
  theme: GameTheme;
}

const TILE_WIDTH = 128;
const TILE_HEIGHT = 64;
const INTERACTION_RANGE = 1.2;

interface NPC {
  id: number;
  pos: Coordinates;
  target: Coordinates;
  speed: number;
  state: 'idle' | 'walking';
  idleTimer: number;
}

export const GameLoop: React.FC<GameLoopProps> = ({ assets, theme }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Player & Movement
  const playerPos = useRef<Coordinates>({ x: 0, y: 0 }); 
  const keysPressed = useRef<Set<string>>(new Set());
  const lastUpdate = useRef<number>(Date.now());
  
  // NPCs
  const npcs = useRef<NPC[]>([]);
  
  // Game State
  const [activeDialogue, setActiveDialogue] = useState<StoryUpdate | null>(null);
  const [objectivePos, setObjectivePos] = useState<Coordinates | null>(null);
  const [objectiveText, setObjectiveText] = useState<string>(theme.initialObjective);
  const [isThinking, setIsThinking] = useState(false);
  const [history, setHistory] = useState<string[]>([theme.storyPrelude]);
  const [nearbyNpcId, setNearbyNpcId] = useState<number | null>(null);

  // Procedural World Persistence
  const tileOverrides = useRef<Map<string, number>>(new Map());

  const getTileType = useCallback((x: number, y: number): number => {
    const key = `${x},${y}`;
    if (tileOverrides.current.has(key)) return tileOverrides.current.get(key)!;
    const sinX = Math.sin(x * 12.9898 + y * 78.233);
    const noise = (Math.sin(sinX * 43758.5453) + 1) / 2;
    if (noise > 0.92) return 1; // Wall/Obstacle
    return 0; // Ground
  }, []);

  const spawnNewObjective = useCallback(() => {
    const radius = 10 + Math.floor(Math.random() * 10);
    const angle = Math.random() * Math.PI * 2;
    let tx = Math.round(playerPos.current.x + Math.cos(angle) * radius);
    let ty = Math.round(playerPos.current.y + Math.sin(angle) * radius);
    while (getTileType(tx, ty) === 1) { tx++; ty++; }
    tileOverrides.current.set(`${tx},${ty}`, 2); 
    setObjectivePos({ x: tx, y: ty });
  }, [getTileType]);

  // Initialize NPCs
  useEffect(() => {
    const initialNpcs: NPC[] = [];
    for (let i = 0; i < 5; i++) {
      const pos = { x: (Math.random() - 0.5) * 10, y: (Math.random() - 0.5) * 10 };
      initialNpcs.push({
        id: i,
        pos,
        target: pos,
        speed: 0.5 + Math.random() * 0.5,
        state: 'idle',
        idleTimer: Math.random() * 3
      });
    }
    npcs.current = initialNpcs;
    if (!objectivePos) spawnNewObjective();
  }, [objectivePos, spawnNewObjective]);

  const handleInteraction = useCallback(async (choiceEffect?: string) => {
    if (isThinking) return;
    setIsThinking(true);
    
    try {
      const recentHistory = history.slice(-5);
      const action = choiceEffect || (nearbyNpcId !== null ? "consulted a villager about the village progress." : "reached the construction site.");
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
  }, [theme, history, isThinking, objectivePos, nearbyNpcId]);

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

      // 1. Movement Logic (Player)
      if (!activeDialogue && !isThinking) {
        const speed = 5 * dt; 
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

        // 2. NPC Logic (Wandering)
        npcs.current.forEach(npc => {
          if (npc.state === 'idle') {
            npc.idleTimer -= dt;
            if (npc.idleTimer <= 0) {
              npc.state = 'walking';
              npc.target = { 
                x: npc.pos.x + (Math.random() - 0.5) * 6, 
                y: npc.pos.y + (Math.random() - 0.5) * 6 
              };
            }
          } else {
            const ndx = npc.target.x - npc.pos.x;
            const ndy = npc.target.y - npc.pos.y;
            const dist = Math.sqrt(ndx * ndx + ndy * ndy);
            if (dist < 0.1) {
              npc.state = 'idle';
              npc.idleTimer = 2 + Math.random() * 4;
            } else {
              npc.pos.x += (ndx / dist) * npc.speed * dt;
              npc.pos.y += (ndy / dist) * npc.speed * dt;
            }
          }
        });

        // 3. Proximity Check
        let foundNpc: number | null = null;
        npcs.current.forEach(npc => {
          const dist = Math.sqrt(Math.pow(npc.pos.x - playerPos.current.x, 2) + Math.pow(npc.pos.y - playerPos.current.y, 2));
          if (dist < INTERACTION_RANGE) foundNpc = npc.id;
        });
        setNearbyNpcId(foundNpc);
      }

      // 4. Isometric Canvas Rendering
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
      ctx.fillStyle = "#1e3a1e"; // Deep grass green background
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const toScreenX = (x: number, y: number) => centerX + (x - playerPos.current.x - (y - playerPos.current.y)) * (TILE_WIDTH / 2);
      const toScreenY = (x: number, y: number) => centerY + (x - playerPos.current.x + (y - playerPos.current.y)) * (TILE_HEIGHT / 2);

      // Render World Grid
      const range = 12;
      const startX = Math.floor(playerPos.current.x - range);
      const endX = Math.floor(playerPos.current.x + range);
      const startY = Math.floor(playerPos.current.y - range);
      const endY = Math.floor(playerPos.current.y + range);

      // Depth sorting trick: iterate y then x
      for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
          const type = getTileType(x, y);
          const drawX = toScreenX(x, y);
          const drawY = toScreenY(x, y);

          // Render Tile
          if (assets.ground) {
            ctx.drawImage(assets.ground, drawX - TILE_WIDTH / 2, drawY - TILE_HEIGHT / 2, TILE_WIDTH, TILE_HEIGHT);
          } else {
            ctx.fillStyle = "#2d5a27";
            ctx.beginPath();
            ctx.moveTo(drawX, drawY - TILE_HEIGHT/2);
            ctx.lineTo(drawX + TILE_WIDTH/2, drawY);
            ctx.lineTo(drawX, drawY + TILE_HEIGHT/2);
            ctx.lineTo(drawX - TILE_WIDTH/2, drawY);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = "#ffffff11";
            ctx.stroke();
          }

          // Wall / Obstacle
          if (type === 1 && assets.wall) {
            ctx.drawImage(assets.wall, drawX - TILE_WIDTH / 2, drawY - TILE_HEIGHT + 10, TILE_WIDTH, TILE_HEIGHT * 1.5);
          }

          // Objective Item
          if (type === 2 && assets.item) {
            const b = Math.sin(Date.now() / 200) * 5;
            ctx.drawImage(assets.item, drawX - 32, drawY - 64 + b, 64, 64);
          }

          // Render NPCs that are on this tile coordinate
          npcs.current.forEach(npc => {
            if (Math.round(npc.pos.x) === x && Math.round(npc.pos.y) === y) {
              const ndX = toScreenX(npc.pos.x, npc.pos.y);
              const ndY = toScreenY(npc.pos.x, npc.pos.y);
              if (assets.npc) {
                // Bobbing animation for NPCs
                const b = Math.sin(Date.now() / 300 + npc.id) * 3;
                ctx.drawImage(assets.npc, ndX - 32, ndY - 64 + b, 64, 64);
              }
            }
          });

          // Render Player if on this tile
          if (Math.round(playerPos.current.x) === x && Math.round(playerPos.current.y) === y) {
            const pX = toScreenX(playerPos.current.x, playerPos.current.y);
            const pY = toScreenY(playerPos.current.y, playerPos.current.y); // Typo corrected: toScreenY(playerPos.current.x, playerPos.current.y)
            // Wait, use accurate screen coords for player
          }
        }
      }

      // Re-draw player at exact center to ensure they stay "above" everything
      const pScreenX = centerX;
      const pScreenY = centerY;
      if (assets.player) {
        ctx.drawImage(assets.player, pScreenX - 48, pScreenY - 80, 96, 96);
      } else {
        ctx.fillStyle = theme.colors.primary;
        ctx.beginPath(); ctx.ellipse(pScreenX, pScreenY, 20, 10, 0, 0, Math.PI * 2); ctx.fill();
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    const onKeyDown = (e: KeyboardEvent) => {
      keysPressed.current.add(e.key);
      if (e.key.toLowerCase() === 'e') {
        const distToObj = objectivePos ? Math.sqrt(Math.pow(objectivePos.x - playerPos.current.x, 2) + Math.pow(objectivePos.y - playerPos.current.y, 2)) : 999;
        if (!activeDialogue && !isThinking && (nearbyNpcId !== null || distToObj < INTERACTION_RANGE)) {
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
  }, [assets, theme, activeDialogue, isThinking, getTileType, nearbyNpcId, objectivePos, handleInteraction]);

  return (
    <div className="relative w-full h-full overflow-hidden select-none bg-[#1e3a1e]">
      <canvas ref={canvasRef} className="block w-full h-full" />
      
      {/* Stone & Gold HUD */}
      <div className="absolute top-8 left-8 flex flex-col gap-3">
        <div className="bg-[#4a4a4a] border-4 border-[#c5a059] rounded-2xl p-4 shadow-2xl relative overflow-hidden group min-w-[280px]">
          {/* Bevel Effect */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-black/30 pointer-events-none" />
          <h2 className="text-[12px] uppercase tracking-[0.2em] text-[#d4af37] font-bold mb-1 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]">Current Objective</h2>
          <p className="text-white font-bold text-lg leading-tight tracking-tight drop-shadow-md">
            {objectiveText}
          </p>
        </div>
        
        {/* Resource / Progress Bar (Stylized) */}
        <div className="w-full h-4 bg-black/40 rounded-full border-2 border-[#c5a059] overflow-hidden shadow-inner">
           <div className="h-full bg-gradient-to-r from-[#d4af37] to-[#f4d03f] w-[65%] transition-all duration-1000" />
        </div>
      </div>

      {/* Isometric Directional Guide */}
      <div className="absolute bottom-10 right-10">
        <div className="w-24 h-24 rounded-full bg-[#4a4a4a] border-4 border-[#c5a059] shadow-2xl flex items-center justify-center relative">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-black/20" />
          <div className="text-white font-bold text-xs uppercase opacity-40">Isometric</div>
          {objectivePos && (
             <div 
               className="w-1.5 h-10 bg-[#d4af37] rounded-full absolute transition-transform duration-200"
               style={{ 
                 transform: `rotate(${Math.atan2(objectivePos.y - playerPos.current.y, objectivePos.x - playerPos.current.x) * (180 / Math.PI) + 45}deg)`,
                 boxShadow: '0 0 10px #d4af37'
                }}
             />
          )}
        </div>
      </div>

      {/* Interaction Prompt (Village Style) */}
      {(nearbyNpcId !== null || (objectivePos && Math.sqrt(Math.pow(objectivePos.x - playerPos.current.x, 2) + Math.pow(objectivePos.y - playerPos.current.y, 2)) < INTERACTION_RANGE)) && !activeDialogue && !isThinking && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-32 text-center pointer-events-none">
          <div className="bg-[#4a4a4a] border-4 border-white/60 px-6 py-2 rounded-full shadow-2xl animate-bounce">
            <p className="text-white font-black text-lg tracking-wide uppercase flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-white text-[#4a4a4a] flex items-center justify-center text-xs">E</span>
              Talk
            </p>
          </div>
        </div>
      )}

      {/* Dialogue System (Stone/Paper UI) */}
      {activeDialogue && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-[95%] max-w-3xl bg-[#f5e6c8] border-8 border-[#5d4037] rounded-[40px] shadow-[0_0_60px_rgba(0,0,0,0.6)] p-10 flex flex-col gap-8 transition-all">
          <div className="space-y-4">
             <div className="bg-[#5d4037] w-fit px-6 py-1 rounded-full text-[#d4af37] font-bold text-sm uppercase tracking-widest -mt-14 ml-4">Dialogue</div>
             <p className="text-2xl text-[#3e2723] font-black leading-tight">"{activeDialogue.narrative}"</p>
             <div className="h-0.5 bg-[#3e2723]/10 w-full" />
             <p className="text-sm text-[#5d4037]/70 font-bold uppercase tracking-wide">{activeDialogue.nearbyDescription}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             {activeDialogue.choices?.map((choice, i) => (
               <button
                 key={i}
                 onClick={() => {
                   handleInteraction(choice.effect);
                   setActiveDialogue(null);
                 }}
                 className="px-8 py-5 rounded-3xl bg-[#4caf50] border-b-8 border-[#2e7d32] hover:brightness-110 active:border-b-0 active:translate-y-2 text-white font-black text-lg uppercase transition-all shadow-xl"
               >
                 {choice.label}
               </button>
             ))}
             <button
               onClick={() => setActiveDialogue(null)}
               className="px-8 py-5 rounded-3xl bg-[#ef5350] border-b-8 border-[#c62828] hover:brightness-110 active:border-b-0 active:translate-y-2 text-white font-black text-lg uppercase transition-all shadow-xl"
             >
               Dismiss
             </button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isThinking && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-50">
          <div className="bg-[#4a4a4a] border-8 border-[#c5a059] p-10 rounded-[40px] text-center shadow-2xl">
            <div className="w-20 h-20 border-8 border-t-[#d4af37] border-white/20 rounded-full animate-spin mx-auto mb-6" />
            <p className="text-white font-black text-2xl uppercase tracking-widest animate-pulse">Calculating Strategy...</p>
          </div>
        </div>
      )}

      {/* Bottom Tooltip */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-10 text-[12px] text-white/50 font-black uppercase tracking-[0.3em]">
        <span>WASD: COMMAND</span>
        <span>E: INTERACT</span>
      </div>
    </div>
  );
};
