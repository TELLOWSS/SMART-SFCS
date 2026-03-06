import imageCompression from 'browser-image-compression';
import { supabase, GANGFORM_BUCKET } from './supabaseClient';

export interface UploadResult {
  publicUrl: string;
  filePath: string;
  sizeBytes: number;
}

const sanitizeFileName = (name: string) =>
  name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_.-]/g, '');

export const compressImageUnder300KB = async (file: File): Promise<File> => {
  const compressed = await imageCompression(file, {
    maxSizeMB: 0.3,
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    initialQuality: 0.85
  });

  if (compressed.size <= 300 * 1024) return compressed;

  const secondPass = await imageCompression(compressed, {
    maxSizeMB: 0.28,
    maxWidthOrHeight: 1280,
    useWebWorker: true,
    initialQuality: 0.72
  });

  return secondPass;
};

export const uploadGangformPhoto = async (
  file: File,
  folder: 'beforeWork' | 'duringWork',
  slotKey: string
): Promise<UploadResult> => {
  const compressed = await compressImageUnder300KB(file);

  const timestamp = Date.now();
  const safeName = sanitizeFileName(file.name || 'photo.jpg');
  const filePath = `${folder}/${slotKey}/${timestamp}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(GANGFORM_BUCKET)
    .upload(filePath, compressed, {
      cacheControl: '3600',
      upsert: true,
      contentType: compressed.type || 'image/jpeg'
    });

  if (uploadError) {
    throw new Error(`Supabase 업로드 실패: ${uploadError.message}`);
  }

  const { data } = supabase.storage.from(GANGFORM_BUCKET).getPublicUrl(filePath);
  if (!data?.publicUrl) {
    throw new Error('Supabase public URL 생성 실패');
  }

  return {
    publicUrl: data.publicUrl,
    filePath,
    sizeBytes: compressed.size
  };
};
