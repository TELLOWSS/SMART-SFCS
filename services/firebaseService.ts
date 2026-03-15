
import { initializeApp } from 'firebase/app';
import { collection, onSnapshot, doc, setDoc, addDoc, writeBatch, getDocs, getDocsFromServer, query, orderBy, limit, initializeFirestore, memoryLocalCache, deleteDoc, updateDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { Building, ChatMessage, AnalysisResult } from '../types';

type GangformPtwStatus = 'draft' | 'requested' | 'approved' | 'completed' | 'rejected';

export interface GangformPtwStoredRecord {
    payload: unknown;
    status: GangformPtwStatus;
    updatedAt: string;
    requestedAt?: string | null;
    approvedAt?: string | null;
    completedAt?: string | null;
}

export type GangformPtwStoredMap = Record<string, GangformPtwStoredRecord>;

export interface ApprovalLeadTimeEventRecord {
    approvedAt: string;
    leadMinutes: number;
    buildingId: string;
    buildingName: string;
    floor: string;
    createdAt: string;
}

export interface GangformPtwForceEditEventRecord {
    buildingId: string;
    buildingName: string;
    floor: string;
    previousStatus: GangformPtwStatus;
    nextStatus: GangformPtwStatus;
    reason: string;
    operatorRole: '제작자';
    createdAt: string;
}

// ==================================================================================
// [설정 완료] 사용자가 제공한 Firebase 키 적용됨
// 이 설정값은 프로젝트 식별용이며, 실제 보안은 Firebase Console의 보안 규칙(Rules)으로 관리됩니다.
// ==================================================================================

const firebaseConfig = {
  apiKey: "AIzaSyA9Rx7DCFoxJWPU7zMav8NWtR71YJOHbJI",
  authDomain: "gen-lang-client-0371209150.firebaseapp.com",
  projectId: "gen-lang-client-0371209150",
  storageBucket: "gen-lang-client-0371209150.firebasestorage.app",
  messagingSenderId: "909884266198",
  appId: "1:909884266198:web:f26b6001560b3ce94f5b77"
};

let db: any = null;
let auth: any = null;
let isRealDbConnected = false;

try {
    if (firebaseConfig.apiKey) {
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        
        // [Fix] persistentLocalCache(IndexedDB)에서 memoryLocalCache로 변경.
        // IndexedDB 기반 오프라인 캐시는 기기마다 서로 다른 오래된 상태(예: 미착수)가 유지되어
        // 다른 기기에서 변경한 상태(예: 설치중)를 실시간으로 수신해도 갱신되지 않는 문제를 일으켰다.
        // memoryLocalCache를 사용하면 앱 시작 시 항상 서버에서 최신 데이터를 가져오므로
        // 기기 간 실시간 상태 동기화가 정확하게 동작한다.
        db = initializeFirestore(app, {
            localCache: memoryLocalCache()
        });

        signInAnonymously(auth).then(() => {
            console.log("✅ 실시간 접속 승인 완료 (Anonymous Auth)");
            isRealDbConnected = true;
        }).catch((error) => {
            console.error("🚫 접속 승인 실패: Firebase Console > Authentication > Sign-in method > Anonymous(익명)을 켜주세요.", error);
        });

        onAuthStateChanged(auth, (user) => {
            if (user) {
                isRealDbConnected = true;
            }
        });
    } else {
        console.error("⚠️ [설정 필요] services/firebaseService.ts 파일에서 firebaseConfig를 설정해주세요.");
    }
} catch (e) {
    console.warn("Firebase 초기화 실패:", e);
}

// 1. 실시간 동기화 (듣기 모드)
export const syncBuildings = (
    onUpdate: (data: Building[], isLive: boolean) => void, 
    onError?: (error: any) => void
) => {
    if (!db) return () => {};

    const q = collection(db, "buildings");
    
    // [Fix] includeMetadataChanges: true 제거.
    // memoryLocalCache 환경에서는 fromCache:true 이벤트가 발생하지 않으므로
    // 메타데이터 변경 이벤트를 별도로 구독할 필요가 없다.
    // 실제 데이터 변경 시에만 콜백이 호출되어 불필요한 재렌더링을 방지한다.
    const unsubscribe = onSnapshot(q,
        (snapshot) => {
            const buildings: Building[] = [];
            const isLive = !snapshot.metadata.fromCache;
            snapshot.forEach((doc) => {
                buildings.push(doc.data() as Building);
            });
            if (buildings.length > 0) {
                buildings.sort((a, b) => a.id.localeCompare(b.id));
            }
            onUpdate(buildings, isLive);
        },
        (error) => {
            console.error("🔴 실시간 동기화 끊김:", error.code);
            if (onError) onError(error);
        }
    );
    return unsubscribe;
};

// 2. 초기 데이터 업로드
export const initializeDataIfEmpty = async (initialBuildings: Building[]) => {
    if (!db) return;
    try {
        if (!auth.currentUser) await new Promise(resolve => setTimeout(resolve, 1500));
        const q = collection(db, "buildings");
        // [Fix] getDocs → getDocsFromServer: 캐시가 아닌 실제 서버 상태를 확인하여
        // 이미 데이터가 있는 경우 초기값으로 덮어쓰는 문제를 방지한다.
        const snapshot = await getDocsFromServer(q);
        if (snapshot.empty) {
            const batch = writeBatch(db);
            initialBuildings.forEach((b) => {
                const ref = doc(db, "buildings", b.id);
                batch.set(ref, b);
            });
            await batch.commit();
        }
    } catch (e: any) {
        console.warn("초기 데이터 확인 건너뜀:", e.code);
    }
};

// 3. 변경 사항 저장
export const saveBuilding = async (building: Building) => {
    if (db) {
        try {
            await setDoc(doc(db, "buildings", building.id), building);
        } catch (e) {
            console.error("데이터 저장 실패:", e);
        }
    }
};

// 4. 전체 데이터 일괄 저장
export const saveAllBuildings = async (buildings: Building[]) => {
    if (db) {
        try {
            const batch = writeBatch(db);
            buildings.forEach((b) => {
                const ref = doc(db, "buildings", b.id);
                batch.set(ref, b);
            });
            await batch.commit();
        } catch (e) {
            console.error("Batch update failed:", e);
        }
    }
};

// 5. 실시간 채팅 구독
export const subscribeToChat = (callback: (msgs: ChatMessage[]) => void) => {
    if (!db) return () => {};
    const q = query(collection(db, "messages"), orderBy("timestamp", "asc"), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const msgs: ChatMessage[] = [];
        snapshot.forEach((doc) => {
            msgs.push({ id: doc.id, ...doc.data() } as ChatMessage);
        });
        callback(msgs);
    }, (error) => {
        console.error("Chat sync error:", error);
    });
    return unsubscribe;
};

