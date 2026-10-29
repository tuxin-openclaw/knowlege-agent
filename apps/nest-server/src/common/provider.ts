import { BadRequestException } from '@nestjs/common';

/**
 * 服务商标识：配置的 API 根地址去掉末尾斜杠，不包含凭证、查询参数或片段。
 * 模型价格和调用记录都以这种形式保存，因此页面展示的服务商地址必须能与之对应。
 */
export function providerId(base: string) {
  const url = new URL(base);
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/**
 * 校验用户填写的服务商 API 根地址，并返回规范化后的标识。
 * 只接受不带凭证、查询参数和片段的 HTTP(S) 地址；地址会被拼接到具体接口路径上，
 * 允许这些部分会让请求目标和鉴权变得不可预期。
 */
export function normalizeProviderUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    throw new BadRequestException('请填写服务商 API 根地址');
  try {
    const url = new URL(value.trim());
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
    return providerId(value.trim());
  } catch {
    throw new BadRequestException(
      '服务商地址必须是无凭证和查询参数的 HTTP 地址',
    );
  }
}
