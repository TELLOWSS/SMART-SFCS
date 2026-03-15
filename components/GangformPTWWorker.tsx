import React, { useEffect, useMemo, useRef, useState } from 'react';
import { uploadGangformPhoto, type GangformPhotoSlotKey } from '../lib/imageUploadUtil';
import { handleShareMessage, buildSmartSfcsShareText } from '../lib/shareUtil';

export type ApprovalStatus = 'draft' | 'requested' | 'approved' | 'completed' | 'rejected';

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
    작업승인신청_고리체결사진: string | null;
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
  remoteUpdatedAt?: string | null;
  focusFloorSignal?: number;
  onPayloadChange?: (payload: GangformPTWPayload, status: ApprovalStatus) => Promise<void> | void;
  onSubmit?: (payload: GangformPTWPayload) => Promise<void> | void;
  onComplete?: (payload: GangformPTWPayload) => Promise<void> | void;
  onCycleReset?: (payload: GangformPTWPayload) => Promise<void> | void;
  onRestoreCycle?: (payload: GangformPTWPayload, status: ApprovalStatus) => Promise<void> | void;
}

interface LocalDraftState {
  payload: GangformPTWPayload;
  status: ApprovalStatus;
  practiceMode: boolean;
  savedAt?: string;
}

interface WorkerSnapshot {
  payload: GangformPTWPayload;
  status: ApprovalStatus;
}

interface ValidationIssue {
  message: string;
  target: 'building' | 'floor' | 'strength' | 'tbmAndPPE' | 'lowerControl' | 'clearDebris' | 'beforeWorkPhotos' | 'status';
}

export const BEFORE_WORK_KEYS = [
  'TBM_및_보호구',
  '와이어로프_반자동샤클',
  '발판상부_낙하물제거',
  '하부통제_감시인',
  '작업승인신청_고리체결사진'
] as const satisfies readonly GangformPhotoSlotKey[];

export const DURING_WORK_KEY = '작업중_안전블럭체결' as const satisfies GangformPhotoSlotKey;

const getLocalStorageKey = (buildingId: string) => `sfcs:gangform-ptw:worker:${buildingId}`;

const readLocalDraft = (key: string): LocalDraftState | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalDraftState;
    if (!parsed?.payload || !parsed?.status) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeLocalDraft = (key: string, value: LocalDraftState) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        ...value,
        savedAt: new Date().toISOString()
      })
    );
  } catch {
    // 저장 실패 시 무시 (스토리지 용량/권한 이슈)
  }
};

const clearLocalDraft = (key: string) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(key);
  } catch {
    // 삭제 실패 시 무시
  }
};

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
      하부통제_감시인: null,
      작업승인신청_고리체결사진: null
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

