import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LayoutDashboard, 
  CheckCircle2,
  Cpu,
  X,
  Map as MapIcon,
  FileText,
  Save,
  RotateCcw,
  Database,
  Activity,
  Award,
  ChevronRight,
  Menu,
  Handshake,
  Bell,
  Wifi,
  WifiOff,
  CloudSun,
  AlertOctagon,
  Zap,
  Search,
  ArrowUp,
  MessageCircle,
  Check,
  Building as BuildingIcon,
  ArrowRight,
  AlertTriangle,
  Share2,
  History,
  Lock
} from 'lucide-react';
// [중요] Notification이 아닌 SystemNotification을 가져옵니다.
import { Building, ProcessStatus, UserRole, SystemNotification, AnalysisResult, BuildingStructure, Floor, Unit } from './types';
import BuildingSection from './components/BuildingSection';
import SiteMap from './components/SiteMap';
import AnalysisView from './components/AnalysisView';
import Manual from './components/Manual';
import LiveChat from './components/LiveChat';
import { suggestSitePlan } from './services/geminiService';
import { 
    syncBuildings, 
    saveBuilding, 
    initializeDataIfEmpty, 
    saveAllBuildings, 
    sendChatMessage, 
    clearChatMessages, 
    subscribeToAnalysisResult, 
    saveAnalysisResult 
} from './services/firebaseService';

interface StatusModalData {
  buildingId: string;
  buildingName: string;
  floorLevel: number;
  unitId: string;
  unitNumber: string;
  currentStatus: ProcessStatus;
  nextStatus: ProcessStatus;
  isRevert: boolean;
}

interface DeadRule {
  min: number;
  max: number;
  units: number[];
}

interface BuildingConfig {
  id: string;
  name: string;
  floors: number;
  unitsPerFloor: number;
  dead: DeadRule[];
}

const BUILDING_CONFIGS: BuildingConfig[] = [
  { 
    id: '2001', name: '2001동', floors: 23, unitsPerFloor: 4, 
    dead: [
      { min: 21, max: 23, units: [3, 4] }, 
      { min: 18, max: 20, units: [4] }, 
      { min: 1, max: 1, units: [1, 2, 3] }
    ] 
  },
  { 
    id: '2002', name: '2002동', floors: 22, unitsPerFloor: 4, 
    dead: [
      { min: 1, max: 1, units: [2, 3] }
    ] 
  },
  { 
    id: '2003', name: '2003동', floors: 28, unitsPerFloor: 6, 
    dead: [
      { min: 24, max: 28, units: [5, 6] }, 
      { min: 1, max: 1, units: [2, 3, 5] }
    ] 
  },
  { 
    id: '2004', name: '2004동', floors: 28, unitsPerFloor: 6, 
    dead: [
      { min: 18, max: 28, units: [1] },
      { min: 21, max: 28, units: [2] },
      { min: 1, max: 2, units: [1] },
      { min: 1, max: 1, units: [4, 5] }
    ] 
  },
  { 
    id: '2005', name: '2005동', floors: 26, unitsPerFloor: 6, 
    dead: [
      { min: 17, max: 26, units: [1] },
      { min: 20, max: 26, units: [2] },
      { min: 26, max: 26, units: [3, 4] },
      { min: 1, max: 1, units: [2, 4, 6] }
    ] 
  },
  { 
    id: '2006', name: '2006동', floors: 26, unitsPerFloor: 6, 
    dead: [
      { min: 25, max: 26, units: [1, 3] },
      { min: 26, max: 26, units: [4] },
      { min: 21, max: 26, units: [5] },
      { min: 19, max: 26, units: [6] }, // Adjusted U6 based on count
      { min: 1, max: 2, units: [1] },
      { min: 1, max: 1, units: [3, 4, 5, 6] }
    ] 
  },
  { 
    id: '2007', name: '2007동', floors: 27, unitsPerFloor: 4, 
    dead: [
      { min: 26, max: 27, units: [3] }, 
      { min: 23, max: 27, units: [4] }, 
      { min: 1, max: 1, units: [2, 3] }
    ] 
  },
  { 
    id: '2008', name: '2008동', floors: 28, unitsPerFloor: 6, 
    dead: [
      { min: 1, max: 1, units: [4] }
    ] 
  },
  { 
    id: '2009', name: '2009동', floors: 28, unitsPerFloor: 6, 
    dead: [
      { min: 1, max: 1, units: [1, 3, 5] }
    ] 
  },
  { 
    id: '2010', name: '2010동', floors: 28, unitsPerFloor: 6, 
    dead: [
      { min: 1, max: 1, units: [1, 2, 5] } 
    ] 
  },
  { 
    id: '2011', name: '2011동', floors: 28, unitsPerFloor: 6, 
    dead: [
      { min: 1, max: 1, units: [2, 3] },
      { min: 1, max: 2, units: [5, 6] }
    ] 
  },
  { 
    id: '2012', name: '2012동', floors: 28, unitsPerFloor: 6, 
    dead: [
      { min: 1, max: 1, units: [3] },
      { min: 1, max: 2, units: [1, 2, 5] }
    ] 
  },
  { 
    id: '2013', name: '2013동', floors: 28, unitsPerFloor: 6, 
    dead: [
      { min: 22, max: 28, units: [1, 6] },
      { min: 1, max: 1, units: [2, 4] },
      { min: 1, max: 3, units: [5] }
    ] 
  },
  { 
    id: '3001', name: '3001동', floors: 21, unitsPerFloor: 4, 
    dead: [
      { min: 20, max: 21, units: [1, 2, 3] },
      { min: 17, max: 21, units: [4] }
    ] 
  },
  { 
    id: '3002', name: '3002동', floors: 26, unitsPerFloor: 4, 
    dead: [
       { min: 1, max: 1, units: [2, 3] }
    ] 
  },
  { 
    id: '3003', name: '3003동', floors: 23, unitsPerFloor: 3, 
    dead: [
       { min: 19, max: 23, units: [2] }
    ] 
  }
];

const createBuildingsFromStructure = (structures: BuildingStructure[]): Building[] => {
  return structures.map((s, idx) => {
    const floors = [];
    let deadFloorStart = 999;
    let deadUnitNums: number[] = [];
    
    if (s.deadUnitLogic) {
      const match = s.deadUnitLogic.match(/(\d+)층 이상 ([\d,]+)호/);
      if (match) {
        deadFloorStart = parseInt(match[1]);
        deadUnitNums = match[2].split(',').map(n => parseInt(n.trim()));
      }
    }

    for (let i = 1; i <= s.totalFloors; i++) {
      const units = [];
      for (let u = 1; u <= s.unitsPerFloor; u++) {
        const isDead = i >= deadFloorStart && deadUnitNums.includes(u);
        units.push({
          id: `${s.name}-${i}-${u}`,
          unitNumber: `${i}0${u}`,
          status: isDead ? ProcessStatus.CURED : ProcessStatus.NOT_STARTED,
          lastUpdated: new Date().toISOString(),
          mepCompleted: false,
          isDeadUnit: isDead
        });
      }
      floors.push({ level: i, units });
    }

    return { id: `b-${idx}`, name: s.name, totalFloors: s.totalFloors, floors };
  });
};

