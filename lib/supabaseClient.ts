import { createClient } from '@supabase/supabase-js';

const readEnv = (key: string): string => {
  const fromProcess = typeof process !== 'undefined' ? process.env?.[key] : undefined;
  if (fromProcess) return fromProcess;

  const fromImportMeta = typeof import.meta !== 'undefined' ? (import.meta as any).env?.[key] : undefined;
  if (fromImportMeta) return fromImportMeta;

  return '';
};

const supabaseUrl = readEnv('NEXT_PUBLIC_SUPABASE_URL') || readEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') || readEnv('VITE_SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase 환경변수 누락: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const GANGFORM_BUCKET = 'gangform-ptw';
