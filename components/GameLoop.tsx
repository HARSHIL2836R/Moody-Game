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

interface Drawable {
  type: 'player' | 'npc' | 'item' | 'wall';
  x: number;
  y: number;
  id?: number;
  img: HTMLImageElement | null;
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

  const getTileType = useCallback((x: number, y: number): number => {
    const key = `${x},${y}`;
    if (tileOverrides.current.has(key)) return tileOverrides.current.get(key)!;
    const sinX = Math.sin(x * 12.9898 + y * 78.233);
    const noise = (Math.sin(sinX * 43758.5453) + 1) / 2;
    if (noise > 0.94) return 1; // Obstacle
    return 0; // Ground
  }, []);

  const spawnNewObjective = useCallback(() => {
    const radius = 8 + Math.floor(Math.random() * 8);
    const angle = Math.random() * Math.PI * 2;
    let tx = Math.round(playerPos.current.x + Math.cos(angle) * radius);
    let ty = Math.round(playerPos.current.y + Math.sin(angle) * radius);
    while (getTileType(tx, ty) === 1) { tx++; ty++; }
    tileOverrides.current.set(`${tx},${ty}`, 2); 
    setObjectivePos({ x: tx, y: ty });
  }, [getTileType]);

  useEffect(() => {
    const initialNpcs: NPC[] = [];
    for (let i = 0; i < 4; i++) {
      const pos = { x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 8 };
      initialNpcs.push({
        id: i,
        pos,
        target: pos,
        speed: 0.6 + Math.random() * 0.4,
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
      const action = choiceEffect || (nearbyNpcId !== null ? "consulted a builder about village expansions." : "secured a major resource point.");
      const update = await updateStoryline(theme, history.slice(-5), action);
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

      // 1. Movement Logic
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
            if (dist < 0.1) { npc.state = 'idle'; npc.idleTimer = 3 + Math.random() * 3; }
            else { npc.pos.x += (ndx / dist) * npc.speed * dt; npc.pos.y += (ndy / dist) * npc.speed * dt; }
          }
        });

        let foundNpc: number | null = null;
        npcs.current.forEach(npc => {
          if (Math.sqrt(Math.pow(npc.pos.x - playerPos.current.x, 2) + Math.pow(npc.pos.y - playerPos.current.y, 2)) < INTERACTION_RANGE) foundNpc = npc.id;
        });
        setNearbyNpcId(foundNpc);
      }

      // 2. Rendering
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
      ctx.fillStyle = "#1e3a1e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const toScreenX = (x: number, y: number) => centerX + (x - playerPos.current.x - (y - playerPos.current.y)) * (TILE_WIDTH / 2);
      const toScreenY = (x: number, y: number) => centerY + (x - playerPos.current.x + (y - playerPos.current.y)) * (TILE_HEIGHT / 2);

      const range = 10;
      const startX = Math.floor(playerPos.current.x - range);
      const endX = Math.ceil(playerPos.current.x + range);
      const startY = Math.floor(playerPos.current.y - range);
      const endY = Math.ceil(playerPos.current.y + range);

      // --- LAYER 1: Ground (seamless tiles) ---
      for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
          const drawX = toScreenX(x, y);
          const drawY = toScreenY(x, y);
          if (assets.ground) {
            // Slight 1px overlap for seamlessness
            ctx.drawImage(assets.ground, drawX - TILE_WIDTH / 2 - 1, drawY - TILE_HEIGHT / 2 - 1, TILE_WIDTH + 2, TILE_HEIGHT + 2);
          } else {
            ctx.fillStyle = "#2d5a27";
            ctx.beginPath();
            ctx.moveTo(drawX, drawY - TILE_HEIGHT/2);
            ctx.lineTo(drawX + TILE_WIDTH/2, drawY);
            ctx.lineTo(drawX, drawY + TILE_HEIGHT/2);
            ctx.lineTo(drawX - TILE_WIDTH/2, drawY);
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      // --- LAYER 2: Objects (Depth Sorted) ---
      const drawables: Drawable[] = [
        { type: 'player', x: playerPos.current.x, y: playerPos.current.y, img: assets.player }
      ];

      // Add NPCs
      npcs.current.forEach(npc => drawables.push({ type: 'npc', x: npc.pos.x, y: npc.pos.y, id: npc.id, img: assets.npc }));
      
      // Add Items/Obstacles in view
      for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
          const type = getTileType(x, y);
          if (type === 1) drawables.push({ type: 'wall', x, y, img: assets.wall });
          if (type === 2) drawables.push({ type: 'item', x, y, img: assets.item });
        }
      }

