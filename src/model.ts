export type Point = { x: number; y: number };
export type Stroke = { id: string; kind: 'stroke'; color: string; width: number; points: Point[] };
export type Sticker = { id: string; kind: 'sticker'; x: number; y: number; content: string; image: boolean };
export type Artwork = Stroke | Sticker;
export type Board = { version: 1; items: Artwork[] };
export const EMPTY_BOARD: Board = { version: 1, items: [] };
export const MAX_ITEMS = 150;
export const MAX_IMAGE_BYTES = 1024 * 1024;
export const MAX_STORAGE_BYTES = 4 * 1024 * 1024;
export const STICKERS = ['✿', '☾', '♡', '✦', '☁', '🌿'];
const colors = ['#62635e', '#b78376', '#b7a16d', '#799481', '#8297ae'];
export { colors };
const finite = (n: unknown, max: number) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max;
export function isBoard(value: unknown): value is Board {
  if (!value || typeof value !== 'object') return false;
  const board = value as Board;
  return board.version === 1 && Array.isArray(board.items) && board.items.length <= MAX_ITEMS && board.items.every(item => {
    if (!item || typeof item.id !== 'string' || item.id.length > 100) return false;
    if (item.kind === 'stroke') return colors.includes(item.color) && finite(item.width, 20) && Array.isArray(item.points) && item.points.length > 0 && item.points.length <= 3000 && item.points.every(p => p && finite(p.x, 1000) && finite(p.y, 700));
    return item.kind === 'sticker' && finite(item.x, 1000) && finite(item.y, 700) && typeof item.image === 'boolean' && typeof item.content === 'string' && (item.image ? /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(item.content) && item.content.length < MAX_IMAGE_BYTES * 1.4 : STICKERS.includes(item.content));
  });
}
export function validateImage(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('請選擇 PNG、JPEG 或 WebP 圖片。');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('圖片請小於 1 MB。');
}
export async function readImage(file: File): Promise<string> {
  validateImage(file);
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width > 4096 || bitmap.height > 4096) throw new Error('圖片長寬請小於 4096 像素。');
  } finally { bitmap.close(); }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('圖片讀取失敗，請再試一次。'));
    reader.readAsDataURL(file);
  });
}
