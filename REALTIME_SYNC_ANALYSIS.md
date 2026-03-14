# SMART-SFCS 실시간 업데이트 문제 분석 보고서

## 1. 디렉토리 구조

```
/home/runner/work/SMART-SFCS/SMART-SFCS/
├── App.tsx                          # 메인 앱 (중앙 상태 관리 & Firebase 구독)
├── Navigation.tsx                   # 네비게이션
├── types.ts                         # 타입 정의 (ProcessStatus 포함)
├── components/
│   ├── SiteMap.tsx                 # 단지배치현황 (Complex Layout Status)
│   ├── BuildingSection.tsx         # 개별 동 세부보기 & 양생완료(CURED) 표시
│   ├── GangformPTW.tsx             # 갱폼 관리자 뷰
│   ├── GangformPTWWorker.tsx       # 갱폼 작업자 뷰
│   ├── GangformPTWHistory.tsx      # 갱폼 히스토리
│   ├── AnalysisView.tsx
│   ├── Manual.tsx
│   └── LiveChat.tsx
├── constants/
│   └── buildingData.ts             # 건물 정보 & dead units
├── services/
│   ├── firebaseService.ts          # Firebase Firestore 구독 & 저장
│   ├── gangformPtwActions.ts
│   └── geminiService.ts
├── lib/
│   ├── shareUtil.ts
│   ├── imageUploadUtil.ts
│   └── supabaseClient.ts
└── app/
    └── gangform-ptw/
        ├── page.tsx
        └── history/
            └── page.tsx
```

## 2. 관련 파일 위치 및 핵심 코드

### 2.1 단지배치현황 (SiteMap.tsx - Line 150)
**파일:** `/home/runner/work/SMART-SFCS/SMART-SFCS/components/SiteMap.tsx`

```typescript
// Line 150: 제목
<h3 className="text-white font-black text-lg tracking-tight">단지 배치 현황</h3>

// Line 169: 양생완료 표시
<span className="flex items-center"><div className="w-1.5 h-1.5 rounded-full bg-emerald-600 mr-1.5"></div> 양생완료</span>
```

### 2.2 양생완료 (ProcessStatus.CURED)
**파일들:**
- `types.ts` (Line 15): 정의
  ```typescript
  CURED = '양생완료'
  ```

- `SiteMap.tsx` (Lines 47-90): 실시간 업데이트 로직
  ```typescript
  const getActiveInfo = (building: Building) => {
    const activeUnits = building.floors
      .flatMap(f => f.units)
      .filter(u => !u.isDeadUnit && u.status !== ProcessStatus.NOT_STARTED);
    
    const curedList = activeUnits.filter(u => u.status === ProcessStatus.CURED);
    if (curedList.length > 0) {
      // 가장 높은 층의 양생완료 세대 찾기
      const highestCured = curedList.reduce((prev, curr) => {
        const prevFloor = parseInt(prev.id.split('-')[1]);
        const currFloor = parseInt(curr.id.split('-')[1]);
        return prevFloor > currFloor ? prev : curr;
      });
      return { floor: highestCured.id.split('-')[1] + 'F', status: ProcessStatus.CURED };
    }
  }
  ```

- `BuildingSection.tsx` (Line 22): 렌더링 시마다 즉시 정렬
  ```typescript
  // 실시간 반영을 위해 렌더링 시마다 즉시 정렬 (메모이제이션 제거)
  const sortedFloors = [...building.floors].sort((a, b) => b.level - a.level);
  ```

### 2.3 갱폼인상완료 (GangformPTW - Separated Data Stream)
**파일:** `/home/runner/work/SMART-SFCS/SMART-SFCS/components/SiteMap.tsx` (Lines 181-196)

```typescript
const gangformRecord = gangformByBuilding[building.id];
const gangformFloor = parseGangformFloor(gangformRecord?.payload?.floor);
const gangformStatus = gangformRecord?.status ?? null;

const tooltipText = `[${building.name} ${displayFloorRow?.floorLevel || '-'}층]\n▶ AL폼: ${displayFloorRow?.alStatus || ProcessStatus.NOT_STARTED}\n▶ 갱폼 인상: ${getGangformTooltipLabel(gangformStatus, gangformFloor)}`;
```

**별도의 Firebase 구독:** `firebaseService.ts` (Lines 247-263)
```typescript
export const subscribeToGangformPtwData = (callback: (records: GangformPtwStoredMap) => void) => {
    const unsubscribe = onSnapshot(doc(db, "site_data", "gangform_ptw"), (snapshot) => {
        // 별도의 "site_data/gangform_ptw" 문서 구독
    });
    return unsubscribe;
};
```

## 3. 데이터 실시간 업데이트 로직

### 3.1 Firebase Firestore 구독 구조
**App.tsx (Lines 529-649)**

#### (1) 양생완료(CURED) - Buildings 컬렉션 기반
```
Firebase 구독 체인:
├── syncBuildings() [firebaseService.ts Line 90]
│   └── onSnapshot(collection(db, "buildings"))
│       └── App.tsx의 setBuildings() 호출
│           └── SiteMap/BuildingSection 컴포넌트 자동 리렌더링
└── 데이터 흐름: Firebase → App 상태 → SiteMap 표시
```

