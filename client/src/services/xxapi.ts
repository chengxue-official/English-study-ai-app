import { CapacitorHttp } from '@capacitor/core';
import { DictEntry } from './database';

export class XxApiService {
  private static API_URL = 'https://v2.xxapi.cn/api/englishwords?word=';

  /**
   * 从 xxapi 获取单词详情
   */
  public static async fetchWord(word: string): Promise<DictEntry | null> {
    try {
      const response = await CapacitorHttp.get({
        url: `${this.API_URL}${encodeURIComponent(word)}`,
      });

      if (response.status !== 200 || !response.data || response.data.code !== 200 || !response.data.data) {
        return null;
      }

      return this.mapToDictEntry(word, response.data.data);
    } catch (error) {
      console.error('[XxApiService] Fetch error:', error);
      return null;
    }
  }

  private static mapToDictEntry(word: string, data: any): DictEntry | null {
    if (!data) return null;

    // 提取音标 (优先英音)
    const phonetic = data.ukphone || data.usphone || '';

    // 提取发音URL (优先英音)
    const speakUrl = data.ukspeech || data.usspeech || '';

    // 提取释义和词性
    let translation = '';
    let pos = '';
    if (data.translations && Array.isArray(data.translations) && data.translations.length > 0) {
      pos = data.translations[0].pos || '';
      translation = data.translations.map((t: any) => {
        return `${t.pos ? t.pos + '. ' : ''}${t.tran_cn || ''}`;
      }).join('\n');
    }

    // 提取例句
    const sentences = data.sentences ? data.sentences.map((s: any) => ({
      en: s.s_content,
      zh: s.s_cn
    })) : [];

    // 提取近义词
    const synonyms = data.synonyms ? data.synonyms.map((s: any) => ({
      pos: s.pos,
      tran: s.tran,
      words: s.Hwds ? s.Hwds.map((h: any) => h.word) : []
    })) : [];

    // 提取短语
    const phrases = data.phrases ? data.phrases.map((p: any) => ({
      en: p.p_content,
      zh: p.p_cn
    })) : [];

    return {
      word: data.word || word,
      phonetic: phonetic,
      definition: '',
      translation: translation,
      pos: pos,
      collins: 0,
      oxford: 0,
      tags: [],
      bnc: null,
      frq: null,
      exchange: {},
      source: 'xxapi',
      speakUrl: speakUrl,
      ukphone: data.ukphone,
      usphone: data.usphone,
      ukspeech: data.ukspeech,
      usspeech: data.usspeech,
      sentences: sentences,
      synonyms: synonyms,
      phrases: phrases
    };
  }
}