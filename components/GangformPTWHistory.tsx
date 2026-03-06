import React, { useEffect, useMemo, useState } from 'react';
import { fetchGangformPtwHistory, type GangformPtwRecordRow } from '../services/gangformPtwActions';

const formatDateTime = (isoString: string): string => {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

const GangformPTWHistory: React.FC = () => {
  const [records, setRecords] = useState<GangformPtwRecordRow[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<string>('ALL');
  const [selectedRecord, setSelectedRecord] = useState<GangformPtwRecordRow | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const loadHistory = async (buildingFilter: string) => {
    try {
      setLoading(true);
      setErrorMessage('');
      const data = await fetchGangformPtwHistory(buildingFilter);
      setRecords(data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '히스토리 조회에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory(selectedBuilding);
  }, [selectedBuilding]);

  const buildingOptions = useMemo(() => {
    const unique = Array.from(new Set(records.map((record) => record.building)));
    return ['ALL', ...unique];
  }, [records]);

  const getBeforeWorkPhotos = (record: GangformPtwRecordRow): string[] => {
    const beforeWork = Array.isArray(record.photos?.beforeWork) ? record.photos.beforeWork : [];
    if (beforeWork.length > 0) return beforeWork.slice(0, 4);

    const fromAll = Array.isArray(record.photos?.all) ? record.photos.all : [];
    return fromAll.slice(0, 4);
  };

  const getDuringWorkPhotos = (record: GangformPtwRecordRow): string[] => {
    const duringWork = Array.isArray(record.photos?.duringWork) ? record.photos.duringWork : [];
    if (duringWork.length > 0) return duringWork.slice(0, 1);

    const fromAll = Array.isArray(record.photos?.all) ? record.photos.all : [];
    return fromAll.slice(4, 5);
  };

  const getEvidenceCount = (record: GangformPtwRecordRow): number => {
    const beforeCount = getBeforeWorkPhotos(record).filter(Boolean).length;
    const duringCount = getDuringWorkPhotos(record).filter(Boolean).length;
    const total = beforeCount + duringCount;
    return total > 5 ? 5 : total;
  };

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 p-6 space-y-6">
      <section className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 space-y-4">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-slate-900">갱폼 PTW 히스토리 대시보드</h1>
            <p className="text-sm text-slate-500">법적 증빙용 완료 기록 조회 · 최신순</p>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="history-building" className="text-sm font-bold text-slate-600">동 필터</label>
            <select
              id="history-building"
              value={selectedBuilding}
              onChange={(e) => setSelectedBuilding(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
            >
              {buildingOptions.map((building) => (
                <option key={building} value={building}>
                  {building === 'ALL' ? '전체 동' : building}
                </option>
              ))}
            </select>
          </div>
        </header>

        {loading && <p className="text-sm text-slate-500">기록을 불러오는 중입니다...</p>}
        {errorMessage && <p className="text-sm font-bold text-red-600">{errorMessage}</p>}

        {!loading && !errorMessage && (
          <div className="overflow-x-auto">
            <table className="min-w-full border border-slate-200 rounded-xl overflow-hidden">
              <thead className="bg-slate-100 text-slate-700 text-xs">
                <tr>
                  <th className="px-3 py-2 text-left font-black">날짜/시간</th>
                  <th className="px-3 py-2 text-left font-black">동/층</th>
                  <th className="px-3 py-2 text-left font-black">압축강도</th>
                  <th className="px-3 py-2 text-left font-black">증빙</th>
                  <th className="px-3 py-2 text-left font-black">상태</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr
                    key={record.id}
                    onClick={() => setSelectedRecord(record)}
                    className="cursor-pointer border-t border-slate-200 hover:bg-slate-50"
                  >
                    <td className="px-3 py-2 text-sm text-slate-700">{formatDateTime(record.created_at)}</td>
                    <td className="px-3 py-2 text-sm font-bold text-slate-800">{record.building} {record.floor}</td>
                    <td className="px-3 py-2 text-sm text-slate-700">{record.compressive_strength}</td>
                    <td className="px-3 py-2 text-sm">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-black ${
                        getEvidenceCount(record) === 5
                          ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                          : 'bg-amber-50 text-amber-600 border-amber-100'
                      }`}>
                        {getEvidenceCount(record)}/5
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-black bg-emerald-50 text-emerald-600 border-emerald-100">
                        🟢 {record.status}
                      </span>
                    </td>
                  </tr>
                ))}

                {records.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-400">조회된 완료 기록이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedRecord && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-6xl bg-white rounded-2xl border border-slate-200 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-900">{selectedRecord.building} {selectedRecord.floor} 상세 기록</h2>
                <p className="text-xs text-slate-500">{formatDateTime(selectedRecord.created_at)}</p>
              </div>
              <button
                onClick={() => setSelectedRecord(null)}
                className="px-3 py-1.5 rounded-lg text-sm font-bold border border-slate-300 text-slate-600"
              >
                닫기
              </button>
            </div>

            <div className="p-5 space-y-5">
              <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-black text-slate-800 mb-3">체크리스트 내역</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div className="rounded-lg border border-slate-200 bg-white p-3">TBM/PPE: <b>{selectedRecord.checklist?.tbmAndPPE ? '확인' : '미확인'}</b></div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">하부 통제: <b>{selectedRecord.checklist?.lowerControl ? '확인' : '미확인'}</b></div>
                  <div className="rounded-lg border border-slate-200 bg-white p-3">낙하물 제거: <b>{selectedRecord.checklist?.clearDebris ? '확인' : '미확인'}</b></div>
                </div>
              </section>

              <section>
                <h3 className="text-sm font-black text-slate-800 mb-3">증빙 사진 (5장)</h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-black text-slate-600 mb-2">작업 전 (4장)</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                      {Array.from({ length: 4 }).map((_, index) => {
                        const url = getBeforeWorkPhotos(selectedRecord)[index] || null;
                        return (
                          <div key={`before-${index}`} className="rounded-xl border border-slate-200 p-2 bg-slate-50">
                            <p className="text-[11px] font-bold text-slate-600 mb-2">작업 전 사진 {index + 1}</p>
                            <div className="w-full h-48 md:h-64 object-contain bg-gray-100 rounded-lg border border-slate-200 overflow-hidden flex items-center justify-center">
                              {url ? (
                                <img src={url} alt={`작업전-증빙사진-${index + 1}`} className="w-full h-full object-contain" />
                              ) : (
                                <span className="text-xs text-slate-400">미등록</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-black text-slate-600 mb-2">작업 중 (1장)</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {Array.from({ length: 1 }).map((_, index) => {
                        const url = getDuringWorkPhotos(selectedRecord)[index] || null;
                        return (
                          <div key={`during-${index}`} className="rounded-xl border border-slate-200 p-2 bg-slate-50">
                            <p className="text-[11px] font-bold text-slate-600 mb-2">작업 중 사진 {index + 1}</p>
                            <div className="w-full h-48 md:h-64 object-contain bg-gray-100 rounded-lg border border-slate-200 overflow-hidden flex items-center justify-center">
                              {url ? (
                                <img src={url} alt={`작업중-증빙사진-${index + 1}`} className="w-full h-full object-contain" />
                              ) : (
                                <span className="text-xs text-slate-400">미등록</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {getBeforeWorkPhotos(selectedRecord).length === 0 && getDuringWorkPhotos(selectedRecord).length === 0 && (
                  <div className="col-span-full w-full h-48 md:h-64 object-contain bg-gray-100 rounded-lg border border-slate-200 flex items-center justify-center text-sm text-slate-400 mt-4">
                    저장된 증빙 사진이 없습니다.
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default GangformPTWHistory;
