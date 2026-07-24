import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

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

    let tempFilePath = "";

    try {
      // 1. 提交任务
      const submitUrl = isWeb ? "/ocr-api/api/v2/ocr/jobs" : this.JOB_URL;
      let responseData;

      if (isWeb) {
        const formData = new FormData();
        formData.append('model', this.MODEL);
        formData.append('optionalPayload', JSON.stringify({
          useDocOrientationClassify: false,
          useDocUnwarping: false,
          useChartRecognition: false
        }));
        formData.append('file', file);

        const response = await fetch(submitUrl, {
          method: 'POST',
          headers: { "Authorization": `Bearer ${this.TOKEN}` },
          body: formData
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`提交失败: ${response.status} ${errorText}`);
        }
        responseData = await response.json();
      } else {
        // Android/iOS: 使用 Filesystem + uploadFile 绕过所有 WebView 限制
        console.log(`[OcrService] 正在准备原生上传...`);
        
        // a. 将 Blob 写入临时文件
        const fileName = `ocr_${Date.now()}.png`;
        const base64Data = await this.blobToBase64(file);
        
        await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Cache
        });
        
        const fileUri = await Filesystem.getUri({
          path: fileName,
          directory: Directory.Cache
        });
        tempFilePath = fileName;

        // b. 使用原生上传
        const response = await (CapacitorHttp as any).uploadFile({
          url: submitUrl,
          filePath: fileUri.uri,
          name: 'file',
          headers: { "Authorization": `Bearer ${this.TOKEN}` },
          params: {
            "model": this.MODEL,
            "optionalPayload": JSON.stringify({
              useDocOrientationClassify: false,
              useDocUnwarping: false,
              useChartRecognition: false
            })
          }
        });

        if (response.status < 200 || response.status >= 300) {
          throw new Error(`原生提交失败: ${response.status} ${JSON.stringify(response.data)}`);
        }
        responseData = response.data;
      }
      
      const jobId = responseData.data.jobId;
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
    } finally {
      // 清理临时文件
      if (tempFilePath) {
        Filesystem.deleteFile({
          path: tempFilePath,
          directory: Directory.Cache
        }).catch(e => console.warn('[OcrService] 临时文件清理失败:', e));
      }
    }
  }

  /**
   * 辅助函数：Blob 转 Base64
   */
  private static async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        // 去掉 data:image/png;base64, 前缀
        resolve(base64String.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}