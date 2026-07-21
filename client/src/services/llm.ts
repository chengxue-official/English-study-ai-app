import { useConfigStore } from '../store/configStore'
import { cleanMnemonic } from '../utils/text'

interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface LLMResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
}

class LLMService {
  /**
   * 规范化 API URL
   */
  private normalizeChatUrl(url: string): string {
    let u = url.trim()
    u = u.replace(/\/+$/, '')
    if (u.endsWith('/chat/completions')) return u
    return u + '/chat/completions'
  }

  /**
   * 调用大模型 API
   */
  public async callAPI(
    messages: LLMMessage[],
    options: { timeoutMs?: number; temperature?: number } = {}
  ): Promise<string> {
    const { apiKey, apiUrl: rawUrl, model } = useConfigStore.getState().getConfig()
    
    if (!apiKey) {
      throw new Error('未配置 API Key，请在设置中填写')
    }

    const apiUrl = this.normalizeChatUrl(rawUrl || 'https://api.openai.com/v1')
    const timeoutMs = options.timeoutMs || 30000
    const temperature = options.temperature ?? 0.3

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'gpt-3.5-turbo',
          messages,
          temperature,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errText = await response.text()
        let errMsg = `API 请求失败 (${response.status})`
        try {
          const errJson = JSON.parse(errText)
          errMsg = errJson.error?.message || errJson.message || errMsg
        } catch {
          // ignore
        }
        throw new Error(errMsg)
      }

