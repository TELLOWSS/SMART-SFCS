
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LayoutDashboard, 
  CheckCircle2,
  BarChart3,
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
  Download,
  History,
  Lock,
  ThumbsDown // [New] Icon for Reject
} from 'lucide-react';
// [중요] Notification이 아닌 SystemNotification을 가져옵니다.
import { Building, ProcessStatus, UserRole, SystemNotification, AnalysisResult, BuildingStructure, Floor, Unit, ActionItem, ActionPriority } from './types';
import BuildingSection from './components/BuildingSection';
import SiteMap from './components/SiteMap';
import AnalysisView from './components/AnalysisView';
import Manual from './components/Manual';
import LiveChat from './components/LiveChat';
import GangformPTW, { GangformPTWPayload, ApprovalStatus } from './components/GangformPTW';
import { BUILDING_DATA } from './constants/buildingData';
import { suggestSitePlan } from './services/geminiService';
import { insertGangformPtwCompletedRecord, fetchGangformPtwHistory, type GangformPtwRecordRow } from './services/gangformPtwActions';
import { handleShareMessage, buildSmartSfcsShareText } from './lib/shareUtil';
import { 
    syncBuildings, 
    saveBuilding, 
    initializeDataIfEmpty, 
    saveAllBuildings, 
    sendChatMessage, 
    clearChatMessages, 
    subscribeToAnalysisResult, 
    saveAnalysisResult,
    saveGangformPtwData,
    saveGangformPtwRecord,
    subscribeToGangformPtwData,
    GangformPtwStoredMap,
    saveApprovalLeadTimeEvent,
    saveGangformPtwForceEditEvent,
    subscribeApprovalLeadTimeEvents,
    type ApprovalLeadTimeEventRecord
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
  return BUILDING_DATA.map((structure) => {
    const floors: Floor[] = [];
    const deadUnitSet = new Set(structure.deadUnits);
    const buildingId = structure.building.replace(/[^0-9]/g, '');

    for (let floorLevel = 1; floorLevel <= structure.maxFloor; floorLevel++) {
      const units: Unit[] = [];

      for (let unitLine = 1; unitLine <= structure.maxUnit; unitLine++) {
        const unitCode = `${floorLevel}${String(unitLine).padStart(2, '0')}`;
        const isDead = deadUnitSet.has(unitCode);

        units.push({
          id: `${structure.building}-${floorLevel}-${unitLine}`,
          unitNumber: unitCode,
          status: isDead ? ProcessStatus.CURED : ProcessStatus.NOT_STARTED,
          lastUpdated: new Date().toISOString(),
          mepCompleted: false,
          isDeadUnit: isDead
        });
      }

      floors.push({ level: floorLevel, units });
    }

    return {
      id: `b-${buildingId}`,
      name: structure.building,
      totalFloors: structure.maxFloor,
      floors
    };
  });
};

const createUnitCode = (floorLevel: number, unitLine: number): string => `${floorLevel}${String(unitLine).padStart(2, '0')}`;