const generateInitialBuildings = (): Building[] => {
  return BUILDING_CONFIGS.map(config => {
    const floors = [];
    for (let i = 1; i <= config.floors; i++) {
      const units = [];
      for (let u = 1; u <= config.unitsPerFloor; u++) {
        const isDead = config.dead.some(rule => 
          i >= rule.min && i <= rule.max && rule.units.includes(u)
        );

        units.push({
          id: `${config.name}-${i}-${u}`,
          unitNumber: `${i}0${u}`,
          status: isDead ? ProcessStatus.CURED : ProcessStatus.NOT_STARTED,
          lastUpdated: new Date().toISOString(),
          mepCompleted: false,
          isDeadUnit: isDead
        });
      }
      floors.push({ level: i, units });
    }
    return { id: `b-${config.id}`, name: config.name, totalFloors: config.floors, floors };
  });
};

const notifySystem = (title: string, body: string, soundUrl: string = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3') => {
  try {
    const audio = new Audio(soundUrl);
    audio.volume = 0.5;
    audio.play().catch(e => console.log('Audio play blocked (needs user interaction first):', e));
  } catch (e) {
    console.error('Sound error:', e);
  }

  if (!("Notification" in window)) {
    return;
  }
  
  if (Notification.permission === "granted") {
    new Notification(title, { body, icon: '/vite.svg' });
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        new Notification(title, { body, icon: '/vite.svg' });
      }
    });
  }
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analysis' | 'manual'>('dashboard');
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>(UserRole.WORKER);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginPassword, setLoginPassword] = useState(""); 
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [siteName, setSiteName] = useState("용인 푸르지오 원클러스터 2,3단지 현장");
  const [projectCode, setProjectCode] = useState("PRJ-YG-2025-PREMIUM");
  const [buildings, setBuildings] = useState<Building[]>(generateInitialBuildings());
  const [notifications, setNotifications] = useState<SystemNotification[]>([]); // [수정] 타입 사용
  const [isNotificationSidebarOpen, setIsNotificationSidebarOpen] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProcessStatus | 'ALL'>('ALL');
  
  const [currentTime, setCurrentTime] = useState<string>("");
  const [weather, setWeather] = useState<{temp: number, wind: number, condition: string} | null>(null);
  const [isConnected, setIsConnected] = useState(false); // 서버 연결 상태
  const [connectionError, setConnectionError] = useState<string | null>(null); // 연결 에러 메시지

  const [lastAnalysisResult, setLastAnalysisResult] = useState<AnalysisResult | null>(null);

  // 전역 상태 변경 모달 상태
  const [statusModal, setStatusModal] = useState<StatusModalData | null>(null);
  // 특정 층으로 이동하기 위한 타겟 상태 (건물ID, 층수)
  const [jumpTarget, setJumpTarget] = useState<{id: string, level: number} | null>(null);
  
  // [추가됨] 채팅창 오픈 상태
  const [isChatOpen, setIsChatOpen] = useState(false);

  // [알림 시스템] 이전 빌딩 상태를 기억하기 위한 Ref
  const prevBuildingsRef = useRef<Building[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // [초기화] 브라우저 알림 권한 요청
  useEffect(() => {
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }
  }, []);

  // [Real-time Sync] Firebase 데이터 동기화
  useEffect(() => {
    // 1. 초기 데이터가 없으면 서버에 업로드 (최초 1회성)
    initializeDataIfEmpty(buildings);

    // 2. 서버 데이터 구독 및 에러 핸들링
    const unsubscribe = syncBuildings(
        (serverBuildings, isLive) => {
            setIsConnected(isLive);
            setConnectionError(null); // 성공 시 에러 초기화
            
            if (serverBuildings.length > 0) {
                // [핵심 Fix] 알림 처리 중 에러가 발생해도 화면 갱신(setBuildings)이 누락되지 않도록 방어 코드 추가
                try {
                    if (prevBuildingsRef.current.length > 0) {
                        const newNotifications: SystemNotification[] = [];

                        serverBuildings.forEach(newB => {
                            const oldB = prevBuildingsRef.current.find(b => b.id === newB.id);
                            if (!oldB) return;

                            newB.floors.forEach(newF => {
                                const oldF = oldB.floors.find(f => f.level === newF.level);
                                if (!oldF) return;

                                newF.units.forEach(newU => {
                                    const oldU = oldF.units.find(u => u.id === newU.id);
                                    if (!oldU) return;

                                    // 감시: 상태가 변경되었는가?
                                    if (newU.status !== oldU.status) {
                                        // 1. 승인 요청 발생 시 (타인이 요청했을 때)
                                        if (newU.status === ProcessStatus.APPROVAL_REQ) {
                                            newNotifications.push({ 
                                                id: Date.now().toString() + Math.random(), // ID 중복 방지
                                                message: `[승인요청] ${newB.name} ${newF.level}층 ${newU.unitNumber}호`, 
                                                type: 'warning', 
                                                timestamp: '방금 전', 
                                                read: false 
                                            });
                                            
                                            notifySystem(
                                              'SFCS 승인 요청 알림', 
                                              `${newB.name} ${newF.level}층 ${newU.unitNumber}호에서 검측 승인이 요청되었습니다.`
                                            );
                                        }
                                        // 2. 승인 완료 시
                                        else if (newU.status === ProcessStatus.APPROVED) {
                                            newNotifications.push({ 
                                                id: Date.now().toString() + Math.random(), 
                                                message: `[승인완료] ${newB.name} ${newF.level}층 ${newU.unitNumber}호`, 
                                                type: 'success', 
                                                timestamp: '방금 전', 
                                                read: false 
                                            });
                                            
                                            notifySystem(
                                              'SFCS 승인 완료',
                                              `${newB.name} ${newF.level}층 ${newU.unitNumber}호가 승인되었습니다.`
                                            );
                                        }
                                    }
                                });
                            });
                        });
                        
                        if (newNotifications.length > 0) {
                            setNotifications(prev => [...newNotifications, ...prev]);
                        }
                    }
                } catch (e) {
                    console.error("Notification system error (UI update will proceed):", e);
                }

                // 현재 상태를 '이전 상태'로 저장
                prevBuildingsRef.current = serverBuildings;
                // [UI 업데이트] 무조건 실행 보장
                setBuildings(serverBuildings);
            }
        },
        (error) => {
            console.error("Sync error:", error);
            setIsConnected(false);
            
            // 사용자에게 구체적인 조치 방법을 알리기 위한 에러 메시지 설정
            if (error.code === 'permission-denied') {
                setConnectionError("권한 거부됨: Firebase Console > Firestore Database > Rules 탭에서 'allow read, write: if true;' 로 설정되어 있는지 확인하세요.");
            } else if (error.code === 'unavailable') {
                setConnectionError("서버 연결 불가: 인터넷 연결을 확인하거나 Firebase 프로젝트 상태를 확인하세요.");
            } else if (error.code === 'auth/operation-not-allowed') {
                setConnectionError("인증 오류: Firebase Console > Authentication > Sign-in method 에서 'Anonymous(익명)' 공급자가 사용 설정되어야 합니다.");
            } else {
                setConnectionError(`연결 오류 (${error.code}): Firebase Console에서 도메인 승인(Authorized domains) 여부를 확인하세요.`);
            }
        }
    );

    return () => unsubscribe();
  }, []);

  // ... (Other useEffects remain the same)
  // [신규] 분석 결과 실시간 구독 (모든 사용자)
  useEffect(() => {
    const unsubscribe = subscribeToAnalysisResult((data) => {
        setLastAnalysisResult(data);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    // 실시간 시간 업데이트
    const updateTime = () => {
      const now = new Date();
      // 대한민국 시간 포맷
      const timeString = now.toLocaleTimeString('ko-KR', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit' 
      });
      const dateString = now.toLocaleDateString('ko-KR', {
        month: 'long',
        day: 'numeric',
        weekday: 'short'
      });
      setCurrentTime(`${dateString} ${timeString}`);
    };
    
    updateTime();
    const timer = setInterval(updateTime, 1000);
    
    return () => clearInterval(timer);
  }, []);

  // [Real-time Weather] 용인시 처인구 남동 실시간 날씨 데이터
  useEffect(() => {
    const fetchWeather = async () => {
        try {
            const response = await fetch("https://api.open-meteo.com/v1/forecast?latitude=37.2307&longitude=127.2075&current=temperature_2m,wind_speed_10m,weather_code&timezone=Asia%2FSeoul");
            const data = await response.json();
            
            if (data.current) {
                const { temperature_2m, wind_speed_10m, weather_code } = data.current;
                
                let condition = "맑음";
                const code = weather_code;
                if (code === 0) condition = "맑음";
                else if (code >= 1 && code <= 3) condition = "구름";
                else if (code === 45 || code === 48) condition = "안개";
                else if (code >= 51 && code <= 67) condition = "비";
                else if (code >= 71 && code <= 77) condition = "눈";
                else if (code >= 80 && code <= 82) condition = "소나기";
                else if (code >= 95) condition = "뇌우";
                
                setWeather({
                    temp: temperature_2m,
                    wind: wind_speed_10m,
                    condition
                });
            }
        } catch (error) {
            console.error("Failed to fetch weather data", error);
        }
    };

    fetchWeather();
    const timer = setInterval(fetchWeather, 600000); 
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const fetchSuggestion = async () => {
        if (!aiSuggestion) {
            const cached = localStorage.getItem(`sitePlan_${siteName}`);
            if (cached) {
                setAiSuggestion(cached);
            } else {
                const result = await suggestSitePlan(siteName);
                setAiSuggestion(result);
                localStorage.setItem(`sitePlan_${siteName}`, result);
            }
        }
    };
    fetchSuggestion();
  }, [siteName]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAnalysisComplete = (result: AnalysisResult) => {
      // 로컬 상태 업데이트
      setLastAnalysisResult(result);
      setSiteName(result.siteName);
      setProjectCode(result.projectCode);
      setAiSuggestion(result.summary);
      
      // [신규] Firebase에 분석 결과 저장 (Persistence)
      saveAnalysisResult(result);
      
      addNotification("도면 분석이 완료되었습니다. (서버 동기화됨)", "success");
  };

  const handleBackup = () => {
    const backupData = {
      buildings,
      siteName,
      projectCode,
      timestamp: new Date().toISOString(),
      version: "3.2"
    };

    try {
        const dataStr = JSON.stringify(backupData, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `SFCS_Backup_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        addNotification("백업 파일(.json)이 다운로드되었습니다.", "success");
    } catch (e) {
        addNotification("백업 파일 생성 중 오류가 발생했습니다.", "warning");
    }
  };

  const handleCreatorBatchAction = async (action: 'RESET' | 'REINIT' | 'INSTALL' | 'REQ' | 'APPROVE' | 'MEP') => {
      if (!window.confirm("선택한 일괄 작업을 수행하시겠습니까? 데이터가 변경됩니다.")) return;

      if (action === 'REINIT' || action === 'RESET') {
          await clearChatMessages();
          addNotification("채팅 내역이 초기화되었습니다.", "info");
      }

      if (action === 'REINIT') {
          const initialData = generateInitialBuildings();
          await saveAllBuildings(initialData);
          setBuildings(initialData);
          addNotification("데이터베이스 구조가 초기 설정값으로 강제 동기화되었습니다.", "warning");
          return;
      }

      const newBuildings = buildings.map(b => ({
          ...b,
          floors: b.floors.map(f => ({
              ...f,
              units: f.units.map(u => {
                  if (u.isDeadUnit) return u;
                  
                  let newStatus = u.status;
                  let newMep = u.mepCompleted;

                  if (action === 'RESET') {
                      newStatus = ProcessStatus.NOT_STARTED;
                      newMep = false;
                  } else if (action === 'INSTALL') {
                      newStatus = ProcessStatus.INSTALLING;
                  } else if (action === 'REQ') {
                      newStatus = ProcessStatus.APPROVAL_REQ;
                  } else if (action === 'APPROVE') {
                      newStatus = ProcessStatus.APPROVED;
                  } else if (action === 'MEP') {
                      if (u.status === ProcessStatus.APPROVED || u.status === ProcessStatus.POURING || u.status === ProcessStatus.CURED) {
                          newMep = true;
                      }
                  }

                  return { ...u, status: newStatus, mepCompleted: newMep };
              })
          }))
      }));

      setBuildings(newBuildings);
      await saveAllBuildings(newBuildings);
      addNotification("일괄 상태 변경이 완료되었습니다.", "success");
  };

  const handleRestore = () => {
    fileInputRef.current?.click();
  };

  const handleFileRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const result = event.target?.result as string;
        const parsed = JSON.parse(result);
        
        if (parsed.buildings && parsed.siteName) {
           if(window.confirm(`불러온 백업 데이터(${new Date(parsed.timestamp).toLocaleString()})로 상태를 복구하시겠습니까?\n\n※ "확인"을 누르면 현재 코드 버전의 건물 구조에 백업된 작업 상태를 병합합니다.`)) {
               
               const baseBuildings = generateInitialBuildings();
               const backupBuildings = parsed.buildings;

               const mergedBuildings = baseBuildings.map((baseB: Building) => {
                   const backupB = backupBuildings.find((b: Building) => b.id === baseB.id);
                   if (!backupB) return baseB;

                   return {
                       ...baseB,
                       floors: baseB.floors.map((baseF: Floor) => {
                           const backupF = backupB.floors.find((f: Floor) => f.level === baseF.level);
                           if (!backupF) return baseF;

                           return {
                               ...baseF,
                               units: baseF.units.map((baseU: Unit) => {
                                   const backupU = backupF.units.find((u: Unit) => u.id === baseU.id);
                                   if (!backupU) return baseU;
                                   return {
                                       ...baseU,
                                       status: backupU.status,
                                       mepCompleted: backupU.mepCompleted,
                                       lastUpdated: backupU.lastUpdated
                                   };
                               })
                           };
                       })
                   };
               });

               setBuildings(mergedBuildings);
               setSiteName(parsed.siteName);
               if(parsed.projectCode) setProjectCode(parsed.projectCode);
               
               mergedBuildings.forEach(b => saveBuilding(b));

               addNotification("데이터 병합 및 복구가 완료되었습니다. (서버 동기화 포함)", "success");
               scrollToTop();
           }
        } else {
            alert("올바르지 않은 SFCS 백업 파일입니다.");
        }
      } catch (err) {
        alert("백업 파일을 읽는 중 오류가 발생했습니다.");
        console.error(err);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; 
  };

  const handleMepUpdate = (bId: string, floorLevel: number, unitId: string, completed: boolean) => {
    const newBuildings = buildings.map(b => {
        if (b.id !== bId) return b;
        return {
            ...b,
            floors: b.floors.map(f => {
                if (f.level !== floorLevel) return f;
                return {
                    ...f,
                    units: f.units.map(u => {
                        if (u.id !== unitId) return u;
                        return { ...u, mepCompleted: completed, lastUpdated: new Date().toISOString() };
                    })
                };
            })
        };
    });

    setBuildings(newBuildings);
    const updatedBuilding = newBuildings.find(b => b.id === bId);
    if (updatedBuilding) saveBuilding(updatedBuilding);
  };

  const handleStatusUpdate = async (bId: string, floorLevel: number, unitId: string, newStatus: ProcessStatus) => {
    let targetUnitNumber = "";

    const newBuildings = buildings.map(b => {
        if (b.id !== bId) return b;
        return {
            ...b,
            floors: b.floors.map(f => {
                if (f.level !== floorLevel) return f;
                return {
                    ...f,
                    units: f.units.map(u => {
                        if (u.id !== unitId) return u;
                        targetUnitNumber = u.unitNumber;

                        let nextMep = u.mepCompleted;

                        // [핵심] 이전 단계(미착수, 설치중, 승인요청)로 돌아가거나
                        // 승인완료(APPROVED) 상태로 진입하는 모든 경우(승인요청->승인, 설치중->강제승인 등)에 
                        // 기전 작업 상태(MEP)를 False(작업필요)로 초기화합니다.
                        if ([ProcessStatus.NOT_STARTED, ProcessStatus.INSTALLING, ProcessStatus.APPROVAL_REQ].includes(newStatus)) {
                            nextMep = false;
                        } 
                        else if (newStatus === ProcessStatus.APPROVED) {
                            nextMep = false;
                        }

                        return { ...u, status: newStatus, mepCompleted: nextMep, lastUpdated: new Date().toISOString() };
                    })
                };
            })
        };
    });
    
    // 1. 로컬 상태 즉시 반영 (낙관적 업데이트)
    setBuildings(newBuildings);
    
    // 2. DB 저장
    const updatedBuilding = newBuildings.find(b => b.id === bId);
    if (updatedBuilding) {
        saveBuilding(updatedBuilding);
        
        // 3. 메시지 자동 전송 (Await applied)
        if (newStatus === ProcessStatus.APPROVAL_REQ) {
            addNotification(`서버로 요청 전송 완료. (${targetUnitNumber}호)`, 'info');
            await sendChatMessage({
                text: `📢 [승인요청] ${updatedBuilding.name} ${floorLevel}층 ${targetUnitNumber}호 - 검측 요청합니다.`,
                userRole: currentUserRole,
                timestamp: Date.now(),
                senderName: '현장 알림'
            });
        } else if (newStatus === ProcessStatus.APPROVED) {
            await sendChatMessage({
                text: `✅ [승인완료] ${updatedBuilding.name} ${floorLevel}층 ${targetUnitNumber}호 - 승인 완료. 후속 공정 진행하세요.`,
                userRole: currentUserRole,
                timestamp: Date.now(),
                senderName: '관리자 알림'
            });
        }
    }
    
    setStatusModal(null);
  };

  const addNotification = (msg: string, type: SystemNotification['type']) => {
    setNotifications(prev => [{ id: Date.now().toString(), message: msg, type, timestamp: '방금 전', read: false }, ...prev]);
  };

  const pendingApprovals = useMemo(() => {
    const list: any[] = [];
    buildings.forEach(b => b.floors.forEach(f => f.units.forEach(u => {
      if (u.status === ProcessStatus.APPROVAL_REQ) list.push({ 
        buildingId: b.id, 
        buildingName: b.name, 
        floorLevel: f.level, 
        unitNumber: u.unitNumber,
        unitId: u.id
      });
    })));
    return list;
  }, [buildings]);

  const filteredBuildings = useMemo(() => {
      return buildings.filter(b => b.name.includes(searchTerm) && (statusFilter === 'ALL' || b.floors.some(f => f.units.some(u => u.status === statusFilter))));
  }, [buildings, searchTerm, statusFilter]);

  const shareCompletion = (data: StatusModalData) => {
    let title = "";
    let message = "";

    if (data.nextStatus === ProcessStatus.APPROVAL_REQ) {
        title = "SFCS 설치완료 보고";
        // [User Request] 요청하신 'AL폼 조립 및 슬라브 완성...' 문구 반영
        message = `[설치완료 보고]\n현장: ${data.buildingName}\n위치: ${data.floorLevel}층 ${data.unitNumber}호\n상태: AL폼 조립 및 슬라브 완성, 서포트 설치 완료. 검측 요청합니다.`;
    } else if (data.nextStatus === ProcessStatus.APPROVED) {
        title = "SFCS 승인완료 통보";
        message = `[승인완료 통보]\n현장: ${data.buildingName}\n위치: ${data.floorLevel}층 ${data.unitNumber}호\n결과: 검측 합격(승인). 기전(전기/설비) 작업 진행 바랍니다.`;
    }

    if (navigator.share) {
      navigator.share({ title: title, text: message }).catch(console.error);
    } else {
      navigator.clipboard.writeText(message);
      addNotification("메시지가 클립보드에 복사되었습니다. 카카오톡을 열어 붙여넣기 하세요.", "success");
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50 font-sans text-slate-900 overflow-x-hidden">
      {isMobileMenuOpen && <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[65] md:hidden" onClick={() => setIsMobileMenuOpen(false)} />}

      <aside className={`fixed h-full z-[70] transition-all duration-300 shadow-2xl bg-brand-dark text-white w-64 md:w-72 flex flex-col ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-6 border-b border-slate-700 flex justify-between items-center text-brand-primary">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 flex items-center justify-center bg-white rounded-xl shadow-glow"><Cpu className="w-6 h-6 text-brand-dark" /></div>
            <div className="flex flex-col">
              <h1 className="text-xl font-black text-white tracking-tighter leading-none">SFCS 3.2</h1>
              <span className="text-[9px] text-blue-200 font-medium whitespace-nowrap tracking-tight">Smart Framework Control System</span>
              <span className="text-[11px] text-white font-black tracking-widest mt-1 opacity-90">스마트 골조 통합 관제</span>
            </div>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden p-1 hover:bg-white/10 rounded-full transition-colors"><X className="w-6 h-6" /></button>
        </div>
        
        <nav className="flex-1 p-4 space-y-1 mt-4 overflow-y-auto custom-scrollbar">
          <button onClick={() => {setActiveTab('dashboard'); scrollToTop();}} className={`w-full flex items-center p-3.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'dashboard' ? 'bg-brand-primary text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
            <LayoutDashboard className="w-5 h-5 mr-3" /> 현황 대시보드
          </button>
          
          <button onClick={() => {setActiveTab('analysis'); scrollToTop();}} className={`w-full flex items-center p-3.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'analysis' ? 'bg-brand-primary text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
            <MapIcon className="w-5 h-5 mr-3" /> AI 도면/데이터 분석
          </button>
          
          <button onClick={() => {setActiveTab('manual'); scrollToTop();}} className={`w-full flex items-center p-3.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'manual' ? 'bg-brand-primary text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
            <FileText className="w-5 h-5 mr-3" /> 기술 아키텍처
          </button>

          {(currentUserRole === UserRole.ADMIN || currentUserRole === UserRole.CREATOR) && (
             <div className="mt-4 pt-4 border-t border-slate-700/50 space-y-2">
               <div className="px-4 text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Data Safety</div>
               <button onClick={handleBackup} className="w-full flex items-center p-3 rounded-xl text-xs font-semibold transition-all text-slate-300 hover:bg-emerald-500/10 hover:text-emerald-300">
                 <Save className="w-4 h-4 mr-3" /> 현재 상태 백업 (Backup)
               </button>
               <button onClick={handleRestore} className="w-full flex items-center p-3 rounded-xl text-xs font-semibold transition-all text-slate-300 hover:bg-amber-500/10 hover:text-amber-300">
                 <History className="w-4 h-4 mr-3" /> 이전 상태 복구 (Restore)
               </button>
             </div>
          )}

          {currentUserRole === UserRole.CREATOR && (
             <div className="mt-4 pt-4 border-t border-slate-700/50 space-y-2">
               <div className="px-4 text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Creator Controls</div>
               <button onClick={() => handleCreatorBatchAction('RESET')} className="w-full flex items-center p-3 rounded-xl text-xs font-semibold transition-all text-slate-300 hover:bg-red-500/10 hover:text-red-300">
                 <RotateCcw className="w-4 h-4 mr-3" /> 시스템 전체 초기화 (Reset)
               </button>
               <button onClick={() => handleCreatorBatchAction('REINIT')} className="w-full flex items-center p-3 rounded-xl text-xs font-semibold transition-all text-slate-300 hover:bg-purple-500/10 hover:text-purple-300">
                 <Database className="w-4 h-4 mr-3" /> DB 구조 강제 동기화 (Re-Init)
               </button>
             </div>
          )}

          <div className="mt-8 px-1">
             <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/50 p-4 shadow-lg">
                <div className="absolute top-0 right-0 w-24 h-24 bg-brand-primary/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
                <div className="relative z-10">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-700 pb-2 flex items-center">
                        <Activity className="w-3 h-3 mr-1.5 text-brand-primary" />
                        SFCS Brand Identity
                    </h3>
                    
                    <div className="mb-4">
                        <p className="text-[9px] text-slate-300 font-bold mb-2">Color Sense (Safety & Trust)</p>
                        <div className="flex gap-2">
                            <div className="flex-1 group">
                                <div className="h-6 w-full bg-[#0055A5] rounded-md shadow-md mb-1 group-hover:scale-105 transition-transform border border-white/5"></div>
                                <span className="text-[7px] text-slate-500 block text-center uppercase tracking-tight font-mono">Tech Blue</span>
                            </div>
                            <div className="flex-1 group">
                                <div className="h-6 w-full bg-[#F97316] rounded-md shadow-md mb-1 group-hover:scale-105 transition-transform border border-white/5"></div>
                                <span className="text-[7px] text-slate-500 block text-center uppercase tracking-tight font-mono">Alert Orange</span>
                            </div>
                            <div className="flex-1 group">
                                <div className="h-6 w-full bg-[#F1F5F9] rounded-md shadow-md mb-1 group-hover:scale-105 transition-transform border border-white/5 opacity-90"></div>
                                <span className="text-[7px] text-slate-500 block text-center uppercase tracking-tight font-mono">Concrete</span>
                            </div>
                        </div>
                    </div>

                    <div>
                        <p className="text-[9px] text-slate-300 font-bold mb-2">Design Composition</p>
                        <div className="bg-slate-950/50 rounded-lg p-2.5 border border-slate-800">
                            <p className="text-[8px] text-slate-400 leading-relaxed font-medium">
                                <span className="text-white font-bold">"Digital Concrete"</span> Theme
                            </p>
                            <p className="text-[8px] text-slate-500 leading-relaxed mt-1.5">
                                물리적 현장의 <span className="text-slate-300 font-bold">견고함</span>과 데이터의 <span className="text-blue-400 font-bold">투명성</span>을 결합한 <span className="text-white">Modular Grid</span> & <span className="text-white">Glassmorphism</span> 시스템.
                            </p>
                        </div>
                    </div>
                </div>
             </div>
          </div>
        </nav>

        <div className="p-4 border-t border-slate-700 bg-slate-900/50">
           <div className="mb-4 px-2 py-3 rounded-xl bg-brand-primary/10 border border-brand-primary/20">
              <div className="flex items-center space-x-2 mb-1">
                 <Award className="w-3.5 h-3.5 text-brand-accent" />
                 <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">System Architect</span>
              </div>
              <p className="text-xs font-black text-white">휘강건설 안전 박성훈 부장</p>
              <p className="text-[9px] text-slate-400 mt-1 italic">World-Class Engineering Lead</p>
           </div>
           
           <button onClick={() => {
             if (currentUserRole === UserRole.ADMIN || currentUserRole === UserRole.CREATOR) {
                 setCurrentUserRole(UserRole.WORKER);
                 addNotification("작업자 모드로 전환되었습니다.", "info");
             } else {
                 setIsLoginModalOpen(true);
                 setLoginPassword("");
             }
           }} className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
              <div className="flex items-center">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center mr-3 font-black text-xs shadow-lg flex-shrink-0 relative overflow-hidden">
                      <div className={`absolute inset-0 ${currentUserRole === UserRole.CREATOR ? 'bg-purple-500' : currentUserRole === UserRole.ADMIN ? 'bg-blue-500' : 'bg-slate-600'}`}></div>
                      <span className="relative z-10 text-white">{currentUserRole === UserRole.CREATOR ? '제' : currentUserRole === UserRole.ADMIN ? '관' : '작'}</span>
                  </div>
                  <div className="text-left min-w-0"><p className="text-xs font-black text-white truncate">{currentUserRole}</p><p className="text-[10px] text-slate-500">모드 전환</p></div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
           </button>
        </div>
      </aside>

      <main className="flex-1 md:ml-64 lg:ml-72 relative flex flex-col min-h-screen">
        <div className="absolute top-0 left-0 w-full h-64 md:h-80 bg-brand-dark z-0">
           <div className="absolute inset-0 opacity-10 bg-grid-pattern bg-[size:32px_32px]"></div>
           <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-slate-50 to-transparent"></div>
        </div>
        
        <header className="relative z-10 p-4 md:p-10 pb-6 text-white w-full">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-6">
              <div className="flex flex-wrap items-center gap-4 md:gap-8">
                  <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 -ml-2 hover:bg-white/10 rounded-xl md:hidden transition-colors"><Menu className="w-7 h-7" /></button>
                  <div className="flex items-center group">
                      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mr-4 shadow-2xl transition-transform group-hover:scale-110"><span className="font-black text-brand-dark text-2xl">D</span></div>
                      <div className="leading-none">
                        <div className="text-[11px] text-brand-primary font-serif italic mb-1 tracking-wider opacity-90">It's Possible</div>
                        <div className="text-xl md:text-2xl font-black tracking-tighter">대우건설</div>
                      </div>
                  </div>
                  <div className="flex items-center bg-white/10 backdrop-blur-xl px-5 py-3 rounded-2xl border border-white/20 shadow-xl">
                      <Handshake className="w-5 h-5 text-blue-300 mr-4" />
                      <div className="flex items-center space-x-6">
                          <div className="flex flex-col">
                            <span className="text-[9px] text-blue-200 font-black uppercase tracking-widest mb-0.5">Partner</span>
                            <span className="text-xs md:text-sm font-black whitespace-nowrap">휘강건설</span>
                          </div>
                          <div className="w-px h-6 bg-white/20"></div>
                          <div className="flex flex-col">
                            <span className="text-[9px] text-blue-200 font-black uppercase tracking-widest mb-0.5">Partner</span>
                            <span className="text-xs md:text-sm font-black whitespace-nowrap">오엔건설</span>
                          </div>
                      </div>
                  </div>
              </div>
              <div className="flex items-center space-x-4 ml-auto lg:ml-0">
                 <button onClick={() => setIsNotificationSidebarOpen(true)} className="relative p-3 bg-white/10 rounded-2xl border border-white/20 backdrop-blur-md hover:bg-white/20 transition-all shadow-lg active:scale-95">
                    <Bell className="w-6 h-6" />
                    {notifications.length > 0 && <span className="absolute top-2 right-2 w-3 h-3 bg-brand-accent rounded-full border-2 border-brand-dark animate-pulse"></span>}
                 </button>
              </div>
          </div>
          <div className="max-w-5xl mx-auto flex flex-col items-center">
              <div className="flex items-center justify-center space-x-3 mb-2">
                 <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-1.5 ${isConnected ? 'bg-emerald-500 text-white' : 'bg-slate-500 text-slate-200'}`}>
                    {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                    {isConnected ? 'Real-time Live' : 'Offline / Reconnecting'}
                 </span>
                 <span className="text-[10px] text-white font-bold font-mono bg-slate-900/50 px-2 py-0.5 rounded-lg border border-white/20 tracking-widest flex items-center gap-2 shadow-sm backdrop-blur-md">
                    {currentTime} 
                    <span className="w-px h-2 bg-white/30 mx-1"></span> 
                    {weather ? (
                        <>
                            <CloudSun className="w-3 h-3 text-yellow-300" /> 
                            용인 남동 {weather.condition} {weather.temp}°C / 풍속 {weather.wind}m/s
                        </>
                    ) : (
                        <>
                            <CloudSun className="w-3 h-3 text-yellow-300" /> 
                            기상 정보 수신중...
                        </>
                    )}
                 </span>
              </div>
              <div className="group relative w-full max-w-3xl">
                <input 
                  type="text" 
                  value={siteName} 
                  onChange={(e) => setSiteName(e.target.value)} 
                  className="text-2xl md:text-4xl lg:text-5xl font-black bg-white border-none w-full outline-none text-brand-dark focus:ring-4 focus:ring-brand-primary/40 py-4 px-8 rounded-3xl transition-all leading-tight tracking-tighter shadow-2xl placeholder:text-slate-300 text-center"
                  placeholder="현장명을 입력하세요"
                />
                <div className="absolute -bottom-2 left-8 right-8 h-1.5 bg-brand-accent rounded-full opacity-0 group-focus-within:opacity-100 transition-all shadow-glow"></div>
              </div>
              {connectionError && (
                  <div className="mt-4 px-6 py-3 bg-red-500/90 text-white text-xs font-bold rounded-xl shadow-lg backdrop-blur-md flex items-center justify-center max-w-2xl w-full border border-red-400 animate-pulse">
                      <AlertOctagon className="w-4 h-4 mr-2" />
                      {connectionError}
                  </div>
              )}
          </div>
        </header>
        
        <div className="relative z-10 flex-1 space-y-6 md:space-y-12 px-4 md:px-10 pb-24 w-full max-w-[1440px] mx-auto overflow-x-hidden">
            {activeTab === 'dashboard' && (
              <>
                {pendingApprovals.length > 0 && (
                  <div className="bg-white/80 backdrop-blur-md border border-orange-200 rounded-[2.5rem] py-4 md:py-6 shadow-2xl animate-fade-in-up w-full min-w-0 overflow-hidden">
                    <div className="flex items-center justify-between mb-5 px-4 md:px-6">
                       <h3 className="text-lg font-black text-slate-800 flex items-center"><Zap className="w-5 h-5 mr-3 text-brand-accent fill-brand-accent" /> 긴급 승인 대기 <span className="ml-2 px-2 py-0.5 bg-orange-100 text-orange-600 rounded-lg text-xs font-black">{pendingApprovals.length} 건</span></h3>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 pb-3 w-full px-4 md:px-6">
                       {pendingApprovals.map((p, idx) => (
                         <button key={idx} onClick={() => {
                            const el = document.getElementById(`building-${p.buildingId}`);
                            if(el) {
                                window.scrollTo({ top: el.offsetTop - 140, behavior: 'smooth' });
                                setJumpTarget({ id: p.buildingId, level: p.floorLevel });
                            }
                            
                            if (currentUserRole === UserRole.ADMIN || currentUserRole === UserRole.CREATOR) {
                              setStatusModal({
                                buildingId: p.buildingId,
                                buildingName: p.buildingName,
                                floorLevel: p.floorLevel,
                                unitId: p.unitId,
                                unitNumber: p.unitNumber,
                                currentStatus: ProcessStatus.APPROVAL_REQ,
                                nextStatus: ProcessStatus.APPROVED,
                                isRevert: false
                              });
                            }
                         }} className="flex-shrink-0 bg-white border border-slate-100 p-4 rounded-3xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all text-left w-full active:scale-95 group relative overflow-hidden">
                            <div className="flex justify-between items-center mb-2">
                               <span className="text-[10px] font-black text-slate-400 tracking-tighter group-hover:text-brand-primary">{p.buildingName}</span>
                               <ChevronRight className="w-3 h-3 text-slate-300" />
                            </div>
                            <div className="text-2xl font-black text-slate-800 mb-1">{p.unitNumber}호</div>
                            <div className="flex items-center justify-between mt-3">
                               <div className="bg-orange-50 text-brand-accent text-[10px] font-black px-3 py-1 rounded-full border border-orange-100">{p.floorLevel}F 요청</div>
                            </div>
                            {(currentUserRole === UserRole.ADMIN || currentUserRole === UserRole.CREATOR) && (
                                <div className="absolute inset-0 bg-slate-900/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if(window.confirm(`${p.buildingName} ${p.unitNumber}호를 승인하시겠습니까?`)) {
                                                handleStatusUpdate(p.buildingId, p.floorLevel, p.unitId, ProcessStatus.APPROVED);
                                            }
                                        }}
                                        className="bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-black flex items-center hover:bg-emerald-600 transition-colors shadow-lg"
                                    >
                                        <CheckCircle2 className="w-4 h-4 mr-1.5" /> 바로 승인
                                    </div>
                                </div>
                            )}
                         </button>
                       ))}
                    </div>
                  </div>
                )}
                
                <SiteMap buildings={buildings} onSelectBuilding={(id) => {
                    const el = document.getElementById(`building-${id}`);
                    if(el) window.scrollTo({ top: el.offsetTop - 140, behavior: 'smooth' });

                    if (currentUserRole === UserRole.ADMIN || currentUserRole === UserRole.CREATOR) {
                        const b = buildings.find(x => x.id === id);
                        let targetUnit = null;
                        let targetFloorLevel = 0;
                        
                        for(const f of b?.floors || []) {
                            const u = f.units.find(x => x.status === ProcessStatus.APPROVAL_REQ);
                            if(u) {
                                targetUnit = u;
                                targetFloorLevel = f.level;
                                break;
                            }
                        }

                        if (targetUnit) {
                             setStatusModal({
                                buildingId: id,
                                buildingName: b!.name,
                                floorLevel: targetFloorLevel,
                                unitId: targetUnit.id,
                                unitNumber: targetUnit.unitNumber,
                                currentStatus: ProcessStatus.APPROVAL_REQ,
                                nextStatus: ProcessStatus.APPROVED,
                                isRevert: false
                            });
                            setJumpTarget({ id, level: targetFloorLevel });
                        }
                    }
                }} />
                
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-slate-200 pb-6 gap-6">
                   <div>
                      <h3 className="text-3xl font-black text-slate-800 tracking-tighter">실시간 관제 그리드</h3>
                      <p className="text-sm text-slate-400 mt-1">현장 안전 관리를 위한 실시간 정밀 모니터링 및 상태 관리 시스템</p>
                   </div>
                   <div className="flex items-center space-x-3 w-full sm:w-auto">
                      <div className="relative flex-1 sm:w-64">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input type="text" placeholder="동/호수 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-medium outline-none focus:ring-4 focus:ring-brand-primary/10 transition-all shadow-sm" />
                      </div>
                   </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                    {filteredBuildings.map((b) => (
                      <div id={`building-${b.id}`} key={b.id} className="animate-fade-in-up w-full min-w-0 overflow-hidden">
                        <BuildingSection 
                            building={b} 
                            userRole={currentUserRole}
                            onUpdateStatus={(floorLevel, unitId, unitNumber, currentStatus, nextStatus, isRevert) => {
                              setStatusModal({
                                buildingId: b.id,
                                buildingName: b.name,
                                floorLevel,
                                unitId,
                                unitNumber,
                                currentStatus,
                                nextStatus,
                                isRevert
                              });
                            }}
                            onUpdateMep={(floorLevel, unitId, completed) => {
                                handleMepUpdate(b.id, floorLevel, unitId, completed);
                            }} 
                            jumpToFloor={jumpTarget?.id === b.id ? jumpTarget.level : undefined}
                            onJumpHandled={() => {
                               if (jumpTarget?.id === b.id) setJumpTarget(null);
                            }}
                        />
                      </div>
                    ))}
                </div>
              </>
            )}
            {activeTab === 'analysis' && (
              <AnalysisView 
                buildings={buildings} 
                onAnalysisComplete={handleAnalysisComplete} 
                persistedResult={lastAnalysisResult}
                userRole={currentUserRole} 
              />
            )}
            {activeTab === 'manual' && (
              <Manual onClose={() => { 
                setActiveTab('dashboard'); 
                scrollToTop(); 
              }} />
            )}
        </div>
        
        {showScrollTop && (
          <button onClick={scrollToTop} className="fixed bottom-8 right-24 z-[100] w-14 h-14 bg-white text-slate-400 border border-slate-200 rounded-2xl shadow-xl flex items-center justify-center animate-fade-in-up hover:bg-slate-50 transition-all hover:-translate-y-1 active:scale-95 group">
              <ArrowUp className="w-6 h-6" />
          </button>
        )}

        <button 
            onClick={() => setIsChatOpen(!isChatOpen)} 
            className="fixed bottom-8 right-6 z-[300] w-14 h-14 bg-slate-800 text-white rounded-2xl shadow-2xl flex items-center justify-center animate-fade-in-up hover:bg-slate-700 transition-all hover:-translate-y-1 active:scale-95 group border border-slate-700"
        >
            {isChatOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
        </button>

        <LiveChat currentUserRole={currentUserRole} isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />

      </main>
      
      <div className="fixed bottom-0 left-0 right-0 md:top-auto md:left-auto md:bottom-6 md:right-6 z-[300] flex flex-col gap-3 pointer-events-none p-4 md:p-0 items-center md:items-end">
        {notifications
            .filter(n => !n.read && Date.now() - parseInt(n.id.split('.')[0]) < 5000)
            .slice(0, 3) 
            .map(n => (
          <div 
            key={n.id} 
            onClick={() => setNotifications(prev => prev.map(p => p.id === n.id ? {...p, read: true} : p))} 
            className="cursor-pointer hover:bg-slate-50 transition-colors bg-white/90 backdrop-blur-md border border-slate-200 p-4 rounded-2xl shadow-2xl animate-slide-up pointer-events-auto flex items-center gap-3 w-full md:w-auto md:min-w-[300px]"
          >
             {n.type === 'success' ? <Check className="w-5 h-5 text-emerald-500"/> : <Bell className="w-5 h-5 text-orange-500"/>}
             <div className="flex-1">
                <p className="text-xs font-black text-slate-800">{n.type === 'success' ? '승인 완료' : '알림'}</p>
                <p className="text-xs text-slate-600">{n.message}</p>
             </div>
          </div>
        ))}
      </div>

      {statusModal && (
        <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center p-0 md:p-4 bg-slate-900/70 backdrop-blur-md transition-all">
          <div className="bg-white rounded-t-[2.5rem] md:rounded-3xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="px-8 py-5 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-black text-base uppercase tracking-widest text-slate-500">{statusModal.isRevert ? '보고 취소' : '상태 변경 실행'}</h3>
              <button onClick={() => setStatusModal(null)} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
            </div>
            <div className="p-8">
              <div className="flex items-center mb-6">
                <div className="w-12 h-12 bg-brand-primary/10 rounded-2xl flex items-center justify-center mr-4"><BuildingIcon className="w-6 h-6 text-brand-primary" /></div>
                <div>
                  <h4 className="text-2xl font-black text-slate-800 tracking-tighter">{statusModal.buildingName}</h4>
                  <p className="text-brand-primary font-bold">{statusModal.unitNumber}호실 - {statusModal.floorLevel}층</p>
                </div>
              </div>
              <div className="bg-slate-50 p-6 rounded-[2rem] mb-6 flex items-center justify-around border border-slate-100 shadow-inner">
                <div className="text-center"><div className="text-[10px] text-slate-400 font-black mb-1">현재</div><div className="text-sm font-bold text-slate-500">{statusModal.currentStatus}</div></div>
                <ArrowRight className="text-brand-primary w-6 h-6" />
                <div className="text-center">
                    <div className="text-[10px] text-brand-primary font-black mb-1">변경</div>
                    <select 
                        value={statusModal.nextStatus}
                        onChange={(e) => setStatusModal({...statusModal, nextStatus: e.target.value as ProcessStatus})}
                        className="text-sm font-black text-brand-primary bg-transparent border-b border-brand-primary focus:outline-none cursor-pointer"
                    >
                        {Object.values(ProcessStatus).filter(status => {
                            if (currentUserRole === UserRole.ADMIN || currentUserRole === UserRole.CREATOR) return true;
                            return [ProcessStatus.NOT_STARTED, ProcessStatus.INSTALLING, ProcessStatus.APPROVAL_REQ].includes(status);
                        }).map((status) => (
                            <option key={status} value={status}>{status}</option>
                        ))}
                    </select>
                </div>
              </div>

              {(statusModal.nextStatus === ProcessStatus.APPROVAL_REQ || statusModal.nextStatus === ProcessStatus.APPROVED) && (
                <div className={`mb-8 p-4 border rounded-2xl ${statusModal.nextStatus === ProcessStatus.APPROVED ? 'bg-emerald-50 border-emerald-100' : 'bg-orange-50 border-orange-100'}`}>
                  <p className={`text-xs font-bold mb-3 flex items-center ${statusModal.nextStatus === ProcessStatus.APPROVED ? 'text-emerald-700' : 'text-orange-700'}`}>
                      {statusModal.nextStatus === ProcessStatus.APPROVED ? 
                         <><Check className="w-3 h-3 mr-1.5" /> 승인 결과 통보 (작업자 공유)</> : 
                         <><AlertTriangle className="w-3 h-3 mr-1.5" /> 설치 완료 보고 (관리자 공유)</>
                      }
                  </p>
                  <button onClick={() => shareCompletion(statusModal)} className={`w-full flex items-center justify-center space-x-2 py-3 bg-white border rounded-xl font-black text-xs shadow-sm active:scale-95 transition-colors ${statusModal.nextStatus === ProcessStatus.APPROVED ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-100' : 'border-orange-200 text-orange-600 hover:bg-orange-100'}`}>
                      <Share2 className="w-4 h-4" />
                      <span>카카오톡 / 문자로 알림 전송</span>
                  </button>
                </div>
              )}

              <div className="flex space-x-4">
                <button onClick={() => setStatusModal(null)} className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl font-black text-sm">취소</button>
                <button onClick={() => handleStatusUpdate(statusModal.buildingId, statusModal.floorLevel, statusModal.unitId, statusModal.nextStatus)} className="flex-1 py-4 bg-brand-primary text-white rounded-2xl font-black text-sm shadow-xl hover:bg-blue-600">업데이트</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isLoginModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-brand-dark/80 backdrop-blur-lg">
            <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-sm overflow-hidden p-10 animate-scale-in">
                <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-blue-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-inner"><Lock className="w-10 h-10 text-brand-primary" /></div>
                    <h3 className="text-2xl font-black text-slate-800 tracking-tighter">관리자 보안 인증</h3>
                    <p className="text-sm text-slate-500 mt-2 font-medium">휘강건설 안전 박성훈 부장 승인 전용</p>
                </div>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (loginPassword === '1234') {
                      setCurrentUserRole(UserRole.ADMIN);
                      setIsLoginModalOpen(false);
                      addNotification("관리자 권한이 활성화되었습니다.", "success");
                  } else if (loginPassword === '3690') {
                      setCurrentUserRole(UserRole.CREATOR);
                      setIsLoginModalOpen(false);
                      addNotification("시스템 제작자(설계자) 권한이 활성화되었습니다.", "success");
                  } else {
                      alert("승인 코드가 올바르지 않습니다.");
                      setLoginPassword("");
                  }
                }} className="space-y-6">
                    <input 
                        type="password" 
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="" 
                        className="w-full border-2 border-slate-100 rounded-2xl px-5 py-5 text-center text-3xl tracking-[0.5em] focus:border-brand-primary outline-none transition-all" 
                        autoFocus 
                    />
                    <button type="submit" className="w-full bg-brand-primary text-white font-black py-5 rounded-2xl shadow-xl hover:bg-blue-600 transition-all active:scale-95 text-sm uppercase tracking-widest">Access System</button>
                    <button type="button" onClick={() => setIsLoginModalOpen(false)} className="w-full text-xs text-slate-400 font-black py-2 uppercase tracking-widest">Cancel</button>
                </form>
            </div>
        </div>
      )}

      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        accept=".json" 
        onChange={handleFileRestore} 
      />
    </div>
  );
};

export default App;