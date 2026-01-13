export enum GameState {
  START = 'START',
  ANALYZING_MOOD = 'ANALYZING_MOOD',
  GENERATING_ASSETS = 'GENERATING_ASSETS',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER'
}

export interface Coordinates {
  x: number;
  y: number;
}

export interface DialogueChoice {
  label: string;
  effect: string;
}

export interface GameAssets {
  ground: HTMLImageElement | null;
  wall: HTMLImageElement | null;
  player: HTMLImageElement | null;
  item: HTMLImageElement | null;
  npc: HTMLImageElement | null;
}

export interface GameTheme {
  title: string;
  storyPrelude: string;
  initialObjective: string;
  worldDescription: string;
  colors: {
    primary: string;
    secondary: string;
    text: string;
    background: string;
  };
  assetPrompts: {
    ground: string;
    wall: string;
    player: string;
    item: string;
    npc: string;
  };
}

export interface StoryUpdate {
  narrative: string;
  nearbyDescription: string;
  newObjective: string;
  choices?: DialogueChoice[];
}
