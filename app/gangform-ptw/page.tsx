import React, { useEffect, useMemo, useRef, useState } from 'react';
import GangformPTW, { type ApprovalStatus, type GangformPTWPayload } from '../../components/GangformPTW';
import { ProcessStatus, type Building } from '../../types';
import {
  saveGangformPtwRecord,
  subscribeToGangformPtwData,
  syncBuildings,
  type GangformPtwStoredMap
} from '../../services/firebaseService';
import { insertGangformPtwCompletedRecord } from '../../services/gangformPtwActions';

interface GangformPtwLocalRecord {
  payload: GangformPTWPayload;
  status: ApprovalStatus;
  updatedAt: string;
  requestedAt?: string | null;
  approvedAt?: string | null;
  completedAt?: string | null;
}

const FALLBACK_BUILDINGS = [
  { id: '101', name: '101동' },
  { id: '102', name: '102동' },
  { id: '103', name: '103동' }
] as const;

const normalizeFloorLabel = (floorText?: string): string => {
  const raw = (floorText || '').trim();
  if (!raw) return '-';
  const matched = raw.match(/\d+/);
  if (!matched) return raw;
  return `${matched[0]}층`;
};

const getElapsedMinutes = (requestedAt?: string | null): number | null => {
  if (!requestedAt) return null;
  const timestamp = new Date(requestedAt).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
};

