export const OBJECT_STORAGE_ADAPTER = Symbol('OBJECT_STORAGE_ADAPTER');

export interface StoredObjectInput {
  key: string;
  body: Buffer;
  size: number;
  contentType: string;
  fileName: string;
}

export interface ObjectStorageAdapter {
  upload(input: StoredObjectInput): Promise<string | undefined>;
  createDownloadUrl(key: string, expiresIn: number): Promise<string>;
}
