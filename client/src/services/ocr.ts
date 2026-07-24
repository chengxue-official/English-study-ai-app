import { Capacitor } from '@capacitor/core';

export class OcrService {
  private static JOB_URL_BASE = Capacitor.getPlatform() === 'web' 
    ? "/ocr-api/api/v2/ocr/jobs" 
    : "https://paddleocr.aistudio-app.com/api/v2/ocr/jobs";
  
  private static TOKEN = "9658a109a67edf61a60b83b282de50e44bbd05ba";
  private static MODEL = "PaddleOCR-VL-1.6";

  /**
   * 识别图片中的文字
   */
  public static async recognize(file: File | Blob): Promise<string> {
    const JOB_URL = this.JOB_URL_BASE;
    try {
      console.log(`[OcrService] 平台: ${Capacitor.getPlatform()}, 提交任务: ${file instanceof File ? file.name : 'blob'}`);
      console.log(`[OcrService] 正在发送请求到: ${JOB_URL}`);
      
      const formData = new FormData();
      formData.append('model', this.MODEL);
      formData.append('optionalPayload', JSON.stringify({
        useDocOrientationClassify: false,
        useDocUnwarping: false,
        useChartRecognition: false
      }));
      formData.append('file', file);

      const headers = {
        "Authorization": `bearer ${this.TOKEN}`
      };

      // 提交任务
      const jobResponse = await fetch(JOB_URL, {
        method: 'POST',
        headers,
        body: formData
      });

      if (!jobResponse.ok) {
        const text = await jobResponse.text();
        console.error(`[OcrService] 提交任务失败, status: ${jobResponse.status}, response: ${text}`);
        throw new Error(`提交任务失败: ${text}`);
      }

      const jobData = await jobResponse.json();
      const jobId = jobData.data.jobId;
      console.log(`[OcrService] 任务提交成功, jobId: ${jobId}`);

      // 轮询状态
      let jsonlUrl = "";
      let attempts = 0;
      const maxAttempts = 20; // 最多等待 60 秒 (20 * 3s)

      while (attempts < maxAttempts) {
        const statusResponse = await fetch(`${JOB_URL}/${jobId}`, { headers });
        if (!statusResponse.ok) throw new Error('查询状态失败');
        
        const statusData = await statusResponse.json();
        const state = statusData.data.state;
        
        if (state === 'done') {
          jsonlUrl = statusData.data.resultUrl.jsonUrl;
          console.log(`[OcrService] 任务完成`);
          break;
        } else if (state === 'failed') {
          throw new Error(`任务失败: ${statusData.data.errorMsg}`);
        }
        
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      if (!jsonlUrl) {
        throw new Error('识别超时，请稍后重试');
      }

      // 获取结果
      let finalJsonlUrl = jsonlUrl;
      if (Capacitor.getPlatform() === 'web' && finalJsonlUrl.startsWith('https://paddleocr.aistudio-app.com')) {
        finalJsonlUrl = finalJsonlUrl.replace('https://paddleocr.aistudio-app.com', '/ocr-api');
      }
      
      const jsonlResponse = await fetch(finalJsonlUrl);
      if (!jsonlResponse.ok) throw new Error('获取结果失败');
      
      const jsonlText = await jsonlResponse.text();
      const lines = jsonlText.trim().split('\n');
      
      let markdownText = "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const result = JSON.parse(line).result;
          if (result && result.layoutParsingResults) {
            for (const res of result.layoutParsingResults) {
              markdownText += res.markdown.text + "\n\n";
            }
          }
        } catch (e) {
          console.warn('[OcrService] 解析行失败:', line);
        }
      }

      // 过滤 Markdown 字符
      const plainText = markdownText
        .replace(/(\*\*|__)(.*?)\1/g, '$2') // 粗体
        .replace(/(\*|_)(.*?)\1/g, '$2') // 斜体
        .replace(/~~(.*?)~~/g, '$1') // 删除线
        .replace(/`{1,3}([^`]+)`{1,3}/g, '$1') // 代码块
        .replace(/\[(.*?)\]\(.*?\)/g, '$1') // 链接
        .replace(/^#+\s+(.*)$/gm, '$1') // 标题
        .replace(/^\s*[-*+]\s+(.*)$/gm, '$1') // 无序列表
        .replace(/^\s*\d+\.\s+(.*)$/gm, '$1') // 有序列表
        .replace(/^\s*>\s+(.*)$/gm, '$1') // 引用
        .trim();

      return plainText;
    } catch (err) {
      console.error('[OcrService] 错误:', err);
      throw err instanceof Error ? err : new Error('OCR 识别失败');
    }
  }
}