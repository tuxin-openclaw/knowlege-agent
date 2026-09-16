/**
 * 输出带分隔线的章节标题。
 */
export function printSection(title, width = 80) {
  const separator = "=".repeat(width);
  console.log(separator);
  console.log(title);
  console.log(separator);
}