// 6. 채팅 메시지 전송
export const sendChatMessage = async (msg: Omit<ChatMessage, 'id'>) => {
    if (!db) return;
    try {
        await addDoc(collection(db, "messages"), msg);
    } catch (e) {
        console.error("Message send failed:", e);
    }
};

// 7. 채팅 메시지 전체 삭제 (초기화용)
export const clearChatMessages = async () => {
    if (!db) return;
    try {
        const q = collection(db, "messages");
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        snapshot.forEach((doc) => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        console.log("채팅 데이터 초기화 완료");
    } catch (e) {
        console.error("채팅 초기화 실패:", e);
    }
};

// 8. [신규] AI 분석 결과 저장 (Persistence)
export const saveAnalysisResult = async (result: AnalysisResult) => {
    if (!db) return;
    try {
        // site_data 컬렉션의 analysis 문서를 덮어씁니다.
        await setDoc(doc(db, "site_data", "analysis"), result);
    } catch (e) {
        console.error("Analysis save failed:", e);
    }
};

// 9. [신규] AI 분석 결과 실시간 구독
export const subscribeToAnalysisResult = (callback: (result: AnalysisResult | null) => void) => {
    if (!db) return () => {};
    
    const unsubscribe = onSnapshot(doc(db, "site_data", "analysis"), (doc) => {
        if (doc.exists()) {
            callback(doc.data() as AnalysisResult);
        } else {
            callback(null);
        }
    }, (error) => {
        console.error("Analysis sync error:", error);
    });
    return unsubscribe;
};

export const saveGangformPtwData = async (ptwByBuilding: GangformPtwStoredMap) => {
    if (!db) return;
    try {
        await setDoc(doc(db, "site_data", "gangform_ptw"), {
            records: ptwByBuilding,
            updatedAt: new Date().toISOString()
        });
    } catch (e) {
        console.error("Gangform PTW save failed:", e);
    }
};

export const saveGangformPtwRecord = async (buildingId: string, record: GangformPtwStoredRecord) => {
    if (!db) return;

    const persistedAt = record.updatedAt || new Date().toISOString();
    const nextRecord: GangformPtwStoredRecord = {
        ...record,
        updatedAt: persistedAt
    };
    const ptwRef = doc(db, "site_data", "gangform_ptw");

    try {
        await updateDoc(ptwRef, {
            [`records.${buildingId}`]: nextRecord,
            updatedAt: persistedAt
        });
    } catch (error: any) {
        if (error?.code === 'not-found') {
            await setDoc(ptwRef, {
                records: {
                    [buildingId]: nextRecord
                },
                updatedAt: persistedAt
            }, { merge: true });
            return;
        }

        console.error("Gangform PTW record save failed:", error);
    }
};

export const subscribeToGangformPtwData = (callback: (records: GangformPtwStoredMap) => void) => {
    if (!db) return () => {};

    // [Fix] includeMetadataChanges: true 및 fromCache 필터 제거.
    // memoryLocalCache 환경에서는 fromCache:true 이벤트가 발생하지 않으므로
    // 메타데이터 기반 필터링 없이 모든 스냅샷 이벤트를 처리한다.
    const unsubscribe = onSnapshot(doc(db, "site_data", "gangform_ptw"), (snapshot) => {
        if (!snapshot.exists()) {
            callback({});
            return;
        }

        const data = snapshot.data() as { records?: GangformPtwStoredMap };
        callback(data.records || {});
    }, (error) => {
        console.error("Gangform PTW sync error:", error);
    });

    return unsubscribe;
};

export const saveApprovalLeadTimeEvent = async (event: Omit<ApprovalLeadTimeEventRecord, 'createdAt'>) => {
    if (!db) return;

    try {
        await addDoc(collection(db, "ptw_leadtime_events"), {
            ...event,
            createdAt: new Date().toISOString()
        });
    } catch (e) {
        console.error("Approval lead-time event save failed:", e);
    }
};

export const subscribeApprovalLeadTimeEvents = (
    callback: (events: ApprovalLeadTimeEventRecord[]) => void,
    maxCount: number = 500
) => {
    if (!db) return () => {};

    const q = query(collection(db, "ptw_leadtime_events"), orderBy("approvedAt", "desc"), limit(maxCount));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const events: ApprovalLeadTimeEventRecord[] = [];
        snapshot.forEach((doc) => {
            events.push(doc.data() as ApprovalLeadTimeEventRecord);
        });
        callback(events);
    }, (error) => {
        console.error("Approval lead-time events sync error:", error);
    });

    return unsubscribe;
};

export const saveGangformPtwForceEditEvent = async (event: Omit<GangformPtwForceEditEventRecord, 'createdAt'>) => {
    if (!db) return;

    try {
        await addDoc(collection(db, "ptw_force_edit_events"), {
            ...event,
            createdAt: new Date().toISOString()
        });
    } catch (e) {
        console.error("PTW force-edit event save failed:", e);
    }
};

export const updateUnitStatus = async () => {};
export const updateMEPStatus = async () => {};
