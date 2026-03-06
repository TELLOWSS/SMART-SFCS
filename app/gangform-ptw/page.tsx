import React, { useMemo, useState } from 'react';
import GangformPTW from '../../components/GangformPTW';

const BUILDINGS = [
  { id: '101', name: '101동', status: '승인 대기' },
  { id: '102', name: '102동', status: '진행 전' },
  { id: '103', name: '103동', status: '완료' }
] as const;

const GangformPTWPage: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>(BUILDINGS[0].id);

  const selectedBuilding = useMemo(() => {
    return BUILDINGS.find((building) => building.id === selectedId) || BUILDINGS[0];
  }, [selectedId]);

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 p-6 space-y-6">
      <section className="bg-white border border-slate-200 rounded-2xl p-4">
        <h2 className="text-lg font-black mb-3">동별 현황 요약 보드</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {BUILDINGS.map((building) => (
            <div key={building.id} className="rounded-xl border border-slate-200 p-3 bg-slate-50 flex justify-between items-center">
              <span className="font-black text-slate-800">{building.name}</span>
              <span
                className={`text-[11px] font-black px-2.5 py-1 rounded-full border ${
                  building.status === '완료'
                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                    : building.status === '승인 대기'
                    ? 'bg-orange-50 text-orange-600 border-orange-100'
                    : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}
              >
                {building.status}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-4">
        <h2 className="text-sm font-black text-slate-700 mb-3">동 선택</h2>
        <div className="flex flex-wrap gap-2">
          {BUILDINGS.map((building) => (
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

      <GangformPTW buildingId={selectedBuilding.name} role="worker" />
    </main>
  );
};

export default GangformPTWPage;
