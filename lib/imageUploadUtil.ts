import imageCompression from 'browser-image-compression';
import { supabase, GANGFORM_BUCKET } from './supabaseClient';

export interface UploadResult {
  publicUrl: string;
  filePath: string;
  sizeBytes: number;
}

export const STORAGE_SLOT_PATH_MAP = {
  TBM_및_보호구: 'tbm_ppe',
  와이어로프_반자동샤클: 'wire_shackle',
  발판상부_낙하물제거: 'clear_debris',
  하부통제_감시인: 'lower_control',
  작업중_안전블럭체결: 'safety_block'
} as const;

export type GangformPhotoSlotKey = keyof typeof STORAGE_SLOT_PATH_MAP;

const sanitizeFileName = (name: string) =>
  name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_.-]/g, '');

const getStorageSlotPath = (slotKey: GangformPhotoSlotKey): string => {
  return STORAGE_SLOT_PATH_MAP[slotKey];
};

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
  slotKey: GangformPhotoSlotKey
): Promise<UploadResult> => {
  const compressed = await compressImageUnder300KB(file);

  const timestamp = Date.now();
  const safeName = sanitizeFileName(file.name || 'photo.jpg');
  const storageSlotPath = getStorageSlotPath(slotKey);
  const filePath = `${folder}/${storageSlotPath}/${timestamp}-${safeName}`;

  if (import.meta.env.DEV) {
    console.info('[GangformPTW] upload path', { slotKey, storageSlotPath, filePath });
  }

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
