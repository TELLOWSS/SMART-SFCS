
export enum UserRole {
  ADMIN = '관리자',
  WORKER = '작업자',
  SUBCONTRACTOR = '협력사',
  CREATOR = '제작자'
}

export enum ProcessStatus {
  NOT_STARTED = '미착수',
  INSTALLING = '설치중',
  APPROVAL_REQ = '승인요청',
  APPROVED = '승인완료',
  POURING = '타설중',
  CURED = '양생완료'
}

export interface Unit {
  id: string;
  unitNumber: string;
  status: ProcessStatus;
  lastUpdated: string;
  mepCompleted: boolean;
  isDeadUnit?: boolean; // 고층부 등에서 실제 존재하지 않는 세대 여부
}

export interface Floor {
  level: number;
  units: Unit[];
  drawingUrl?: string;
}

export interface Building {
  id: string;
  name: string;
  totalFloors: number;
  floors: Floor[];
}

export interface BuildingStructure {
  name: string;
  totalFloors: number;
  unitsPerFloor: number;
  deadUnitLogic?: string; // 예: "20층 이상 2호 세대 없음"
}

export interface AnalysisResult {
  siteName: string;
  projectCode: string;
  overallSafetyScore: number;
  summary: string;
  buildingStructures: BuildingStructure[]; // AI가 분석한 실제 단지 구조
  riskFactors: RiskFactor[];
  actionItems: string[];
}

export interface RiskFactor {
  category: string;
  score: number;
  detail: string;
}

// [중요] 브라우저 내장 Notification 객체와 충돌 방지를 위해 SystemNotification으로 명명
export interface SystemNotification {
  id: string;
  message: string;
  type: 'success' | 'warning' | 'info';
  timestamp: string;
  read: boolean;
}

// 실시간 채팅 메시지 타입
export interface ChatMessage {
  id: string;
  text: string;
  userRole: UserRole;
  timestamp: number;
  senderName?: string; // 선택적 발신자 이름
}
