import { Capacitor } from '@capacitor/core';

export class OcrService {
  private static JOB_URL = "https://paddleocr.aistudio-app.com/api/v2/ocr/jobs";
  private static TOKEN = "9658a109a67edf61a60b83b282de50e44bbd05ba";
  private static MODEL = "PaddleOCR-VL-1.6";

  /**
   * 识别图片中的文字
   */
  public static async recognize(file: File | Blob): Promise<string> {
    const isWeb = Capacitor.getPlatform() === 'web';
    console.log(`[OcrService] 开始识别, 平台: ${Capacitor.getPlatform()}`);

    try {
      // 1. 提交任务
      const submitUrl = isWeb ? "/ocr-api/api/v2/ocr/jobs" : this.JOB_URL;
      
      const formData = new FormData();
      formData.append('model', this.MODEL);
      formData.append('optionalPayload', JSON.stringify({
        useDocOrientationClassify: false,
        useDocUnwarping: false,
        useChartRecognition: false
      }));
      formData.append('file', file);

      console.log(`[OcrService] 正在提交任务到: ${submitUrl}`);
      
      const response = await fetch(submitUrl, {
        method: 'POST',
        headers: { "Authorization": `bearer ${this.TOKEN}` },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`提交失败: ${response.status} ${errorText}`);
      }
      
      const jobData = await response.json();
      const jobId = jobData.data.jobId;
      console.log(`[OcrService] 任务提交成功, jobId: ${jobId}`);

      // 2. 轮询状态
      let jsonlUrl = "";
      let attempts = 0;
      const maxAttempts = 30;

      while (attempts < maxAttempts) {
        attempts++;
        const statusUrl = isWeb ? `/ocr-api/api/v2/ocr/jobs/${jobId}` : `${this.JOB_URL}/${jobId}`;
        
        const statusResponse = await fetch(statusUrl, {
          headers: { "Authorization": `bearer ${this.TOKEN}` }
        });

        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          const state = statusData.data.state;
          console.log(`[OcrService] 轮询状态 (${attempts}): ${state}`);
          
          if (state === 'done') {
            jsonlUrl = statusData.data.resultUrl.jsonUrl;
            break;
          } else if (state === 'failed') {
            throw new Error(`任务失败: ${statusData.data.errorMsg}`);
          }
        } else {
          console.warn(`[OcrService] 轮询请求失败: ${statusResponse.status}`);
        }

        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      if (!jsonlUrl) throw new Error('识别超时');

      // 3. 获取结果
      console.log(`[OcrService] 正在获取结果: ${jsonlUrl}`);
      
      // Web 端尝试通过代理
      const finalResultUrl = isWeb ? jsonlUrl.replace(/https:\/\/.*\.aistudio-app\.com/, "/ocr-api") : jsonlUrl;
      const resultResponse = await fetch(finalResultUrl);
      
      if (!resultResponse.ok) {
        throw new Error(`获取结果失败: ${resultResponse.status}`);
      }
      
      const resultText = await resultResponse.text();

      // 4. 解析 JSONL
      const lines = resultText.trim().split('\n');
      let markdown = "";
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.result && data.result.layoutParsingResults) {
            for (const res of data.result.layoutParsingResults) {
              markdown += res.markdown.text + "\n\n";
            }
          }
        } catch (e) { /* 忽略解析失败的行 */ }
      }

      // 5. 清理 Markdown
      return markdown
        .replace(/(\*\*|__)(.*?)\1/g, '$2')
        .replace(/(\*|_)(.*?)\1/g, '$2')
        .replace(/~~(.*?)~~/g, '$1')
        .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .replace(/^#+\s+(.*)$/gm, '$1')
        .replace(/^\s*[-*+]\s+(.*)$/gm, '$1')
        .replace(/^\s*\d+\.\s+(.*)$/gm, '$1')
        .replace(/^\s*>\s+(.*)$/gm, '$1')
        .trim();

    } catch (err) {
      console.error('[OcrService] 识别过程出错:', err);
      throw err instanceof Error ? err : new Error('OCR 识别失败');
    }
  }
}