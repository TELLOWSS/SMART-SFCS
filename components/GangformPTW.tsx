import React, { useEffect, useState } from 'react';
import GangformPTWWorker, {
  BEFORE_WORK_KEYS,
  DURING_WORK_KEY,
  normalizeGangformPayload,
  type ApprovalStatus,
  type GangformPTWPayload
} from './GangformPTWWorker';
import { handleShareMessage, buildSmartSfcsShareText } from '../lib/shareUtil';

type Role = 'worker' | 'admin';

interface GangformPTWProps {
  buildingId: string;
  role: Role;
  initialData?: GangformPTWPayload;
  initialStatus?: ApprovalStatus;
  focusFloorSignal?: number;
  onSubmit?: (payload: GangformPTWPayload) => Promise<void> | void;
  onComplete?: (payload: GangformPTWPayload) => Promise<void> | void;
  onCycleReset?: (payload: GangformPTWPayload) => Promise<void> | void;
  onApprove?: () => Promise<void> | void;
  onReject?: () => Promise<void> | void;
}

interface GangformPTWAdminProps {
  buildingId: string;
  initialData?: GangformPTWPayload;
  initialStatus?: ApprovalStatus;
  onApprove?: () => Promise<void> | void;
  onReject?: () => Promise<void> | void;
}

const GangformPTWAdmin: React.FC<GangformPTWAdminProps> = ({
  buildingId,
  initialData,
  initialStatus = 'draft',
  onApprove,
  onReject
}) => {
  const [payload, setPayload] = useState<GangformPTWPayload>(normalizeGangformPayload(buildingId, initialData));
  const [status, setStatus] = useState<ApprovalStatus>(initialStatus);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setPayload(normalizeGangformPayload(buildingId, initialData));
    setStatus(initialStatus);
  }, [buildingId, initialData, initialStatus]);

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

  const shareAdminMessage = (shareStatus: '승인 요청' | '승인 완료') => {
    const title = shareStatus === '승인 요청' ? 'SMART-SFCS 갱폼 승인 요청' : 'SMART-SFCS 갱폼 승인 완료';
    const text = buildSmartSfcsShareText({
      workType: '갱폼 인상',
      building: payload.building || buildingId,
      floor: payload.floor || '-',
      status: shareStatus
    });
    handleShareMessage(title, text);
  };

  return (
    <section className="bg-white rounded-3xl border border-slate-200 p-6 space-y-5">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-black text-slate-800">갱폼 인상 PTW 관리자 뷰 · {buildingId}</h2>
        <span className="text-xs font-bold px-3 py-1 rounded-lg bg-slate-100 text-slate-600">상태: {status}</span>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">동: <b>{payload.building || '-'}</b></div>
        <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">층: <b>{payload.floor || '-'}</b></div>
        <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">압축강도: <b>{payload.essentialChecks.compressiveStrength}</b></div>
        <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">TBM/PPE: <b>{payload.essentialChecks.tbmAndPPE ? '확인' : '미확인'}</b></div>
        <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">하부 통제: <b>{payload.essentialChecks.lowerControl ? '확인' : '미확인'}</b></div>
        <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">낙하물 제거: <b>{payload.essentialChecks.clearDebris ? '확인' : '미확인'}</b></div>
      </div>

      <div>
        <h3 className="text-sm font-black text-slate-700 mb-2">작업 전 필수 사진 4장</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {BEFORE_WORK_KEYS.map((key) => {
            const url = payload.requiredPhotos.beforeWork[key];
            return (
              <div key={key} className="rounded-xl border border-slate-200 p-2 bg-slate-50">
                <p className="text-[11px] font-bold text-slate-600 mb-2">{key}</p>
                <div className="aspect-square w-full rounded-lg border border-slate-200 bg-gray-100 overflow-hidden flex items-center justify-center">
                  {url ? (
                    <img src={url} alt={key} className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-[10px] text-slate-400">미업로드</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {payload.requiredPhotos.duringWork.작업중_안전블럭체결 && (
        <div>
          <h3 className="text-sm font-black text-slate-700 mb-2">작업 중 사진</h3>
          <div className="aspect-square max-w-sm rounded-lg border border-slate-200 bg-gray-100 overflow-hidden flex items-center justify-center">
            <img
              src={payload.requiredPhotos.duringWork.작업중_안전블럭체결}
              alt={DURING_WORK_KEY}
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => shareAdminMessage('승인 요청')}
          className="px-4 py-2 rounded-xl bg-slate-800 text-white text-sm font-black"
        >
          🚀 알림 공유하기
        </button>
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

      {status === 'approved' && (
        <button
          onClick={() => shareAdminMessage('승인 완료')}
          className="px-4 py-2 rounded-xl bg-slate-800 text-white text-sm font-black"
        >
          🚀 알림 공유하기
        </button>
      )}
    </section>
  );
};

const GangformPTW: React.FC<GangformPTWProps> = ({
  buildingId,
  role,
  initialData,
  initialStatus = 'draft',
  focusFloorSignal,
  onSubmit,
  onComplete,
  onCycleReset,
  onApprove,
  onReject
}) => {
  if (role === 'worker') {
    return (
      <GangformPTWWorker
        buildingId={buildingId}
        initialData={initialData}
        initialStatus={initialStatus}
        focusFloorSignal={focusFloorSignal}
        onSubmit={onSubmit}
        onComplete={onComplete}
        onCycleReset={onCycleReset}
      />
    );
  }

  return (
    <GangformPTWAdmin
      buildingId={buildingId}
      initialData={initialData}
      initialStatus={initialStatus}
      onApprove={onApprove}
      onReject={onReject}
    />
  );
};

export type { ApprovalStatus, GangformPTWPayload } from './GangformPTWWorker';
export default GangformPTW;
