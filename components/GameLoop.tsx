import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameAssets, GameTheme, Coordinates, StoryUpdate } from '../types';
import { updateStoryline } from '../services/geminiService';

interface GameLoopProps {
  assets: GameAssets;
  theme: GameTheme;
}

const TILE_WIDTH = 128;
const TILE_HEIGHT = 64;
const INTERACTION_RANGE = 1.5;

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
  const playerPos = useRef<Coordinates>({ x: 0, y: 0 }); 
  const keysPressed = useRef<Set<string>>(new Set());
  const lastUpdate = useRef<number>(Date.now());
  const npcs = useRef<NPC[]>([]);
  
  const [activeDialogue, setActiveDialogue] = useState<StoryUpdate | null>(null);
  const [objectivePos, setObjectivePos] = useState<Coordinates | null>(null);
  const [objectiveText, setObjectiveText] = useState<string>(theme.initialObjective);
  const [isThinking, setIsThinking] = useState(false);
  const [history, setHistory] = useState<string[]>([theme.storyPrelude]);
  const [nearbyNpcId, setNearbyNpcId] = useState<number | null>(null);
  const tileOverrides = useRef<Map<string, number>>(new Map());

  // Noise function for consistent terrain generation
  const getTileType = useCallback((x: number, y: number): number => {
    const key = `${x},${y}`;
    if (tileOverrides.current.has(key)) return tileOverrides.current.get(key)!;
    // Simple pseudo-random noise
    const sinX = Math.sin(x * 12.9898 + y * 78.233);
    const noise = (Math.sin(sinX * 43758.5453) + 1) / 2;
    if (noise > 0.88) return 1; // Wall/Obstacle
    return 0; // Ground
  }, []);

  const spawnNewObjective = useCallback(() => {
    const radius = 8 + Math.floor(Math.random() * 8);
    const angle = Math.random() * Math.PI * 2;
    let tx = Math.round(playerPos.current.x + Math.cos(angle) * radius);
    let ty = Math.round(playerPos.current.y + Math.sin(angle) * radius);
    while (getTileType(tx, ty) === 1) { tx++; ty++; }
    tileOverrides.current.set(`${tx},${ty}`, 2); // 2 = Objective Item
    setObjectivePos({ x: tx, y: ty });
  }, [getTileType]);

  useEffect(() => {
    const initialNpcs: NPC[] = [];
    for (let i = 0; i < 4; i++) {
      const pos = { x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8 };
      initialNpcs.push({
        id: i, pos, target: pos, speed: 0.8 + Math.random() * 0.5,
        state: 'idle', idleTimer: Math.random() * 3
      });
    }
    npcs.current = initialNpcs;
    if (!objectivePos) spawnNewObjective();
  }, [objectivePos, spawnNewObjective]);

  const handleInteraction = useCallback(async (choiceEffect?: string) => {
    if (isThinking) return;
    setIsThinking(true);
    try {
      const recentHistory = history.slice(-3);
      const action = choiceEffect || (nearbyNpcId !== null ? "spoke to a local." : "found a point of interest.");
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
    } catch (e) { console.error(e); } finally { setIsThinking(false); }
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

      // --- Logic Update ---
      if (!activeDialogue && !isThinking) {
        const speed = 4 * dt; 
        let dx = 0, dy = 0;
        if (keysPressed.current.has('ArrowUp') || keysPressed.current.has('w')) dy = -1;
        if (keysPressed.current.has('ArrowDown') || keysPressed.current.has('s')) dy = 1;
        if (keysPressed.current.has('ArrowLeft') || keysPressed.current.has('a')) dx = -1;
        if (keysPressed.current.has('ArrowRight') || keysPressed.current.has('d')) dx = 1;
        
        if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; } // Normalize diagonal
        const nextX = playerPos.current.x + dx * speed;
        const nextY = playerPos.current.y + dy * speed;
        
        // Simple collision check
        if (getTileType(Math.round(nextX), Math.round(nextY)) !== 1) {
          playerPos.current.x = nextX; playerPos.current.y = nextY;
        }

        // NPC AI
        npcs.current.forEach(npc => {
          if (npc.state === 'idle') {
            npc.idleTimer -= dt;
            if (npc.idleTimer <= 0) {
              npc.state = 'walking';
              npc.target = { x: npc.pos.x + (Math.random() - 0.5) * 5, y: npc.pos.y + (Math.random() - 0.5) * 5 };
            }
          } else {
            const ndx = npc.target.x - npc.pos.x, ndy = npc.target.y - npc.pos.y;
            const dist = Math.sqrt(ndx * ndx + ndy * ndy);
            if (dist < 0.1) { npc.state = 'idle'; npc.idleTimer = 1 + Math.random() * 3; }
            else { npc.pos.x += (ndx / dist) * npc.speed * dt; npc.pos.y += (ndy / dist) * npc.speed * dt; }
          }
        });

        // Interaction Check
        let foundNpc: number | null = null;
        npcs.current.forEach(npc => {
          const dist = Math.sqrt(Math.pow(npc.pos.x - playerPos.current.x, 2) + Math.pow(npc.pos.y - playerPos.current.y, 2));
          if (dist < INTERACTION_RANGE) foundNpc = npc.id;
        });
        setNearbyNpcId(foundNpc);
      }

      // --- Render Start ---
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      
      // Clear with Theme Background
      ctx.fillStyle = "#0f1a0f"; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const isoX = (x: number, y: number) => cx + (x - playerPos.current.x - (y - playerPos.current.y)) * (TILE_WIDTH / 2);
      const isoY = (x: number, y: number) => cy + (x - playerPos.current.x + (y - playerPos.current.y)) * (TILE_HEIGHT / 2);

      const range = 10;
      const startX = Math.floor(playerPos.current.x - range);
      const endX = Math.floor(playerPos.current.x + range);
      const startY = Math.floor(playerPos.current.y - range);
      const endY = Math.floor(playerPos.current.y + range);

      // PASS 1: Ground (Seamless Stitching)
      for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
          const drawX = isoX(x, y);
          const drawY = isoY(x, y);
          
          if (assets.ground) {
            // Draw slightly larger (+2px) to stitch gaps
            ctx.drawImage(assets.ground, drawX - TILE_WIDTH/2 - 1, drawY - TILE_HEIGHT/2 - 1, TILE_WIDTH + 2, TILE_HEIGHT + 2);
          } else {
            // Fallback Grid
            ctx.fillStyle = "#2d5a27";
            ctx.beginPath();
            ctx.moveTo(drawX, drawY - TILE_HEIGHT/2); ctx.lineTo(drawX + TILE_WIDTH/2, drawY);
            ctx.lineTo(drawX, drawY + TILE_HEIGHT/2); ctx.lineTo(drawX - TILE_WIDTH/2, drawY);
            ctx.fill();
            ctx.strokeStyle = "#1e3a1e"; ctx.stroke();
          }
        }
      }

      // PASS 2: Sorted Objects (Depth)
      const drawList: {y: number, z: number, draw: () => void}[] = [];

      // Add Static Objects
      for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
          const type = getTileType(x, y);
          const drawX = isoX(x, y), drawY = isoY(x, y);

          if (type === 1 && assets.wall) {
            drawList.push({
              y: y, z: x, // Sort key
              draw: () => ctx.drawImage(assets.wall!, drawX - TILE_WIDTH/2, drawY - TILE_HEIGHT + 10, TILE_WIDTH, TILE_HEIGHT * 1.5)
            });
          }
          if (type === 2 && assets.item) {
             const bob = Math.sin(now / 200) * 5;
             drawList.push({
               y: y, z: x,
               draw: () => {
                 // Glow under item
                 ctx.shadowColor = theme.colors.secondary; ctx.shadowBlur = 20; 
                 ctx.drawImage(assets.item!, drawX - 32, drawY - 64 + bob, 64, 64);
                 ctx.shadowBlur = 0;
               }
             });
          }
        }
      }

      // Add Dynamic Entities
      npcs.current.forEach(npc => {
        drawList.push({
          y: npc.pos.y, z: npc.pos.x,
          draw: () => {
            const dx = isoX(npc.pos.x, npc.pos.y), dy = isoY(npc.pos.x, npc.pos.y);
            if (assets.npc) {
              const bounce = Math.abs(Math.sin(now / 150 + npc.id)) * 6;
              // Shadow
              ctx.fillStyle = "rgba(0,0,0,0.3)";
              ctx.beginPath(); ctx.ellipse(dx, dy, 20, 10, 0, 0, Math.PI*2); ctx.fill();
              // Sprite
              ctx.drawImage(assets.npc, dx - 32, dy - 64 - bounce, 64, 64);
            }
          }
        });
      });

      drawList.push({
        y: playerPos.current.y, z: playerPos.current.x,
        draw: () => {
          if (assets.player) {
            // Shadow
            ctx.fillStyle = "rgba(0,0,0,0.4)";
            ctx.beginPath(); ctx.ellipse(cx, cy, 24, 12, 0, 0, Math.PI*2); ctx.fill();
            // Player Sprite
            ctx.drawImage(assets.player, cx - 48, cy - 84, 96, 96);
          }
        }
      });

      // Sort by Y first, then X for correct isometric depth
      drawList.sort((a, b) => (a.y - b.y) || (a.z - b.z)).forEach(o => o.draw());

      animationId = requestAnimationFrame(render);
    };

    render();
    const onKeyDown = (e: KeyboardEvent) => {
      keysPressed.current.add(e.key);
      if (e.key.toLowerCase() === 'e' && !activeDialogue && !isThinking) handleInteraction();
    };
    const onKeyUp = (e: KeyboardEvent) => keysPressed.current.delete(e.key);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { cancelAnimationFrame(animationId); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, [assets, theme, activeDialogue, isThinking, getTileType, nearbyNpcId, objectivePos, handleInteraction]);

  return (
    <div className="relative w-full h-full overflow-hidden select-none bg-[#1a1a1a] font-sans">
      <canvas ref={canvasRef} className="block w-full h-full" />
      
      {/* --- HUD: RESOURCE & OBJECTIVE --- */}
      <div className="absolute top-6 left-6 flex flex-col gap-2 z-10 max-w-md w-full">
        <div className="relative bg-[#2a2a2a] border-2 border-[#4a4a4a] rounded-xl p-1 shadow-2xl">
           <div className="absolute -inset-1 bg-gradient-to-r from-[#ffd700] via-[#c5a059] to-[#ffd700] rounded-xl -z-10 blur-sm opacity-60" />
           <div className="bg-[#1f1f1f] rounded-lg p-4 flex flex-col gap-1">
              <span className="text-[10px] font-black tracking-[0.2em] text-[#888] uppercase">Current Directive</span>
              <p className="text-white font-bold text-sm leading-snug text-shadow-sm">{objectiveText}</p>
           </div>
        </div>
        
        {/* Progress Bar */}
        <div className="h-3 w-full bg-[#111] rounded-full border border-[#444] overflow-hidden relative">
           <div className="absolute inset-0 bg-gradient-to-r from-[#4ade80] to-[#22c55e] w-[65%] shadow-[0_0_10px_#4ade80]" />
        </div>
      </div>

      {/* --- UI: MAGICAL COMPASS --- */}
      <div className="absolute bottom-10 right-10 z-10 group">
        <div className="w-28 h-28 relative transition-transform duration-300 hover:scale-105">
           {/* Outer Ring */}
           <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#ffd700] to-[#8a6e2f] shadow-[0_10px_30px_rgba(0,0,0,0.5)] border-4 border-[#5c4013]" />
           {/* Inner Glass */}
           <div className="absolute inset-2 rounded-full bg-[#1a1a1a] shadow-inner overflow-hidden flex items-center justify-center">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.1),transparent)]" />
              {/* Labels */}
              <span className="absolute top-2 text-[8px] font-bold text-[#c5a059]">N</span>
              <span className="absolute bottom-2 text-[8px] font-bold text-[#c5a059] opacity-50">S</span>
              <span className="absolute left-2 text-[8px] font-bold text-[#c5a059] opacity-50">W</span>
              <span className="absolute right-2 text-[8px] font-bold text-[#c5a059] opacity-50">E</span>
              
              {/* The Needle */}
              {objectivePos && (
                <div 
                  className="w-1 h-14 bg-gradient-to-t from-red-500 to-red-600 absolute rounded-full shadow-[0_0_10px_red] origin-bottom transform -translate-y-1/2"
                  style={{ 
                    transform: `rotate(${Math.atan2(objectivePos.y - playerPos.current.y, objectivePos.x - playerPos.current.x) * (180 / Math.PI) + 45}deg) translateY(-30%)`
                   }}
                >
                  <div className="w-3 h-3 bg-[#ffd700] rounded-full absolute -bottom-1 -left-1 shadow-sm border border-[#5c4013]" />
                </div>
              )}
           </div>
        </div>
      </div>

      {/* --- INTERACTION PROMPT --- */}
      {(nearbyNpcId !== null || (objectivePos && Math.sqrt(Math.pow(objectivePos.x - playerPos.current.x, 2) + Math.pow(objectivePos.y - playerPos.current.y, 2)) < INTERACTION_RANGE)) && !activeDialogue && !isThinking && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-24 z-20 animate-bounce">
          <div className="bg-white text-black px-4 py-1 rounded-full font-black text-xs uppercase tracking-widest shadow-[0_0_20px_rgba(255,255,255,0.6)] border-2 border-[#ffd700]">
            Press E
          </div>
        </div>
      )}

      {/* --- DIALOGUE BOX --- */}
      {activeDialogue && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl bg-[#1f1f1f] border border-[#4a4a4a] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.9)] p-6 z-50 flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-10">
          <p className="text-xl text-gray-100 font-medium leading-relaxed">"{activeDialogue.narrative}"</p>
          <div className="h-px bg-gradient-to-r from-transparent via-[#4a4a4a] to-transparent w-full" />
          <div className="flex gap-3 flex-wrap justify-end">
             {activeDialogue.choices?.map((choice, i) => (
               <button key={i} onClick={() => { handleInteraction(choice.effect); setActiveDialogue(null); }} 
                 className="px-6 py-3 rounded-lg bg-[#2a2a2a] hover:bg-[#333] border border-[#444] text-[#ffd700] font-bold text-sm uppercase tracking-wide transition-all hover:scale-105 active:scale-95 shadow-lg">
                 {choice.label}
               </button>
             ))}
             <button onClick={() => setActiveDialogue(null)} className="px-6 py-3 rounded-lg bg-red-900/20 hover:bg-red-900/40 border border-red-900/50 text-red-400 font-bold text-sm uppercase transition-all">Dismiss</button>
          </div>
        </div>
      )}

      {/* --- LOADING OVERLAY --- */}
      {isThinking && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100]">
          <div className="flex flex-col items-center gap-4">
             <div className="w-12 h-12 border-4 border-[#ffd700] border-t-transparent rounded-full animate-spin" />
             <p className="text-[#ffd700] font-black text-sm uppercase tracking-[0.3em] animate-pulse">Consulting the Oracle...</p>
          </div>
        </div>
      )}
    </div>
  );
};