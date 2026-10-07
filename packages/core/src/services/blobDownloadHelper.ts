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

export async function downloadBlobAsFile(blob: Blob, filename: string): Promise<void> {
  const isNative = typeof window !== 'undefined' && 
    typeof (window as any).Capacitor !== 'undefined' && 
    Boolean((window as any).Capacitor.isNativePlatform?.());

  if (isNative) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks to prevent memory pressure

      const writeToLocation = async (targetPath: string, targetDir?: any) => {
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

      // 1. Try physical direct write to /storage/emulated/0/Download/ (tablets & Android 11+)
      try {
        await writeToLocation(`/storage/emulated/0/Download/${filename}`);
        return;
      } catch (err1) {
        console.debug('Direct /storage/emulated/0/Download/ write failed, attempting ExternalStorage:', err1);
      }

      // 2. Try ExternalStorage Download/
      try {
        await writeToLocation(`Download/${filename}`, Directory.ExternalStorage);
        return;
      } catch (err2) {
        console.debug('ExternalStorage Download/ write failed, attempting Documents:', err2);
      }

      // 3. Fallback to Documents/
      try {
        await writeToLocation(filename, Directory.Documents);
        return;
      } catch (err3) {
        console.warn('Documents fallback failed, falling back to browser blob download:', err3);
      }
    } catch (fsErr) {
      console.warn('Filesystem import/execution error, falling back to web download:', fsErr);
    }
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
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
}