      const data = (await response.json()) as LLMResponse
      return data.choices[0].message.content
    } catch (err: any) {
      clearTimeout(timeoutId)
      if (err.name === 'AbortError') {
        throw new Error(`请求超时（${timeoutMs / 1000}秒），请稍后重试`)
      }
      throw err
    }
  }

  /**
   * 翻译段落
   */
  public async translate(texts: string[]): Promise<string[]> {
    const systemPrompt = `你是一个专业的高中英语翻译助手。你的任务是将英语文章翻译成中文。
翻译要求：
1. 翻译要准确、通顺，符合中文表达习惯。
2. 对于长难句，要拆分翻译，保持语义完整。
3. 对于专有名词，保留英文并在括号内标注中文。
4. **关键要求**：返回一个JSON数组格式，数组中的每个元素必须严格对应输入数组中的每一段。
5. **严禁合并或跳过段落**：即使某一段只是标题、短句、单个单词或字母（如段落编号A, B, C），也必须翻译并占据数组中的对应位置。
6. **长度校验**：输出数组的长度必须【完全等于】输入数组的长度（当前输入长度：${texts.length}）。
7. 只返回JSON数组，不要其他任何内容。`

    // 为了防止LLM混淆，我们在发送时可以给每段加上临时编号，但要求它返回纯翻译数组
    const userPrompt = `待翻译数组（共${texts.length}项）：\n${JSON.stringify(texts)}`
    
    const result = await this.callAPI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ])

    try {
      let parsed: any = null
      // 尝试直接解析
      try {
        parsed = JSON.parse(result)
      } catch {
        // 尝试正则提取数组
        const jsonMatch = result.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0])
        }
      }

      if (Array.isArray(parsed)) {
        if (parsed.length !== texts.length) {
          console.warn(`[LLM] 翻译结果长度不匹配: 输入 ${texts.length}, 输出 ${parsed.length}`)
          // 如果LLM返回的结果少了，我们用空字符串补齐，防止后续逻辑错位
          if (parsed.length < texts.length) {
            const padding = new Array(texts.length - parsed.length).fill('')
            return [...parsed, ...padding].map(String)
          }
          // 如果多了，截断
          return parsed.slice(0, texts.length).map(String)
        }
        return parsed.map(String)
      }
    } catch (err) {
      console.error('[LLM] 翻译解析失败:', err, result)
    }
    throw new Error('翻译结果解析失败，请重试')
  }

  /**
   * 获取单词用法
   */
  public async getWordUsage(word: string): Promise<any> {
    const systemPrompt = `你是一个高中英语教学专家。为给定单词提供常见搭配、短语和用法。
要求：
1. 返回JSON格式，包含以下字段：
   - collocations: 常见搭配数组，每项含{en:英文搭配, zh:中文释义}
   - phrases: 常用短语数组，每项含{en:英文短语, zh:中文释义}
   - usage: 用法要点数组，每项含{point:用法说明, example:例句, translation:例句翻译}
2. 内容聚焦高中英语应试，优先选择高考高频搭配
3. 搭配和短语各3-5个，用法要点2-3个
4. 只返回JSON，不要其他内容`

    const result = await this.callAPI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: word },
    ])

    try {
      return JSON.parse(result)
    } catch {
      const jsonMatch = result.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try { return JSON.parse(jsonMatch[0]) } catch { /* ignore */ }
      }
    }
    throw new Error('用法分析结果解析失败')
  }

  /**
   * 获取语境释义
   */
  public async getWordContext(word: string, sentence: string, translation?: string): Promise<any> {
    const systemPrompt = `你是一个高中英语教学专家。根据单词在句子中的上下文，判断其具体含义和是否属于词组。

要求：
1. 返回JSON格式，包含以下字段：
   - matchedIndex: 整数，该词在此语境下最匹配的释义序号（从0开始，对应词典释义列表的索引）
   - contextMeaning: 字符串，该词在此语境下的简明中文释义（10字以内）
   - phrase: 对象或null，如果该词属于某个词组/搭配，则包含：
     - text: 词组完整文本（如 "a glass of"）
     - meaning: 词组的中文释义
     - words: 数组，词组中每个词的文本（如 ["a", "glass", "of"]）
   如果该词不属于词组，phrase为null
2. 只返回JSON，不要其他内容
3. 判断词组时，向前向后各看2-3个词，识别常见搭配模式`

    const userPrompt = `单词: ${word}
英文句子: ${sentence}
${translation ? `中文翻译: ${translation}` : ''}`

    const result = await this.callAPI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { timeoutMs: 15000 })

    try {
      return JSON.parse(result)
    } catch {
      const jsonMatch = result.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try { return JSON.parse(jsonMatch[0]) } catch { /* ignore */ }
      }
    }
    throw new Error('语境分析结果解析失败')
  }

  /**
   * 扫描熟词生义
   */
  public async scanUncommonMeanings(text: string, translation?: string): Promise<any[]> {
    const systemPrompt = `你是一个高中英语词汇专家。分析给定的英语段落，找出其中"熟词生义"的单词。

"熟词生义"是指：学生已经熟悉该单词的常见含义，但在本文中该词使用了不常见的含义。

例如：
- "address" 常见义"地址"，但本文可能是"处理/解决"
- "strike" 常见义"打击"，但本文可能是"突然想到"
- "observe" 常见义"观察"，但本文可能是"遵守"
- "cover" 常见义"覆盖"，但本文可能是"涉及/讲述"
- "conduct" 常见义"行为"，但本文可能是"进行/实施"

请按以下两步进行：

【第一步：初步识别】
逐词扫描段落，找出所有可能是熟词生义的单词，包括容易忽略的常见词（如cover、work、run等高频词的非常规用法）。

【第二步：自检验证】
对第一步的每个候选词进行二次审查：
1. 该词在本文中的含义是否确实不同于高中学生最熟悉的常见含义？
2. 是否存在遗漏？重新快速扫描段落，检查是否有第一步未识别的熟词生义（尤其是cover、work、run、state、form等高频多义词）。
3. 剔除判断错误的候选词。

输出要求：
1. 只标注经过自检验证的熟词生义，不要标注正常使用的常见义
2. 每个段落最多标注5个最重要的熟词生义
3. 返回JSON数组格式，每项：
   {word: "单词原形", commonMeaning: "常见含义(1-2词)", contextMeaning: "本文含义(1-2词)", reason: "简要说明为什么这是熟词生义"}
4. 如果没有熟词生义，返回空数组 []

只返回JSON数组，不要其他内容。`

    const userContent = translation
      ? `英语段落：\n${text}\n\n中文译文（参考）：\n${translation}`
      : `英语段落：\n${text}`

    const result = await this.callAPI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ])

    try {
      const parsed = JSON.parse(result)
      if (Array.isArray(parsed)) return parsed
    } catch {
      const jsonMatch = result.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])
          if (Array.isArray(parsed)) return parsed
        } catch { /* ignore */ }
      }
    }
    return []
  }

  /**
   * 生成单词助记
   */
  public async getWordMnemonic(word: string): Promise<string> {
    const systemPrompt = `你是一个记忆大师和英语老师。请为给定的英语单词提供生动、有趣、容易记住的助记方法。
要求：
1. 综合使用多种记忆法，如：谐音记忆、词根词缀分析、联想记忆、小故事顺口溜等。
2. 语言要幽默风趣，通俗易懂，特别适合记单词困难的学生。
3. 结构清晰，分点说明。
4. **重要要求**：直接返回纯文本格式，不要使用 Markdown 语法（如不要使用 #, *, ** 等符号）。
5. 每一行内容要简洁明了。`

    const userPrompt = `请为单词 "${word}" 生成助记内容。`

    const result = await this.callAPI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { timeoutMs: 20000 })

    return cleanMnemonic(result)
  }

  /**
   * 扫描词组
   */
  public async scanPhrases(text: string, translation?: string): Promise<any[]> {
    const systemPrompt = `你是一个高中英语词汇专家。分析给定的英语段落，找出其中的动词短语、介词短语、固定搭配等。

要求：
1. 识别段落中的常见短语和固定搭配（如 "look forward to", "in spite of", "take advantage of" 等）。
2. 优先识别高中英语大纲内的核心短语。
3. 返回JSON数组格式，每项：
   {phrase: "短语文本", meaning: "中文释义", type: "短语类型(动词短语/介词短语/固定搭配/形容词短语)"}
4. 如果没有发现词组，返回空数组 []
5. 只返回JSON数组，不要其他内容。`

    const userContent = translation
      ? `英语段落：\n${text}\n\n中文译文（参考）：\n${translation}`
      : `英语段落：\n${text}`

    const result = await this.callAPI([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ])

    try {
      const parsed = JSON.parse(result)
      if (Array.isArray(parsed)) return parsed
    } catch {
      const jsonMatch = result.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])
          if (Array.isArray(parsed)) return parsed
        } catch { /* ignore */ }
      }
    }
    return []
  }
}

export const llmService = new LLMService()