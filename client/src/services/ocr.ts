import { Capacitor } from '@capacitor/core';

export class OcrService {
  private static JOB_URL = "https://paddleocr.aistudio-app.com/api/v2/ocr/jobs";
  private static TOKEN = "9658a109a67edf61a60b83b282de50e44bbd05ba";
  private static MODEL = "PaddleOCR-VL-1.6";

  /**
   * 识别图片中的文字
   */
  public static async recognize(file: File | Blob): Promise<string> {
    const platform = Capacitor.getPlatform();
    const isWeb = platform === 'web';
    console.log(`[OcrService] 开始识别, 平台: ${platform}`);

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
      
      const headers: any = { 
        "Authorization": `Bearer ${this.TOKEN}`
      };

      // Android 端通过原生 Fetch 伪造请求头
      if (!isWeb) {
        headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
        headers["Origin"] = "https://paddleocr.aistudio-app.com";
        headers["Referer"] = "https://paddleocr.aistudio-app.com/";
      }

      console.log(`[OcrService] 请求头:`, JSON.stringify(headers));

      const response = await fetch(submitUrl, {
        method: 'POST',
        headers: headers,
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMsg = errorText;
        try {
          const errorJson = JSON.parse(errorText);
          errorMsg = errorJson.msg || errorJson.message || errorText;
        } catch (e) {}
        console.error(`[OcrService] 提交失败: 状态码=${response.status}, 详情=${errorText}`);
        throw new Error(`提交失败: ${response.status} ${errorMsg}`);
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
          headers: { "Authorization": `Bearer ${this.TOKEN}` }
        });

        if (!statusResponse.ok) {
          const errorText = await statusResponse.text();
          console.error(`[OcrService] 轮询请求失败: 状态码=${statusResponse.status}, 响应体=${errorText}`);
        } else {
          const statusData = await statusResponse.json();
          const state = statusData.data.state;
          console.log(`[OcrService] 轮询状态 (${attempts}): ${state}`);
          
          if (state === 'done') {
            jsonlUrl = statusData.data.resultUrl.jsonUrl;
            break;
          } else if (state === 'failed') {
            throw new Error(`任务失败: ${statusData.data.errorMsg}`);
          }
        }

        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      if (!jsonlUrl) throw new Error('识别超时');

      // 3. 获取结果
      console.log(`[OcrService] 正在获取结果: ${jsonlUrl}`);
      
      let finalResultUrl = jsonlUrl;
      if (isWeb) {
        if (jsonlUrl.includes('aistudio-app.com')) {
          finalResultUrl = jsonlUrl.replace(/https:\/\/.*\.aistudio-app\.com/, "/ocr-api");
        } else if (jsonlUrl.includes('bcebos.com')) {
          finalResultUrl = jsonlUrl.replace(/https:\/\/.*\.bcebos\.com/, "/ocr-storage");
        }
        console.log(`[OcrService] Web 代理转换: ${jsonlUrl} -> ${finalResultUrl}`);
      }
      
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
      const errorInfo = err instanceof Error ? { message: err.message, stack: err.stack } : { message: String(err) };
      console.error('[OcrService] 识别过程出错:', JSON.stringify(errorInfo));
      throw err instanceof Error ? err : new Error('OCR 识别失败');
    }
  }
}