**실시간 감지 (Lines 549-629):**
```typescript
normalizedBuildings.forEach(newB => {
  const oldB = prevBuildingsRef.current.find(b => b.id === newB.id);
  newB.floors.forEach(newF => {
    newF.units.forEach(newU => {
      const oldU = oldF.units.find(u => u.id === newU.id);
      if (newU.status !== oldU.status) {
        if (newU.status === ProcessStatus.APPROVAL_REQ) { /* 알림 */ }
        else if (newU.status === ProcessStatus.APPROVED) { /* 알림 */ }
        else if (newU.status === ProcessStatus.INSTALLING && oldU.status === ProcessStatus.APPROVAL_REQ) { /* 알림 */ }
      }
    });
  });
});
```

#### (2) 갱폼인상완료 - 별도 site_data/gangform_ptw 문서
```
Firebase 구독 체인:
├── subscribeToGangformPtwData() [firebaseService.ts Line 247]
│   └── onSnapshot(doc(db, "site_data", "gangform_ptw"))
│       └── App.tsx의 setGangformPtwByBuilding() 호출
│           └── SiteMap 컴포넌트 자동 리렌더링 (gangformByBuilding prop)
└── 데이터 흐름: Firebase → App 상태 → SiteMap 표시
```

**App.tsx (Lines 660-677):**
```typescript
useEffect(() => {
  const unsubscribe = subscribeToGangformPtwData((records: GangformPtwStoredMap) => {
    const mapped = Object.entries(records || {}).reduce((acc, [buildingId, record]) => {
      // site_data/gangform_ptw의 records 매핑
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
```

## 4. 문제 분석: 양생완료(CURED) vs 갱폼인상완료(Gangform)

### 4.1 데이터 구조의 차이

| 항목 | 양생완료 (CURED) | 갱폼인상완료 (Gangform) |
|------|-----------------|----------------------|
| **저장 위치** | `buildings/{buildingId}` | `site_data/gangform_ptw` |
| **구조** | 각 유닛의 `status` 필드 | 별도 `records` 객체 |
| **업데이트 방식** | 유닛 단위 (세밀함) | 건물 단위 (통합) |
| **구독 방식** | 컬렉션 전체 `onSnapshot` | 단일 문서 `onSnapshot` |
| **실시간성** | 높음 (유닛 변경 즉시) | 높음 (문서 변경 즉시) |

### 4.2 양생완료 업데이트 로직 흐름 (SiteMap 기준)

```
1. Firebase에서 building 문서 변경 감지
   ↓
2. syncBuildings()의 onSnapshot 트리거
   ↓
3. App.tsx의 setBuildings(normalizedBuildings) 호출
   ↓
4. SiteMap props 업데이트: buildings={normalizedBuildings}
   ↓
5. getActiveInfo(building) 실행
   - 모든 activeUnits 필터링
   - CURED 상태의 units 찾기
   - 가장 높은 층 반환
   ↓
6. SiteMap 카드 렌더링 (emerald-600 표시)
```

### 4.3 갱폼인상완료 업데이트 로직 흐름 (SiteMap 기준)

```
1. Firebase에서 site_data/gangform_ptw 문서 변경 감지
   ↓
2. subscribeToGangformPtwData()의 onSnapshot 트리거
   ↓
3. App.tsx의 setGangformPtwByBuilding(mapped) 호출
   ↓
4. SiteMap props 업데이트: gangformByBuilding={gangformPtwByBuilding}
   ↓
5. parseGangformFloor() 및 getGangformLabel() 실행
   ↓
6. SiteMap 카드 우측 상단 배지 렌더링
```

## 5. 🔴 문제점: 양생완료가 다기기에서 다르게 표시되는 이유

### 5.1 원인 분석

**⚠️ 가능한 원인들:**

1. **캐시 문제**
   - Firebase의 `includeMetadataChanges: true`는 있지만
   - 브라우저 IndexedDB 캐시로 인해 기기별로 다른 상태 유지 가능
   - `enableIndexedDbPersistence(db)` (Line 66 in firebaseService.ts)

2. **오프라인 모드의 차이**
   - 기기A: 온라인 상태 → 최신 데이터 표시
   - 기기B: 오프라인 상태 → 캐시된 구 데이터 표시
   - `setIsConnected(isLive)` (Line 537 in App.tsx) - 연결 상태 감지는 하지만...

3. **정규화 로직의 문제** (normalizeBuildingsWithDrawingData)
   - Line 150-207 in App.tsx
   - 다른 기기가 다른 건물 구조 버전을 가질 수 있음
   - Dead units 재평가로 인한 상태 변경

4. **렌더링 최적화 미흡**
   - SiteMap의 getActiveInfo()는 매 렌더링마다 새로 계산됨 (정상)
   - BuildingSection에서 sortedFloors는 memo 제거됨 (정상)
   - 하지만 **화면이 실제로 업데이트되지 않을 수 있음** → 아래 참고

