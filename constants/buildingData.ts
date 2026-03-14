export interface BuildingStructure {
  building: string;
  maxFloor: number;
  maxUnit: number; // 최대 호수 라인
  deadUnits: string[]; // "층+호수" 형태의 문자열 배열 (예: "101", "2403")
}

export const BUILDING_DATA: BuildingStructure[] = [
  {
    building: '2006동',
    maxFloor: 28,
    maxUnit: 6,
    // 1F: 1,3,6호 필로티 / 2F: 1호 PIT
    deadUnits: ['101', '103', '106', '201']
  },
  {
    building: '2007동',
    maxFloor: 27,
    maxUnit: 4,
    // 1F: 2,3호 필로티 / 27F: 3,4호 없음 / 26F: 3,4호 없음
    deadUnits: ['102', '103', '2703', '2704', '2603', '2604']
  },
  {
    building: '3001동',
    maxFloor: 21,
    maxUnit: 4,
    // 1F: 1,3호 필로티, 2,4호 기타시설 / 2F: 1~4호 전체 PIT
    deadUnits: ['101', '102', '103', '104', '201', '202', '203', '204']
  },
  {
    building: '2010동',
    maxFloor: 28,
    maxUnit: 6,
    // 1F 활성: 102,104,106
    deadUnits: ['101', '103', '105']
  },
  {
    building: '2013동',
    maxFloor: 28,
    maxUnit: 6,
    // 1F 활성: 101,103,105 / 2F~3F: 6세대 전체 활성
    deadUnits: ['102', '104', '106']
  },
  {
    building: '3003동',
    maxFloor: 23,
    maxUnit: 3,
    // 1F 활성: 101,103
    deadUnits: ['102']
  }
  // 추가 동은 이 패턴에 맞춰 개발자가 입력할 예정
];
