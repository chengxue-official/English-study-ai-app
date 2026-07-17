import { CapacitorHttp } from '@capacitor/core';
import { DictEntry } from './database';
import { useConfigStore } from '../store/configStore';

export class YoudaoService {
  private static API_URL = 'https://openapi.youdao.com/v2/dict';

  /**
   * 计算 SHA256 哈希值
   */
  private static async sha256(message: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * 测试有道 API 连接
   */
  public static async testConnection(appKey: string, appSecret: string): Promise<{ success: boolean; message: string }> {
    try {
      const word = 'test';
      const salt = crypto.randomUUID();
      const curtime = Math.floor(Date.now() / 1000).toString();
      const input = word;
      const sign = await this.sha256(appKey + input + salt + curtime + appSecret);

      const params = {
        q: word,
        langType: 'en',
        appKey: appKey,
        salt: salt,
        sign: sign,
        signType: 'v3',
        curtime: curtime,
        dicts: 'ec'
      };

      const response = await CapacitorHttp.get({
        url: this.API_URL,
        params: params
      });

      if (response.status === 200 && response.data && response.data.errorCode === '0') {
        return { success: true, message: '连接成功' };
      } else {
        const errorCode = response.data?.errorCode || 'unknown';
        return { success: false, message: `连接失败: ${this.getErrorMessage(errorCode)} (${errorCode})` };
      }
    } catch (error: any) {
      return { success: false, message: `连接异常: ${error.message || '未知错误'}` };
    }
  }

  /**
   * 从有道官方 API 获取单词详情
   */
  public static async fetchWord(word: string): Promise<DictEntry | null> {
    const { appKey, appSecret } = useConfigStore.getState().getYoudaoConfig();
    
    if (!appKey || !appSecret) {
      console.warn('[YoudaoService] 未配置有道 API Key 或 Secret，回退到简易模式或报错');
      // 如果没有配置官方 API，可以考虑回退到之前的非官方接口，或者提示用户配置
      return this.fetchWordUnofficial(word);
    }

    try {
      const salt = crypto.randomUUID();
      const curtime = Math.floor(Date.now() / 1000).toString();
      const input = word.length <= 20 
        ? word 
        : word.substring(0, 10) + word.length + word.substring(word.length - 10);
      
      const sign = await this.sha256(appKey + input + salt + curtime + appSecret);

      const params = {
        q: word,
        langType: 'en',
        appKey: appKey,
        salt: salt,
        sign: sign,
        signType: 'v3',
        curtime: curtime,
        dicts: 'ec'
      };

      const response = await CapacitorHttp.get({
        url: this.API_URL,
        params: params
      });

      if (response.status !== 200 || !response.data || response.data.errorCode !== '0') {
        const errorCode = response.data?.errorCode;
        const errorMsg = this.getErrorMessage(errorCode);
        console.error(`[YoudaoService] Official API error ${errorCode}: ${errorMsg}`, response.data);
        
        // 如果是鉴权失败或频率限制，可能需要通知用户
        if (['108', '110', '111', '411'].includes(errorCode)) {
          // 这里可以考虑通过某种方式通知 UI 层，或者直接回退
        }
        
        return this.fetchWordUnofficial(word);
      }

      return this.mapOfficialToDictEntry(word, response.data);
    } catch (error) {
      console.error('[YoudaoService] Official Fetch error:', error);
      return this.fetchWordUnofficial(word);
    }
  }

  /**
   * 获取有道 API 错误信息
   */
  private static getErrorMessage(code: string): string {
    const errors: Record<string, string> = {
      '101': '必填参数为空',
      '102': '不支持的语言类型',
      '103': '翻译文本过长',
      '104': '不支持的 API 类型',
      '105': '不支持的签名类型',
      '106': '不支持的响应类型',
      '107': '不支持的传输加密类型',
      '108': 'AppKey 无效',
      '109': 'BatchLog 格式不正确',
      '110': '无相关服务的有效实例',
      '111': '开发者账号无效',
      '112': '请求服务无效',
      '113': '查询参数为空',
      '201': '解密失败',
      '202': '签名检验失败',
      '203': '访问 IP 地址不在可访问列表内',
      '205': '请求的数据库不支持',
      '301': '辞典查询失败',
      '302': '翻译查询失败',
      '303': '服务繁忙',
      '304': '会话已失效',
      '411': '访问频率受限',
      '412': '欠费停机',
    };
    return errors[code] || '未知错误';
  }

  /**
   * 之前的非官方接口作为回退方案
   */
  private static async fetchWordUnofficial(word: string): Promise<DictEntry | null> {
    try {
      const response = await CapacitorHttp.get({
        url: `https://dict.youdao.com/jsonapi?q=${encodeURIComponent(word)}`,
      });

      if (response.status !== 200 || !response.data) {
        return null;
      }

      return this.mapUnofficialToDictEntry(word, response.data);
    } catch (error) {
      console.error('[YoudaoService] Unofficial Fetch error:', error);
      return null;
    }
  }

  private static mapOfficialToDictEntry(word: string, data: any): DictEntry | null {
    // 官方 API 返回的结构中，结果在 result 数组里，通常第一个就是 ec 词典
    const ecResult = data.result?.find((r: any) => r.ec)?.ec || data.result?.[0]?.ec;
    if (!ecResult) return null;

    const wordData = ecResult.word;
    if (!wordData) return null;

    // 提取释义
    const translation = wordData.trs?.map((t: any) => t.tr?.[0]?.l?.i?.[0] || '').filter(Boolean).join('\n') || '';
    
    // 提取音标
    const phonetic = wordData.phonetic || '';
    
    // 提取词性
    const pos = wordData.trs?.[0]?.pos || '';

    // 提取词形变化
    const exchange: Record<string, string[]> = {};
    if (wordData.wfs) {
      wordData.wfs.forEach((wf: any) => {
        const type = wf.wf?.name;
        const value = wf.wf?.value;
        if (type && value) {
          if (!exchange[type]) exchange[type] = [];
          exchange[type].push(value);
        }
      });
    }

    const tags: string[] = [];
    if (wordData.exam_type) {
      tags.push(...wordData.exam_type);
    }

    return {
      word: word,
      phonetic: phonetic ? `/${phonetic}/` : '',
      definition: '',
      translation: translation,
      pos: pos,
      collins: 0,
      oxford: 0,
      tags: tags,
      bnc: null,
      frq: null,
      exchange: exchange,
      source: 'youdao_official',
      speakUrl: data.speakUrl || ''
    };
  }

  private static mapUnofficialToDictEntry(word: string, data: any): DictEntry | null {
    const ec = data.ec?.word;
    const simple = data.simple?.word;
    if (!ec && !simple) return null;

    let translation = '';
    if (ec?.trs) {
      translation = ec.trs.map((t: any) => t.tr?.[0]?.l?.i?.[0] || '').filter(Boolean).join('\n');
    } else if (simple?.trs) {
      translation = simple.trs.map((t: any) => t.tr || '').filter(Boolean).join('\n');
    }

    if (!translation && data.web_trans?.['web-translation']) {
      const webTrans = data.web_trans['web-translation'][0]?.trans;
      if (webTrans) translation = webTrans.map((t: any) => t.value).join('; ');
    }

    if (!translation) return null;

    const phonetic = ec?.phonetic || simple?.phonetic || '';
    const pos = ec?.trs?.[0]?.pos || '';
    const exchange: Record<string, string[]> = {};
    if (ec?.wfs) {
      ec.wfs.forEach((wf: any) => {
        const type = wf.wf?.name;
        const value = wf.wf?.value;
        if (type && value) {
          if (!exchange[type]) exchange[type] = [];
          exchange[type].push(value);
        }
      });
    }

    const tags: string[] = [];
    if (data.collins?.entry?.[0]?.star) tags.push(`Collins ${data.collins.entry[0].star}星`);
    if (data.ec?.exam_type) tags.push(...data.ec.exam_type);

    return {
      word: word,
      phonetic: phonetic ? `/${phonetic}/` : '',
      definition: '',
      translation: translation,
      pos: pos,
      collins: data.collins?.entry?.[0]?.star || 0,
      oxford: 0,
      tags: tags,
      bnc: null,
      frq: null,
      exchange: exchange,
      source: 'youdao',
      speakUrl: `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}`
    };
  }
}