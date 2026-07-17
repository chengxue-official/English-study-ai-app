// 全局缓存：预加载的语音列表 + 上一个Audio对象（用于停止重复播放）
let cachedVoices: SpeechSynthesisVoice[] = []
let lastAudio: HTMLAudioElement | null = null

// 模块加载时预加载voices（解决移动端首次getVoices返回空数组的问题）
if (typeof window !== 'undefined' && window.speechSynthesis) {
  cachedVoices = window.speechSynthesis.getVoices()
  if (cachedVoices.length === 0) {
    window.speechSynthesis.addEventListener('voiceschanged', () => {
      cachedVoices = window.speechSynthesis.getVoices()
    })
  }
}

/** 停止当前正在播放的音频和TTS */
export function stopSpeaking() {
  if (lastAudio) { lastAudio.pause(); lastAudio.currentTime = 0; lastAudio = null }
  if (window.speechSynthesis) window.speechSynthesis.cancel()
}

/**
 * 朗读单词 - 移动端兼容版
 * 优先使用提供的 URL 或在线真人发音（有道词典API），失败回退Web Speech API TTS
 */
export function speakWord(word: string, url?: string) {
  console.log('[发音] 开始:', word, '| URL:', url, '| speechSynthesis可用:', !!window.speechSynthesis)

  // 停止上一次播放
  if (lastAudio) { lastAudio.pause(); lastAudio.currentTime = 0; lastAudio = null }
  if (window.speechSynthesis) window.speechSynthesis.cancel()

  // 1. 优先：使用提供的 URL (如果有)
  if (url) {
    try {
      const audio = new Audio(url)
      lastAudio = audio
      audio.play().then(() => {
        console.log('[发音] 指定 URL 发音成功')
      }).catch((e) => {
        console.log('[发音] 指定 URL 发音失败:', e?.message || e, '→ 回退默认在线发音')
        lastAudio = null
        speakDefaultOnline(word)
      })
      return
    } catch (e) {
      console.log('[发音] 指定 URL Audio 创建异常:', e, '→ 回退默认在线发音')
    }
  }

  speakDefaultOnline(word)
}

/** 默认在线发音逻辑 */
function speakDefaultOnline(word: string) {
  try {
    const audioUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=2`
    const audio = new Audio(audioUrl)
    lastAudio = audio
    audio.play().then(() => {
      console.log('[发音] 默认在线真人发音成功')
    }).catch((e) => {
      console.log('[发音] 默认在线发音失败:', e?.message || e, '→ 回退TTS')
      lastAudio = null
      speakWithTTS(word)
    })
  } catch (e) {
    console.log('[发音] 默认在线 Audio 创建异常:', e, '→ 回退TTS')
    speakWithTTS(word)
  }
}

/** Web Speech API TTS回退方案 - 同步调用保持用户手势链 */
function speakWithTTS(word: string) {
  if (!window.speechSynthesis) {
    console.log('[发音] speechSynthesis不可用，无法发音')
    return
  }
  const utterance = new SpeechSynthesisUtterance(word)
  utterance.lang = 'en-US'
  utterance.rate = 0.85
  utterance.pitch = 1

  // 使用预加载的voices（同步调用，不破坏iOS用户手势链）
  if (cachedVoices.length > 0) {
    const enVoice = cachedVoices.find(v => v.lang.startsWith('en-US'))
      || cachedVoices.find(v => v.lang.startsWith('en'))
    if (enVoice) {
      utterance.voice = enVoice
      console.log('[发音] TTS使用voice:', enVoice.name)
    }
  }
  window.speechSynthesis.speak(utterance)
  console.log('[发音] TTS已调用')
}