import { supabase } from '../lib/supabaseClient';
import type { GangformPTWPayload } from '../components/GangformPTW';

export interface GangformPtwRecordRow {
  id: string;
  building: string;
  floor: number | string;
  compressive_strength: number;
  checklist: {
    tbmAndPPE: boolean;
    lowerControl: boolean;
    clearDebris: boolean;
  };
  photos: {
    beforeWork: string[];
    duringWork: string[];
    all: string[];
  };
  status: 'COMPLETED';
  created_at: string;
}

const parseFloorToInteger = (floorText: string): number => {
  const raw = String(floorText || '').trim();
  const matched = raw.match(/\d+/);
  if (!matched) {
    throw new Error(`PTW 완료 기록 저장 실패: 층 정보 형식이 올바르지 않습니다 (${raw || '빈 값'})`);
  }

  const floor = Number(matched[0]);
  if (!Number.isFinite(floor) || floor <= 0) {
    throw new Error(`PTW 완료 기록 저장 실패: 층 정보가 유효하지 않습니다 (${raw})`);
  }

  return floor;
};

const toRecordInsertPayload = (payload: GangformPTWPayload) => {
  const beforeWork = Object.values(payload.requiredPhotos.beforeWork).filter(
    (url): url is string => Boolean(url)
  );
  const duringWork = Object.values(payload.requiredPhotos.duringWork).filter(
    (url): url is string => Boolean(url)
  );

  return {
    building: payload.building,
    floor: parseFloorToInteger(payload.floor),
    compressive_strength: payload.essentialChecks.compressiveStrength,
    checklist: {
      tbmAndPPE: payload.essentialChecks.tbmAndPPE,
      lowerControl: payload.essentialChecks.lowerControl,
      clearDebris: payload.essentialChecks.clearDebris
    },
    photos: {
      beforeWork,
      duringWork,
      all: [...beforeWork, ...duringWork]
    },
    status: 'COMPLETED' as const
  };
};

export const insertGangformPtwCompletedRecord = async (
  payload: GangformPTWPayload
): Promise<GangformPtwRecordRow> => {
  const insertPayload = toRecordInsertPayload(payload);

  const { data, error } = await supabase
    .from('gangform_ptw_records')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error) {
    throw new Error(`PTW 완료 기록 저장 실패: ${error.message}`);
  }

  if (!data) {
    throw new Error('PTW 완료 기록 저장 결과가 없습니다.');
  }

  return data as GangformPtwRecordRow;
};

export const fetchGangformPtwHistory = async (
  building?: string
): Promise<GangformPtwRecordRow[]> => {
  let query = supabase
    .from('gangform_ptw_records')
    .select('*')
    .order('created_at', { ascending: false });

  if (building && building !== 'ALL') {
    query = query.eq('building', building);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`PTW 히스토리 조회 실패: ${error.message}`);
  }

  return (data || []) as GangformPtwRecordRow[];
};