5. **React 상태 업데이트 지연**
   - normalizeBuildingsWithDrawingData() 계산 비용 높음
   - 대량의 units 비교로 인한 지연 발생 가능
   - 특정 기기에서 느린 처리 → 다른 상태 표시

### 5.2 갱폼인상완료가 정상 작동하는 이유

```typescript
subscribeToGangformPtwData((records: GangformPtwStoredMap) => {
  // 매우 간단한 매핑만 수행
  const mapped = Object.entries(records || {}).reduce((acc, [buildingId, record]) => {
    acc[buildingId] = { /* 간단한 할당 */ };
    return acc;
  }, {});
  setGangformPtwByBuilding(mapped);  // 가벼운 상태 업데이트
});
```

**갱폼이 정상인 이유:**
- 데이터 구조가 단순함 (건물 단위 단일 기록)
- 정규화 로직이 없음
- 상태 업데이트가 가볍고 빠름
- Firebase 구독이 직접적임

## 6. 📊 실시간 업데이트 플로우 다이어그램

### 6.1 양생완료 (현재 구조)

```
Building Document Update in Firebase
         ↓
   onSnapshot triggered
         ↓
  syncBuildings() callback
         ↓
normalizeBuildingsWithDrawingData()  ← ⚠️ 무거운 계산
         ↓
  setBuildings(normalized)
         ↓
SiteMap props update (buildings)
         ↓
getActiveInfo() + getFloorAlStatus()
         ↓
Render emerald badge (양생완료)
```

### 6.2 갱폼인상완료 (현재 구조)

```
site_data/gangform_ptw Document Update in Firebase
         ↓
   onSnapshot triggered
         ↓
subscribeToGangformPtwData() callback
         ↓
Simple mapping  ← ✅ 가벼운 작업
         ↓
setGangformPtwByBuilding()
         ↓
SiteMap props update (gangformByBuilding)
         ↓
getGangformLabel() + parseGangformFloor()
         ↓
Render badge (갱폼 상태)
```

## 7. 🔧 권장 개선 방안

### 7.1 즉시 시행 (고우선)

1. **Firebase IndexedDB 캐시 정책 수정**
   ```typescript
   // firebaseService.ts Line 62-64 변경
   db = initializeFirestore(app, {
       cacheSizeBytes: 10 * 1024 * 1024,  // 제한된 캐시
       ignoreUndefinedProperties: true
   });
   ```

2. **온라인 모드 강제 설정**
   ```typescript
   // firebaseService.ts Line 98
   const unsubscribe = onSnapshot(q, { includeMetadataChanges: true },
     (snapshot) => {
       // 캐시가 아닌 서버 데이터만 처리
       if (snapshot.metadata.fromCache) {
           console.warn("⚠️ Using cached data - forcing refresh");
           // 캐시일 때 강제 새로고침
           return;
       }
       // ... 처리
     }
   );
   ```

3. **기기별 캐시 동기화 강제**
   ```typescript
   // App.tsx에 추가
   useEffect(() => {
       const interval = setInterval(() => {
           const unsubscribe = syncBuildings((buildings, isLive) => {
               if (!isLive) {
                   console.warn("Cache detected, forcing sync");
                   // 캐시 상태일 때 강제 동기화
               }
           });
       }, 30000);  // 30초마다 확인
       return () => clearInterval(interval);
   }, []);
   ```

### 7.2 중기 개선 (구조적)

1. **normalizeBuildingsWithDrawingData() 최적화**
   - useMemo 적용
   - 변경 감지 로직 개선

2. **양생완료를 갱폼처럼 분리된 문서로 저장**
   ```typescript
   // site_data/al_curing_status (새로운 문서)
   {
       records: {
           "b-2006": { floor: 15, units: 8, timestamp: "..." },
           "b-2007": { floor: 12, units: 6, timestamp: "..." }
       },
       updatedAt: "..."
   }
   ```

3. **WebSocket 고려**
   - 특정 기기에서 폴링 방식으로 전환
   - Firestore 구독 외 HTTP polling 추가

### 7.3 장기 개선 (아키텍처)

1. **Real-time Synchronization 라이브러리** 도입
   - Replicache, Yjs 등 고려

2. **기기별 동기화 상태 모니터링**
   - 기기 ID 등록 후 마지막 동기화 타임스탬프 추적

3. **UI에 연결 상태 표시**
   - 현재 isConnected 상태 활용
   - 사용자에게 "오프라인 모드" 명확히 표시

## 8. 핵심 코드 참고

| 항목 | 파일 | 라인 |
|------|------|------|
| ProcessStatus.CURED 정의 | types.ts | 15 |
| SiteMap 양생완료 표시 | components/SiteMap.tsx | 46-90, 129, 139, 169 |
| Firebase 구독 | services/firebaseService.ts | 90-116, 247-263 |
| App 상태 업데이트 | App.tsx | 529-685 |
| 데이터 정규화 | App.tsx | 150-207 |
| 실시간 감지 | App.tsx | 549-629 |

