export function publicAssetPath(
  asset: string,
  basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "",
): string {
  const normalizedBasePath = basePath.trim().replace(/^\/+|\/+$/g, "");
  const normalizedAsset = asset.trim().replace(/^\/+/, "");
  return normalizedBasePath
    ? `/${normalizedBasePath}/${normalizedAsset}`
    : `/${normalizedAsset}`;
}
