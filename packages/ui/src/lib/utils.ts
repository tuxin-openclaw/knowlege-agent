import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** 合并 Tailwind 类名：clsx 处理条件拼接，tailwind-merge 处理同类冲突（后者覆盖前者）。 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