const GangformPTWPage: React.FC = () => {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [gangformPtwByBuilding, setGangformPtwByBuilding] = useState<Record<string, GangformPtwLocalRecord>>({});
  const [isRealtimeLive, setIsRealtimeLive] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [ptwJumpedBuildingId, setPtwJumpedBuildingId] = useState<string | null>(null);
  const [ptwFocusSignal, setPtwFocusSignal] = useState(0);
  const ptwDetailRef = useRef<HTMLDivElement | null>(null);

  const syncTimeLabel = useMemo(() => {
    if (!lastSyncedAt) return '-';
    const parsed = new Date(lastSyncedAt);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleTimeString('ko-KR', { hour12: false });
  }, [lastSyncedAt]);

  useEffect(() => {
    const unsubscribe = syncBuildings(
      (serverBuildings, isLive) => {
        setBuildings(serverBuildings || []);
        setIsRealtimeLive(isLive);
        setSyncError(null);
        setLastSyncedAt(new Date().toISOString());
      },
      (error) => {
        setIsRealtimeLive(false);
        setSyncError(error?.code ? `동기화 오류: ${error.code}` : '동기화 오류가 발생했습니다.');
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToGangformPtwData((records: GangformPtwStoredMap) => {
      const mapped = Object.entries(records || {}).reduce((acc, [buildingId, record]) => {
        if (!record || !record.payload) return acc;
        acc[buildingId] = {
          payload: record.payload as GangformPTWPayload,
          status: record.status,
          updatedAt: record.updatedAt,
          requestedAt: record.requestedAt || null,
          approvedAt: record.approvedAt || null,
          completedAt: record.completedAt || null
        };
        return acc;
      }, {} as Record<string, GangformPtwLocalRecord>);
      setGangformPtwByBuilding(mapped);
      setLastSyncedAt(new Date().toISOString());
    });
    return () => unsubscribe();
  }, []);

  const boardBuildings = useMemo(() => {
    if (buildings.length > 0) {
      return buildings.map((building) => ({ id: building.id, name: building.name }));
    }

    return FALLBACK_BUILDINGS.map((building) => ({ id: building.id, name: building.name }));
  }, [buildings]);

  const getBuildingPtwStatus = (buildingId: string): '진행 전' | '승인 대기' | '인상중' | '인상 완료' => {
    const ptwStatus = gangformPtwByBuilding[buildingId]?.status;
    if (ptwStatus === 'requested') return '승인 대기';
    if (ptwStatus === 'approved') return '인상중';
    if (ptwStatus === 'completed') return '인상 완료';

    const targetBuilding = buildings.find((building) => building.id === buildingId);
    if (!targetBuilding) return '진행 전';

    const activeUnits = targetBuilding.floors.flatMap((floor) => floor.units).filter((unit) => !unit.isDeadUnit);
    if (activeUnits.some((unit) => unit.status === ProcessStatus.APPROVAL_REQ)) return '승인 대기';
    if (activeUnits.length > 0 && activeUnits.every((unit) => unit.status === ProcessStatus.CURED || unit.status === ProcessStatus.APPROVED)) return '인상 완료';

    return '진행 전';
  };

  const ptwSummary = useMemo(() => {
    return boardBuildings
      .map((building) => {
        const record = gangformPtwByBuilding[building.id];
        const status = getBuildingPtwStatus(building.id);
        const floorLabel = normalizeFloorLabel(record?.payload?.floor);
        const elapsedMinutes = status === '승인 대기' ? getElapsedMinutes(record?.requestedAt || null) : null;

        return {
          ...building,
          floorLabel,
          status,
          elapsedMinutes,
          sortPriority: status === '승인 대기' ? 0 : 1
        };
      })
      .sort((a, b) => {
        if (a.sortPriority !== b.sortPriority) return a.sortPriority - b.sortPriority;
        if (a.status === '승인 대기' && b.status === '승인 대기') {
          return (b.elapsedMinutes || 0) - (a.elapsedMinutes || 0);
        }
        return a.name.localeCompare(b.name, 'ko');
      });
  }, [boardBuildings, gangformPtwByBuilding]);

  useEffect(() => {
    if (!selectedId && boardBuildings.length > 0) {
      setSelectedId(boardBuildings[0].id);
      return;
    }

    if (selectedId && !boardBuildings.some((building) => building.id === selectedId) && boardBuildings.length > 0) {
      setSelectedId(boardBuildings[0].id);
    }
  }, [boardBuildings, selectedId]);

  const selectedBuilding = useMemo(() => {
    if (boardBuildings.length === 0) return null;
    return boardBuildings.find((building) => building.id === selectedId) || boardBuildings[0];
  }, [boardBuildings, selectedId]);

  const focusPtwDetailView = (buildingId: string) => {
    setSelectedId(buildingId);
    setPtwJumpedBuildingId(buildingId);
    setPtwFocusSignal((prev) => prev + 1);
    window.setTimeout(() => {
      ptwDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      ptwDetailRef.current?.focus();
    }, 60);
  };

  useEffect(() => {
    if (!ptwJumpedBuildingId) return;
    const timer = window.setTimeout(() => setPtwJumpedBuildingId(null), 2500);
    return () => window.clearTimeout(timer);
  }, [ptwJumpedBuildingId]);

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 p-6 space-y-6">
      <section className="bg-white border border-slate-200 rounded-2xl p-4 flex justify-end">
        <a
          href="/gangform-ptw/history"
          className="inline-flex items-center px-3 py-2 rounded-xl text-xs font-black border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        >
          히스토리 대시보드
        </a>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`px-2.5 py-1 rounded-full border font-black ${isRealtimeLive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
            {isRealtimeLive ? '실시간 연동 정상 (PC/모바일)' : '오프라인/재연결 중'}
          </span>
          <span className="px-2.5 py-1 rounded-full border font-black bg-slate-50 text-slate-700 border-slate-200">
            마지막 동기화: {syncTimeLabel}
          </span>
        </div>
        <p className="text-[11px] text-slate-600">
          같은 동/층에서 상태를 변경하면 PC와 핸드폰 양쪽 화면에 수 초 내 동일하게 반영되어야 정상입니다.
        </p>
        {syncError && <p className="text-[11px] font-bold text-red-600">{syncError}</p>}
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-4">
        <h2 className="text-lg font-black mb-3">동별 현황 요약 보드</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {ptwSummary.map((item) => (
            <button
              key={item.id}
              onClick={() => focusPtwDetailView(item.id)}
              className={`rounded-xl border p-3 bg-slate-50 flex justify-between items-center transition-colors ${
                ptwJumpedBuildingId === item.id
                  ? 'border-brand-primary ring-2 ring-brand-primary/25'
                  : 'border-slate-200 hover:border-brand-primary/50'
              }`}
            >
              <span className="font-black text-slate-800">{item.name} {item.floorLabel}</span>
              <span
                className={`text-[11px] font-black px-2.5 py-1 rounded-full border ${
                  item.status === '인상 완료'
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                    : item.status === '승인 대기'
                    ? 'bg-orange-50 text-orange-600 border-orange-100'
                    : item.status === '인상중'
                    ? 'bg-blue-50 text-blue-600 border-blue-100'
                    : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}
              >
                {item.status}
                {item.status === '승인 대기' && typeof item.elapsedMinutes === 'number' ? ` · ${item.elapsedMinutes}분` : ''}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-4">
        <h2 className="text-sm font-black text-slate-700 mb-3">동 선택</h2>
        <div className="flex flex-wrap gap-2">
          {boardBuildings.map((building) => (
            <button
              key={building.id}
              onClick={() => setSelectedId(building.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all border ${
                selectedId === building.id
                  ? 'bg-brand-primary text-white border-brand-primary'
                  : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              {building.name}
            </button>
          ))}
        </div>
      </section>

      {selectedBuilding && (
        <div ref={ptwDetailRef} tabIndex={-1} className="outline-none">
          {ptwJumpedBuildingId === selectedBuilding.id && (
            <div className="mb-3 inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
              요약보드에서 {selectedBuilding.name} PTW 뷰로 이동됨
            </div>
          )}
          <GangformPTW
            buildingId={selectedBuilding.name}
            role="worker"
            initialData={gangformPtwByBuilding[selectedBuilding.id]?.payload}
            initialStatus={gangformPtwByBuilding[selectedBuilding.id]?.status || 'draft'}
            remoteUpdatedAt={gangformPtwByBuilding[selectedBuilding.id]?.updatedAt || null}
            focusFloorSignal={ptwFocusSignal}
            onPayloadChange={async (payload, workerStatus) => {
            const now = new Date().toISOString();
            const current = gangformPtwByBuilding[selectedBuilding.id];
            const nextRecord = {
              payload,
              status: workerStatus || current?.status || 'draft',
              updatedAt: now,
              requestedAt: current?.requestedAt || null,
              approvedAt: current?.approvedAt || null,
              completedAt: current?.completedAt || null
            };
            await saveGangformPtwRecord(selectedBuilding.id, nextRecord);
            setGangformPtwByBuilding((prev) => ({
              ...prev,
              [selectedBuilding.id]: nextRecord
            }));
            }}
            onRestoreCycle={async (payload, restoredStatus) => {
            const now = new Date().toISOString();
            const current = gangformPtwByBuilding[selectedBuilding.id];
            const nextRecord = {
              payload,
              status: restoredStatus,
              updatedAt: now,
              requestedAt: current?.requestedAt || null,
              approvedAt: current?.approvedAt || null,
              completedAt: restoredStatus === 'completed' ? (current?.completedAt || now) : current?.completedAt || null
            };
            await saveGangformPtwRecord(selectedBuilding.id, nextRecord);
            setGangformPtwByBuilding((prev) => ({
              ...prev,
              [selectedBuilding.id]: nextRecord
            }));
            }}
            onSubmit={async (payload) => {
            const requestedAt = new Date().toISOString();
            const nextRecord = {
              payload,
              status: 'requested' as ApprovalStatus,
              updatedAt: requestedAt,
              requestedAt,
              approvedAt: null,
              completedAt: null
            };
            await saveGangformPtwRecord(selectedBuilding.id, nextRecord);
            setGangformPtwByBuilding((prev) => ({
              ...prev,
              [selectedBuilding.id]: nextRecord
            }));
            }}
            onComplete={async (payload) => {
            await insertGangformPtwCompletedRecord(payload);
            const completedAt = new Date().toISOString();
            const current = gangformPtwByBuilding[selectedBuilding.id];
            const nextRecord = {
              payload,
              status: 'completed' as ApprovalStatus,
              updatedAt: completedAt,
              requestedAt: current?.requestedAt || null,
              approvedAt: current?.approvedAt || null,
              completedAt
            };
            await saveGangformPtwRecord(selectedBuilding.id, nextRecord);
            setGangformPtwByBuilding((prev) => ({
              ...prev,
              [selectedBuilding.id]: nextRecord
            }));
            }}
            onCycleReset={async (payload) => {
            const now = new Date().toISOString();
            const nextRecord = {
              payload,
              status: 'draft' as ApprovalStatus,
              updatedAt: now,
              requestedAt: null,
              approvedAt: null,
              completedAt: null
            };
            await saveGangformPtwRecord(selectedBuilding.id, nextRecord);
            setGangformPtwByBuilding((prev) => ({
              ...prev,
              [selectedBuilding.id]: nextRecord
            }));
            }}
          />
        </div>
      )}
    </main>
  );
};

export default GangformPTWPage;
