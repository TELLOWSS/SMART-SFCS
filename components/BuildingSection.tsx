
import React, { useState, useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown, Check, AlertCircle, Lock, HardHat, MoreHorizontal, Zap, X, ArrowRight, ShieldCheck, AlertTriangle, RotateCcw, Target, Building as BuildingIcon, Share2, Copy, Ghost, Hammer } from 'lucide-react';
import { Building, Floor, ProcessStatus, UserRole } from '../types';

interface BuildingSectionProps {
  building: Building;
  userRole: UserRole;
  onUpdateStatus: (floorLevel: number, unitId: string, unitNumber: string, currentStatus: ProcessStatus, nextStatus: ProcessStatus, isRevert: boolean) => void;
  onUpdateMep: (floorLevel: number, unitId: string, completed: boolean) => void;
  jumpToFloor?: number;
  onJumpHandled?: () => void;
}

const STATUS_STYLES = {
  [ProcessStatus.NOT_STARTED]: 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300',
  [ProcessStatus.INSTALLING]: 'bg-yellow-50 border-yellow-400 text-yellow-800 stripe-pattern', 
  [ProcessStatus.APPROVAL_REQ]: 'bg-orange-50 border-brand-accent text-brand-accent ring-1 ring-brand-accent', 
  [ProcessStatus.APPROVED]: 'bg-blue-50 border-blue-500 text-blue-700',
  [ProcessStatus.POURING]: 'bg-purple-50 border-purple-500 text-purple-700',
  [ProcessStatus.CURED]: 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-inner',
};