const normalizeBuildingsWithDrawingData = (buildings: Building[]): Building[] => {
  const structureMap = new Map(BUILDING_DATA.map((structure) => [structure.building, structure]));

  return buildings.map((building) => {
    const structure = structureMap.get(building.name);
    if (!structure) return building;

    const existingUnitMap = new Map<string, Unit>();
    building.floors.forEach((floor) => {
      floor.units.forEach((unit, index) => {
        const parsedUnit = parseInt(String(unit.unitNumber).replace(/[^0-9]/g, ''), 10);
        const fallbackCode = createUnitCode(floor.level, index + 1);
        const unitCode = Number.isFinite(parsedUnit) ? String(parsedUnit) : fallbackCode;
        existingUnitMap.set(unitCode, unit);
      });
    });

    const deadUnitSet = new Set(structure.deadUnits);
    const nowIso = new Date().toISOString();
    const floors: Floor[] = [];

    for (let floorLevel = 1; floorLevel <= structure.maxFloor; floorLevel++) {
      const units: Unit[] = [];

      for (let unitLine = 1; unitLine <= structure.maxUnit; unitLine++) {
        const unitCode = createUnitCode(floorLevel, unitLine);
        const existingUnit = existingUnitMap.get(unitCode);
        const isDead = deadUnitSet.has(unitCode);
        const wasDead = !!existingUnit?.isDeadUnit;

        const status = (() => {
          if (isDead) return ProcessStatus.CURED;
          if (!existingUnit) return ProcessStatus.NOT_STARTED;
          if (wasDead && existingUnit.status === ProcessStatus.CURED) return ProcessStatus.NOT_STARTED;
          return existingUnit.status;
        })();

        units.push({
          id: existingUnit?.id || `${structure.building}-${floorLevel}-${unitLine}`,
          unitNumber: unitCode,
          status,
          lastUpdated: existingUnit?.lastUpdated || nowIso,
          mepCompleted: isDead ? false : !!existingUnit?.mepCompleted,
          isDeadUnit: isDead
        });
      }

      floors.push({ level: floorLevel, units });
    }

    return {
      ...building,
      name: structure.building,
      totalFloors: structure.maxFloor,
      floors
    };
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

const normalizeAnalysisActionItems = (result: AnalysisResult | null): ActionItem[] => {
  if (!result || !Array.isArray((result as any).actionItems)) return [];

  return (result as any).actionItems
    .map((item: any): ActionItem | null => {
      if (typeof item === 'string') {
        const title = item.trim();
        if (!title) return null;
        return { title, code: 'GENERAL_ACTION', priority: 'medium', dueAt: null };
      }

      if (item && typeof item === 'object') {
        const title = String(item.title || '').trim();
        if (!title) return null;
        const priority: ActionPriority = item.priority === 'high' || item.priority === 'low' ? item.priority : 'medium';
        return {
          title,
          code: item.code || 'GENERAL_ACTION',
          priority,
          dueAt: item.dueAt || null
        };
      }

      return null;
    })
    .filter((item: ActionItem | null): item is ActionItem => item !== null);
};

const buildAnalysisAlertKey = (result: AnalysisResult | null): string => {
  if (!result) return '';
  const actions = normalizeAnalysisActionItems(result)
    .map(a => `${a.code}|${a.priority}|${a.title}`)
    .join('||');
  return `${result.siteName}|${result.projectCode}|${actions}`;
};

const buildRoleCommunicationBundle = (siteName: string, highPriorityItems: ActionItem[]) => {
  const summary = highPriorityItems.slice(0, 2).map(item => item.title).join(' / ');
  const count = highPriorityItems.length;

  return {
    summary,
    admin: `🛡️ [관리자 지시] ${siteName} - 긴급 항목 ${count}건 확인 후 담당 지정 및 기한 설정: ${summary}`,
    worker: `🛠️ [작업자 안내] ${siteName} - 긴급 항목 ${count}건 관련 즉시 점검 및 진행상태 보고: ${summary}`,
    subcontractor: `🤝 [협력사 요청] ${siteName} - 긴급 항목 ${count}건 대응 계획/회신 필요: ${summary}`,
    integrated: `🚨 [긴급 액션 공유]\n- 관리자: 담당 배정 및 승인 경로 점검\n- 작업자: 즉시 현장 점검 및 보고\n- 협력사: 대응 계획 회신\n핵심: ${summary}`
  };
};

const buildIntegratedRoleCommunicationMessage = (siteName: string, highPriorityItems: ActionItem[]) => {
  const comm = buildRoleCommunicationBundle(siteName, highPriorityItems);
  return `${comm.integrated}\n- 관리자 지시: ${comm.admin}\n- 작업자 안내: ${comm.worker}\n- 협력사 요청: ${comm.subcontractor}`;
};

const getTabFromPath = (pathname: string): 'dashboard' | 'executive' | 'analysis' | 'manual' | 'ptw' => {
  if (pathname === '/gangform-ptw') return 'ptw';
  if (pathname === '/executive') return 'executive';
  if (pathname === '/analysis') return 'analysis';
  if (pathname === '/manual') return 'manual';
  return 'dashboard';
};

const getPathFromTab = (tab: 'dashboard' | 'executive' | 'analysis' | 'manual' | 'ptw'): string => {
  if (tab === 'ptw') return '/gangform-ptw';
  if (tab === 'executive') return '/executive';
  if (tab === 'analysis') return '/analysis';
  if (tab === 'manual') return '/manual';
  return '/';
};

const parseExecutiveFiltersFromSearch = (search: string): { building: string; month: string } => {
  const params = new URLSearchParams(search);
  const building = params.get('b') || params.get('building') || 'ALL';
  const month = params.get('m') || params.get('month') || 'ALL';
  return { building, month };
};

const ZONE2_BUILDING_NUMBERS = new Set([2006, 2007, 2008, 2009, 2010, 3001, 3002, 3003]);

const isZone2Building = (buildingName: string): boolean => {
  const number = parseInt(buildingName.replace(/[^0-9]/g, ''), 10);
  return ZONE2_BUILDING_NUMBERS.has(number);
};

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

interface GangformPtwLocalRecord {
  payload: GangformPTWPayload;
  status: ApprovalStatus;
  updatedAt: string;
  requestedAt?: string | null;
  approvedAt?: string | null;
  completedAt?: string | null;
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'executive' | 'analysis' | 'manual' | 'ptw'>(() => getTabFromPath(window.location.pathname));
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
  const [selectedPtwBuildingId, setSelectedPtwBuildingId] = useState<string>('');
  const [gangformPtwByBuilding, setGangformPtwByBuilding] = useState<Record<string, GangformPtwLocalRecord>>({});
  const [ptwHistoryRecords, setPtwHistoryRecords] = useState<GangformPtwRecordRow[]>([]);
  const [ptwHistoryRefreshTick, setPtwHistoryRefreshTick] = useState(0);
  const [approvalLeadTimeEvents, setApprovalLeadTimeEvents] = useState<ApprovalLeadTimeEventRecord[]>([]);
  const [executiveBuildingFilter, setExecutiveBuildingFilter] = useState<string>(() => parseExecutiveFiltersFromSearch(window.location.search).building);
  const [executiveMonthFilter, setExecutiveMonthFilter] = useState<string>(() => parseExecutiveFiltersFromSearch(window.location.search).month);
  const [isExecutiveProgressHighlighted, setIsExecutiveProgressHighlighted] = useState(false);
  const [executiveProgressFocusLabel, setExecutiveProgressFocusLabel] = useState<string>('공정률');
  const [ptwJumpedBuildingId, setPtwJumpedBuildingId] = useState<string | null>(null);
  const [ptwFocusSignal, setPtwFocusSignal] = useState(0);
  
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
  const analysisAlertKeyRef = useRef<string | null>(null);
  const ptwDetailRef = useRef<HTMLDivElement | null>(null);
  // [Fix] 도면 정규화 재저장이 세션 당 최대 1회만 실행되도록 보장.
  // 모든 기기가 라이브 스냅샷마다 saveAllBuildings를 호출하면 기기 간 동시 쓰기 경쟁(Race Condition)이
  // 발생해 다른 기기에서 요청한 상태 변경이 덮어씌워질 수 있다.
  const normalizedOnceRef = useRef<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const analysisActionItems = useMemo(() => normalizeAnalysisActionItems(lastAnalysisResult), [lastAnalysisResult]);
  const highPriorityActionItems = useMemo(
    () => analysisActionItems.filter(item => item.priority === 'high'),
    [analysisActionItems]
  );
  const unreadNotificationCount = useMemo(
    () => notifications.filter(n => !n.read).length,
    [notifications]
  );

  const handleNavigateTab = (tab: 'dashboard' | 'executive' | 'analysis' | 'manual' | 'ptw') => {
    const nextPath = getPathFromTab(tab);
    const params = new URLSearchParams();
    if (tab === 'executive') {
      if (executiveBuildingFilter !== 'ALL') params.set('b', executiveBuildingFilter);
      if (executiveMonthFilter !== 'ALL') params.set('m', executiveMonthFilter);
    }
    const query = params.toString();
    const nextUrl = query ? `${nextPath}?${query}` : nextPath;

    if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
      window.history.pushState({}, '', nextUrl);
    }
    setActiveTab(tab);
    scrollToTop();
  };

  const getBuildingPtwStatus = (building: Building): '진행 전' | '승인 대기' | '인상 완료' => {
    const activeUnits = building.floors.flatMap(f => f.units).filter(u => !u.isDeadUnit);
    if (activeUnits.some(u => u.status === ProcessStatus.APPROVAL_REQ)) return '승인 대기';
    if (activeUnits.length > 0 && activeUnits.every(u => u.status === ProcessStatus.CURED || u.status === ProcessStatus.APPROVED)) return '인상 완료';
    return '진행 전';
  };

  const ptwSummary = useMemo(() => {
    return buildings
      .map((building) => {
        const ptwRecord = gangformPtwByBuilding[building.id];
        const status = (() => {
          const ptwStatus = ptwRecord?.status;
          if (ptwStatus === 'requested') return '승인 대기';
          if (ptwStatus === 'approved') return '인상중';
          if (ptwStatus === 'completed') return '인상 완료';
          if (ptwStatus === 'rejected' || ptwStatus === 'draft') return '진행 전';
          return getBuildingPtwStatus(building);
        })();

        return {
          buildingId: building.id,
          buildingName: building.name,
          floor: normalizeFloorLabel(ptwRecord?.payload?.floor),
          status,
          elapsedMinutes: status === '승인 대기' ? getElapsedMinutes(ptwRecord?.requestedAt || null) : null,
          statusEmoji: (() => {
            const ptwStatus = ptwRecord?.status;
            if (ptwStatus === 'requested') return '🟡';
            if (ptwStatus === 'approved') return '🔵';
            if (ptwStatus === 'completed') return '🟢';
            if (getBuildingPtwStatus(building) === '인상 완료') return '🟢';
            return '⚪';
          })()
        };
      })
      .sort((a, b) => {
        const aPriority = a.status === '승인 대기' ? 0 : 1;
        const bPriority = b.status === '승인 대기' ? 0 : 1;
        if (aPriority !== bPriority) return aPriority - bPriority;
        if (a.status === '승인 대기' && b.status === '승인 대기') {
          return (b.elapsedMinutes || 0) - (a.elapsedMinutes || 0);
        }
        return a.buildingName.localeCompare(b.buildingName, 'ko');
      });
  }, [buildings, gangformPtwByBuilding]);

  const selectedPtwBuilding = useMemo(() => {
    return buildings.find(b => b.id === selectedPtwBuildingId) || buildings[0] || null;
  }, [buildings, selectedPtwBuildingId]);

  const focusPtwDetailView = (buildingId: string) => {
    setSelectedPtwBuildingId(buildingId);
    setPtwJumpedBuildingId(buildingId);
    setPtwFocusSignal(prev => prev + 1);
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

  // [초기화] 브라우저 알림 권한 요청
  useEffect(() => {
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!selectedPtwBuildingId && buildings.length > 0) {
      setSelectedPtwBuildingId(buildings[0].id);
    }
  }, [buildings, selectedPtwBuildingId]);

  useEffect(() => {
    const handlePopState = () => {
      const nextTab = getTabFromPath(window.location.pathname);
      setActiveTab(nextTab);

      if (nextTab === 'executive') {
        const parsed = parseExecutiveFiltersFromSearch(window.location.search);
        setExecutiveBuildingFilter(parsed.building || 'ALL');
        setExecutiveMonthFilter(parsed.month || 'ALL');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (activeTab !== 'executive') return;

    const params = new URLSearchParams(window.location.search);
    params.delete('building');
    if (executiveBuildingFilter === 'ALL') params.delete('b');
    else params.set('b', executiveBuildingFilter);

    params.delete('month');
    if (executiveMonthFilter === 'ALL') params.delete('m');
    else params.set('m', executiveMonthFilter);

    const query = params.toString();
    const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    const currentUrl = `${window.location.pathname}${window.location.search}`;

    if (nextUrl !== currentUrl) {
      window.history.replaceState({}, '', nextUrl);
    }
  }, [activeTab, executiveBuildingFilter, executiveMonthFilter]);

  // [Real-time Sync] Firebase 데이터 동기화
  useEffect(() => {
    // 1. 초기 데이터가 없으면 서버에 업로드 (최초 1회성)
    initializeDataIfEmpty(buildings);

    // 2. 서버 데이터 구독 및 에러 핸들링
    const unsubscribe = syncBuildings(
        (serverBuildings, isLive) => {
            // [Fix] memoryLocalCache 환경에서는 항상 서버 데이터를 받으므로 isLive는 true.
            // 연결 성공 시 isConnected를 true로 설정하고 에러를 초기화한다.
            setIsConnected(isLive);
            setConnectionError(null);
            
            if (serverBuildings.length > 0) {
              // 서버에 없는 동은 초기 상태로 보완해서 표시한다 (방어 코드).
              // Supabase 테이블에 일부 동만 있을 때 나머지 동이 UI에서 사라지는 현상을 방지한다.
              const serverIds = new Set(serverBuildings.map(b => b.id));
              const initialAll = generateInitialBuildings();
              const missingLocally = initialAll.filter(b => !serverIds.has(b.id));
              const mergedBuildings = missingLocally.length > 0
                ? [...serverBuildings, ...missingLocally]
                : serverBuildings;
              const normalizedBuildings = normalizeBuildingsWithDrawingData(mergedBuildings);

              // [Fix] saveAllBuildings 경쟁 조건(Race Condition) 제거.
              // 기존에는 정규화된 데이터를 Firebase에 재저장할 때 여러 기기가 동시에 스냅샷을 받으면
              // 모두 saveAllBuildings를 호출하여 마지막 기기의 쓰기가 이기는 방식으로
              // 다른 기기에서 막 변경한 상태(예: 설치중)가 초기값(미착수)으로 덮어씌워지는 문제가 있었다.
              // 이제 정규화 재저장은 initializeDataIfEmpty에서 한 번만 처리한다.
              if (!normalizedOnceRef.current && JSON.stringify(normalizedBuildings) !== JSON.stringify(serverBuildings)) {
                normalizedOnceRef.current = true;
                // 단위 세대 구조 변경(BUILDING_DATA 업데이트)이 있을 때만 저장하되,
                // 최초 1회 저장 이후에는 절대 전체 덮어쓰기를 하지 않는다.
                // 각 건물의 개별 saveBuilding을 사용해 충돌을 최소화한다.
                const serverBuildingMap = new Map(serverBuildings.map(sb => [sb.id, sb]));
                const structureChangedBuildings = normalizedBuildings.filter((nb) => {
                  const sb = serverBuildingMap.get(nb.id);
                  if (!sb) return true;
                  // 상태(status/mepCompleted)가 아닌 구조(floors 길이, units 길이, isDeadUnit)만 비교
                  const structureEqual = nb.floors.length === sb.floors.length &&
                    nb.floors.every((nf) => {
                      const sf = sb.floors.find(f => f.level === nf.level);
                      return sf && nf.units.length === sf.units.length &&
                        nf.units.every((nu) => {
                          const su = sf.units.find(u => u.id === nu.id || u.unitNumber === nu.unitNumber);
                          return su && nu.isDeadUnit === su.isDeadUnit;
                        });
                    });
                  return !structureEqual;
                });
                if (structureChangedBuildings.length > 0) {
                  Promise.allSettled(structureChangedBuildings.map(b => saveBuilding(b))).then(results => {
                    results.forEach((result, idx) => {
                      if (result.status === 'rejected') {
                        console.error(`도면 정규화 데이터 재저장 실패 (${structureChangedBuildings[idx]?.name}):`, result.reason);
                      }
                    });
                  });
                }
              }

                // [핵심 Fix] 알림 처리 중 에러가 발생해도 화면 갱신(setBuildings)이 누락되지 않도록 방어 코드 추가
                try {
                    if (prevBuildingsRef.current.length > 0) {
                        const newNotifications: SystemNotification[] = [];

                  normalizedBuildings.forEach(newB => {
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
                                        // 3. 승인 반려 (설치중으로 회귀) 시 - 작업자에게 알림
                                        else if (newU.status === ProcessStatus.INSTALLING && oldU.status === ProcessStatus.APPROVAL_REQ) {
                                            newNotifications.push({ 
                                                id: Date.now().toString() + Math.random(), 
                                                message: `[승인반려] ${newB.name} ${newF.level}층 ${newU.unitNumber}호`, 
                                                type: 'warning', 
                                                timestamp: '방금 전', 
                                                read: false 
                                            });
                                            notifySystem(
                                              'SFCS 승인 반려 알림',
                                              `${newB.name} ${newF.level}층 ${newU.unitNumber}호가 반려되었습니다. 보완 후 재요청바랍니다.`
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
                prevBuildingsRef.current = normalizedBuildings;
                // [UI 업데이트] 무조건 실행 보장
                setBuildings(normalizedBuildings);
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
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeApprovalLeadTimeEvents((events) => {
      setApprovalLeadTimeEvents(events);
    }, 800);

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadPtwHistory = async () => {
      try {
        const rows = await fetchGangformPtwHistory();
        setPtwHistoryRecords(rows);
      } catch (error) {
        console.error('PTW history load failed:', error);
      }
    };

    loadPtwHistory();
  }, [ptwHistoryRefreshTick]);

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // [Fix] 모바일 브라우저 백그라운드 복귀 시 Firebase 연결 복구 처리.
  // 모바일 기기는 앱이 백그라운드로 전환될 때 WebSocket 연결을 끊는 경우가 있어
  // 포그라운드로 돌아왔을 때 실시간 업데이트를 받지 못하는 문제가 발생한다.
  // visibilitychange 이벤트로 복귀를 감지하고 연결 상태를 초기화하여 재연결을 유도한다.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // 페이지가 다시 보일 때 연결 상태를 체크 중으로 표시
        // Firebase onSnapshot은 자동으로 재연결하므로, 다음 스냅샷 이벤트에서 isConnected가 갱신된다.
        setConnectionError(null);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
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

      const alertKey = buildAnalysisAlertKey(result);
      analysisAlertKeyRef.current = alertKey;

      const highPriority = normalizeAnalysisActionItems(result).filter(item => item.priority === 'high');
      if (highPriority.length > 0) {
          const comm = buildRoleCommunicationBundle(result.siteName, highPriority);
          const integratedMessage = buildIntegratedRoleCommunicationMessage(result.siteName, highPriority);
          setNotifications(prev => [{
            id: Date.now().toString() + Math.random(),
            message: `[긴급 액션] ${highPriority.length}건 - ${comm.summary}`,
            type: 'warning',
            timestamp: '방금 전',
            read: false
          }, ...prev]);
          notifySystem('SFCS 긴급 실행 항목', `고우선 액션 ${highPriority.length}건이 도출되었습니다.`);

          sendChatMessage({
            text: integratedMessage,
            userRole: currentUserRole,
            timestamp: Date.now(),
            senderName: 'AI 소통 브리핑'
          }).catch((e) => console.error('High priority role communication send failed:', e));
      }
      
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

  const handleMepUpdate = async (bId: string, floorLevel: number, unitId: string, completed: boolean) => {
    const previousBuildings = buildings;
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
    if (updatedBuilding) {
      try {
        await saveBuilding(updatedBuilding);
        setConnectionError(null);
      } catch (error) {
        setBuildings(previousBuildings);
        const message = formatWriteErrorMessage(error);
        setConnectionError(message);
        addNotification(message, 'warning');
      }
    }
  };

  const handleStatusUpdate = async (bId: string, floorLevel: number, unitId: string, newStatus: ProcessStatus) => {
    const previousBuildings = buildings;
    let targetUnitNumber = "";
    // [Reject Logic] 현재 상태가 승인요청이고, 새로운 상태가 설치중(반려)일 경우 감지
    let isRejection = false;

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
                        
                        // Detect Rejection
                        if (u.status === ProcessStatus.APPROVAL_REQ && newStatus === ProcessStatus.INSTALLING) {
                            isRejection = true;
                        }

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
      try {
        await saveBuilding(updatedBuilding);
        setConnectionError(null);
      } catch (error) {
        setBuildings(previousBuildings);
        const message = formatWriteErrorMessage(error);
        setConnectionError(message);
        addNotification(message, 'warning');
        setStatusModal(null);
        return;
      }
        
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
            text: `✅ [안전 작업 허가(PTW) 발급] ${updatedBuilding.name} ${floorLevel}층 ${targetUnitNumber}호 - 후속 공정 진행하세요.`,
                userRole: currentUserRole,
                timestamp: Date.now(),
                senderName: '관리자 알림'
            });
        } else if (isRejection) {
            await sendChatMessage({
                text: `❌ [승인반려] ${updatedBuilding.name} ${floorLevel}층 ${targetUnitNumber}호 - 재작업 및 보완 요망.`,
                userRole: currentUserRole,
                timestamp: Date.now(),
                senderName: '관리자 알림'
            });
            addNotification("승인 반려 처리되었습니다.", "warning");
        }
    }
    
    setStatusModal(null);
  };

  const handleBulkFloorStatusUpdate = async (bId: string, floorLevel: number, targetStatus: ProcessStatus) => {
    if (
      targetStatus !== ProcessStatus.APPROVED &&
      targetStatus !== ProcessStatus.POURING &&
      targetStatus !== ProcessStatus.CURED
    ) return;

    const targetBuilding = buildings.find(b => b.id === bId);
    if (!targetBuilding) return;

    const targetFloor = targetBuilding.floors.find(f => f.level === floorLevel);
    if (!targetFloor) return;

    const activeUnits = targetFloor.units.filter(u => !u.isDeadUnit);
    if (activeUnits.length === 0) return;

    const statusLabel =
      targetStatus === ProcessStatus.APPROVED
        ? '승인완료'
        : targetStatus === ProcessStatus.POURING
        ? '타설중'
        : '양생완료';
    const confirmed = window.confirm(`${targetBuilding.name} ${floorLevel}층 전체를 '${statusLabel}' 상태로 일괄 변경하시겠습니까?`);
    if (!confirmed) return;

    const now = new Date().toISOString();
    const previousBuildings = buildings;

    const newBuildings = buildings.map(b => {
      if (b.id !== bId) return b;
      return {
        ...b,
        floors: b.floors.map(f => {
          if (f.level !== floorLevel) return f;
          return {
            ...f,
            units: f.units.map(u => {
              if (u.isDeadUnit) return u;

              let nextMep = u.mepCompleted;
              if (targetStatus === ProcessStatus.APPROVED) {
                nextMep = false;
              }
              if (targetStatus === ProcessStatus.POURING) {
                nextMep = true;
              }

              return {
                ...u,
                status: targetStatus,
                mepCompleted: nextMep,
                lastUpdated: now
              };
            })
          };
        })
      };
    });

    setBuildings(newBuildings);
    const updatedBuilding = newBuildings.find(b => b.id === bId);
    if (updatedBuilding) {
      try {
        await saveBuilding(updatedBuilding);
        setConnectionError(null);
      } catch (error) {
        setBuildings(previousBuildings);
        const message = formatWriteErrorMessage(error);
        setConnectionError(message);
        addNotification(message, 'warning');
        return;
      }
    }

    addNotification(`[일괄 처리] ${targetBuilding.name} ${floorLevel}층 전체 ${statusLabel} 전환 완료`, 'success');

    await sendChatMessage({
      text: `📦 [층 단위 일괄처리] ${targetBuilding.name} ${floorLevel}층 전체 ${statusLabel}로 전환되었습니다.`,
      userRole: currentUserRole,
      timestamp: Date.now(),
      senderName: '관리자 알림'
    });
  };

  const addNotification = (msg: string, type: SystemNotification['type']) => {
    setNotifications(prev => [{ id: Date.now().toString(), message: msg, type, timestamp: '방금 전', read: false }, ...prev]);
  };

  const formatWriteErrorMessage = (error: any) => {
    if (error?.code === 'resource-exhausted') {
      return 'Firebase 쓰기 한도를 초과했습니다. 현재 변경은 서버에 저장되지 않아 다른 기기에 반영되지 않습니다. Firebase 사용량 할당량을 확인하거나 요금제를 조정해야 합니다.';
    }
    if (error?.code === 'permission-denied') {
      return 'Firebase 쓰기 권한이 없습니다. Firestore Rules 설정을 확인하세요.';
    }
    if (error?.code === 'unavailable') {
      return 'Firebase 서버에 연결할 수 없어 변경이 저장되지 않았습니다. 네트워크 연결을 확인하세요.';
    }
    return `실시간 저장 실패${error?.code ? ` (${error.code})` : ''}: 변경이 서버에 반영되지 않았습니다.`;
  };

  useEffect(() => {
    if (!lastAnalysisResult) return;

    const nextKey = buildAnalysisAlertKey(lastAnalysisResult);
    if (!nextKey) return;

    if (analysisAlertKeyRef.current === null) {
      analysisAlertKeyRef.current = nextKey;
      return;
    }

    if (analysisAlertKeyRef.current === nextKey) return;
    analysisAlertKeyRef.current = nextKey;

    const highPriority = normalizeAnalysisActionItems(lastAnalysisResult).filter(item => item.priority === 'high');
    if (highPriority.length === 0) return;

    const comm = buildRoleCommunicationBundle(lastAnalysisResult.siteName, highPriority);
    const integratedMessage = buildIntegratedRoleCommunicationMessage(lastAnalysisResult.siteName, highPriority);
    setNotifications(prev => [{
      id: Date.now().toString() + Math.random(),
      message: `[동기화 긴급] ${highPriority.length}건 - ${comm.summary}`,
      type: 'warning',
      timestamp: '방금 전',
      read: false
    }, ...prev]);

    notifySystem('SFCS 긴급 항목 동기화', `새 분석 결과에서 긴급 액션 ${highPriority.length}건이 동기화되었습니다.`);

    sendChatMessage({
      text: integratedMessage,
      userRole: currentUserRole,
      timestamp: Date.now(),
      senderName: 'AI 동기화 알림'
    }).catch((e) => console.error('Synced high priority role communication send failed:', e));
  }, [currentUserRole, lastAnalysisResult]);

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

  const executiveBuildingOptions = useMemo(() => ['ALL', ...buildings.map(b => b.name)], [buildings]);

  const executiveMonthOptions = useMemo(() => {
    const months = new Set<string>();
    ptwHistoryRecords.forEach((row) => {
      const d = new Date(row.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.add(key);
    });

    approvalLeadTimeEvents.forEach((event) => {
      const d = new Date(event.approvedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.add(key);
    });

    return ['ALL', ...Array.from(months).sort((a, b) => (a < b ? 1 : -1))];
  }, [approvalLeadTimeEvents, ptwHistoryRecords]);

  useEffect(() => {
    if (!executiveBuildingOptions.includes(executiveBuildingFilter)) {
      setExecutiveBuildingFilter('ALL');
    }
  }, [executiveBuildingFilter, executiveBuildingOptions]);

  useEffect(() => {
    if (!executiveMonthOptions.includes(executiveMonthFilter)) {
      setExecutiveMonthFilter('ALL');
    }
  }, [executiveMonthFilter, executiveMonthOptions]);

  const allActiveUnits = useMemo(() => {
    return buildings.flatMap(b => b.floors.flatMap(f => f.units)).filter(u => !u.isDeadUnit);
  }, [buildings]);

  const totalUnits = allActiveUnits.length;
  const curedUnits = allActiveUnits.filter(u => u.status === ProcessStatus.CURED).length;
  const progressRate = totalUnits > 0 ? Math.round((curedUnits / totalUnits) * 100) : 0;
  const zoneProgress = useMemo(() => {
    const seed = {
      zone1: { total: 0, cured: 0, rate: 0 },
      zone2: { total: 0, cured: 0, rate: 0 }
    };

    const aggregated = buildings.reduce((acc, building) => {
      const zoneKey = isZone2Building(building.name) ? 'zone2' : 'zone1';
      const units = building.floors.flatMap(f => f.units).filter(u => !u.isDeadUnit);
      const total = units.length;
      const cured = units.filter(u => u.status === ProcessStatus.CURED).length;
      acc[zoneKey].total += total;
      acc[zoneKey].cured += cured;
      return acc;
    }, seed);

    const zone1Rate = aggregated.zone1.total > 0 ? Math.round((aggregated.zone1.cured / aggregated.zone1.total) * 100) : 0;
    const zone2Rate = aggregated.zone2.total > 0 ? Math.round((aggregated.zone2.cured / aggregated.zone2.total) * 100) : 0;

    return {
      zone1: { ...aggregated.zone1, rate: zone1Rate },
      zone2: { ...aggregated.zone2, rate: zone2Rate }
    };
  }, [buildings]);
  const aiRiskCount = lastAnalysisResult?.riskFactors?.length || 0;
  const aiCriticalRiskCount = (lastAnalysisResult?.riskFactors || []).filter(r => Number(r.score || 0) >= 80).length;
  const ptwIssuedCount = Object.entries(gangformPtwByBuilding).filter(([buildingId, record]) => {
    const buildingName = buildings.find(b => b.id === buildingId)?.name || '';
    if (executiveBuildingFilter !== 'ALL' && buildingName !== executiveBuildingFilter) return false;
    return record.status === 'approved' || record.status === 'completed';
  }).length;

  const filteredPtwHistoryRecords = useMemo(() => {
    return ptwHistoryRecords.filter((row) => {
      const matchesBuilding = executiveBuildingFilter === 'ALL' || row.building === executiveBuildingFilter;
      if (!matchesBuilding) return false;

      if (executiveMonthFilter === 'ALL') return true;
      const d = new Date(row.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return key === executiveMonthFilter;
    });
  }, [executiveBuildingFilter, executiveMonthFilter, ptwHistoryRecords]);

  const filteredApprovalLeadTimeEvents = useMemo(() => {
    return approvalLeadTimeEvents.filter((event) => {
      const matchesBuilding = executiveBuildingFilter === 'ALL' || event.buildingName === executiveBuildingFilter;
      if (!matchesBuilding) return false;

      if (executiveMonthFilter === 'ALL') return true;
      const d = new Date(event.approvedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return key === executiveMonthFilter;
    });
  }, [approvalLeadTimeEvents, executiveBuildingFilter, executiveMonthFilter]);

  const ptwCompletedCount = filteredPtwHistoryRecords.length;
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const monthlyCompletedCount = filteredPtwHistoryRecords.filter((row) => {
    const date = new Date(row.created_at);
    if (executiveMonthFilter !== 'ALL') return true;
    return date.getFullYear() === currentYear && date.getMonth() === currentMonth;
  }).length;
  const estimatedAdminHoursSaved = Math.round((monthlyCompletedCount * 2.8) * 10) / 10;
  const currentCycleAverageLeadMinutes = filteredApprovalLeadTimeEvents.length > 0
    ? Math.round((filteredApprovalLeadTimeEvents.reduce((sum, event) => sum + event.leadMinutes, 0) / filteredApprovalLeadTimeEvents.length) * 10) / 10
    : 0;

  const approvalLeadTimeTrend = useMemo(() => {
    const weekStart = (offsetWeeks: number) => {
      const now = new Date();
      const day = now.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMonday - offsetWeeks * 7);
      monday.setHours(0, 0, 0, 0);
      return monday;
    };

    const bucketAverage = (offsetWeeks: number) => {
      const start = weekStart(offsetWeeks);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);

      const events = filteredApprovalLeadTimeEvents.filter((event) => {
        const approved = new Date(event.approvedAt);
        return approved >= start && approved < end;
      });

      if (events.length === 0) return null;
      const sum = events.reduce((acc, event) => acc + event.leadMinutes, 0);
      return Math.round(sum / events.length);
    };

    const fallbackBase = Math.max(45, Math.round(150 - progressRate * 0.8));

    return [
      { label: '4주 전', minutes: bucketAverage(3) ?? (fallbackBase + 24) },
      { label: '3주 전', minutes: bucketAverage(2) ?? (fallbackBase + 14) },
      { label: '2주 전', minutes: bucketAverage(1) ?? (fallbackBase + 6) },
      { label: '이번 주', minutes: bucketAverage(0) ?? fallbackBase }
    ];
  }, [filteredApprovalLeadTimeEvents, progressRate]);

  const maxLeadMinutes = useMemo(() => Math.max(...approvalLeadTimeTrend.map(x => x.minutes), 1), [approvalLeadTimeTrend]);

  const getFloorMacroStatus = (units: Unit[]) => {
    const active = units.filter(u => !u.isDeadUnit);
    if (active.length === 0) return { color: 'bg-slate-200', isDelayed: false };
    if (active.some(u => u.status === ProcessStatus.APPROVAL_REQ)) return { color: 'bg-brand-accent', isDelayed: true };
    if (active.some(u => u.status === ProcessStatus.INSTALLING)) return { color: 'bg-yellow-500', isDelayed: false };
    if (active.some(u => u.status === ProcessStatus.POURING)) return { color: 'bg-purple-500', isDelayed: false };
    if (active.every(u => u.status === ProcessStatus.CURED)) return { color: 'bg-emerald-500', isDelayed: false };
    if (active.every(u => u.status === ProcessStatus.APPROVED || u.status === ProcessStatus.CURED)) return { color: 'bg-blue-500', isDelayed: false };
    return { color: 'bg-slate-400', isDelayed: false };
  };

  const exportExecutiveReportPdf = () => {
    const reportWindow = window.open('', '_blank', 'width=1100,height=800');
    if (!reportWindow) {
      addNotification('리포트 창을 열 수 없습니다. 팝업 차단을 해제해주세요.', 'warning');
      return;
    }

    const generatedAt = new Date().toLocaleString('ko-KR');
    const filterLabel = `동: ${executiveBuildingFilter === 'ALL' ? '전체' : executiveBuildingFilter} / 월: ${executiveMonthFilter === 'ALL' ? '전체' : executiveMonthFilter}`;
    const leadRows = approvalLeadTimeTrend.map(item => `<tr><td>${item.label}</td><td>${item.minutes}분</td></tr>`).join('');

    reportWindow.document.write(`
      <html>
        <head>
          <title>SFCS Executive Report</title>
          <style>
            @page { size: A4; margin: 16mm; }
            body { font-family: 'Pretendard', 'Inter', sans-serif; color: #0f172a; }
            .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #0f172a; padding-bottom:10px; margin-bottom:16px; }
            .logo { font-weight:900; font-size:20px; letter-spacing:-0.02em; }
            .sys { font-size:12px; color:#334155; }
            .grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px; }
            .card { border:1px solid #cbd5e1; border-radius:8px; padding:10px; }
            .k { font-size:10px; color:#64748b; text-transform:uppercase; font-weight:700; }
            .v { font-family:'JetBrains Mono','Consolas',monospace; font-size:24px; font-weight:900; margin-top:4px; }
            table { width:100%; border-collapse:collapse; margin-top:8px; }
            th,td { border:1px solid #cbd5e1; padding:8px; font-size:11px; text-align:left; }
            th { background:#f8fafc; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo">대우건설 · SMART-SFCS</div>
              <div class="sys">Executive Summary / Command Center Briefing</div>
            </div>
            <div class="sys">생성시각: ${generatedAt}<br/>필터: ${filterLabel}</div>
          </div>

          <div class="grid">
            <div class="card"><div class="k">AI 감지 위험요인(예방 대상)</div><div class="v">${aiRiskCount} 건</div></div>
            <div class="card"><div class="k">고위험 리스크</div><div class="v">${aiCriticalRiskCount} 건</div></div>
            <div class="card"><div class="k">PTW 발급(승인/완료)</div><div class="v">${ptwIssuedCount} 건</div></div>
            <div class="card"><div class="k">행정시간 절감(월 실적 기반)</div><div class="v">${estimatedAdminHoursSaved} h</div></div>
          </div>

          <div class="card" style="margin-bottom:14px;">
            <div class="k">현재 사이클 평균 승인 리드타임(실측)</div>
            <div class="v">${currentCycleAverageLeadMinutes} 분</div>
          </div>

          <div class="card" style="margin-bottom:14px;">
            <div class="k">실시간 골조 공정률 (공구별/전체)</div>
            <table>
              <thead><tr><th>구분</th><th>공정률</th><th>완료/활성 세대</th></tr></thead>
              <tbody>
                <tr><td>1공구 (휘강)</td><td>${zoneProgress.zone1.rate}%</td><td>${zoneProgress.zone1.cured} / ${zoneProgress.zone1.total}</td></tr>
                <tr><td>2공구 (오엔)</td><td>${zoneProgress.zone2.rate}%</td><td>${zoneProgress.zone2.cured} / ${zoneProgress.zone2.total}</td></tr>
                <tr><td>전체</td><td>${progressRate}%</td><td>${curedUnits} / ${totalUnits}</td></tr>
              </tbody>
            </table>
          </div>

          <div class="card">
            <div class="k">승인 리드타임 단축 추이</div>
            <table>
              <thead><tr><th>기간</th><th>평균 리드타임</th></tr></thead>
              <tbody>${leadRows}</tbody>
            </table>
          </div>
        </body>
      </html>
    `);

    reportWindow.document.close();
    setTimeout(() => reportWindow.print(), 250);
  };

  const copyCurrentExecutiveViewLink = async () => {
    const currentUrl = `${window.location.origin}${window.location.pathname}${window.location.search}`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(currentUrl);
        addNotification('현재 경영진 뷰 링크가 복사되었습니다.', 'success');
        return;
      }

      window.prompt('아래 링크를 복사하세요:', currentUrl);
      addNotification('클립보드 API 미지원 환경입니다. 링크를 수동 복사하세요.', 'info');
    } catch (error) {
      window.prompt('아래 링크를 복사하세요:', currentUrl);
      addNotification('링크 복사 중 오류가 발생했습니다. 수동 복사로 진행하세요.', 'warning');
    }
  };

  const scrollToExecutiveProgressDetail = (focusLabel: string = '공정률') => {
    const target = document.getElementById('executive-progress-detail');
    if (!target) return;
    setExecutiveProgressFocusLabel(focusLabel);
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setIsExecutiveProgressHighlighted(true);
    window.setTimeout(() => setIsExecutiveProgressHighlighted(false), 1000);
  };

  const shareCompletion = (data: StatusModalData) => {
    const title = data.nextStatus === ProcessStatus.APPROVAL_REQ
      ? 'SMART-SFCS 승인 요청'
      : 'SMART-SFCS 승인 완료';

    const status = data.nextStatus === ProcessStatus.APPROVAL_REQ ? '승인 요청' : '승인 완료';
    const text = buildSmartSfcsShareText({
      workType: 'AL폼 검측',
      building: data.buildingName,
      floor: `${data.floorLevel}층`,
      status
    });

    handleShareMessage(title, text);
  };

  const isExecutiveReadOnly = currentUserRole === UserRole.WORKER;

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
          <button onClick={() => handleNavigateTab('dashboard')} className={`w-full flex items-center p-3.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'dashboard' ? 'bg-brand-primary text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
            <LayoutDashboard className="w-5 h-5 mr-3" /> 현황 대시보드
          </button>
          
          <button onClick={() => handleNavigateTab('executive')} className={`w-full flex items-center p-3.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'executive' ? 'bg-brand-primary text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
            <BarChart3 className="w-5 h-5 mr-3" /> Executive Summary
          </button>

          <button onClick={() => handleNavigateTab('analysis')} className={`w-full flex items-center p-3.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'analysis' ? 'bg-brand-primary text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
            <MapIcon className="w-5 h-5 mr-3" /> AI 도면/데이터 분석
          </button>

          <button onClick={() => handleNavigateTab('ptw')} className={`w-full flex items-center p-3.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'ptw' ? 'bg-brand-primary text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
            <CheckCircle2 className="w-5 h-5 mr-3" /> 갱폼 작업허가 (PTW)
          </button>
          
          <button onClick={() => handleNavigateTab('manual')} className={`w-full flex items-center p-3.5 rounded-lg text-sm font-semibold transition-all ${activeTab === 'manual' ? 'bg-brand-primary text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
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
                  <button onClick={() => setIsNotificationSidebarOpen(prev => !prev)} className="relative p-3 bg-white/10 rounded-2xl border border-white/20 backdrop-blur-md hover:bg-white/20 transition-all shadow-lg active:scale-95">
                    <Bell className="w-6 h-6" />
                    {unreadNotificationCount > 0 && <span className="absolute top-2 right-2 w-3 h-3 bg-brand-accent rounded-full border-2 border-brand-dark animate-pulse"></span>}
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
                  className="text-2xl md:text-4xl lg:text-5xl font-black bg-white border-none w-full outline-none text-brand-dark focus:ring-4 focus:ring-brand-primary/40 py-4 px-8 rounded-xl transition-all leading-tight tracking-tighter shadow-2xl placeholder:text-slate-300 text-center"
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
            {highPriorityActionItems.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 md:p-5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3 animate-fade-in-up">
                <div className="flex items-start">
                  <AlertTriangle className="w-5 h-5 text-red-500 mr-2 mt-0.5" />
                  <div>
                    <p className="text-sm font-black text-red-700">AI 긴급 실행 항목 {highPriorityActionItems.length}건</p>
                    <p className="text-xs text-red-600 mt-1">{highPriorityActionItems.slice(0, 2).map(item => item.title).join(' / ')}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    handleNavigateTab('analysis');
                  }}
                  className="px-4 py-2 bg-red-500 text-white text-xs font-black rounded-xl hover:bg-red-600 transition-colors self-start md:self-auto"
                >
                  분석 화면으로 이동
                </button>
              </div>
            )}
            {activeTab === 'dashboard' && (
              <>
                {pendingApprovals.length > 0 && (
                  <div className="bg-white border border-orange-200 rounded-xl py-4 md:py-6 shadow-xl animate-fade-in-up w-full min-w-0 overflow-hidden">
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
                         }} className="flex-shrink-0 bg-white border border-slate-100 p-4 rounded-lg shadow-sm hover:shadow-md transition-all text-left w-full active:scale-95 group relative overflow-hidden">
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
                
                <SiteMap buildings={buildings} gangformByBuilding={gangformPtwByBuilding} onSelectBuilding={(id) => {
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
                }} onSelectGangformBuilding={(id) => {
                    handleNavigateTab('ptw');
                    window.setTimeout(() => {
                      focusPtwDetailView(id);
                    }, 120);
                }} />
                
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-slate-200 pb-6 gap-6">
                   <div>
                      <h3 className="text-3xl font-black text-slate-800 tracking-tighter">실시간 관제 그리드</h3>
                      <p className="text-sm text-slate-400 mt-1">현장 안전 관리를 위한 실시간 정밀 모니터링 및 상태 관리 시스템</p>
                   </div>
                   <div className="flex items-center space-x-3 w-full sm:w-auto">
                      <div className="relative flex-1 sm:w-64">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input type="text" placeholder="동/호수 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-lg text-sm font-medium outline-none focus:ring-2 focus:ring-brand-primary/20 transition-all shadow-sm" />
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
                            onBulkUpdateFloorStatus={(floorLevel, targetStatus) => {
                              handleBulkFloorStatusUpdate(b.id, floorLevel, targetStatus);
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
            {activeTab === 'executive' && (
              <section className="bg-slate-50 text-gray-900 rounded-xl border border-slate-300 p-5 md:p-8 space-y-6 animate-fade-in-up">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-200 pb-4">
                  <div>
                    <h2 className="text-2xl font-black tracking-tight text-gray-900">Executive Summary (경영진 브리핑)</h2>
                    <p className="text-sm text-slate-600 mt-1">현장 안전·생산성·행정효율 통합 지표</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {isExecutiveReadOnly && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md border border-amber-300 bg-amber-50 text-[10px] font-black text-amber-700 uppercase tracking-wider">
                          작업자 모드 · 조회 전용
                        </span>
                      )}
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md border border-slate-300 bg-slate-100 text-[10px] font-black text-slate-700 uppercase tracking-wider">
                        Scope · {executiveBuildingFilter === 'ALL' ? '전체 동' : executiveBuildingFilter}
                      </span>
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md border border-slate-300 bg-slate-100 text-[10px] font-black text-slate-700 uppercase tracking-wider">
                        Month · {executiveMonthFilter === 'ALL' ? '전체 월' : executiveMonthFilter}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <select
                      value={executiveBuildingFilter}
                      onChange={(e) => setExecutiveBuildingFilter(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-black text-slate-700"
                    >
                      {executiveBuildingOptions.map((opt) => (
                        <option key={opt} value={opt}>{opt === 'ALL' ? '전체 동' : opt}</option>
                      ))}
                    </select>
                    <select
                      value={executiveMonthFilter}
                      onChange={(e) => setExecutiveMonthFilter(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-black text-slate-700"
                    >
                      {executiveMonthOptions.map((opt) => (
                        <option key={opt} value={opt}>{opt === 'ALL' ? '전체 월' : opt}</option>
                      ))}
                    </select>
                    <button
                      onClick={copyCurrentExecutiveViewLink}
                      disabled={isExecutiveReadOnly}
                      className={`inline-flex items-center px-4 py-2 rounded-lg text-xs font-black border border-slate-300 ${isExecutiveReadOnly ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
                    >
                      <Share2 className="w-4 h-4 mr-2" /> 현재 뷰 링크 복사
                    </button>
                    <button
                      onClick={exportExecutiveReportPdf}
                      disabled={isExecutiveReadOnly}
                      className={`inline-flex items-center px-4 py-2 rounded-lg text-xs font-black border border-slate-300 ${isExecutiveReadOnly ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white text-slate-700 hover:bg-slate-100'}`}
                    >
                      <Download className="w-4 h-4 mr-2" /> One-Click 자동화 리포트 출력 (Export to PDF)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="bg-white rounded-lg border border-slate-300 p-4">
                    <p className="text-[11px] text-slate-500 font-black uppercase tracking-widest">AI 감지 위험요인(예방 대상)</p>
                    <p className="font-mono text-3xl font-black mt-2 tracking-tight">{aiRiskCount}<span className="text-base text-slate-400 ml-1">건</span></p>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-300 p-4">
                    <p className="text-[11px] text-slate-500 font-black uppercase tracking-widest">고위험 리스크</p>
                    <p className="font-mono text-3xl font-black mt-2 tracking-tight text-brand-accent">{aiCriticalRiskCount}<span className="text-base text-slate-400 ml-1">건</span></p>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-300 p-4">
                    <p className="text-[11px] text-slate-500 font-black uppercase tracking-widest">PTW 발급(승인/완료)</p>
                    <p className="font-mono text-3xl font-black mt-2 tracking-tight">{ptwIssuedCount}<span className="text-base text-slate-400 ml-1">건</span></p>
                  </div>
                  <div className="bg-white rounded-lg border border-slate-300 p-4">
                    <p className="text-[11px] text-slate-500 font-black uppercase tracking-widest">행정 시간 절감 (월 실적 기반)</p>
                    <p className="font-mono text-3xl font-black mt-2 tracking-tight">{estimatedAdminHoursSaved}<span className="text-base text-slate-400 ml-1">h</span></p>
                  </div>
                </div>

                <div className="bg-white rounded-lg border border-slate-300 p-4">
                  <p className="text-[11px] text-slate-500 font-black uppercase tracking-widest">공구별 공정률 빠른 보기</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => scrollToExecutiveProgressDetail('1공구')}
                      disabled={isExecutiveReadOnly}
                      className={`inline-flex items-center px-3 py-1.5 rounded-full border text-xs font-black ${isExecutiveReadOnly ? 'border-slate-300 bg-slate-100 text-slate-400 cursor-not-allowed' : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}
                    >
                      1공구(휘강) {zoneProgress.zone1.rate}%
                    </button>
                    <button
                      onClick={() => scrollToExecutiveProgressDetail('2공구')}
                      disabled={isExecutiveReadOnly}
                      className={`inline-flex items-center px-3 py-1.5 rounded-full border text-xs font-black ${isExecutiveReadOnly ? 'border-slate-300 bg-slate-100 text-slate-400 cursor-not-allowed' : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'}`}
                    >
                      2공구(오엔) {zoneProgress.zone2.rate}%
                    </button>
                    <button
                      onClick={() => scrollToExecutiveProgressDetail('전체')}
                      disabled={isExecutiveReadOnly}
                      className={`inline-flex items-center px-3 py-1.5 rounded-full border text-xs font-black ${isExecutiveReadOnly ? 'border-slate-300 bg-slate-100 text-slate-400 cursor-not-allowed' : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                    >
                      전체 {progressRate}%
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-lg border border-slate-300 p-4">
                  <p className="text-[11px] text-slate-500 font-black uppercase tracking-widest">현재 사이클 평균 승인 리드타임 (실측)</p>
                  <p className="font-mono text-3xl font-black mt-2 tracking-tight text-brand-primary">{currentCycleAverageLeadMinutes}<span className="text-base text-slate-400 ml-1">분</span></p>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className="bg-white rounded-lg border border-slate-300 p-5">
                    <h3 className="text-sm font-black text-slate-700 mb-4">평균 승인 리드타임 단축 추이</h3>
                    <div className="space-y-3">
                      {approvalLeadTimeTrend.map((point) => (
                        <div key={point.label} className="space-y-1">
                          <div className="flex justify-between text-[11px] font-black text-slate-600">
                            <span>{point.label}</span>
                            <span className="font-mono">{point.minutes}분</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-sm border border-slate-200 overflow-hidden">
                            <div className="h-full bg-brand-primary" style={{ width: `${Math.max(8, Math.round((point.minutes / maxLeadMinutes) * 100))}%` }}></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white rounded-lg border border-slate-300 p-5">
                    <h3 className="text-sm font-black text-slate-700 mb-4">실시간 골조 공정률 Macro View (블록 히트맵)</h3>
                    <div className="overflow-x-auto custom-scrollbar">
                      <div className="inline-grid gap-2" style={{ gridTemplateColumns: `repeat(${buildings.length}, minmax(28px, 1fr))` }}>
                        {buildings.map((building) => (
                          <div key={`macro-${building.id}`} className="space-y-1">
                            {[...building.floors].sort((a, b) => b.level - a.level).slice(0, 28).map((floor) => {
                              const status = getFloorMacroStatus(floor.units);
                              return (
                                <div
                                  key={`${building.id}-${floor.level}`}
                                  title={`${building.name} ${floor.level}층`}
                                  className={`h-2.5 rounded-sm border border-slate-300 ${status.color} ${status.isDelayed ? 'animate-pulse shadow-glow' : ''}`}
                                ></div>
                              );
                            })}
                            <div className="text-[9px] font-black text-slate-500 text-center mt-1">{building.name.replace('동', '')}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3 text-[10px] font-black text-slate-500">
                      <span className="inline-flex items-center"><span className="w-2.5 h-2.5 bg-blue-500 border border-slate-300 rounded-sm mr-1"></span>승인구간</span>
                      <span className="inline-flex items-center"><span className="w-2.5 h-2.5 bg-purple-500 border border-slate-300 rounded-sm mr-1"></span>타설중</span>
                      <span className="inline-flex items-center"><span className="w-2.5 h-2.5 bg-emerald-500 border border-slate-300 rounded-sm mr-1"></span>양생완료</span>
                      <span className="inline-flex items-center"><span className="w-2.5 h-2.5 bg-brand-accent border border-slate-300 rounded-sm mr-1 animate-pulse"></span>지연/주의</span>
                    </div>
                  </div>
                </div>

                <div
                  id="executive-progress-detail"
                  className={`bg-white rounded-lg border p-4 transition-all ${isExecutiveProgressHighlighted ? 'border-brand-primary ring-2 ring-brand-primary/30 shadow-glow' : 'border-slate-300'}`}
                >
                  {isExecutiveProgressHighlighted && (
                    <div className="mb-3 inline-flex items-center px-2.5 py-1 rounded-full bg-brand-primary/10 text-brand-primary text-[11px] font-black animate-fade-in-up">
                      {executiveProgressFocusLabel} 상세 공정률 위치입니다
                    </div>
                  )}
                  <div className="mb-3">
                    <p className="text-sm font-black text-slate-800">실시간 골조 공정률</p>
                    <p className="text-xs text-slate-500 mt-1">공구별 활성 세대 기준 + 전체 통합</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-3">
                      <p className="text-[11px] font-black text-indigo-700">1공구 (휘강)</p>
                      <p className="font-mono text-3xl font-black tracking-tight text-indigo-700 mt-1">{zoneProgress.zone1.rate}%</p>
                      <p className="text-[11px] text-indigo-600 mt-1">{zoneProgress.zone1.cured} / {zoneProgress.zone1.total} 세대</p>
                    </div>
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3">
                      <p className="text-[11px] font-black text-rose-700">2공구 (오엔)</p>
                      <p className="font-mono text-3xl font-black tracking-tight text-rose-700 mt-1">{zoneProgress.zone2.rate}%</p>
                      <p className="text-[11px] text-rose-600 mt-1">{zoneProgress.zone2.cured} / {zoneProgress.zone2.total} 세대</p>
                    </div>
                    <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-3">
                      <p className="text-[11px] font-black text-slate-700">전체</p>
                      <p className="font-mono text-3xl font-black tracking-tight text-brand-primary mt-1">{progressRate}%</p>
                      <p className="text-[11px] text-slate-600 mt-1">{curedUnits} / {totalUnits} 세대</p>
                    </div>
                  </div>
                </div>
              </section>
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
                handleNavigateTab('dashboard');
              }} />
            )}
            {activeTab === 'ptw' && (
              <section className="bg-gray-50 text-gray-900 rounded-xl border border-slate-200 p-5 md:p-8 space-y-6 animate-fade-in-up">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-black tracking-tight text-gray-900">갱폼 작업허가(PTW)</h2>
                    <p className="text-sm text-slate-600 mt-1">동별 선택 기반 작업허가 진행 현황 및 승인 관리</p>
                  </div>
                  <a
                    href="/gangform-ptw/history"
                    className="inline-flex items-center px-3 py-2 rounded-xl text-xs font-black border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  >
                    히스토리 대시보드
                  </a>
                </div>

                <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-5">
                  <h3 className="text-sm font-black text-slate-700 mb-3">동별 현황 요약 보드</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {ptwSummary.map((item) => (
                      <button
                        key={item.buildingId}
                        onClick={() => focusPtwDetailView(item.buildingId)}
                        className={`rounded-xl border bg-slate-50 p-3 flex items-center justify-between transition-colors text-left ${
                          ptwJumpedBuildingId === item.buildingId
                            ? 'border-brand-primary ring-2 ring-brand-primary/25'
                            : 'border-slate-200 hover:border-brand-primary/40'
                        }`}
                      >
                        <span className="text-sm font-black text-slate-800">{item.buildingName} {item.floor}</span>
                        <span className={`text-[11px] font-black px-2.5 py-1 rounded-full border ${
                          item.status === '인상 완료'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                            : item.status === '승인 대기'
                            ? 'bg-orange-50 text-orange-600 border-orange-100'
                          : item.status === '인상중'
                            ? 'bg-blue-50 text-blue-600 border-blue-100'
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}>
                          {item.statusEmoji} {item.status}
                          {item.status === '승인 대기' && typeof item.elapsedMinutes === 'number' ? ` · ${item.elapsedMinutes}분` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-5">
                  <h3 className="text-sm font-black text-slate-700 mb-3">동 선택</h3>
                  <div className="flex flex-wrap gap-2">
                    {buildings.map((building) => (
                      <button
                        key={building.id}
                        onClick={() => setSelectedPtwBuildingId(building.id)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all border ${
                          selectedPtwBuilding?.id === building.id
                            ? 'bg-brand-primary text-white border-brand-primary shadow-md'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-brand-primary/40'
                        }`}
                      >
                        {building.name}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedPtwBuilding && (
                  <div ref={ptwDetailRef} tabIndex={-1} className="outline-none">
                    {ptwJumpedBuildingId === selectedPtwBuilding.id && (
                      <div className="mb-3 inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                        요약보드에서 {selectedPtwBuilding.name} PTW 뷰로 이동됨
                      </div>
                    )}
                    <GangformPTW
                      buildingId={selectedPtwBuilding.name}
                      role={currentUserRole === UserRole.ADMIN || currentUserRole === UserRole.CREATOR ? 'admin' : 'worker'}
                      canForceEdit={currentUserRole === UserRole.CREATOR}
                      initialData={gangformPtwByBuilding[selectedPtwBuilding.id]?.payload}
                      initialStatus={gangformPtwByBuilding[selectedPtwBuilding.id]?.status || 'draft'}
                      remoteUpdatedAt={gangformPtwByBuilding[selectedPtwBuilding.id]?.updatedAt || null}
                      focusFloorSignal={ptwFocusSignal}
                      onSubmit={(payload) => {
                      const requestedAt = new Date().toISOString();
                      const beforePhotos = Object.values(payload.requiredPhotos.beforeWork).filter(Boolean).length;
                      addNotification(`[${selectedPtwBuilding.name}] PTW 승인요청 전송 (${beforePhotos}/5장 URL 포함)`, 'info');
                      setGangformPtwByBuilding(prev => {
                        const nextRecord = {
                          payload,
                          status: 'requested' as ApprovalStatus,
                          updatedAt: requestedAt,
                          requestedAt,
                          approvedAt: null,
                          completedAt: null
                        };
                        const next = {
                          ...prev,
                          [selectedPtwBuilding.id]: nextRecord
                        };
                        void saveGangformPtwRecord(selectedPtwBuilding.id, nextRecord);
                        return next;
                      });
                    }}
                      onApprove={() => {
                      const approvedAt = new Date().toISOString();
                      addNotification(`[${selectedPtwBuilding.name}] 안전 작업 허가(PTW)가 발급되었습니다.`, 'success');
                      setGangformPtwByBuilding(prev => {
                        const current = prev[selectedPtwBuilding.id];
                        if (!current) return prev;

                        const requestedAt = current.requestedAt || null;
                        if (requestedAt) {
                          const leadMinutes = Math.max(0, Math.round((new Date(approvedAt).getTime() - new Date(requestedAt).getTime()) / 60000));
                          if (Number.isFinite(leadMinutes)) {
                            saveApprovalLeadTimeEvent({
                              approvedAt,
                              leadMinutes,
                              buildingId: selectedPtwBuilding.id,
                              buildingName: selectedPtwBuilding.name,
                              floor: current.payload?.floor || '-'
                            });
                          }
                        }

                        const next = {
                          ...prev,
                          [selectedPtwBuilding.id]: {
                            ...current,
                            status: 'approved',
                            updatedAt: approvedAt,
                            approvedAt
                          }
                        };
                        void saveGangformPtwRecord(selectedPtwBuilding.id, next[selectedPtwBuilding.id]);
                        return next;
                      });
                    }}
                      onComplete={(payload) => {
                      return insertGangformPtwCompletedRecord(payload).then(() => {
                        addNotification(`[${selectedPtwBuilding.name} ${payload.floor}] PTW 작업이 완료되었습니다.`, 'success');
                        setPtwHistoryRefreshTick(prev => prev + 1);
                        setGangformPtwByBuilding(prev => {
                          const completedAt = new Date().toISOString();
                          const current = prev[selectedPtwBuilding.id];
                          const nextRecord = {
                            payload,
                            status: 'completed' as ApprovalStatus,
                            updatedAt: completedAt,
                            requestedAt: current?.requestedAt || null,
                            approvedAt: current?.approvedAt || null,
                            completedAt
                          };
                          const next = {
                            ...prev,
                            [selectedPtwBuilding.id]: nextRecord
                          };

                          void saveGangformPtwRecord(selectedPtwBuilding.id, nextRecord);
                          return next;
                        });
                      });
                    }}
                      onCycleReset={(payload) => {
                      const now = new Date().toISOString();
                      addNotification(`[${selectedPtwBuilding.name}] ${payload.floor} 인상 준비 사이클을 시작했습니다.`, 'info');
                      setGangformPtwByBuilding(prev => {
                        const nextRecord = {
                          payload,
                          status: 'draft' as ApprovalStatus,
                          updatedAt: now,
                          requestedAt: null,
                          approvedAt: null,
                          completedAt: null
                        };
                        const next = {
                          ...prev,
                          [selectedPtwBuilding.id]: nextRecord
                        };
                        void saveGangformPtwRecord(selectedPtwBuilding.id, nextRecord);
                        return next;
                      });
                    }}
                      onReject={() => {
                      const now = new Date().toISOString();
                      addNotification(`[${selectedPtwBuilding.name}] PTW가 반려되었습니다.`, 'warning');
                      setGangformPtwByBuilding(prev => {
                        const current = prev[selectedPtwBuilding.id];
                        if (!current) return prev;
                        const next = {
                          ...prev,
                          [selectedPtwBuilding.id]: {
                            ...current,
                            status: 'rejected',
                            updatedAt: now,
                            approvedAt: null
                          }
                        };
                        void saveGangformPtwRecord(selectedPtwBuilding.id, next[selectedPtwBuilding.id]);
                        return next;
                      });
                      }}
                      onForceStatusChange={(nextStatus, reason) => {
                      const now = new Date().toISOString();
                      addNotification(`[${selectedPtwBuilding.name}] 제작자 권한으로 PTW 상태가 ${nextStatus}(으)로 수정되었습니다. 사유: ${reason}`, 'warning');
                      setGangformPtwByBuilding(prev => {
                        const current = prev[selectedPtwBuilding.id];
                        if (!current) return prev;

                        void saveGangformPtwForceEditEvent({
                          buildingId: selectedPtwBuilding.id,
                          buildingName: selectedPtwBuilding.name,
                          floor: current.payload?.floor || '-',
                          previousStatus: current.status,
                          nextStatus,
                          reason,
                          operatorRole: '제작자'
                        });

                        const next = {
                          ...prev,
                          [selectedPtwBuilding.id]: {
                            ...current,
                            status: nextStatus,
                            updatedAt: now,
                            requestedAt: nextStatus === 'requested' ? (current.requestedAt || now) : nextStatus === 'draft' ? null : current.requestedAt || null,
                            approvedAt: nextStatus === 'approved' ? (current.approvedAt || now) : (nextStatus === 'requested' || nextStatus === 'draft' || nextStatus === 'rejected') ? null : current.approvedAt || null,
                            completedAt: nextStatus === 'completed' ? (current.completedAt || now) : null
                          }
                        };

                        void saveGangformPtwRecord(selectedPtwBuilding.id, next[selectedPtwBuilding.id]);
                        return next;
                      });
                    }}
                    />
                  </div>
                )}
              </section>
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
      
      {isNotificationSidebarOpen && (
        <div className="fixed inset-0 z-[280] bg-slate-900/50 backdrop-blur-sm" onClick={() => setIsNotificationSidebarOpen(false)}>
          <aside
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 top-0 h-full w-full max-w-md bg-white border-l border-slate-200 shadow-2xl flex flex-col"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-sm font-black text-slate-800">알림 센터</p>
                <p className="text-[11px] text-slate-500">미확인 {unreadNotificationCount}건 / 전체 {notifications.length}건</p>
              </div>
              <button
                onClick={() => setIsNotificationSidebarOpen(false)}
                className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                aria-label="알림 패널 닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
              <button
                onClick={() => setNotifications(prev => prev.map(item => ({ ...item, read: true })))}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-black text-slate-700"
              >
                모두 읽음 처리
              </button>
              <button
                onClick={() => setNotifications([])}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-black text-slate-700"
              >
                전체 삭제
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {notifications.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm font-bold text-slate-400">표시할 알림이 없습니다.</div>
              ) : (
                notifications.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setNotifications(prev => prev.map(n => n.id === item.id ? { ...n, read: true } : n))}
                    className={`w-full text-left rounded-xl border p-3 transition-colors ${
                      item.read
                        ? 'bg-white border-slate-200 text-slate-500'
                        : 'bg-orange-50 border-orange-200 text-slate-700'
                    }`}
                  >
                    <p className="text-xs font-black">{item.type === 'success' ? '처리 완료' : '알림'}</p>
                    <p className="text-xs mt-1">{item.message}</p>
                    <p className="text-[10px] mt-1.5 text-slate-400">{item.timestamp}</p>
                  </button>
                ))
              )}
            </div>
          </aside>
        </div>
      )}

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
                <p className="text-xs font-black text-slate-800">{n.type === 'success' ? '처리 완료' : '알림'}</p>
                <p className="text-xs text-slate-600">{n.message}</p>
             </div>
          </div>
        ))}
      </div>

      {statusModal && (
        <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center p-0 md:p-4 bg-slate-900/70 backdrop-blur-md transition-all">
          <div className="bg-white rounded-t-xl md:rounded-xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden animate-slide-up" onClick={(e) => e.stopPropagation()}>
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
              <div className="bg-slate-50 p-6 rounded-lg mb-6 flex items-center justify-around border border-slate-100 shadow-inner">
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
                <div className={`mb-8 p-4 border rounded-lg ${statusModal.nextStatus === ProcessStatus.APPROVED ? 'bg-emerald-50 border-emerald-100' : 'bg-orange-50 border-orange-100'}`}>
                  <p className={`text-xs font-bold mb-3 flex items-center ${statusModal.nextStatus === ProcessStatus.APPROVED ? 'text-emerald-700' : 'text-orange-700'}`}>
                      {statusModal.nextStatus === ProcessStatus.APPROVED ? 
                         <><Check className="w-3 h-3 mr-1.5" /> 안전 작업 허가(PTW) 발급 통보</> : 
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
                <button onClick={() => setStatusModal(null)} className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg font-black text-sm">취소</button>
                
                {/* [승인 반려 기능 추가] 관리자이고 현재 승인요청 상태일 때 '반려' 버튼 노출 */}
                {(currentUserRole === UserRole.ADMIN || currentUserRole === UserRole.CREATOR) && statusModal.currentStatus === ProcessStatus.APPROVAL_REQ && (
                   <button 
                     onClick={() => {
                        if(window.confirm("승인을 반려하시겠습니까? (상태가 '설치중'으로 변경됩니다)")) {
                            handleStatusUpdate(statusModal.buildingId, statusModal.floorLevel, statusModal.unitId, ProcessStatus.INSTALLING);
                        }
                     }} 
                     className="flex-1 py-4 bg-red-50 text-red-500 border border-red-100 rounded-lg font-black text-sm hover:bg-red-100 flex items-center justify-center transition-all"
                   >
                     <ThumbsDown className="w-4 h-4 mr-2" /> 승인 반려
                   </button>
                )}

                <button onClick={() => handleStatusUpdate(statusModal.buildingId, statusModal.floorLevel, statusModal.unitId, statusModal.nextStatus)} className="flex-1 py-4 bg-brand-primary text-white rounded-lg font-black text-sm shadow-xl hover:bg-blue-600">업데이트</button>
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