      // Isometric depth sorting: x + y
      drawables.sort((a, b) => (a.x + a.y) - (b.x + b.y));

      drawables.forEach(d => {
        const dX = toScreenX(d.x, d.y);
        const dY = toScreenY(d.x, d.y);

        // Draw Shadow for characters/items
        if (d.type !== 'wall') {
          ctx.fillStyle = "rgba(0,0,0,0.3)";
          ctx.beginPath();
          ctx.ellipse(dX, dY + 5, 25, 12, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        // Bouncy walk animation logic
        let bob = 0;
        if (d.type === 'player') {
          const isMoving = keysPressed.current.size > 0;
          if (isMoving) bob = -Math.abs(Math.sin(now / 100)) * 12;
        } else if (d.type === 'npc') {
          const npc = npcs.current.find(n => n.id === d.id);
          if (npc?.state === 'walking') bob = -Math.abs(Math.sin(now / 120 + (d.id || 0))) * 10;
          else bob = Math.sin(now / 400 + (d.id || 0)) * 3; // Idle breathe
        } else if (d.type === 'item') {
          bob = Math.sin(now / 500) * 8; // Floating
        }

        if (d.img) {
          const size = d.type === 'player' ? 110 : (d.type === 'wall' ? 140 : 80);
          const offsetY = d.type === 'wall' ? -size * 0.7 : -size * 0.85;
          ctx.drawImage(d.img, dX - size/2, dY + offsetY + bob, size, size);
        } else {
           // Fallback
           ctx.fillStyle = d.type === 'player' ? "#ff0000" : "#ffffff";
           ctx.beginPath(); ctx.arc(dX, dY - 20 + bob, 15, 0, Math.PI*2); ctx.fill();
        }
      });

      animationId = requestAnimationFrame(render);
    };

    render();

    const onKeyDown = (e: KeyboardEvent) => {
      keysPressed.current.add(e.key);
      if (e.key.toLowerCase() === 'e') {
        const distToObj = objectivePos ? Math.sqrt(Math.pow(objectivePos.x - playerPos.current.x, 2) + Math.pow(objectivePos.y - playerPos.current.y, 2)) : 999;
        if (!activeDialogue && !isThinking && (nearbyNpcId !== null || distToObj < INTERACTION_RANGE)) handleInteraction();
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
    <div className="relative w-full h-full overflow-hidden select-none bg-[#1e3a1e] font-['Luckiest_Guy']">
      <canvas ref={canvasRef} className="block w-full h-full" />
      
      {/* Thick Gold HUD */}
      <div className="absolute top-8 left-8 flex flex-col gap-4">
        <div className="bg-[#4a4a4a] border-[8px] border-[#c5a059] rounded-[2rem] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.5)] min-w-[320px] relative">
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none rounded-[1.5rem]" />
          <h2 className="text-[14px] uppercase tracking-[0.25em] text-[#d4af37] mb-1 drop-shadow-md">Current Goal</h2>
          <p className="text-white text-2xl leading-none drop-shadow-lg tracking-wide uppercase">
            {objectiveText}
          </p>
        </div>
        
        <div className="w-full h-6 bg-black/50 rounded-full border-4 border-[#c5a059] overflow-hidden shadow-inner">
           <div className="h-full bg-gradient-to-r from-[#d4af37] via-[#f4d03f] to-[#d4af37] w-[75%] shadow-[0_0_10px_#d4af37]" />
        </div>
      </div>

      {/* Isometric Navigator */}
      <div className="absolute bottom-12 right-12">
        <div className="w-28 h-28 rounded-full bg-[#4a4a4a] border-[8px] border-[#c5a059] shadow-2xl flex items-center justify-center relative">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-black/30 rounded-full" />
          <div className="text-white font-bold text-[10px] uppercase opacity-40">Map</div>
          {objectivePos && (
             <div 
               className="w-2 h-12 bg-gradient-to-t from-[#d4af37] to-white rounded-full absolute transition-transform duration-150"
               style={{ 
                 transform: `rotate(${Math.atan2(objectivePos.y - playerPos.current.y, objectivePos.x - playerPos.current.x) * (180 / Math.PI) + 45}deg)`,
                 boxShadow: '0 0 15px rgba(212,175,55,0.8)'
                }}
             />
          )}
        </div>
      </div>

      {/* Interaction Prompt */}
      {(nearbyNpcId !== null || (objectivePos && Math.sqrt(Math.pow(objectivePos.x - playerPos.current.x, 2) + Math.pow(objectivePos.y - playerPos.current.y, 2)) < INTERACTION_RANGE)) && !activeDialogue && !isThinking && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-40 text-center pointer-events-none">
          <div className="bg-[#4a4a4a] border-[6px] border-white/80 px-8 py-3 rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.6)] animate-bounce">
            <p className="text-white text-2xl tracking-widest uppercase flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-white text-[#4a4a4a] flex items-center justify-center text-sm font-black">E</span>
              Talk
            </p>
          </div>
        </div>
      )}

      {/* CoC Style Dialogue Panel */}
      {activeDialogue && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-[95%] max-w-4xl bg-[#f5e6c8] border-[10px] border-[#5d4037] rounded-[3rem] shadow-[0_20px_80px_rgba(0,0,0,0.8)] p-12 flex flex-col gap-10">
          <div className="space-y-4 text-center">
             <div className="bg-[#5d4037] w-fit px-10 py-2 rounded-full text-[#d4af37] font-bold text-lg uppercase tracking-widest -mt-20 mx-auto shadow-xl border-4 border-[#c5a059]">Update</div>
             <p className="text-3xl text-[#3e2723] font-black leading-tight drop-shadow-sm uppercase">"{activeDialogue.narrative}"</p>
             <div className="h-1 bg-[#3e2723]/10 w-[80%] mx-auto" />
             <p className="text-lg text-[#5d4037]/80 font-bold uppercase tracking-widest italic">{activeDialogue.nearbyDescription}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             {activeDialogue.choices?.map((choice, i) => (
               <button
                 key={i}
                 onClick={() => { handleInteraction(choice.effect); setActiveDialogue(null); }}
                 className="px-10 py-6 rounded-[2rem] bg-[#4caf50] border-b-[10px] border-[#2e7d32] hover:brightness-110 active:border-b-0 active:translate-y-2 text-white font-black text-xl uppercase transition-all shadow-2xl tracking-widest"
               >
                 {choice.label}
               </button>
             ))}
             <button
               onClick={() => setActiveDialogue(null)}
               className="px-10 py-6 rounded-[2rem] bg-[#ef5350] border-b-[10px] border-[#c62828] hover:brightness-110 active:border-b-0 active:translate-y-2 text-white font-black text-xl uppercase transition-all shadow-2xl tracking-widest"
             >
               Return
             </button>
          </div>
        </div>
      )}

      {/* High-End Loading Spinner */}
      {isThinking && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-xl flex items-center justify-center z-[100]">
          <div className="bg-[#4a4a4a] border-[12px] border-[#c5a059] p-12 rounded-[4rem] text-center shadow-[0_0_100px_rgba(212,175,55,0.4)]">
            <div className="w-24 h-24 border-[10px] border-t-[#d4af37] border-white/10 rounded-full animate-spin mx-auto mb-8" />
            <p className="text-white font-black text-3xl uppercase tracking-[0.2em] animate-pulse drop-shadow-lg">Strategic Planning...</p>
          </div>
        </div>
      )}

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-12 text-[14px] text-white/40 font-black uppercase tracking-[0.4em]">
        <span>WASD: NAV</span>
        <span>E: CMD</span>
      </div>
    </div>
  );
};
