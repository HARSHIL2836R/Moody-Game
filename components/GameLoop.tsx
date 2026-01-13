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

interface Cloud {
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
}

export const GameLoop: React.FC<GameLoopProps> = ({ assets, theme }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerPos = useRef<Coordinates>({ x: 0, y: 0 }); 
  const keysPressed = useRef<Set<string>>(new Set());
  const lastUpdate = useRef<number>(Date.now());
  const npcs = useRef<NPC[]>([]);
  const clouds = useRef<Cloud[]>([]);
  
  const [activeDialogue, setActiveDialogue] = useState<StoryUpdate | null>(null);
  const [objectivePos, setObjectivePos] = useState<Coordinates | null>(null);
  const [objectiveText, setObjectiveText] = useState<string>(theme.initialObjective);
  const [isThinking, setIsThinking] = useState(false);
  const [history, setHistory] = useState<string[]>([theme.storyPrelude]);
  const [nearbyNpcId, setNearbyNpcId] = useState<number | null>(null);
  const tileOverrides = useRef<Map<string, number>>(new Map());

  // Initialize Clouds
  useEffect(() => {
    const cloudCount = 15;
    const initialClouds: Cloud[] = [];
    for (let i = 0; i < cloudCount; i++) {
      initialClouds.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        size: 150 + Math.random() * 300,
        speed: 20 + Math.random() * 40,
        opacity: 0.1 + Math.random() * 0.2
      });
    }
    clouds.current = initialClouds;
  }, []);

  const getTileType = useCallback((x: number, y: number): number => {
    const key = `${x},${y}`;
    if (tileOverrides.current.has(key)) return tileOverrides.current.get(key)!;
    const sinX = Math.sin(x * 12.9898 + y * 78.233);
    const noise = (Math.sin(sinX * 43758.5453) + 1) / 2;
    if (noise > 0.94) return 1; // Obstacle/Wall
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
      const action = choiceEffect || (nearbyNpcId !== null ? "consulted a local resident about the village expansion." : "visited a key resource location.");
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
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animationId: number;

    const render = () => {
      const now = Date.now();
      const dt = (now - lastUpdate.current) / 1000;
      lastUpdate.current = now;

      // 1. Logic Pass
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

        // Update Clouds
        clouds.current.forEach(c => {
          c.x += c.speed * dt;
          if (c.x > canvas.width + c.size) c.x = -c.size;
        });

        let foundNpc: number | null = null;
        npcs.current.forEach(npc => {
          if (Math.sqrt(Math.pow(npc.pos.x - playerPos.current.x, 2) + Math.pow(npc.pos.y - playerPos.current.y, 2)) < INTERACTION_RANGE) foundNpc = npc.id;
        });
        setNearbyNpcId(foundNpc);
      }

      // 2. Render Pass
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // --- LAYER 0: Animated Aether Background ---
      const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, canvas.width * 0.8);
      grad.addColorStop(0, theme.colors.background || "#1e3a1e");
      grad.addColorStop(1, "#0a0f0a");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw Background Clouds (Mist)
      ctx.globalCompositeOperation = 'screen';
      clouds.current.forEach(c => {
        const cGrad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.size);
        cGrad.addColorStop(0, `rgba(255, 255, 255, ${c.opacity})`);
        cGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = cGrad;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';

      // Coordinate converter
      const toScreenX = (x: number, y: number) => centerX + (x - playerPos.current.x - (y - playerPos.current.y)) * (TILE_WIDTH / 2);
      const toScreenY = (x: number, y: number) => centerY + (x - playerPos.current.x + (y - playerPos.current.y)) * (TILE_HEIGHT / 2);

      // --- LAYER 1: Ground Tiles ---
      const range = 12;
      const startX = Math.floor(playerPos.current.x - range);
      const endX = Math.ceil(playerPos.current.x + range);
      const startY = Math.floor(playerPos.current.y - range);
      const endY = Math.ceil(playerPos.current.y + range);

      for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
          const drawX = toScreenX(x, y);
          const drawY = toScreenY(x, y);
          
          if (assets.ground) {
            // Subtle "Breathing" ground animation for magical feel
            const hover = Math.sin(now / 1000 + (x + y) * 0.5) * 2;
            ctx.drawImage(assets.ground, drawX - TILE_WIDTH / 2 - 1, drawY - TILE_HEIGHT / 2 - 1 + hover, TILE_WIDTH + 2, TILE_HEIGHT + 2);
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

      // --- LAYER 2: Depth Sorted Objects ---
      const drawables: Drawable[] = [
        { type: 'player', x: playerPos.current.x, y: playerPos.current.y, img: assets.player }
      ];
      npcs.current.forEach(n => drawables.push({ type: 'npc', x: n.pos.x, y: n.pos.y, id: n.id, img: assets.npc }));
      
      for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
          const type = getTileType(x, y);
          if (type === 1) drawables.push({ type: 'wall', x, y, img: assets.wall });
          if (type === 2) drawables.push({ type: 'item', x, y, img: assets.item });
        }
      }

      drawables.sort((a, b) => (a.x + a.y) - (b.x + b.y));

      drawables.forEach(d => {
        const dX = toScreenX(d.x, d.y);
        const dY = toScreenY(d.x, d.y);

        // Ground-matching shadow
        if (d.type !== 'wall') {
          ctx.fillStyle = "rgba(0,0,0,0.3)";
          ctx.beginPath();
          ctx.ellipse(dX, dY + 5, 30, 15, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        // Bouncy character movement
        let bob = 0;
        if (d.type === 'player' && keysPressed.current.size > 0) {
          bob = -Math.abs(Math.sin(now / 150)) * 15;
        } else if (d.type === 'npc') {
          const n = npcs.current.find(npc => npc.id === d.id);
          if (n?.state === 'walking') {
            bob = -Math.abs(Math.sin(now / 150 + (d.id || 0))) * 12;
          } else {
            bob = Math.sin(now / 400 + (d.id || 0)) * 4; 
          }
        } else if (d.type === 'item') {
          bob = Math.sin(now / 600) * 10; 
        }

        if (d.img) {
          const size = d.type === 'player' ? 120 : (d.type === 'wall' ? 160 : 90);
          const offsetY = d.type === 'wall' ? -size * 0.75 : -size * 0.9;
          ctx.drawImage(d.img, dX - size/2, dY + offsetY + bob, size, size);
        } else {
          ctx.fillStyle = d.type === 'player' ? "#ffcc00" : "#ffffff";
          ctx.beginPath(); ctx.arc(dX, dY - 30 + bob, 20, 0, Math.PI*2); ctx.fill();
        }
      });

      // --- LAYER 3: Aether Particle Overlay ---
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 20; i++) {
        const px = (Math.sin(now / 2000 + i) * 0.5 + 0.5) * canvas.width;
        const py = (Math.cos(now / 3000 + i * 1.5) * 0.5 + 0.5) * canvas.height;
        const pSize = 1 + Math.sin(now / 500 + i) * 1;
        ctx.fillStyle = theme.colors.primary || "#d4af37";
        ctx.beginPath();
        ctx.arc(px, py, pSize, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

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
    <div className="relative w-full h-full overflow-hidden select-none bg-black font-['Luckiest_Guy']">
      <canvas ref={canvasRef} className="block w-full h-full" />
      
      {/* Thick Gold HUD */}
      <div className="absolute top-8 left-8 flex flex-col gap-4">
        <div className="bg-[#4a4a4a] border-[8px] border-[#c5a059] rounded-[2.5rem] p-8 shadow-[0_15px_40px_rgba(0,0,0,0.7)] min-w-[340px] relative">
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none rounded-[2rem]" />
          <h2 className="text-[14px] uppercase tracking-[0.3em] text-[#d4af37] mb-2 drop-shadow-md">Village Goal</h2>
          <p className="text-white text-3xl leading-none drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] tracking-wide uppercase">
            {objectiveText}
          </p>
        </div>
        
        <div className="w-full h-8 bg-black/60 rounded-full border-4 border-[#c5a059] overflow-hidden shadow-inner p-1">
           <div className="h-full bg-gradient-to-r from-[#d4af37] via-[#f4d03f] to-[#d4af37] w-[80%] rounded-full shadow-[0_0_15px_#f4d03f]" />
        </div>
      </div>

      {/* Strategic Navigator */}
      <div className="absolute bottom-12 right-12">
        <div className="w-32 h-32 rounded-full bg-[#4a4a4a] border-[10px] border-[#c5a059] shadow-[0_10px_40px_rgba(0,0,0,0.8)] flex items-center justify-center relative">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-black/40 rounded-full" />
          <div className="text-white font-bold text-[12px] uppercase opacity-40">Tactical</div>
          {objectivePos && (
             <div 
               className="w-3 h-14 bg-gradient-to-t from-[#d4af37] via-white to-[#d4af37] rounded-full absolute transition-transform duration-150"
               style={{ 
                 transform: `rotate(${Math.atan2(objectivePos.y - playerPos.current.y, objectivePos.x - playerPos.current.x) * (180 / Math.PI) + 45}deg)`,
                 boxShadow: '0 0 20px rgba(212,175,55,1)'
                }}
             />
          )}
        </div>
      </div>

      {/* Interaction Prompt */}
      {(nearbyNpcId !== null || (objectivePos && Math.sqrt(Math.pow(objectivePos.x - playerPos.current.x, 2) + Math.pow(objectivePos.y - playerPos.current.y, 2)) < INTERACTION_RANGE)) && !activeDialogue && !isThinking && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-48 text-center pointer-events-none">
          <div className="bg-[#4a4a4a] border-[8px] border-white/90 px-10 py-4 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.8)] animate-bounce">
            <p className="text-white text-3xl tracking-widest uppercase flex items-center gap-4">
              <span className="w-10 h-10 rounded-full bg-white text-[#4a4a4a] flex items-center justify-center text-lg font-black">E</span>
              Action
            </p>
          </div>
        </div>
      )}

      {/* Strategy Dialogue Panel */}
      {activeDialogue && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[90%] max-w-4xl bg-[#f5e6c8] border-[12px] border-[#5d4037] rounded-[4rem] shadow-[0_30px_100px_rgba(0,0,0,0.9)] p-14 flex flex-col gap-10">
          <div className="space-y-6 text-center">
             <div className="bg-[#5d4037] w-fit px-12 py-3 rounded-full text-[#f4d03f] font-bold text-xl uppercase tracking-widest -mt-24 mx-auto shadow-2xl border-4 border-[#c5a059]">Council</div>
             <p className="text-4xl text-[#3e2723] font-black leading-tight drop-shadow-md uppercase italic">"{activeDialogue.narrative}"</p>
             <div className="h-1.5 bg-[#3e2723]/20 w-[60%] mx-auto rounded-full" />
             <p className="text-xl text-[#5d4037]/90 font-bold uppercase tracking-[0.2em]">{activeDialogue.nearbyDescription}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             {activeDialogue.choices?.map((choice, i) => (
               <button
                 key={i}
                 onClick={() => { handleInteraction(choice.effect); setActiveDialogue(null); }}
                 className="px-12 py-7 rounded-[2.5rem] bg-[#4caf50] border-b-[12px] border-[#2e7d32] hover:brightness-110 active:border-b-0 active:translate-y-3 text-white font-black text-2xl uppercase transition-all shadow-2xl tracking-widest"
               >
                 {choice.label}
               </button>
             ))}
             <button
               onClick={() => setActiveDialogue(null)}
               className="px-12 py-7 rounded-[2.5rem] bg-[#ef5350] border-b-[12px] border-[#c62828] hover:brightness-110 active:border-b-0 active:translate-y-3 text-white font-black text-2xl uppercase transition-all shadow-2xl tracking-widest"
             >
               Close
             </button>
          </div>
        </div>
      )}

      {/* Strategy Loading Layer */}
      {isThinking && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-2xl flex items-center justify-center z-[200]">
          <div className="bg-[#4a4a4a] border-[14px] border-[#c5a059] p-16 rounded-[5rem] text-center shadow-[0_0_120px_rgba(212,175,55,0.5)]">
            <div className="w-32 h-32 border-[12px] border-t-[#d4af37] border-white/10 rounded-full animate-spin mx-auto mb-10" />
            <p className="text-white font-black text-4xl uppercase tracking-[0.3em] animate-pulse drop-shadow-2xl">Generating Strategy...</p>
          </div>
        </div>
      )}
    </div>
  );
};
