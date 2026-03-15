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
  canForceEdit?: boolean;
  initialData?: GangformPTWPayload;
  initialStatus?: ApprovalStatus;
  remoteUpdatedAt?: string | null;
  focusFloorSignal?: number;
  onPayloadChange?: (payload: GangformPTWPayload, status: ApprovalStatus) => Promise<void> | void;
  onSubmit?: (payload: GangformPTWPayload) => Promise<void> | void;
  onComplete?: (payload: GangformPTWPayload) => Promise<void> | void;
  onCycleReset?: (payload: GangformPTWPayload) => Promise<void> | void;
  onApprove?: () => Promise<void> | void;
  onReject?: () => Promise<void> | void;
  onForceStatusChange?: (status: ApprovalStatus, reason: string) => Promise<void> | void;
}

interface GangformPTWAdminProps {
  buildingId: string;
  canForceEdit?: boolean;
  initialData?: GangformPTWPayload;
  initialStatus?: ApprovalStatus;
  onApprove?: () => Promise<void> | void;
  onReject?: () => Promise<void> | void;
  onForceStatusChange?: (status: ApprovalStatus, reason: string) => Promise<void> | void;
}

const GangformPTWAdmin: React.FC<GangformPTWAdminProps> = ({
  buildingId,
  canForceEdit = false,
  initialData,
  initialStatus = 'draft',
  onApprove,
  onReject,
  onForceStatusChange
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

  const shareAdminMessage = (shareStatus: '승인 요청' | '인상 진행') => {
    const title = shareStatus === '승인 요청' ? 'SMART-SFCS 갱폼 승인 요청' : 'SMART-SFCS 갱폼 인상 진행';
    const text = buildSmartSfcsShareText({
      workType: '갱폼 인상',
      building: payload.building || buildingId,
      floor: payload.floor || '-',
      status: shareStatus
    });
    handleShareMessage(title, text);
  };

  const handleForceStatusChange = async (nextStatus: ApprovalStatus) => {
    if (!canForceEdit || isSubmitting) return;
    const reason = window.prompt('강제 수정 사유를 입력하세요. (필수)', '');
    if (!reason || !reason.trim()) {
      alert('강제 수정 사유는 필수입니다.');
      return;
    }
    if (!window.confirm(`제작자 권한으로 상태를 '${nextStatus}'(으)로 수정하시겠습니까?`)) return;

    try {
      setIsSubmitting(true);
      await onForceStatusChange?.(nextStatus, reason.trim());
      setStatus(nextStatus);
    } finally {
      setIsSubmitting(false);
    }
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
        <h3 className="text-sm font-black text-slate-700 mb-2">작업 승인신청 필수 사진 5장</h3>
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

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-black text-slate-700">알림 공유 항목</p>
        <p className="text-[11px] text-slate-600 mt-1">공종(갱폼 인상), 동/층, 현재 상태(승인 요청 또는 인상 진행) 메시지를 공유합니다.</p>
      </div>

      {status === 'approved' && (
        <div className="space-y-2">
          <button
            onClick={() => shareAdminMessage('인상 진행')}
            className="px-4 py-2 rounded-xl bg-slate-800 text-white text-sm font-black"
          >
            🚀 알림 공유하기
          </button>
          <p className="text-[11px] text-slate-500">
            공유 내용: 공종(갱폼 인상), 동/층, 현재 상태(인상 진행)
          </p>
        </div>
      )}

      {canForceEdit && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 space-y-2">
          <h3 className="text-sm font-black text-rose-700">제작자 권한 · 상태 강제 수정</h3>
          <p className="text-[11px] text-rose-600">오입력/오처리 복구가 필요할 때만 사용하세요.</p>
          <div className="flex flex-wrap gap-2">
            {(['draft', 'requested', 'approved', 'completed', 'rejected'] as ApprovalStatus[]).map((nextStatus) => (
              <button
                key={nextStatus}
                type="button"
                onClick={() => handleForceStatusChange(nextStatus)}
                disabled={isSubmitting || status === nextStatus}
                className="px-3 py-1.5 rounded-lg text-xs font-black border border-rose-200 bg-white text-rose-700 disabled:opacity-40"
              >
                {nextStatus}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

const GangformPTW: React.FC<GangformPTWProps> = ({
  buildingId,
  role,
  canForceEdit = false,
  initialData,
  initialStatus = 'draft',
  remoteUpdatedAt,
  focusFloorSignal,
  onPayloadChange,
  onSubmit,
  onComplete,
  onCycleReset,
  onApprove,
  onReject,
  onForceStatusChange
}) => {
  if (role === 'worker') {
    return (
      <GangformPTWWorker
        buildingId={buildingId}
        initialData={initialData}
        initialStatus={initialStatus}
        remoteUpdatedAt={remoteUpdatedAt}
        focusFloorSignal={focusFloorSignal}
        onPayloadChange={onPayloadChange}
        onSubmit={onSubmit}
        onComplete={onComplete}
        onCycleReset={onCycleReset}
      />
    );
  }

  return (
    <GangformPTWAdmin
      buildingId={buildingId}
      canForceEdit={canForceEdit}
      initialData={initialData}
      initialStatus={initialStatus}
      onApprove={onApprove}
      onReject={onReject}
      onForceStatusChange={onForceStatusChange}
    />
  );
};

export type { ApprovalStatus, GangformPTWPayload } from './GangformPTWWorker';
export default GangformPTW;
