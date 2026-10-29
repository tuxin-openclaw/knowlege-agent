import { BadRequestException } from '@nestjs/common';

/** 单价必须是 0 到 10^16 之间、最多 8 位小数的十进制数，避免浮点误差和 numeric 溢出。 */
const PRICE = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,8})?$/;

/**
 * 校验页面提交的单价，返回可直接写入 numeric 列的字符串。
 * 空值表示“未配置”，此时不估算成本，而不是按 0 计算；没有价格就给出的成本结论会更糟。
 */
export function parsePriceValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (!PRICE.test(text))
    throw new BadRequestException('价格必须是非负数，最多保留 8 位小数');
  return text;
}
