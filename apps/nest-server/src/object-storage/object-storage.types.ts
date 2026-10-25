export const OBJECT_STORAGE_ADAPTER = Symbol('OBJECT_STORAGE_ADAPTER');

export interface ObjectStorageAdapter {
  createUploadUrl(key: string, contentType: string, expiresIn: number): Promise<string>;
  createDownloadUrl(key: string, expiresIn: number): Promise<string>;
}
