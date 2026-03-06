import React, { useEffect, useMemo, useState } from 'react';
import { uploadGangformPhoto, type GangformPhotoSlotKey } from '../lib/imageUploadUtil';

export type ApprovalStatus = 'draft' | 'requested' | 'approved' | 'rejected';

interface EssentialChecks {
  compressiveStrength: number;
  tbmAndPPE: boolean;
  lowerControl: boolean;
  clearDebris: boolean;
}

interface RequiredPhotos {
  beforeWork: {
    TBM_및_보호구: string | null;
    와이어로프_반자동샤클: string | null;
    발판상부_낙하물제거: string | null;
    하부통제_감시인: string | null;
  };
  duringWork: {
    작업중_안전블럭체결: string | null;
  };
}

interface SubmissionRecord {
  building: string;
  floor: string;
  essentialChecks: EssentialChecks;
  photos: RequiredPhotos;
  status: 'PENDING';
  requestedAtServer: string | null;
  requestedAtClient: string;
}

export interface GangformPTWPayload {
  category: 'GANGFORM_PTW_APPROVAL';
  building: string;
  floor: string;
  essentialChecks: EssentialChecks;
  requiredPhotos: RequiredPhotos;
  submissionRecord?: SubmissionRecord;
}

interface GangformPTWWorkerProps {
  buildingId: string;
  initialData?: GangformPTWPayload;
  initialStatus?: ApprovalStatus;
  onSubmit?: (payload: GangformPTWPayload) => Promise<void> | void;
}

export const BEFORE_WORK_KEYS = [
  'TBM_및_보호구',
  '와이어로프_반자동샤클',
  '발판상부_낙하물제거',
  '하부통제_감시인'
] as const satisfies readonly GangformPhotoSlotKey[];

export const DURING_WORK_KEY = '작업중_안전블럭체결' as const satisfies GangformPhotoSlotKey;

const createDefaultPayload = (buildingId: string): GangformPTWPayload => ({
  category: 'GANGFORM_PTW_APPROVAL',
  building: buildingId,
  floor: '',
  essentialChecks: {
    compressiveStrength: 0,
    tbmAndPPE: false,
    lowerControl: false,
    clearDebris: false
  },
  requiredPhotos: {
    beforeWork: {
      TBM_및_보호구: null,
      와이어로프_반자동샤클: null,
      발판상부_낙하물제거: null,
      하부통제_감시인: null
    },
    duringWork: {
      작업중_안전블럭체결: null
    }
  }
});

export const normalizeGangformPayload = (
  buildingId: string,
  initialData?: GangformPTWPayload
): GangformPTWPayload => {
  const defaults = createDefaultPayload(buildingId);
  if (!initialData) return defaults;

  return {
    ...defaults,
    ...initialData,
    building: initialData.building || buildingId,
    floor: initialData.floor || '',
    essentialChecks: {
      ...defaults.essentialChecks,
      ...initialData.essentialChecks
    },
    requiredPhotos: {
      beforeWork: {
        ...defaults.requiredPhotos.beforeWork,
        ...initialData.requiredPhotos?.beforeWork
      },
      duringWork: {
        ...defaults.requiredPhotos.duringWork,
        ...initialData.requiredPhotos?.duringWork
      }
    }
  };
};

