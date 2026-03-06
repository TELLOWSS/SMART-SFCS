import React, { useEffect, useMemo, useState } from 'react';
import { uploadGangformPhoto } from '../lib/imageUploadUtil';

type Role = 'worker' | 'admin';
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

export interface GangformPTWPayload {
  category: 'GANGFORM_PTW_APPROVAL';
  essentialChecks: EssentialChecks;
  requiredPhotos: RequiredPhotos;
}

interface GangformPTWProps {
  buildingId: string;
  role: Role;
  initialData?: GangformPTWPayload;
  initialStatus?: ApprovalStatus;
  onSubmit?: (payload: GangformPTWPayload) => Promise<void> | void;
  onApprove?: () => Promise<void> | void;
  onReject?: () => Promise<void> | void;
}

const BEFORE_WORK_KEYS = [
  'TBM_및_보호구',
  '와이어로프_반자동샤클',
  '발판상부_낙하물제거',
  '하부통제_감시인'
] as const;

const DURING_WORK_KEY = '작업중_안전블럭체결' as const;

const defaultPayload: GangformPTWPayload = {
  category: 'GANGFORM_PTW_APPROVAL',
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
};

const GangformPTW: React.FC<GangformPTWProps> = ({
  buildingId,
  role,
  initialData,
  initialStatus = 'draft',
  onSubmit,
  onApprove,
  onReject
}) => {
  const [payload, setPayload] = useState<GangformPTWPayload>(initialData || defaultPayload);
  const [status, setStatus] = useState<ApprovalStatus>(initialStatus);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setPayload(initialData);
    } else {
      setPayload(defaultPayload);
    }
    setStatus(initialStatus);
  }, [buildingId, initialData, initialStatus]);

  const compressiveWarning = payload.essentialChecks.compressiveStrength > 0 && payload.essentialChecks.compressiveStrength < 5;

  const beforeWorkCompleted = useMemo(() => {
    return BEFORE_WORK_KEYS.every((key) => Boolean(payload.requiredPhotos.beforeWork[key]));
  }, [payload.requiredPhotos.beforeWork]);

  const workerReadyForRequest =
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
      await onSubmit?.(payload);
      setStatus('requested');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (isSubmitting) return;
    try {
      setIsSubmitting(true);
      await onApprove?.();
      setStatus('approved');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (isSubmitting) return;
    try {
      setIsSubmitting(true);
      await onReject?.();
      setStatus('rejected');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (role === 'admin') {
    return (
      <section className="bg-white rounded-3xl border border-slate-200 p-6 space-y-5">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-800">갱폼 인상 PTW 관리자 뷰 · {buildingId}</h2>
          <span className="text-xs font-bold px-3 py-1 rounded-lg bg-slate-100 text-slate-600">상태: {status}</span>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">압축강도: <b>{payload.essentialChecks.compressiveStrength}</b></div>
          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">TBM/PPE: <b>{payload.essentialChecks.tbmAndPPE ? '확인' : '미확인'}</b></div>
          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">하부 통제: <b>{payload.essentialChecks.lowerControl ? '확인' : '미확인'}</b></div>
          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">낙하물 제거: <b>{payload.essentialChecks.clearDebris ? '확인' : '미확인'}</b></div>
        </div>

        <div>
          <h3 className="text-sm font-black text-slate-700 mb-2">작업 전 필수 사진 4장</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {BEFORE_WORK_KEYS.map((key) => {
              const url = payload.requiredPhotos.beforeWork[key];
              return (
                <div key={key} className="rounded-xl border border-slate-200 p-2 bg-slate-50">
                  <p className="text-[11px] font-bold text-slate-600 mb-2">{key}</p>
                  {url ? (
                    <img src={url} alt={key} className="w-full h-24 object-cover rounded-lg border border-slate-200" />
                  ) : (
                    <div className="w-full h-24 rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-400">미업로드</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleApprove}
            disabled={status !== 'requested' || isSubmitting}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-black disabled:opacity-50"
          >
            승인
          </button>
          <button
            onClick={handleReject}
            disabled={status !== 'requested' || isSubmitting}
            className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-black disabled:opacity-50"
          >
            반려
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-3xl border border-slate-200 p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-black text-slate-800">갱폼 인상 PTW 작업자 뷰 · {buildingId}</h2>
        <span className="text-xs font-bold px-3 py-1 rounded-lg bg-slate-100 text-slate-600">상태: {status}</span>
      </header>

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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <div className="mt-2">
                  {url ? (
                    <img src={url} alt={key} className="w-full h-28 object-cover rounded-lg border border-slate-200" />
                  ) : (
                    <div className="w-full h-28 rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-[11px] text-slate-400">미리보기 없음</div>
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
            <img
              src={payload.requiredPhotos.duringWork.작업중_안전블럭체결}
              alt={DURING_WORK_KEY}
              className="w-full h-40 object-cover rounded-lg border border-emerald-200"
            />
          )}
        </div>
      )}
    </section>
  );
};

export default GangformPTW;
