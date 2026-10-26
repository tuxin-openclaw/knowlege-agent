export const OBJECT_STORAGE_ADAPTER = Symbol('OBJECT_STORAGE_ADAPTER');

export interface ObjectStorageAdapter {
  createUploadUrl(
    key: string,
    contentType: string,
    expiresIn: number,
  ): Promise<string>;
  createDownloadUrl(key: string, expiresIn: number): Promise<string>;
  createPreviewUrl(key: string, expiresIn: number): Promise<string>;
  readImage(key: string): Promise<{ bytes: Uint8Array; contentType: string }>;
  saveImage(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  deleteImage(key: string): Promise<void>;
}
