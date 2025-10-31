export enum Tab {
  Game = 'game',
  ImageEditor = 'image-editor',
  LiveChat = 'live-chat',
}

export enum LevelType {
  Scramble = 'scramble',
  CompleteSentence = 'complete_sentence',
}

export interface ScrambleLevel {
  id: number;
  type: LevelType.Scramble;
  word: string;
  scrambled: string;
  hint: string;
}

export interface CompleteSentenceLevel {
  id: number;
  type: LevelType.CompleteSentence;
  sentenceParts: [string, string];
  answer: string;
  hint: string;
}

export type GameLevel = ScrambleLevel | CompleteSentenceLevel;


export interface TranscriptionEntry {
  speaker: 'user' | 'model';
  text: string;
}
