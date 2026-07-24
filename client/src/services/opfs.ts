import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'

export async function downloadToOPFS(url: string, filename: string, onProgress?: (progress: number) => void): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try {
      console.log(`[Download] Native download starting: ${url}`);
      // 原生平台使用 Filesystem.downloadFile (如果可用) 或者 fetch + writeFile
      // 注意：@capacitor/filesystem 1.0+ 支持 downloadFile
      
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      
      if (!response.body) throw new Error('ReadableStream not supported');
      const reader = response.body.getReader();
      
      // 先删除旧文件
      try {
        await Filesystem.deleteFile({ path: filename, directory: Directory.Data });
      } catch (e) {}

      let loaded = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        // 将 Uint8Array 转换为 Base64
        // 注意：这里分块写入
        let binary = '';
        for (let i = 0; i < value.byteLength; i++) {
          binary += String.fromCharCode(value[i]);
        }
        const base64Data = btoa(binary);

        await (Filesystem.writeFile as any)({
          path: filename,
          data: base64Data,
          directory: Directory.Data,
          recursive: true,
          append: loaded > 0
        });

        loaded += value.length;
        if (onProgress && total) {
          onProgress(loaded / total);
        }
      }
      return true;
    } catch (err) {
      console.error('Error downloading on native:', err);
      return false;
    }
  }

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
    
    const contentLength = response.headers.get('content-length')
    const total = contentLength ? parseInt(contentLength, 10) : 0
    
    if (!response.body) throw new Error('ReadableStream not supported')
    
    const reader = response.body.getReader()
    
    const root = await navigator.storage.getDirectory()
    const fileHandle = await root.getFileHandle(filename, { create: true })
    const writable = await fileHandle.createWritable()
    
    let loaded = 0
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      await writable.write(value)
      loaded += value.length
      
      if (onProgress && total) {
        onProgress(loaded / total)
      }
    }
    
    await writable.close()
    return true
  } catch (err) {
    console.error('Error downloading to OPFS:', err)
    return false
  }


}