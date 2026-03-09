
import React from 'react';
import { Building, ProcessStatus } from '../types';
import { MapPin, Layers } from 'lucide-react';

type GangformCellStatus = 'draft' | 'requested' | 'approved' | 'completed' | 'rejected';

interface GangformStatusRecord {
  status: GangformCellStatus;
  payload?: {
    floor?: string;
  };
}

interface SiteMapProps {
  buildings: Building[];
  gangformByBuilding?: Record<string, GangformStatusRecord>;
  onSelectBuilding: (buildingId: string) => void;
}

const SiteMap: React.FC<SiteMapProps> = ({ buildings, gangformByBuilding = {}, onSelectBuilding }) => {
  
  // [공구 구분 헬퍼 함수]
  const getZoneInfo = (buildingName: string) => {
    const num = parseInt(buildingName.replace(/[^0-9]/g, ''));
    // 2공구: 2006~2010, 3001~3003
    const isZone2 = [2006, 2007, 2008, 2009, 2010, 3001, 3002, 3003].includes(num);
    
    if (isZone2) {
        return { 
            label: '2공구', 
            company: '오엔', 
            badgeColor: 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.4)]', 
            textColor: 'text-white' 
        };
    }
    return { 
        label: '1공구', 
        company: '휘강', 
        badgeColor: 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.4)]', 
        textColor: 'text-white' 
    };
  };

  const getActiveInfo = (building: Building) => {
    // [Updated] Include CURED in active units to display completed floors
    // [Fix] Filter out dead units so they don't incorrectly show as completed progress
    const activeUnits = building.floors
      .flatMap(f => f.units)
      .filter(u => !u.isDeadUnit && u.status !== ProcessStatus.NOT_STARTED);

    if (activeUnits.length === 0) return { floor: '-', status: ProcessStatus.NOT_STARTED };

    const pouring = activeUnits.find(u => u.status === ProcessStatus.POURING);
    if (pouring) return { floor: pouring.id.split('-')[1] + 'F', status: ProcessStatus.POURING };

    const approval = activeUnits.find(u => u.status === ProcessStatus.APPROVAL_REQ);
    if (approval) return { floor: approval.id.split('-')[1] + 'F', status: ProcessStatus.APPROVAL_REQ };

    const installing = activeUnits.find(u => u.status === ProcessStatus.INSTALLING);
    if (installing) return { floor: installing.id.split('-')[1] + 'F', status: ProcessStatus.INSTALLING };

    // [New] Check for CURED status (highest floor)
    const curedList = activeUnits.filter(u => u.status === ProcessStatus.CURED);
    if (curedList.length > 0) {
        // Find the unit with the highest floor number
        const highestCured = curedList.reduce((prev, curr) => {
            const prevFloor = parseInt(prev.id.split('-')[1]);
            const currFloor = parseInt(curr.id.split('-')[1]);
            return prevFloor > currFloor ? prev : curr;
        });
        return { floor: highestCured.id.split('-')[1] + 'F', status: ProcessStatus.CURED };
    }

    return { floor: '마감', status: ProcessStatus.APPROVED };
  };

  const getFloorAlStatus = (building: Building, floorLevel: number): ProcessStatus => {
    const floor = building.floors.find((f) => f.level === floorLevel);
    if (!floor) return ProcessStatus.NOT_STARTED;

    const activeUnits = floor.units.filter((unit) => !unit.isDeadUnit);
    if (activeUnits.length === 0) return ProcessStatus.NOT_STARTED;

    if (activeUnits.some((unit) => unit.status === ProcessStatus.POURING)) return ProcessStatus.POURING;
    if (activeUnits.some((unit) => unit.status === ProcessStatus.APPROVAL_REQ)) return ProcessStatus.APPROVAL_REQ;
    if (activeUnits.some((unit) => unit.status === ProcessStatus.INSTALLING)) return ProcessStatus.INSTALLING;
    if (activeUnits.every((unit) => unit.status === ProcessStatus.CURED)) return ProcessStatus.CURED;
    if (activeUnits.every((unit) => unit.status === ProcessStatus.APPROVED || unit.status === ProcessStatus.CURED)) return ProcessStatus.APPROVED;

    return ProcessStatus.NOT_STARTED;
  };

  const parseGangformFloor = (floorText?: string): number | null => {
    if (!floorText) return null;
    const matched = floorText.match(/\d+/);
    if (!matched) return null;
    return Number(matched[0]);
  };

  const getGangformLabel = (status: GangformCellStatus | null): string => {
    if (status === 'requested') return '승인 요청';
    if (status === 'approved') return '허가 발급';
    if (status === 'completed') return '인상 완료 (안전 확보)';
    if (status === 'rejected') return '반려';
    return '진행 전';
  };

  const getGangformTooltipLabel = (status: GangformCellStatus | null, floor: number | null): string => {
    const statusLabel = getGangformLabel(status);
    if (!status || status === 'draft') return statusLabel;
    return floor ? `${floor}층 ${statusLabel}` : statusLabel;
  };

  const getGangformBadgeClass = (status: GangformCellStatus | null): string => {
    if (status === 'requested') return 'bg-orange-500 animate-pulse';
    if (status === 'approved' || status === 'completed') return 'bg-emerald-500';
    if (status === 'rejected') return 'bg-red-500';
    return 'bg-slate-400/70';
  };

  const getStatusBorderColor = (status: ProcessStatus) => {
    switch (status) {
      case ProcessStatus.POURING: return 'border-purple-500/60 shadow-glow bg-purple-900/20';
      case ProcessStatus.APPROVAL_REQ: return 'border-brand-accent shadow-glow animate-pulse bg-orange-900/20';
      case ProcessStatus.INSTALLING: return 'border-blue-500/40 bg-blue-900/10';
      case ProcessStatus.CURED: return 'border-emerald-500/40 bg-emerald-900/10'; // [New]
      default: return 'border-slate-800 bg-slate-900/40';
    }
  };

  const getStatusTextColor = (status: ProcessStatus) => {
    switch (status) {
      case ProcessStatus.POURING: return 'text-purple-400';
      case ProcessStatus.APPROVAL_REQ: return 'text-orange-500';
      case ProcessStatus.INSTALLING: return 'text-blue-400';
      case ProcessStatus.CURED: return 'text-emerald-400'; // [New]
      default: return 'text-slate-500';
    }
  };

  return (
    <div className="bg-[#0A1128] rounded-[2.5rem] p-4 md:p-6 shadow-2xl border border-slate-800 relative overflow-hidden">
      <div className="relative z-10 flex flex-col mb-6">
        <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
                <MapPin className="w-5 h-5 text-orange-500" />
                <h3 className="text-white font-black text-lg tracking-tight">단지 배치 현황</h3>
            </div>
            {/* 공구 범례 추가 */}
            <div className="flex space-x-2">
                <div className="flex items-center px-2 py-1 rounded-md bg-indigo-500/20 border border-indigo-500/30">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mr-1.5"></div>
                    <span className="text-[9px] font-black text-indigo-300">1공구(휘강)</span>
                </div>
                <div className="flex items-center px-2 py-1 rounded-md bg-rose-500/20 border border-rose-500/30">
                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5"></div>
                    <span className="text-[9px] font-black text-rose-300">2공구(오엔)</span>
                </div>
            </div>
        </div>
        <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono uppercase mt-2 pl-1">
           <div className="flex space-x-4">
              <span className="flex items-center"><div className="w-1.5 h-1.5 rounded-full bg-purple-600 mr-1.5"></div> 타설중</span>
              <span className="flex items-center"><div className="w-1.5 h-1.5 rounded-full bg-orange-600 mr-1.5"></div> 승인요청</span>
              <span className="flex items-center"><div className="w-1.5 h-1.5 rounded-full bg-blue-600 mr-1.5"></div> 설치중</span>
              <span className="flex items-center"><div className="w-1.5 h-1.5 rounded-full bg-emerald-600 mr-1.5"></div> 양생완료</span>
           </div>
           <span className="flex items-center gap-1 text-slate-600"><Layers className="w-3 h-3"/> {buildings.length} Zones</span>
        </div>
      </div>

      <div className="w-full">
        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-3 relative z-10 w-full">
          {buildings.map((building) => {
            const info = getActiveInfo(building);
            const zone = getZoneInfo(building.name);
            const activeFloor = parseInt(info.floor.replace(/[^0-9]/g, ''), 10);
            const gangformRecord = gangformByBuilding[building.id];
            const gangformFloor = parseGangformFloor(gangformRecord?.payload?.floor);
            const gangformStatus = gangformRecord?.status ?? null;

            const floorRows = building.floors.map((floor) => {
              return {
                floorLevel: floor.level,
                alStatus: getFloorAlStatus(building, floor.level)
              };
            });

            const displayFloorRow = floorRows.find((row) => row.floorLevel === activeFloor)
              || floorRows.find((row) => row.alStatus !== ProcessStatus.NOT_STARTED)
              || floorRows[floorRows.length - 1];

            const tooltipText = `[${building.name} ${displayFloorRow?.floorLevel || '-'}층]\n▶ AL폼: ${displayFloorRow?.alStatus || ProcessStatus.NOT_STARTED}\n▶ 갱폼 인상: ${getGangformTooltipLabel(gangformStatus, gangformFloor)}`;
            const showGangformBadge = Boolean(gangformStatus && gangformStatus !== 'draft');
            const gangformBadgeText = gangformFloor ? String(gangformFloor) : 'G';
            
            return (
              <button
                key={building.id}
                onClick={() => onSelectBuilding(building.id)}
                title={tooltipText}
                aria-label={tooltipText}
                className={`group relative flex flex-col items-center justify-center py-4 px-1 rounded-xl border transition-all active:scale-[0.95] backdrop-blur-md overflow-hidden ${getStatusBorderColor(info.status)}`}
              >
                {/* Zone Indicator Badge */}
                <div className={`absolute top-0 left-0 px-1.5 py-[2px] rounded-br-lg text-[8px] font-black tracking-tighter z-10 ${zone.badgeColor} ${zone.textColor}`}>
                    {zone.label}
                </div>

                {showGangformBadge && (
                  <div className={`absolute top-1.5 right-1.5 min-w-5 h-5 px-1 rounded-full text-[9px] font-black text-white flex items-center justify-center z-10 shadow-md ${getGangformBadgeClass(gangformStatus)}`}>
                    {gangformBadgeText}
                  </div>
                )}

                <div className="text-[10px] font-black text-slate-300 mb-1 tracking-tighter shadow-sm whitespace-nowrap mt-1">
                  {building.name}
                </div>
                <div className={`font-mono font-black text-xl ${getStatusTextColor(info.status)}`}>
                  {info.floor}
                </div>
                
                {/* Hover Effect */}
                <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-5 transition-opacity"></div>
              </button>
            );
          })}
        </div>
      </div>
      
      <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/10 rounded-full blur-[100px] pointer-events-none"></div>
    </div>
  );
};

export default SiteMap;
