import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

/** 密文版本号：格式变化时用它区分历史数据。 */
const VERSION = 'v1';

/**
 * 由 MODEL_CONFIG_SECRET 派生 32 字节 AES 密钥。
 * 同一把密钥必须保持不变，否则页面上已保存的模型 API Key 将无法解密。
 */
export function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

/**
 * 用 AES-256-GCM 加密模型 API Key。
 * 每次加密使用随机 IV，输出 `v1:iv:tag:密文`（各段 base64url），可直接存库；
 * GCM 的认证标签能在解密时发现密文被篡改。
 */
export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    data.toString('base64url'),
  ].join(':');
}

/**
 * 解密模型 API Key。
 * 密钥不匹配或密文被篡改时抛出错误，由调用方转换成不含细节的用户提示，
 * 避免把密文或密钥信息写进日志和接口响应。
 */
export function decryptSecret(payload: string, key: Buffer): string {
  const [version, iv, tag, data] = payload.split(':');
  if (version !== VERSION || !iv || !tag || !data)
    throw new Error('unsupported secret format');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
