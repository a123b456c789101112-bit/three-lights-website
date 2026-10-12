import { EMPTY_BOARD, isBoard, MAX_STORAGE_BYTES, type Board, type Artwork } from './model';
// Implement this boundary with a trusted API for shared mode; never equate local storage with sync.
export interface SharedBoardRepository {
  load(boardId: string): Promise<Board>;
  subscribe(boardId: string, onChange: (board: Board) => void): () => void;
  create(boardId: string, item: Artwork): Promise<void>;
  moveSticker(boardId: string, itemId: string, x: number, y: number): Promise<void>;
  remove(boardId: string, itemId: string): Promise<void>;
  report(boardId: string, itemId: string, reason: string): Promise<void>;
}
const KEY = 'three-lights:board:v1';
export function loadLocalBoard(): Board {
  const raw = localStorage.getItem(KEY);
  if (!raw) return { ...EMPTY_BOARD, items: [] };
  const value: unknown = JSON.parse(raw);
  if (!isBoard(value)) throw new Error('本機畫布資料格式無效；原始資料未被覆寫。');
  return value;
}
export function saveLocalBoard(board: Board) {
  if (!isBoard(board)) throw new Error('畫布資料無效。');
  const raw = JSON.stringify(board);
  if (new Blob([raw]).size > MAX_STORAGE_BYTES) throw new Error('本機空間已滿，請移除部分作品再試一次。');
  localStorage.setItem(KEY, raw);
}
