/**
 * 清洗助记内容，去除 Markdown 符号和不明字符
 */
export function cleanMnemonic(text: string): string {
  if (!text) return ''
  return text
    .replace(/[#*`~]/g, '') // 去除 # * ` ~ 等 Markdown 符号
    .replace(/\[|\]/g, '') // 去除 [ ]
    .replace(/\n{3,}/g, '\n\n') // 将连续三个及以上的换行符替换为两个
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .trim()
}