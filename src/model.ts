export type Point = { x: number; y: number };
export type Stroke = {
  id: string;
  kind: "stroke";
  color: string;
  width: number;
  points: Point[];
};
export type Sticker = {
  id: string;
  kind: "sticker";
  x: number;
  y: number;
  content: string;
  image: boolean;
  url?: string;
};
export type Artwork = (Stroke | Sticker) & {
  authorId: string;
  revision: number;
};
export type NewArtwork = Stroke | Sticker;
export type Light = { id: number; on: boolean; revision: number };
export type Snapshot = {
  items: Artwork[];
  lights: Light[];
  userId: string;
  canUndo: boolean;
};
export const STICKERS = ["✿", "☾", "♡", "✦", "☁", "🌿"];
export const colors = ["#62635e", "#b78376", "#b7a16d", "#799481", "#8297ae"];
export const MAX_IMAGE_BYTES = 1024 * 1024;
export function validateImage(file: File) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("僅支援 PNG、JPEG、WebP。");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("圖片上限 1 MB。");
}
// Decode and re-encode: do not upload arbitrary original bytes or retain EXIF metadata.
export async function prepareImage(file: File): Promise<Blob> {
  validateImage(file);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("無法讀取圖片。");
  }
  try {
    if (bitmap.width > 4096 || bitmap.height > 4096)
      throw new Error("圖片尺寸上限 4096 像素。");
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("無法讀取圖片。");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("無法讀取圖片。")),
        "image/png",
      ),
    );
    if (blob.size > MAX_IMAGE_BYTES) throw new Error("轉換後圖片超過 1 MB。");
    return blob;
  } finally {
    bitmap.close();
  }
}