const GangformPTWWorker: React.FC<GangformPTWWorkerProps> = ({
  buildingId,
  initialData,
  initialStatus = 'draft',
  onSubmit
}) => {
  const [payload, setPayload] = useState<GangformPTWPayload>(normalizeGangformPayload(buildingId, initialData));
  const [status, setStatus] = useState<ApprovalStatus>(initialStatus);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  useEffect(() => {
    setPayload(normalizeGangformPayload(buildingId, initialData));
    setStatus(initialStatus);
  }, [buildingId, initialData, initialStatus]);

  const compressiveWarning = payload.essentialChecks.compressiveStrength > 0 && payload.essentialChecks.compressiveStrength < 5;

  const beforeWorkCompleted = useMemo(() => {
    return BEFORE_WORK_KEYS.every((key) => Boolean(payload.requiredPhotos.beforeWork[key]));
  }, [payload.requiredPhotos.beforeWork]);

  const workerReadyForRequest =
    payload.building.trim().length > 0 &&
    payload.floor.trim().length > 0 &&
    payload.essentialChecks.compressiveStrength >= 5 &&
    payload.essentialChecks.tbmAndPPE &&
    payload.essentialChecks.lowerControl &&
    payload.essentialChecks.clearDebris &&
    beforeWorkCompleted;

  const handleStrengthChange = (value: string) => {
    const num = Number(value || 0);
    setPayload((prev) => ({
      ...prev,
      essentialChecks: {
        ...prev.essentialChecks,
        compressiveStrength: Number.isNaN(num) ? 0 : num
      }
    }));
  };

  const handleLocationChange = (key: 'building' | 'floor', value: string) => {
    setPayload((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleCheckChange = (key: keyof Omit<EssentialChecks, 'compressiveStrength'>, checked: boolean) => {
    setPayload((prev) => ({
      ...prev,
      essentialChecks: {
        ...prev.essentialChecks,
        [key]: checked
      }
    }));
  };

  const handleBeforePhotoUpload = async (
    key: keyof RequiredPhotos['beforeWork'],
    file: File | null
  ) => {
    if (!file) return;
    try {
      setUploadingKey(key);
      const { publicUrl } = await uploadGangformPhoto(file, 'beforeWork', key);
      setPayload((prev) => ({
        ...prev,
        requiredPhotos: {
          ...prev.requiredPhotos,
          beforeWork: {
            ...prev.requiredPhotos.beforeWork,
            [key]: publicUrl
          }
        }
      }));
    } catch (error) {
      alert(error instanceof Error ? error.message : '이미지 업로드 실패');
    } finally {
      setUploadingKey(null);
    }
  };

  const handleDuringPhotoUpload = async (file: File | null) => {
    if (!file) return;
    try {
      setUploadingKey(DURING_WORK_KEY);
      const { publicUrl } = await uploadGangformPhoto(file, 'duringWork', DURING_WORK_KEY);
      setPayload((prev) => ({
        ...prev,
        requiredPhotos: {
          ...prev.requiredPhotos,
          duringWork: {
            ...prev.requiredPhotos.duringWork,
            작업중_안전블럭체결: publicUrl
          }
        }
      }));
    } catch (error) {
      alert(error instanceof Error ? error.message : '작업중 사진 업로드 실패');
    } finally {
      setUploadingKey(null);
    }
  };

  const submitRequest = async () => {
    if (!workerReadyForRequest || isSubmitting) return;

    try {
      setIsSubmitting(true);

      const dbPayload = {
        building: payload.building.trim(),
        floor: payload.floor.trim(),
        essentialChecks: payload.essentialChecks,
        photos: payload.requiredPhotos,
        status: 'PENDING' as const,
        // 서버 insert 시 DB 함수(now()/CURRENT_TIMESTAMP)로 채워질 필드
        requestedAtServer: null as string | null,
        requestedAtClient: new Date().toISOString()
      };

      await onSubmit?.({
        ...payload,
        building: dbPayload.building,
        floor: dbPayload.floor,
        submissionRecord: dbPayload
      });

      setStatus('requested');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="bg-white rounded-3xl border border-slate-200 p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-black text-slate-800">갱폼 인상 PTW 작업자 뷰 · {buildingId}</h2>
        <span className="text-xs font-bold px-3 py-1 rounded-lg bg-slate-100 text-slate-600">상태: {status}</span>
      </header>

      <div className="space-y-3">
        <p className="text-sm font-black text-slate-700">작업 위치 정보</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-600">동</label>
            <input
              type="text"
              placeholder="예: 101동"
              value={payload.building}
              onChange={(e) => handleLocationChange('building', e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-600">층</label>
            <input
              type="text"
              placeholder="예: 15층"
              value={payload.floor}
              onChange={(e) => handleLocationChange('floor', e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-black text-slate-700">압축강도 (최소 5)</label>
        <input
          type="number"
          min={0}
          value={payload.essentialChecks.compressiveStrength || ''}
          onChange={(e) => handleStrengthChange(e.target.value)}
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
        {compressiveWarning && (
          <p className="text-xs font-bold text-red-600">압축강도 5 미만입니다. 승인 요청이 불가합니다.</p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-black text-slate-700">필수 체크</p>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={payload.essentialChecks.tbmAndPPE}
            onChange={(e) => handleCheckChange('tbmAndPPE', e.target.checked)}
          />
          TBM 및 보호구 확인
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={payload.essentialChecks.lowerControl}
            onChange={(e) => handleCheckChange('lowerControl', e.target.checked)}
          />
          하부 통제 및 감시인 배치
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={payload.essentialChecks.clearDebris}
            onChange={(e) => handleCheckChange('clearDebris', e.target.checked)}
          />
          발판 상부 낙하물 제거
        </label>
      </div>

      <div>
        <h3 className="text-sm font-black text-slate-700 mb-3">작업 전 필수 사진 4장</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {BEFORE_WORK_KEYS.map((key) => {
            const url = payload.requiredPhotos.beforeWork[key];
            const isUploading = uploadingKey === key;
            return (
              <div key={key} className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                <p className="text-xs font-bold text-slate-700 mb-2">{key}</p>
                <label className="inline-flex items-center px-3 py-2 rounded-lg bg-slate-800 text-white text-xs font-bold cursor-pointer">
                  {isUploading ? '업로드 중...' : '사진 업로드'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={isUploading || status !== 'draft'}
                    onChange={(e) => handleBeforePhotoUpload(key, e.target.files?.[0] || null)}
                  />
                </label>

                <div className="mt-2 aspect-square w-full rounded-lg border border-slate-200 bg-gray-100 overflow-hidden flex items-center justify-center">
                  {url ? (
                    <img src={url} alt={key} className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-[11px] text-slate-400">미리보기 없음</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={submitRequest}
        disabled={!workerReadyForRequest || status !== 'draft' || isSubmitting}
        className="w-full py-3 rounded-xl bg-blue-600 text-white font-black text-sm disabled:opacity-40"
      >
        승인 요청
      </button>

      {status === 'approved' && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
          <h3 className="text-sm font-black text-emerald-700">작업 중 사진 업로드</h3>
          <label className="inline-flex items-center px-3 py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold cursor-pointer">
            {uploadingKey === DURING_WORK_KEY ? '업로드 중...' : '작업중 안전블럭체결 업로드'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploadingKey === DURING_WORK_KEY}
              onChange={(e) => handleDuringPhotoUpload(e.target.files?.[0] || null)}
            />
          </label>
          {payload.requiredPhotos.duringWork.작업중_안전블럭체결 && (
            <div className="aspect-square w-full rounded-lg border border-emerald-200 bg-gray-100 overflow-hidden flex items-center justify-center">
              <img
                src={payload.requiredPhotos.duringWork.작업중_안전블럭체결}
                alt={DURING_WORK_KEY}
                className="w-full h-full object-contain"
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default GangformPTWWorker;
