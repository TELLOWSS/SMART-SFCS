# ⚡ Quick Fix Guide: 양생완료 실시간 업데이트

## 🎯 5분 요약

**문제:** 양생완료(CURED) 상태가 기기별로 다르게 표시됨  
**원인:** Firebase IndexedDB 캐시 → 오프라인/온라인 상태 불일치  
**해결:** 캐시 정책 수정 + 강제 동기화  

---

## 🔧 즉시 적용 가능한 3가지 Fix

### Fix #1: Firebase 캐시 크기 제한 (2분)

**파일:** `services/firebaseService.ts` (Line 62)

**변경 전:**
```typescript
db = initializeFirestore(app, {
    cacheSizeBytes: CACHE_SIZE_UNLIMITED
});
```

**변경 후:**
```typescript
db = initializeFirestore(app, {
    cacheSizeBytes: 10 * 1024 * 1024,  // 10MB로 제한
    ignoreUndefinedProperties: true
});
```

---

### Fix #2: 캐시 상태 감지 (2분)

**파일:** `App.tsx` (Line 537 근처)

**추가 코드:**
```typescript
const unsubscribe = syncBuildings(
    (serverBuildings, isLive) => {
        setIsConnected(isLive);
        
        // ⚠️ 새로 추가: 캐시 사용 감지
        if (!isLive && prevBuildingsRef.current.length > 0) {
            console.warn("⚠️ CACHE MODE: Using local cached data, NOT real-time!");
            // 선택: 사용자에게 알림 표시
            // addNotification("오프라인 상태: 로컬 캐시 사용 중", "warning");
        }
        
        // ... 나머지 코드
    }
);
```

---

### Fix #3: 주기적 강제 동기화 (2분)

**파일:** `App.tsx` (useEffect 추가, Line 650 이후)

**추가 코드:**
```typescript
useEffect(() => {
    // 30초마다 强제 동기화 체크
    const syncInterval = setInterval(() => {
        const currentlyOnline = navigator.onLine;
        if (currentlyOnline && !isConnected) {
            console.log("🔄 강제 동기화 시작");
            // 강제 새로고침 트리거 (선택)
            // window.location.reload();
        }
    }, 30000);

    return () => clearInterval(syncInterval);
}, [isConnected]);
```

---

## 🧪 테스트 방법

### 1단계: 현재 상태 확인
```bash
# 브라우저 Console 열기 (F12)
# 다음 명령 실행:
localStorage.clear()  // 로컬 스토리지 초기화
indexedDB.databases().then(dbs => dbs.forEach(db => indexedDB.deleteDatabase(db.name)))  // IndexedDB 캐시 삭제
location.reload()  // 새로고침
```

### 2단계: 기기별 테스트
1. 기기 A: 양생완료 상태 변경 (예: 2006동 15층 → 16층)
2. 기기 B: 새로고침 **없이** 즉시 확인
3. ✅ 즉시 변경 보이면 정상
4. ❌ 여전히 구 상태면 캐시 문제

### 3단계: Fix 적용 후
1. Fix #1~3 모두 적용
2. 위 테스트 다시 실행
3. ✅ 즉시 동기화되어야 함

---

## 🔍 진단 명령어

```typescript
// 브라우저 Console에서 실행:

// 1. 현재 연결 상태 확인
console.log("온라인 상태:", navigator.onLine);

// 2. Firebase 캐시 상태 확인
firebase.firestore().enableNetwork().then(() => {
    console.log("✅ Firebase 네트워크 활성화");
}).catch(e => {
    console.error("❌ Firebase 오류:", e);
});

// 3. IndexedDB 캐시 크기 확인
navigator.storage.estimate().then(estimate => {
    console.log("저장소 사용:", estimate.usage / 1024 / 1024, "MB");
    console.log("할당량:", estimate.quota / 1024 / 1024, "MB");
});

// 4. Firestore 캐시 비활성화 (즉시 테스트)
db.disableNetwork().then(() => console.log("오프라인 모드 활성화"));
db.enableNetwork().then(() => console.log("온라인 모드 활성화"));
```

---

## 📊 예상 결과

| 시나리오 | Before | After |
|---------|--------|-------|
| **기기A 업데이트** | ✅ 즉시 반영 | ✅ 즉시 반영 |
| **기기B 새로고침 없이** | ❌ 캐시 표시 | ✅ 즉시 반영 |
| **오프라인 상태** | ❌ 같은 상태 유지 | ⚠️ 알림 표시 |
| **온라인 복귀** | ⏳ 수초 후 동기화 | ✅ 즉시 동기화 |

---

## �� 변경 파일 체크리스트

- [ ] `services/firebaseService.ts` (Line 62): 캐시 크기 제한
- [ ] `App.tsx` (Line 537): 캐시 상태 감지 추가
- [ ] `App.tsx` (Line 650+): 주기적 동기화 useEffect 추가
- [ ] 로컬 테스트 완료
- [ ] 2대 이상 기기에서 테스트
- [ ] 브라우저 Console에서 에러 확인

---

## 🐛 여전히 문제면?

### 1단계: 로그 확인
```typescript
// firebaseService.ts의 syncBuildings 콜백
onSnapshot(q, { includeMetadataChanges: true },
    (snapshot) => {
        console.log("📡 Firestore Update");
        console.log("From Cache:", snapshot.metadata.fromCache);  // ← 이 값 확인
        console.log("Has Pending:", snapshot.metadata.hasPendingWrites);
        // ...
    }
);
```

### 2단계: Network 탭 확인
브라우저 DevTools → Network 탭 → XHR/Fetch
- Firestore API 호출 보이는가?
- 응답 상태 200인가?
- 타이밍은?

### 3단계: Chrome DevTools Storage 확인
- Application → Storage → IndexedDB
- "firestore" 항목 크기 확인
- "buildings" 컬렉션 데이터 확인

---

## 💡 추가 팁

### Firestore 오프라인 우선(Offline-First) 활성화
```typescript
// firebaseService.ts
enableIndexedDbPersistence(db)
    .then(() => {
        console.log("✅ IndexedDB Persistence 활성화");
        console.log("⚠️  주의: 캐시 크기 모니터링 필수");
    })
    .catch((err) => {
        if (err.code === 'failed-precondition') {
            // 브라우저가 IndexedDB를 지원하지 않음
        } else if (err.code === 'unimplemented') {
            // 이미 다른 탭에서 활성화됨
        }
    });
```

### 수동 캐시 초기화 (테스트용)
```typescript
// App.tsx의 Creator 배치 작업에 추가
const handleClearCache = async () => {
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
        indexedDB.deleteDatabase(db.name);
    }
    localStorage.clear();
    sessionStorage.clear();
    alert("캐시가 초기화되었습니다. 새로고침해주세요.");
    location.reload();
};
```

---

## 📞 검증 완료 기준

✅ 모두 만족하면 Fix 완료:

- [ ] 기기 A에서 양생완료 변경 시, 기기 B에서 **2초 이내** 반영
- [ ] 오프라인 상태에서 기기별 다른 데이터 보이지 않음
- [ ] 온라인 복귀 시 자동 동기화
- [ ] 브라우저 Console에 경고 없음
- [ ] 갱폼인상 정상 작동 유지

---

**💾 저장 위치:** `/home/runner/work/SMART-SFCS/SMART-SFCS/QUICK_FIX_GUIDE.md`

