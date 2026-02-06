
import React from 'react';
import { Building, ProcessStatus } from '../types';
import { MapPin } from 'lucide-react';

interface SiteMapProps {
  buildings: Building[];
  onSelectBuilding: (buildingId: string) => void;
}

const SiteMap: React.FC<SiteMapProps> = ({ buildings, onSelectBuilding }) => {
  
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

  const getStatusBorderColor = (status: ProcessStatus) => {
    switch (status) {
      case ProcessStatus.POURING: return 'border-purple-500/40 shadow-glow';
      case ProcessStatus.APPROVAL_REQ: return 'border-brand-accent shadow-glow animate-pulse';
      case ProcessStatus.INSTALLING: return 'border-blue-500/40';
      case ProcessStatus.CURED: return 'border-emerald-500/40'; // [New]
      default: return 'border-slate-800';
    }
  };

  const getStatusTextColor = (status: ProcessStatus) => {
    switch (status) {
      case ProcessStatus.POURING: return 'text-purple-400';
      case ProcessStatus.APPROVAL_REQ: return 'text-orange-500';
      case ProcessStatus.INSTALLING: return 'text-blue-400';
      case ProcessStatus.CURED: return 'text-emerald-400'; // [New]
      default: return 'text-slate-400';
    }
  };

  return (
    <div className="bg-[#0A1128] rounded-[2.5rem] p-4 md:p-6 shadow-2xl border border-slate-800 relative overflow-hidden">
      <div className="relative z-10 flex flex-col mb-6">
        <div className="flex items-center space-x-2 mb-2">
          <MapPin className="w-5 h-5 text-orange-500" />
          <h3 className="text-white font-black text-lg tracking-tight">단지 배치 현황 ({buildings.length}개 동 트래킹)</h3>
        </div>
        <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono uppercase">
           <div className="flex space-x-4">
              <span className="flex items-center"><div className="w-1.5 h-1.5 rounded-full bg-purple-600 mr-1.5"></div> 타설중</span>
              <span className="flex items-center"><div className="w-1.5 h-1.5 rounded-full bg-orange-600 mr-1.5"></div> 승인요청</span>
              <span className="flex items-center"><div className="w-1.5 h-1.5 rounded-full bg-blue-600 mr-1.5"></div> 설치중</span>
              <span className="flex items-center"><div className="w-1.5 h-1.5 rounded-full bg-emerald-600 mr-1.5"></div> 양생완료</span>
           </div>
           <span>Active Syncing...</span>
        </div>
      </div>

      <div className="w-full">
        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-3 relative z-10 w-full">
          {buildings.map((building) => {
            const info = getActiveInfo(building);
            return (
              <button
                key={building.id}
                onClick={() => onSelectBuilding(building.id)}
                className={`group relative flex flex-col items-center justify-center py-3 px-1 rounded-xl border transition-all active:scale-[0.95] bg-slate-900/40 backdrop-blur-md ${getStatusBorderColor(info.status)}`}
              >
                <div className="text-[9px] font-black text-slate-300 mb-1 tracking-tighter shadow-sm whitespace-nowrap">
                  {building.name}
                </div>
                <div className={`font-mono font-black text-lg ${getStatusTextColor(info.status)}`}>
                  {info.floor}
                </div>
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