const BuildingSection: React.FC<BuildingSectionProps> = ({ building, userRole, onUpdateStatus, onUpdateMep, jumpToFloor, onJumpHandled }) => {
  const [viewOffset, setViewOffset] = useState(0);
  const VIEW_SIZE = 3; 
  const hasInitializedFocus = useRef(false);

  // 실시간 반영을 위해 렌더링 시마다 즉시 정렬 (메모이제이션 제거)
  const sortedFloors = [...building.floors].sort((a, b) => b.level - a.level);
  const visibleFloors = sortedFloors.slice(viewOffset, viewOffset + VIEW_SIZE);
  
  const canScrollUp = viewOffset > 0;
  const canScrollDown = viewOffset + VIEW_SIZE < sortedFloors.length;

  const getActiveFloorIndex = () => {
      const idx = sortedFloors.findIndex(f => 
          f.units.some(u => !u.isDeadUnit && u.status !== ProcessStatus.NOT_STARTED)
      );
      if (idx !== -1) return idx;
      return sortedFloors.length - 1; 
  };

  useEffect(() => {
    if (!hasInitializedFocus.current && sortedFloors.length > 0) {
         const activeIndex = getActiveFloorIndex();
         let targetOffset = activeIndex - Math.floor(VIEW_SIZE / 2);
         targetOffset = Math.max(0, Math.min(sortedFloors.length - VIEW_SIZE, targetOffset));
         setViewOffset(targetOffset);
         hasInitializedFocus.current = true;
    }
  }, [building.id]);

  useEffect(() => {
    if (jumpToFloor !== undefined) {
       const targetIdx = sortedFloors.findIndex(f => f.level === jumpToFloor);
       if (targetIdx !== -1) {
          const newOffset = Math.max(0, Math.min(sortedFloors.length - VIEW_SIZE, targetIdx - Math.floor(VIEW_SIZE/2)));
          setViewOffset(newOffset);
       }
       onJumpHandled?.();
    }
  }, [jumpToFloor, onJumpHandled]);

  const handleScroll = (direction: 'up' | 'down') => {
    if (direction === 'up' && canScrollUp) setViewOffset(Math.max(0, viewOffset - VIEW_SIZE));
    else if (direction === 'down' && canScrollDown) setViewOffset(Math.min(sortedFloors.length - VIEW_SIZE, viewOffset + VIEW_SIZE));
  };

  const pendingRequests = building.floors.filter(f => f.units.some(u => u.status === ProcessStatus.APPROVAL_REQ));

  const jumpToFirstPending = () => {
    if (pendingRequests.length > 0) {
        const highestPendingFloor = Math.max(...pendingRequests.map(f => f.level));
        const targetIdx = sortedFloors.findIndex(f => f.level === highestPendingFloor);
        setViewOffset(Math.max(0, Math.min(sortedFloors.length - VIEW_SIZE, targetIdx)));
    }
  };

  const handleAction = (floorLevel: number, unitId: string, currentStatus: ProcessStatus, isDead: boolean, mepCompleted: boolean) => {
    if (isDead) return;

    if (currentStatus === ProcessStatus.APPROVED) {
        if (!mepCompleted) {
            onUpdateMep(floorLevel, unitId, true);
            return;
        }
    }

    let nextStatus = currentStatus;
    let isRevert = false;

    if (userRole === UserRole.ADMIN || userRole === UserRole.CREATOR) {
        if (currentStatus === ProcessStatus.APPROVAL_REQ) nextStatus = ProcessStatus.APPROVED;
        else if (currentStatus === ProcessStatus.APPROVED && mepCompleted) nextStatus = ProcessStatus.POURING;
        else if (currentStatus === ProcessStatus.POURING) nextStatus = ProcessStatus.CURED;
        else if (currentStatus === ProcessStatus.CURED) {
            nextStatus = ProcessStatus.NOT_STARTED; 
            isRevert = true;
        } else if (currentStatus === ProcessStatus.NOT_STARTED) {
             nextStatus = ProcessStatus.INSTALLING;
        } else if (currentStatus === ProcessStatus.INSTALLING) {
             nextStatus = ProcessStatus.APPROVAL_REQ;
        }
    } else {
      // Worker Logic
      if (currentStatus === ProcessStatus.NOT_STARTED) nextStatus = ProcessStatus.INSTALLING;
      else if (currentStatus === ProcessStatus.INSTALLING) nextStatus = ProcessStatus.APPROVAL_REQ;
      else if (currentStatus === ProcessStatus.APPROVAL_REQ) { nextStatus = ProcessStatus.INSTALLING; isRevert = true; }
    }

    if (nextStatus !== currentStatus) {
       const floor = building.floors.find(f => f.level === floorLevel);
       const unit = floor?.units.find(u => u.id === unitId);
       if (unit) {
         onUpdateStatus(floorLevel, unitId, unit.unitNumber, currentStatus, nextStatus, isRevert);
       }
    }
  };

  const getGridCols = (unitsCount: number) => {
    if (unitsCount >= 5) return 'grid-cols-2 sm:grid-cols-3';
    return 'grid-cols-2';
  };

  return (
    <div className="bg-white rounded-2xl shadow-tech border border-slate-200 flex flex-col h-full overflow-hidden transition-all hover:shadow-xl">
      <div className="bg-slate-50 px-4 py-3.5 border-b border-slate-200 flex justify-between items-center">
        <div className="flex flex-col">
          <h3 className="font-black text-slate-800 font-mono tracking-tight text-base">{building.name}</h3>
          {pendingRequests.length > 0 && (
              <button 
                onClick={jumpToFirstPending}
                className="flex items-center text-[10px] text-orange-600 font-black hover:underline animate-pulse mt-0.5"
              >
                <Target className="w-3 h-3 mr-1" /> 승인요청 {pendingRequests.length}구간 이동
              </button>
          )}
        </div>
        <div className={`text-[9px] font-bold px-2 py-0.5 rounded-full border shadow-sm ${userRole === UserRole.ADMIN || userRole === UserRole.CREATOR ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-600 border-slate-200 uppercase'}`}>
          {userRole}
        </div>
      </div>

      <div className="flex justify-center bg-slate-50 border-b border-slate-200 py-1.5 active:bg-slate-100 transition-colors">
        <button 
          onClick={() => handleScroll('up')} 
          disabled={!canScrollUp} 
          className={`p-1.5 rounded-full ${canScrollUp ? 'text-slate-600 hover:bg-slate-200' : 'text-slate-200'}`}
        >
          <ChevronUp className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 relative bg-grid-pattern p-3 md:p-4 space-y-4 min-h-[350px] overflow-y-auto">
        {visibleFloors.map((floor) => (
          <div key={`${floor.level}-${building.id}`} className="flex items-stretch border-b border-slate-200/60 pb-4 last:border-0 last:pb-0">
            <div className="w-12 md:w-14 shrink-0 flex flex-col justify-center items-center mr-2 md:mr-3 border-r border-slate-200 relative pr-2 md:pr-3">
              <span className="font-mono text-lg md:text-xl font-black text-slate-500">{floor.level}F</span>
              {floor.units.some(u => u.status === ProcessStatus.APPROVAL_REQ) && (
                  <div className="absolute right-[-4px] top-1/2 -translate-y-1/2 w-2 h-2 bg-brand-accent rounded-full animate-ping"></div>
              )}
            </div>
            <div className={`flex-1 grid gap-2 md:gap-3 min-w-0 w-full max-w-full ${getGridCols(floor.units.length)}`}>
              {floor.units.map((unit) => (
                  <button 
                    // [핵심 수정] React Key에 'mepCompleted'를 추가하여 텍스트/상태 변경 시 컴포넌트가 확실하게 리렌더링되도록 보장
                    // status가 같아도 mepCompleted가 변경되면(예: 기전작업요망 -> 타설준비) 버튼을 새로 그려야 함
                    key={`${unit.id}-${unit.status}-${unit.mepCompleted}`}
                    onClick={() => handleAction(floor.level, unit.id, unit.status, !!unit.isDeadUnit, unit.mepCompleted)}
                    disabled={!!unit.isDeadUnit}
                    className={`relative p-2 md:p-3 rounded-xl border-l-[4px] text-left transition-all active:scale-95 shadow-sm flex flex-col justify-between h-20 md:h-24 overflow-hidden w-full max-w-full min-w-0 ${
                      unit.isDeadUnit 
                      ? 'bg-slate-100 border-slate-300 opacity-40 grayscale cursor-not-allowed' 
                      : `bg-white ${STATUS_STYLES[unit.status] || 'border-slate-200'}`
                    }`}
                  >
                    <div className="flex justify-between items-start w-full min-w-0 overflow-hidden">
                        <span className="font-black text-base md:text-lg font-mono tracking-tighter z-10 truncate pr-1 flex-1">
                          {unit.isDeadUnit ? 'N/A' : unit.unitNumber}
                        </span>
                        
                        {!unit.isDeadUnit && unit.status === ProcessStatus.APPROVED && (
                            <div className={`z-10 px-1.5 py-0.5 rounded-md flex items-center gap-0.5 border shrink-0 ${unit.mepCompleted ? 'bg-yellow-400 border-yellow-500 text-white' : 'bg-slate-200/50 border-slate-300 text-slate-400'}`}>
                                <Zap className="w-3 h-3 fill-current" />
                                <span className="text-[9px] font-black whitespace-nowrap">{unit.mepCompleted ? '완료' : '대기'}</span>
                            </div>
                        )}
                    </div>
                    
                    <div className="flex items-center justify-between mt-1 z-10 w-full min-w-0 max-w-full overflow-hidden">
                      <div className="flex-1 min-w-0 overflow-hidden mr-1">
                         <span className="text-[10px] md:text-[11px] font-black uppercase truncate block w-full">
                           {unit.isDeadUnit ? '비활성' : (
                              unit.status === ProcessStatus.APPROVED ? 
                                (unit.mepCompleted ? '승인완료 (타설준비)' : '승인완료 (기전요망)') :
                              unit.status
                           )}
                         </span>
                      </div>
                      
                      {unit.isDeadUnit ? (
                        <Ghost className="w-4 h-4 text-slate-400 shrink-0" />
                      ) : (
                        unit.status === ProcessStatus.APPROVAL_REQ && (
                            <div className="shrink-0 w-5 h-5 flex items-center justify-center">
                                <AlertCircle className="w-full h-full text-brand-accent animate-pulse" />
                            </div>
                        )
                      )}
                    </div>
                  </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-center bg-slate-50 border-t border-slate-200 py-1.5 active:bg-slate-100 transition-colors">
        <button 
          onClick={() => handleScroll('down')} 
          disabled={!canScrollDown} 
          className={`p-1.5 rounded-full ${canScrollDown ? 'text-slate-600 hover:bg-slate-200' : 'text-slate-200'}`}
        >
          <ChevronDown className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default BuildingSection;
