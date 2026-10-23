export interface DownloadFileResult {
  success: boolean;
  filePath: string;
  fileName: string;
}

export async function blobToBase64(b: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      const base64 = res.includes(',') ? res.split(',')[1] : res;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(b);
  });
}

export async function downloadBlobAsFile(blob: Blob, filename: string): Promise<DownloadFileResult> {
  const isNative = typeof window !== 'undefined' && 
    typeof (window as any).Capacitor !== 'undefined' && 
    Boolean((window as any).Capacitor.isNativePlatform?.());

  if (isNative) {
    let tempFileName: string | null = null;
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { registerPlugin } = await import('@capacitor/core');
      const MediaDownload = registerPlugin<any>('MediaDownload');
      const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks to prevent memory pressure

      const writeBlobToFile = async (targetPath: string, targetDir: any) => {
        const totalSize = blob.size;
        if (totalSize <= CHUNK_SIZE) {
          const base64Data = await blobToBase64(blob);
          await Filesystem.writeFile({
            path: targetPath,
            data: base64Data,
            directory: targetDir,
            recursive: true
          });
        } else {
          let offset = 0;
          let isFirst = true;
          while (offset < totalSize) {
            const slice = blob.slice(offset, Math.min(totalSize, offset + CHUNK_SIZE));
            const base64Chunk = await blobToBase64(slice);
            if (isFirst) {
              await Filesystem.writeFile({
                path: targetPath,
                data: base64Chunk,
                directory: targetDir,
                recursive: true
              });
              isFirst = false;
            } else {
              await Filesystem.appendFile({
                path: targetPath,
                data: base64Chunk,
                directory: targetDir
              });
            }
            offset += CHUNK_SIZE;
          }
        }
      };

      tempFileName = `temp_export_${Date.now()}_${filename}`;
      await writeBlobToFile(tempFileName, Directory.Cache);

      const uriResult = await Filesystem.getUri({
        directory: Directory.Cache,
        path: tempFileName
      });
      const tempPath = uriResult.uri;

      // 1. Save directly into public Download/Lexiduo via MediaStore
      try {
        const res = await MediaDownload.saveToDownloads({
          cacheFilePath: tempPath,
          fileName: filename,
          mimeType: blob.type || 'video/mp4',
          subfolder: 'Lexiduo'
        });

        // Clean up temporary cache file
        Filesystem.deleteFile({ path: tempFileName, directory: Directory.Cache }).catch(() => {});
        tempFileName = null;

        return {
          success: true,
          filePath: res?.path || `Download/Lexiduo/${filename}`,
          fileName: filename
        };
      } catch (mediaErr) {
        console.warn('[blobDownloadHelper] MediaDownload.saveToDownloads failed, attempting Documents fallback:', mediaErr);
        if (tempFileName) {
          Filesystem.deleteFile({ path: tempFileName, directory: Directory.Cache }).catch(() => {});
          tempFileName = null;
        }

        // 2. Safe Fallback to Directory.Documents
        try {
          await writeBlobToFile(filename, Directory.Documents);
          let docPath = filename;
          try {
            const docUri = await Filesystem.getUri({ directory: Directory.Documents, path: filename });
            docPath = docUri.uri || filename;
          } catch {}

          return {
            success: true,
            filePath: docPath,
            fileName: filename
          };
        } catch (docErr) {
          console.warn('[blobDownloadHelper] Documents fallback failed, falling back to browser blob download:', docErr);
        }
      }
    } catch (fsErr) {
      console.warn('[blobDownloadHelper] Native filesystem/MediaDownload error, falling back to web download:', fsErr);
      if (tempFileName) {
        try {
          const { Filesystem, Directory } = await import('@capacitor/filesystem');
          Filesystem.deleteFile({ path: tempFileName, directory: Directory.Cache }).catch(() => {});
        } catch {}
      }
    }
  }

  // 3. Web environment fallback
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { success: false, filePath: '', fileName: filename };
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { 
    document.body.removeChild(a); 
    URL.revokeObjectURL(url); 
  }, 1000);

  return { success: true, filePath: filename, fileName: filename };
}