const parseFloorNumber = (floorText: string): number | null => {
  const matched = floorText.match(/\d+/);
  if (!matched) return null;
  const parsed = Number(matched[0]);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseIsoTimestamp = (value?: string | null): number => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const GangformPTWWorker: React.FC<GangformPTWWorkerProps> = ({
  buildingId,
  initialData,
  initialStatus = 'draft',
  remoteUpdatedAt,
  focusFloorSignal = 0,
  onPayloadChange,
  onSubmit,
  onComplete,
  onCycleReset,
  onRestoreCycle
}) => {
  const [payload, setPayload] = useState<GangformPTWPayload>(normalizeGangformPayload(buildingId, initialData));
  const [status, setStatus] = useState<ApprovalStatus>(initialStatus);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [isPracticeMode, setIsPracticeMode] = useState(false);
  const [undoStack, setUndoStack] = useState<WorkerSnapshot[]>([]);
  const [cycleUndoSnapshot, setCycleUndoSnapshot] = useState<WorkerSnapshot | null>(null);
  const buildingInputRef = useRef<HTMLInputElement | null>(null);
  const floorInputRef = useRef<HTMLInputElement | null>(null);
  const strengthInputRef = useRef<HTMLInputElement | null>(null);
  const tbmCheckboxRef = useRef<HTMLInputElement | null>(null);
  const lowerControlCheckboxRef = useRef<HTMLInputElement | null>(null);
  const clearDebrisCheckboxRef = useRef<HTMLInputElement | null>(null);
  const beforeWorkPhotosRef = useRef<HTMLDivElement | null>(null);

  const storageKey = useMemo(() => getLocalStorageKey(buildingId), [buildingId]);

  useEffect(() => {
    const localDraft = readLocalDraft(storageKey);
    const normalizedRemotePayload = normalizeGangformPayload(buildingId, initialData);
    const localSavedAt = parseIsoTimestamp(localDraft?.savedAt);
    const remoteSavedAt = parseIsoTimestamp(remoteUpdatedAt);
    const hasRemoteState = Boolean(initialData) || initialStatus !== 'draft' || remoteSavedAt > 0;
    const shouldPreferRemote = hasRemoteState && (initialStatus !== 'draft' || remoteSavedAt >= localSavedAt);

    if (localDraft && !shouldPreferRemote) {
      setPayload(normalizeGangformPayload(buildingId, localDraft.payload));
      setStatus(localDraft.status);
      setIsPracticeMode(Boolean(localDraft.practiceMode));
      setUndoStack([]);
      return;
    }

    setPayload(normalizedRemotePayload);
    setStatus(initialStatus);
    setIsPracticeMode(false);
    setUndoStack([]);
    setCycleUndoSnapshot(null);

    if (shouldPreferRemote) {
      clearLocalDraft(storageKey);
    }
  }, [buildingId, initialData, initialStatus, remoteUpdatedAt, storageKey]);

  useEffect(() => {
    writeLocalDraft(storageKey, { payload, status, practiceMode: isPracticeMode });
  }, [payload, status, isPracticeMode, storageKey]);

  useEffect(() => {
    if (!focusFloorSignal) return;
    const timer = window.setTimeout(() => {
      floorInputRef.current?.focus();
      floorInputRef.current?.select();
    }, 120);

    return () => window.clearTimeout(timer);
  }, [focusFloorSignal, buildingId]);

  const pushUndoSnapshot = () => {
    setUndoStack((prev) => {
      const next = [...prev, { payload, status }];
      return next.slice(-20);
    });
  };

  const handleUndo = () => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setPayload(last.payload);
      setStatus(last.status);
      return prev.slice(0, -1);
    });
  };

  const compressiveWarning = payload.essentialChecks.compressiveStrength > 0 && payload.essentialChecks.compressiveStrength < 5;

  const beforeWorkCompleted = useMemo(() => {
    return BEFORE_WORK_KEYS.every((key) => Boolean(payload.requiredPhotos.beforeWork[key]));
  }, [payload.requiredPhotos.beforeWork]);

  const canEditBeforeWorkSection = status !== 'completed';
  const canSubmitRequest = status === 'draft' || status === 'rejected';

  const requestValidation = useMemo(() => {
    const checks = {
      building: payload.building.trim().length > 0,
      floor: payload.floor.trim().length > 0,
      strength: payload.essentialChecks.compressiveStrength >= 5,
      tbmAndPPE: payload.essentialChecks.tbmAndPPE,
      lowerControl: payload.essentialChecks.lowerControl,
      clearDebris: payload.essentialChecks.clearDebris,
      beforeWorkPhotos: beforeWorkCompleted,
      requestStatus: canSubmitRequest
    };

    const unmetIssues: ValidationIssue[] = [];
    if (!checks.building) unmetIssues.push({ message: '동 정보를 입력하세요.', target: 'building' });
    if (!checks.floor) unmetIssues.push({ message: '층 정보를 입력하세요.', target: 'floor' });
    if (!checks.strength) unmetIssues.push({ message: '압축강도 5 이상을 입력하세요.', target: 'strength' });
    if (!checks.tbmAndPPE) unmetIssues.push({ message: 'TBM 및 보호구 확인 체크가 필요합니다.', target: 'tbmAndPPE' });
    if (!checks.lowerControl) unmetIssues.push({ message: '하부 통제 및 감시인 배치 체크가 필요합니다.', target: 'lowerControl' });
    if (!checks.clearDebris) unmetIssues.push({ message: '발판 상부 낙하물 제거 체크가 필요합니다.', target: 'clearDebris' });
    if (!checks.beforeWorkPhotos) unmetIssues.push({ message: '승인신청 필수 사진 5장을 모두 업로드하세요.', target: 'beforeWorkPhotos' });
    if (!checks.requestStatus) {
      if (status === 'requested') unmetIssues.push({ message: '현재 승인 대기 상태입니다. 관리자 승인 후 다음 절차를 진행하세요.', target: 'status' });
      if (status === 'approved') unmetIssues.push({ message: '현재 승인 완료 상태입니다. 인상 완료 처리로 진행하세요.', target: 'status' });
      if (status === 'completed') unmetIssues.push({ message: '현재 인상 완료 상태입니다. 다음 층 인상 준비하기를 진행하세요.', target: 'status' });
    }

    return {
      ready: checks.building
        && checks.floor
        && checks.strength
        && checks.tbmAndPPE
        && checks.lowerControl
        && checks.clearDebris
        && checks.beforeWorkPhotos,
      disabled: !checks.requestStatus || unmetIssues.length > 0,
      unmetIssues
    };
  }, [beforeWorkCompleted, canSubmitRequest, payload, status]);

  const focusValidationTarget = (target: ValidationIssue['target']) => {
    const focusMap: Record<ValidationIssue['target'], () => void> = {
      building: () => {
        buildingInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        buildingInputRef.current?.focus();
      },
      floor: () => {
        floorInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        floorInputRef.current?.focus();
      },
      strength: () => {
        strengthInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        strengthInputRef.current?.focus();
      },
      tbmAndPPE: () => {
        tbmCheckboxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        tbmCheckboxRef.current?.focus();
      },
      lowerControl: () => {
        lowerControlCheckboxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        lowerControlCheckboxRef.current?.focus();
      },
      clearDebris: () => {
        clearDebrisCheckboxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        clearDebrisCheckboxRef.current?.focus();
      },
      beforeWorkPhotos: () => {
        beforeWorkPhotosRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
      status: () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };

    focusMap[target]();
  };

  const nextFloorNumber = parseFloorNumber(payload.floor)?.valueOf();

  const handleStrengthChange = (value: string) => {
    pushUndoSnapshot();
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
    pushUndoSnapshot();
    setPayload((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  const handleCheckChange = (key: keyof Omit<EssentialChecks, 'compressiveStrength'>, checked: boolean) => {
    pushUndoSnapshot();
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
      let nextPayload: GangformPTWPayload | null = null;
      pushUndoSnapshot();
      setPayload((prev) => ({
        ...(nextPayload = {
          ...prev,
          requiredPhotos: {
            ...prev.requiredPhotos,
            beforeWork: {
              ...prev.requiredPhotos.beforeWork,
              [key]: publicUrl
            }
          }
        })
      }));

      if (!isPracticeMode && nextPayload) {
        await onPayloadChange?.(nextPayload, status);
      }
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
      let nextPayload: GangformPTWPayload | null = null;
      pushUndoSnapshot();
      setPayload((prev) => ({
        ...(nextPayload = {
          ...prev,
          requiredPhotos: {
            ...prev.requiredPhotos,
            duringWork: {
              ...prev.requiredPhotos.duringWork,
              작업중_안전블럭체결: publicUrl
            }
          }
        })
      }));

      if (!isPracticeMode && nextPayload) {
        await onPayloadChange?.(nextPayload, status);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : '작업중 사진 업로드 실패');
    } finally {
      setUploadingKey(null);
    }
  };

  const submitRequest = async () => {
    if (!requestValidation.ready || !canSubmitRequest || isSubmitting) return;

    try {
      setIsSubmitting(true);
      pushUndoSnapshot();

      const dbPayload = {
        building: payload.building.trim(),
        floor: payload.floor.trim(),
        essentialChecks: payload.essentialChecks,
        photos: payload.requiredPhotos,
        status: 'PENDING' as const,
        requestedAtServer: null as string | null,
        requestedAtClient: new Date().toISOString()
      };

      if (!isPracticeMode) {
        await onSubmit?.({
          ...payload,
          building: dbPayload.building,
          floor: dbPayload.floor,
          submissionRecord: dbPayload
        });
      }

      setStatus('requested');
    } finally {
      setIsSubmitting(false);
    }
  };

  const markAsCompleted = async () => {
    if (isSubmitting) return;

    try {
      setIsSubmitting(true);
      pushUndoSnapshot();
      if (!isPracticeMode && !onComplete) {
        throw new Error('완료 기록 DB 저장 함수가 연결되지 않았습니다.');
      }
      if (!isPracticeMode) {
        await onComplete?.(payload);
      }
      setStatus('completed');
    } catch (error) {
      alert(error instanceof Error ? error.message : '완료 기록 저장 실패');
    } finally {
      setIsSubmitting(false);
    }
  };

  const prepareNextFloorCycle = async () => {
    if (status !== 'completed') return;
    if (!window.confirm('다음 층 인상 준비로 전환하시겠습니까? 실수 전환 시 바로 복원할 수 있습니다.')) {
      return;
    }

    const currentFloor = parseFloorNumber(payload.floor);
    const nextFloor = (currentFloor ?? 0) + 1;
    const previousSnapshot: WorkerSnapshot = {
      payload,
      status
    };

    const nextPayload: GangformPTWPayload = {
      ...createDefaultPayload(payload.building || buildingId),
      building: payload.building || buildingId,
      floor: `${nextFloor}층`
    };

    setCycleUndoSnapshot(previousSnapshot);
    clearLocalDraft(storageKey);
    setUndoStack([]);
    setPayload(nextPayload);
    setStatus('draft');

    if (!isPracticeMode) {
      await onCycleReset?.(nextPayload);
    }
  };

  const restorePreviousCycle = async () => {
    if (!cycleUndoSnapshot || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setPayload(cycleUndoSnapshot.payload);
      setStatus(cycleUndoSnapshot.status);
      setUndoStack([]);

      if (!isPracticeMode) {
        await onRestoreCycle?.(cycleUndoSnapshot.payload, cycleUndoSnapshot.status);
      }

      setCycleUndoSnapshot(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : '이전 층 상태 복원 실패');
    } finally {
      setIsSubmitting(false);
    }
  };

  const shareGangformMessage = (status: '승인 요청' | '인상 진행') => {
    const title = status === '승인 요청' ? 'SMART-SFCS 갱폼 승인 요청' : 'SMART-SFCS 갱폼 인상 진행';
    const text = buildSmartSfcsShareText({
      workType: '갱폼 인상',
      building: payload.building || buildingId,
      floor: payload.floor || '-',
      status
    });
    handleShareMessage(title, text);
  };

  return (
    <section className="bg-white rounded-3xl border border-slate-200 p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-black text-slate-800">갱폼 인상 PTW 작업자 뷰 · {buildingId}</h2>
        <div className="flex items-center gap-2">
          {isPracticeMode && (
            <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 border border-amber-200">
              PRACTICE
            </span>
          )}
          <span className="text-xs font-bold px-3 py-1 rounded-lg bg-slate-100 text-slate-600">상태: {status}</span>
        </div>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPracticeMode((prev) => !prev)}
            className={`px-3 py-1.5 rounded-lg text-xs font-black border ${
              isPracticeMode
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-white text-slate-700 border-slate-300'
            }`}
          >
            {isPracticeMode ? '연습 모드 ON' : '연습 모드 OFF'}
          </button>
          <button
            type="button"
            onClick={handleUndo}
            disabled={undoStack.length === 0 || isSubmitting || Boolean(uploadingKey)}
            className="px-3 py-1.5 rounded-lg text-xs font-black border border-slate-300 bg-white text-slate-700 disabled:opacity-40"
          >
            되돌리기 ({undoStack.length})
          </button>
        </div>
        {isPracticeMode && (
          <p className="text-xs font-bold text-amber-700">연습 모드에서는 승인요청/완료처리가 서버에 저장되지 않습니다.</p>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-sm font-black text-slate-700">작업 위치 정보</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-600">동</label>
            <input
              ref={buildingInputRef}
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
              ref={floorInputRef}
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
          ref={strengthInputRef}
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
            ref={tbmCheckboxRef}
            type="checkbox"
            checked={payload.essentialChecks.tbmAndPPE}
            onChange={(e) => handleCheckChange('tbmAndPPE', e.target.checked)}
          />
          TBM 및 보호구 확인
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            ref={lowerControlCheckboxRef}
            type="checkbox"
            checked={payload.essentialChecks.lowerControl}
            onChange={(e) => handleCheckChange('lowerControl', e.target.checked)}
          />
          하부 통제 및 감시인 배치
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            ref={clearDebrisCheckboxRef}
            type="checkbox"
            checked={payload.essentialChecks.clearDebris}
            onChange={(e) => handleCheckChange('clearDebris', e.target.checked)}
          />
          발판 상부 낙하물 제거
        </label>
      </div>

      <div ref={beforeWorkPhotosRef}>
        <h3 className="text-sm font-black text-slate-700 mb-3">작업 승인신청 필수 사진 5장</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {BEFORE_WORK_KEYS.map((key) => {
            const url = payload.requiredPhotos.beforeWork[key];
            const isUploading = uploadingKey === key;
            return (
              <div key={key} className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                <p className="text-xs font-bold text-slate-700 mb-2">{key}</p>
                <label className="inline-flex items-center px-3 py-2 rounded-lg bg-slate-800 text-white text-xs font-bold cursor-pointer">
                  {isUploading ? '동기화 중...' : '현장 증빙 데이터 동기화'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={isUploading || !canEditBeforeWorkSection}
                    onChange={(e) => handleBeforePhotoUpload(key, e.target.files?.[0] || null)}
                  />
                </label>

                <div className="mt-2 w-full h-48 md:h-64 object-contain bg-gray-100 rounded-lg border border-slate-200 overflow-hidden flex items-center justify-center">
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
        disabled={requestValidation.disabled || isSubmitting}
        className="w-full py-3 rounded-xl bg-blue-600 text-white font-black text-sm disabled:opacity-40"
      >
        안전 작업 허가(PTW) 발급 요청
      </button>

      {requestValidation.unmetIssues.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1">
          <p className="text-xs font-black text-amber-800">요청 버튼이 비활성화된 사유</p>
          {requestValidation.unmetIssues.map((issue, index) => (
            <button
              key={`${issue.message}-${index}`}
              type="button"
              onClick={() => focusValidationTarget(issue.target)}
              className="block text-left text-[11px] text-amber-700 underline underline-offset-2 hover:text-amber-800"
            >
              - {issue.message}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-black text-slate-700">알림 공유 시 전달되는 내용</p>
        <p className="text-[11px] text-slate-600 mt-1">공종(갱폼 인상), 동/층, 현재 상태(승인 요청 또는 인상 진행) 정보를 공유합니다.</p>
      </div>

      {status === 'requested' && (
        <button
          onClick={() => shareGangformMessage('승인 요청')}
          className="w-full py-3 rounded-xl bg-slate-800 text-white font-black text-sm"
        >
          🚀 알림 공유하기
        </button>
      )}

      {(status === 'approved' || status === 'completed') && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
          <h3 className="text-sm font-black text-emerald-700">인상 진행/완료 절차</h3>
          <p className="text-[11px] text-emerald-700/90">
            1) 승인신청 시 고리체결 사진이 이미 필수 반영됩니다. 2) 필요 시 인상 진행 중 추가 사진을 업로드합니다. 3) 작업 종료 시 인상 완료 처리 버튼을 누르세요.
          </p>
          <label className="inline-flex items-center px-3 py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold cursor-pointer">
            {uploadingKey === DURING_WORK_KEY ? '업로드 중...' : '인상 진행 중 추가사진 업로드(선택)'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploadingKey === DURING_WORK_KEY || status === 'completed'}
              onChange={(e) => handleDuringPhotoUpload(e.target.files?.[0] || null)}
            />
          </label>

          <div className="w-full h-48 md:h-64 object-contain bg-gray-100 rounded-lg border border-emerald-200 overflow-hidden flex items-center justify-center">
            {payload.requiredPhotos.duringWork.작업중_안전블럭체결 ? (
              <img
                src={payload.requiredPhotos.duringWork.작업중_안전블럭체결}
                alt={DURING_WORK_KEY}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-[11px] text-emerald-500/80">작업중 사진 미업로드</div>
            )}
          </div>

          {status === 'approved' && (
            <>
              <button
                onClick={() => shareGangformMessage('인상 진행')}
                className="w-full py-2.5 rounded-xl bg-slate-800 text-white text-sm font-black"
              >
                🚀 알림 공유하기
              </button>
              <button
                onClick={markAsCompleted}
                disabled={isSubmitting}
                className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-black disabled:opacity-40"
              >
                인상 완료 처리
              </button>
            </>
          )}
        </div>
      )}

      {status === 'completed' && (
        <div className="space-y-2">
          <button
            onClick={prepareNextFloorCycle}
            disabled={isSubmitting}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-black text-sm disabled:opacity-40"
          >
            다음 층({(nextFloorNumber ?? 0) + 1}층) 인상 준비하기
          </button>
          <p className="text-[11px] text-slate-500">실수로 눌렀을 경우 아래 복원 버튼으로 이전 완료 상태를 되돌릴 수 있습니다.</p>
        </div>
      )}

      {cycleUndoSnapshot && status === 'draft' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-xs font-black text-amber-800">다음 층 준비로 전환되었습니다. 이전 완료 상태로 되돌릴 수 있습니다.</p>
          <button
            type="button"
            onClick={restorePreviousCycle}
            disabled={isSubmitting}
            className="w-full py-2.5 rounded-xl bg-amber-600 text-white text-sm font-black disabled:opacity-40"
          >
            이전 층 완료 상태로 되돌리기
          </button>
        </div>
      )}
    </section>
  );
};

export default GangformPTWWorker;
