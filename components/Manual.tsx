
import React, { useState } from 'react';
import { 
  X, Server, Database, Smartphone, Wifi, Shield, 
  Cpu, Zap, Globe, Lock, Layers, RefreshCw, 
  Activity, ArrowRight, Cloud,
  GitMerge, Box, Fingerprint, Network, Check,
  ZapOff, Signal, Share2, BookOpen, Users, Key, FileJson, AlertTriangle
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, Cell
} from 'recharts';

interface ManualProps {
  onClose: () => void;
}

const Manual: React.FC<ManualProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'tech' | 'guide'>('guide');
  
  // 데이터 1: 업무 처리 속도 비교 (한글화)
  const speedData = [
    { name: '기존 수기 방식', time: 60, fill: '#cbd5e1' },
    { name: 'SFCS 실시간 방식', time: 0.1, fill: '#0055A5' },
  ];

  // 데이터 2: 네트워크 안정성 시뮬레이션
  const latencyData = [
    { time: '0s', ms: 12 }, { time: '1s', ms: 15 }, { time: '2s', ms: 18 },
    { time: '3s', ms: 14 }, { time: '4s', ms: 42 }, { time: '5s', ms: 12 },
    { time: '6s', ms: 11 }, { time: '7s', ms: 13 }, { time: '8s', ms: 15 },
  ];

  return (
    <div className="bg-slate-50 rounded-[2.5rem] shadow-2xl border border-slate-200 animate-fade-in-up relative overflow-hidden flex flex-col h-[90vh] md:h-auto max-h-[92vh] w-full max-w-5xl mx-auto my-auto">
      
      {/* 1. 헤더 섹션 (Header) */}
      <div className="bg-brand-dark p-8 md:p-10 text-white shrink-0 relative overflow-hidden flex flex-col justify-between items-start min-h-[200px]">
        <div className="absolute top-0 right-0 w-96 h-96 bg-brand-primary/20 rounded-full blur-[100px] -mr-20 -mt-20 pointer-events-none"></div>
        
        <div className="relative z-10 w-full flex justify-between items-start">
            <div className="flex items-center space-x-4">
                <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md border border-white/10 shadow-lg">
                    {activeTab === 'tech' ? <Network className="w-7 h-7 text-brand-accent" /> : <BookOpen className="w-7 h-7 text-brand-accent" />}
                </div>
                <div>
                    <h2 className="text-3xl font-black tracking-tighter text-white">SFCS {activeTab === 'tech' ? '기술 아키텍처' : '사용 설명서'} 3.2</h2>
                    <p className="text-[11px] text-blue-200 font-mono uppercase tracking-[0.25em] font-bold">
                        {activeTab === 'tech' ? 'Cloud Native Real-time Engine' : 'User Guide & Documentation'}
                    </p>
                </div>
            </div>
            
            <button 
            onClick={onClose}
            className="p-3 bg-white/5 hover:bg-white/20 rounded-full text-white transition-all z-50 backdrop-blur-md border border-white/10 group"
            >
            <X className="w-6 h-6 group-hover:rotate-90 transition-transform duration-300" />
            </button>
        </div>

        {/* 탭 네비게이션 */}
        <div className="relative z-10 flex space-x-2 mt-8 w-full md:w-auto bg-white/10 p-1.5 rounded-2xl backdrop-blur-md border border-white/5 self-start">
            <button 
                onClick={() => setActiveTab('guide')}
                className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all flex items-center ${activeTab === 'guide' ? 'bg-white text-brand-dark shadow-lg' : 'text-slate-300 hover:bg-white/5'}`}
            >
                <Users className="w-4 h-4 mr-2" />
                사용자 가이드
            </button>
            <button 
                onClick={() => setActiveTab('tech')}
                className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all flex items-center ${activeTab === 'tech' ? 'bg-white text-brand-dark shadow-lg' : 'text-slate-300 hover:bg-white/5'}`}
            >
                <Cpu className="w-4 h-4 mr-2" />
                기술 아키텍처
            </button>
        </div>
      </div>

      {/* 2. 스크롤 콘텐츠 영역 (Content) */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10 space-y-12 bg-slate-50">
        
        {/* ======================= TAB: USER GUIDE ======================= */}
        {activeTab === 'guide' && (
            <div className="space-y-10 animate-fade-in-up">
                
                {/* 섹션 1: 권한 및 로그인 */}
                <section>
                    <div className="flex items-center space-x-3 mb-6">
                        <Key className="w-5 h-5 text-brand-primary" />
                        <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest text-sm">권한별 기능 및 접속 방법</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* 작업자 */}
                        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-all">
                            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center mb-4 text-slate-600 font-black">작</div>
                            <h4 className="font-black text-slate-800 text-lg mb-2">작업자 (Worker)</h4>
                            <div className="text-[10px] bg-slate-100 text-slate-500 inline-block px-2 py-1 rounded-md font-bold mb-4">기본 접속 모드</div>
                            <ul className="text-xs text-slate-500 space-y-2 font-medium">
                                <li className="flex items-start"><Check className="w-3.5 h-3.5 mr-2 text-slate-400 mt-0.5" /> 작업 상태 변경 (설치중, 보고)</li>
                                <li className="flex items-start"><Check className="w-3.5 h-3.5 mr-2 text-slate-400 mt-0.5" /> 승인 요청 (관리자에게 알림)</li>
                                <li className="flex items-start"><Check className="w-3.5 h-3.5 mr-2 text-slate-400 mt-0.5" /> 승인된 동호수 조회만 가능</li>
                            </ul>
                        </div>
                        {/* 관리자 */}
                        <div className="bg-white p-6 rounded-[2rem] border border-blue-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/10 rounded-bl-[2rem]"></div>
                            <div className="w-10 h-10 bg-blue-500 text-white rounded-xl flex items-center justify-center mb-4 font-black shadow-lg">관</div>
                            <h4 className="font-black text-slate-800 text-lg mb-2">관리자 (Admin)</h4>
                            <div className="text-[10px] bg-blue-50 text-blue-600 inline-block px-2 py-1 rounded-md font-bold mb-4">보안 접속 전용</div>
                            <ul className="text-xs text-slate-600 space-y-2 font-bold">
                                <li className="flex items-start"><Check className="w-3.5 h-3.5 mr-2 text-blue-500 mt-0.5" /> 작업 승인 및 반려 처리</li>
                                <li className="flex items-start"><Check className="w-3.5 h-3.5 mr-2 text-blue-500 mt-0.5" /> 모든 상태 강제 변경 권한</li>
                                <li className="flex items-start"><Check className="w-3.5 h-3.5 mr-2 text-blue-500 mt-0.5" /> 데이터 백업 및 복구</li>
                                <li className="flex items-start"><Check className="w-3.5 h-3.5 mr-2 text-blue-500 mt-0.5" /> AI 분석 결과 열람 (업로드 불가)</li>
                            </ul>
                        </div>
                        {/* 제작자 */}
                        <div className="bg-white p-6 rounded-[2rem] border border-purple-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-16 h-16 bg-purple-500/10 rounded-bl-[2rem]"></div>
                            <div className="w-10 h-10 bg-purple-500 text-white rounded-xl flex items-center justify-center mb-4 font-black shadow-lg">제</div>
                            <h4 className="font-black text-slate-800 text-lg mb-2">제작자 (Creator)</h4>
                            <div className="text-[10px] bg-purple-50 text-purple-600 inline-block px-2 py-1 rounded-md font-bold mb-4">시스템 설계자 전용</div>
                            <ul className="text-xs text-slate-600 space-y-2 font-bold">
                                <li className="flex items-start"><Check className="w-3.5 h-3.5 mr-2 text-purple-500 mt-0.5" /> 관리자의 모든 권한 포함</li>
                                <li className="flex items-start"><Check className="w-3.5 h-3.5 mr-2 text-purple-500 mt-0.5" /> AI 분석용 도면/데이터 업로드</li>
                                <li className="flex items-start"><Check className="w-3.5 h-3.5 mr-2 text-purple-500 mt-0.5" /> DB 초기화 및 일괄 상태 변경</li>
                                <li className="flex items-start"><Check className="w-3.5 h-3.5 mr-2 text-purple-500 mt-0.5" /> 시스템 디버깅 모드</li>
                            </ul>
                        </div>
                    </div>
                </section>

                {/* 섹션 2: 표준 프로세스 */}
                <section>
                    <div className="flex items-center space-x-3 mb-6">
                        <Activity className="w-5 h-5 text-brand-primary" />
                        <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest text-sm">표준 공정 프로세스 (Standard Workflow)</h3>
                    </div>
                    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
                            <div className="flex-1 group">
                                <div className="text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Step 01</div>
                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 group-hover:border-slate-400 transition-colors">
                                    <div className="text-sm font-black text-slate-600">미착수</div>
                                    <div className="text-[10px] text-slate-400 mt-1">작업 시작 전 대기 상태</div>
                                </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-slate-300 rotate-90 md:rotate-0" />
                            <div className="flex-1 group">
                                <div className="text-[10px] font-black text-blue-400 mb-2 uppercase tracking-widest">Step 02 (작업자)</div>
                                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-200 group-hover:bg-blue-100 transition-colors">
                                    <div className="text-sm font-black text-blue-700">설치중</div>
                                    <div className="text-[10px] text-blue-400 mt-1">클릭하여 '설치중' 변경</div>
                                </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-slate-300 rotate-90 md:rotate-0" />
                            <div className="flex-1 group">
                                <div className="text-[10px] font-black text-orange-400 mb-2 uppercase tracking-widest">Step 03 (작업자)</div>
                                <div className="bg-orange-50 p-4 rounded-2xl border border-orange-200 group-hover:bg-orange-100 transition-colors animate-pulse">
                                    <div className="text-sm font-black text-orange-700">승인 요청</div>
                                    <div className="text-[10px] text-orange-400 mt-1">설치 완료 후 검측 요청</div>
                                </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-slate-300 rotate-90 md:rotate-0" />
                            <div className="flex-1 group">
                                <div className="text-[10px] font-black text-emerald-400 mb-2 uppercase tracking-widest">Step 04 (관리자)</div>
                                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200 group-hover:bg-emerald-100 transition-colors shadow-lg">
                                    <div className="text-sm font-black text-emerald-700">승인 완료</div>
                                    <div className="text-[10px] text-emerald-500 mt-1">기전(MEP) 작업 진행</div>
                                </div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-slate-300 rotate-90 md:rotate-0" />
                            <div className="flex-1 group">
                                <div className="text-[10px] font-black text-purple-400 mb-2 uppercase tracking-widest">Step 05</div>
                                <div className="bg-purple-50 p-4 rounded-2xl border border-purple-200 group-hover:bg-purple-100 transition-colors">
                                    <div className="text-sm font-black text-purple-700">타설 및 양생</div>
                                    <div className="text-[10px] text-purple-400 mt-1">콘크리트 타설 진행</div>
                                </div>
                            </div>
                        </div>
                        <div className="mt-6 bg-slate-50 p-4 rounded-2xl text-xs text-slate-500 font-medium flex items-center border border-slate-100">
                            <Zap className="w-4 h-4 text-yellow-500 mr-2" />
                            <span className="text-slate-700 font-bold mr-1">Tip:</span> 
                            승인 완료 상태에서 다시 한번 클릭하면 기전(MEP) 완료 체크가 가능하며, 이후 타설 단계로 넘어갑니다.
                        </div>
                    </div>
                </section>

                 {/* 섹션 3: 고급 기능 */}
                 <section className="pb-10">
                    <div className="flex items-center space-x-3 mb-6">
                        <Database className="w-5 h-5 text-brand-primary" />
                        <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest text-sm">고급 관리 기능 (Advanced)</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                            <h4 className="font-black text-slate-800 mb-4 flex items-center"><FileJson className="w-4 h-4 mr-2 text-slate-400"/> 데이터 백업 및 복구</h4>
                            <p className="text-xs text-slate-500 leading-relaxed mb-4">
                                사이드바의 <strong>[Data Safety]</strong> 메뉴를 통해 현재 현장의 모든 진행 상황을 JSON 파일로 내보내거나, 
                                이전에 저장한 파일로 상태를 되돌릴 수 있습니다. (관리자/제작자 전용)
                            </p>
                            <div className="flex gap-2 text-[10px] font-black uppercase text-slate-400">
                                <span className="bg-slate-100 px-2 py-1 rounded">Backup.json</span>
                                <span className="bg-slate-100 px-2 py-1 rounded">Restore Sync</span>
                            </div>
                         </div>
                         <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                            <h4 className="font-black text-slate-800 mb-4 flex items-center"><AlertTriangle className="w-4 h-4 mr-2 text-red-400"/> 제작자 전용 일괄 제어</h4>
                            <p className="text-xs text-slate-500 leading-relaxed mb-4">
                                제작자 모드에서는 사이드바 하단 <strong>[Creator Controls]</strong>를 통해 
                                DB 구조를 초기화하거나 테스트를 위해 전체 동의 상태를 일괄 변경할 수 있습니다.
                                <br/><span className="text-red-500 font-bold">* 데이터 손실 주의</span>
                            </p>
                            <div className="flex gap-2 text-[10px] font-black uppercase text-slate-400">
                                <span className="bg-red-50 text-red-400 border border-red-100 px-2 py-1 rounded">Reset All</span>
                                <span className="bg-purple-50 text-purple-400 border border-purple-100 px-2 py-1 rounded">Re-Init DB</span>
                            </div>
                         </div>
                    </div>
                </section>
            </div>
        )}

        {/* ======================= TAB: ARCHITECTURE ======================= */}
        {activeTab === 'tech' && (
            <div className="space-y-12 animate-fade-in-up">
                {/* A. 실시간 데이터 토폴로지 (Topology) */}
                <section className="relative">
                    <div className="flex items-center space-x-3 mb-6">
                        <Activity className="w-5 h-5 text-brand-primary" />
                        <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest text-sm">실시간 데이터 토폴로지</h3>
                    </div>
                    
                    <div className="bg-white rounded-[2.5rem] p-8 md:p-10 border border-slate-200 shadow-xl relative overflow-hidden">
                        <div className="absolute inset-0 bg-grid-pattern opacity-[0.03]"></div>
                        
                        {/* 다이어그램 컨테이너 (스크롤 가능하도록 래핑) */}
                        <div className="overflow-x-auto custom-scrollbar pb-4 relative z-10">
                            <div className="flex flex-col md:flex-row justify-between items-stretch gap-6">
                                
                                {/* 데이터 발생지 (현장 작업자) */}
                                <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-50/50 rounded-[2rem] border border-slate-100 group hover:border-blue-200 transition-colors min-w-[200px]">
                                    <span className="mb-6 px-3 py-1 bg-white rounded-full border border-slate-200 shadow-sm text-[10px] font-black text-slate-500 uppercase tracking-widest">Data Source</span>
                                    <div className="w-16 h-16 bg-white rounded-2xl shadow-lg flex items-center justify-center mb-4 border border-slate-100 group-hover:scale-110 transition-transform">
                                        <Smartphone className="w-8 h-8 text-slate-600" />
                                    </div>
                                    <h4 className="font-black text-slate-700">현장 작업자</h4>
                                    <p className="text-[10px] text-slate-400 mt-1 uppercase">Mobile App Interface</p>
                                    <div className="mt-6 flex items-center space-x-2 text-[9px] font-black text-blue-500">
                                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                                        <span className="whitespace-nowrap">데이터 전송중</span>
                                    </div>
                                </div>

                                {/* 연결 로직 (커넥션) */}
                                <div className="hidden md:flex flex-col justify-center items-center w-28 shrink-0">
                                    <div className="relative w-full h-10 flex items-center justify-center">
                                        <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-brand-primary to-transparent w-1/2 animate-[shimmer_1.5s_infinite]"></div>
                                        </div>
                                        <div className="absolute bg-white p-2.5 rounded-full shadow-md border border-slate-100 z-10">
                                            <Wifi className="w-4 h-4 text-brand-primary" />
                                        </div>
                                    </div>
                                    <span className="text-[9px] text-brand-primary font-black mt-6 uppercase tracking-tighter whitespace-nowrap">TLS 1.3 암호화</span>
                                </div>

                                {/* 클라우드 코어 (서버) */}
                                <div className="flex-[1.6] bg-slate-900 rounded-[2rem] p-8 text-center relative overflow-hidden shadow-2xl flex flex-col justify-center items-center group min-w-[280px]">
                                    <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/10 to-brand-accent/10 opacity-50"></div>
                                    <div className="relative z-10 w-full">
                                        <div className="w-16 h-16 mx-auto bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/20 mb-4 shadow-xl">
                                            <Database className="w-8 h-8 text-white" />
                                        </div>
                                        <h4 className="text-xl font-black text-white tracking-tight">Firebase Cloud Core</h4>
                                        <p className="text-[10px] text-blue-300 font-mono uppercase mt-1 tracking-widest">Real-time NoSQL Engine</p>
                                        
                                        <div className="grid grid-cols-2 gap-3 mt-8">
                                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 text-left">
                                                <div className="text-[8px] text-slate-400 uppercase font-black">Sync Latency</div>
                                                <div className="text-sm font-black text-emerald-400 font-mono">24ms</div>
                                            </div>
                                            <div className="bg-white/5 p-3 rounded-xl border border-white/5 text-left">
                                                <div className="text-[8px] text-slate-400 uppercase font-black">System Uptime</div>
                                                <div className="text-sm font-black text-brand-accent font-mono">99.9%</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 연결 로직 (커넥션) */}
                                <div className="hidden md:flex flex-col justify-center items-center w-28 shrink-0">
                                    <div className="relative w-full h-10 flex items-center justify-center">
                                        <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-brand-accent to-transparent w-1/2 animate-[shimmer_1.5s_infinite] delay-100"></div>
                                        </div>
                                        <div className="absolute bg-white p-2.5 rounded-full shadow-md border border-slate-100 z-10">
                                            <Zap className="w-4 h-4 text-brand-accent" />
                                        </div>
                                    </div>
                                    <span className="text-[9px] text-brand-accent font-black mt-6 uppercase tracking-tighter whitespace-nowrap">Socket Push 전송</span>
                                </div>

                                {/* AI 및 통합 관제 */}
                                <div className="flex-1 flex flex-col gap-4 min-w-[200px]">
                                    <div className="flex-1 bg-white rounded-[1.5rem] p-5 border border-slate-100 flex items-center hover:shadow-md transition-all group overflow-hidden">
                                        <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center border border-indigo-100 mr-4 shrink-0 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                                            <Cpu className="w-6 h-6" />
                                        </div>
                                        <div className="min-w-0">
                                            <h5 className="font-black text-slate-800 text-sm whitespace-nowrap">AI 분석 엔진</h5>
                                            <p className="text-[10px] text-slate-400 whitespace-nowrap">Gemini 3.0 Engine</p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex-1 bg-white rounded-[1.5rem] p-5 border border-slate-100 flex items-center hover:shadow-md transition-all group overflow-hidden">
                                        <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center border border-emerald-100 mr-4 shrink-0 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                                            <Globe className="w-6 h-6" />
                                        </div>
                                        <div className="min-w-0">
                                            <h5 className="font-black text-slate-800 text-sm whitespace-nowrap">통합 대시보드</h5>
                                            <p className="text-[10px] text-slate-400 whitespace-nowrap">실시간 현황 관제</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* B. 성능 메트릭 섹션 (Performance) */}
                <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    
                    {/* 업무 효율성 비교 */}
                    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-lg flex flex-col">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                                    <ZapOff className="w-5 h-5 text-brand-primary" />
                                </div>
                                <div>
                                    <h4 className="font-black text-slate-800 text-sm uppercase tracking-widest">업무 처리 효율성</h4>
                                    <p className="text-[10px] text-slate-400 font-medium">정보 전파 및 승인 소요 시간</p>
                                </div>
                            </div>
                            <span className="text-2xl font-black text-brand-primary tracking-tighter">99.8% <span className="text-xs text-slate-400 font-normal align-middle tracking-normal">절감</span></span>
                        </div>
                        
                        <div className="h-40 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={speedData} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }} barSize={24}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={110} tick={{fontSize: 11, fontWeight: 700, fill: '#64748b'}} axisLine={false} tickLine={false} />
                                    <Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                                    <Bar dataKey="time" radius={[0, 4, 4, 0]}>
                                        {speedData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* 네트워크 안정성 */}
                    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-lg flex flex-col">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center space-x-3">
                                <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                                    <Signal className="w-5 h-5 text-emerald-500" />
                                </div>
                                <div>
                                    <h4 className="font-black text-slate-800 text-sm uppercase tracking-widest">네트워크 안정성</h4>
                                    <p className="text-[10px] text-slate-400 font-medium">서버 지연 속도 모니터링 (ms)</p>
                                </div>
                            </div>
                            <div className="flex items-center space-x-2 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Live Stable</span>
                            </div>
                        </div>

                        <div className="h-40 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={latencyData}>
                                    <defs>
                                        <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10B981" stopOpacity={0.2}/>
                                            <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="time" tick={{fontSize: 10, fill: '#94a3b8'}} axisLine={false} tickLine={false} />
                                    <YAxis hide />
                                    <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}} />
                                    <Area type="monotone" dataKey="ms" stroke="#10B981" strokeWidth={3} fillOpacity={1} fill="url(#colorLatency)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </section>

                {/* C. 핵심 기술 스택 (Tech Stack) */}
                <section>
                    <div className="flex items-center space-x-3 mb-6">
                        <Layers className="w-5 h-5 text-brand-primary" />
                        <h3 className="text-lg font-black text-slate-800 uppercase tracking-widest text-sm">핵심 기술 스택</h3>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg transition-all group">
                            <div className="w-10 h-10 bg-cyan-50 rounded-xl flex items-center justify-center mb-3 group-hover:bg-cyan-500 group-hover:text-white transition-all">
                                <Box className="w-5 h-5" />
                            </div>
                            <h5 className="font-black text-slate-800 text-xs">React 19</h5>
                            <p className="text-[9px] text-slate-400 mt-1 leading-tight">가상 DOM 기반의<br/>초고속 렌더링 최적화</p>
                        </div>
                        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg transition-all group">
                            <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center mb-3 group-hover:bg-orange-500 group-hover:text-white transition-all">
                                <Database className="w-5 h-5" />
                            </div>
                            <h5 className="font-black text-slate-800 text-xs">NoSQL DB</h5>
                            <p className="text-[9px] text-slate-400 mt-1 leading-tight">Firestore 기반의<br/>실시간 양방향 동기화</p>
                        </div>
                        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg transition-all group">
                            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center mb-3 group-hover:bg-indigo-500 group-hover:text-white transition-all">
                                <Zap className="w-5 h-5" />
                            </div>
                            <h5 className="font-black text-slate-800 text-xs">Gemini AI</h5>
                            <p className="text-[9px] text-slate-400 mt-1 leading-tight">LLM 기반의<br/>도면 해석 및 자동화</p>
                        </div>
                        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg transition-all group">
                            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center mb-3 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                                <Shield className="w-5 h-5" />
                            </div>
                            <h5 className="font-black text-slate-800 text-xs">보안 시스템</h5>
                            <p className="text-[9px] text-slate-400 mt-1 leading-tight">Role-based 권한 제어<br/>및 데이터 암호화</p>
                        </div>
                    </div>
                </section>

                {/* D. 하단 워크플로우 (Workflow) */}
                <div className="bg-slate-900 rounded-[2.5rem] p-8 md:p-10 relative overflow-hidden text-white">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary opacity-20 rounded-full blur-[80px] -mr-16 -mt-16 pointer-events-none"></div>
                    <div className="relative z-10">
                        <h4 className="font-black text-lg mb-8 flex items-center"><Share2 className="w-5 h-5 mr-3 text-brand-accent" /> 실시간 데이터 전파 프로세스</h4>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="flex items-center space-x-4 bg-white/5 p-5 rounded-2xl border border-white/10">
                                <div className="w-8 h-8 bg-brand-primary rounded-xl flex items-center justify-center font-black text-xs shadow-lg">01</div>
                                <div>
                                    <div className="text-xs font-black text-white">현장 액션 발생</div>
                                    <div className="text-[9px] text-slate-400 mt-0.5 whitespace-nowrap">상태 변경 및 데이터 업데이트</div>
                                </div>
                            </div>
                            <div className="flex items-center space-x-4 bg-white/5 p-5 rounded-2xl border border-white/10">
                                <div className="w-8 h-8 bg-slate-700 rounded-xl flex items-center justify-center font-black text-xs">02</div>
                                <div>
                                    <div className="text-xs font-black text-white">클라우드 병합</div>
                                    <div className="text-[9px] text-slate-400 mt-0.5 whitespace-nowrap">데이터 원장 실시간 동기화</div>
                                </div>
                            </div>
                            <div className="flex items-center space-x-4 bg-white/5 p-5 rounded-2xl border border-white/10">
                                <div className="w-8 h-8 bg-brand-accent rounded-xl flex items-center justify-center font-black text-xs shadow-lg">03</div>
                                <div>
                                    <div className="text-xs font-black text-white">전역 브로드캐스트</div>
                                    <div className="text-[9px] text-slate-400 mt-0.5 whitespace-nowrap">모든 클라이언트 화면 즉시 반영</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}

      </div>

      {/* 3. 푸터 (Footer) */}
      <div className="p-6 border-t border-slate-200 bg-white flex justify-end shrink-0 z-20">
         <button 
           onClick={onClose}
           className="px-10 py-4 bg-brand-dark text-white rounded-2xl font-black text-sm hover:bg-slate-800 transition-all shadow-xl active:scale-95 flex items-center group"
         >
            <span>닫기</span>
            <X className="w-4 h-4 ml-2 group-hover:rotate-90 transition-transform" />
         </button>
      </div>
    </div>
  );
};

export default Manual;
