import type { ImageInput } from "../shared/schema";

export const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const maxImageSize = 5 * 1024 * 1024;
export const maxImageCount = 10;

export type FileLike = {
  name: string;
  type: string;
  size: number;
};

export function validateImageFile(file: FileLike) {
  if (!allowedImageTypes.includes(file.type as (typeof allowedImageTypes)[number])) {
    return "仅支持 JPEG、PNG 或 WebP 图片。";
  }
  if (file.size > maxImageSize) {
    return "单张图片不能超过 5MB。";
  }
  return "";
}

export async function fileToImageInput(file: File): Promise<ImageInput> {
  const error = validateImageFile(file);
  if (error) throw new Error(error);

  const data = await readAsDataUrl(file);
  return {
    name: file.name,
    mimeType: file.type as ImageInput["mimeType"],
    size: file.size,
    data
  };
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("图片读取失败。"));
    reader.readAsDataURL(file);
  });
}
