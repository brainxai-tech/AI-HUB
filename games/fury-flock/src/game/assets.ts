export function resolveAssetUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${path.replace(/^\/+/, '')}`;
}

export const assetUrl = (path: string): string => resolveAssetUrl(import.meta.env.BASE_URL, path);
