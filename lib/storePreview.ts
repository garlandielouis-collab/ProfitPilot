export function previewFeatureOverrideEnabled(): boolean {
  return process.env.NODE_ENV !== 'production'
    || process.env.NEXT_PUBLIC_ENABLE_STORE_PREVIEW === '1'
    || process.env.ALLOW_STORE_PREVIEW === '1';
}
