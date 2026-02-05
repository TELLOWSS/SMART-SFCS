
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, onSnapshot, doc, setDoc, addDoc, writeBatch, getDocs, query, orderBy, limit, enableIndexedDbPersistence, initializeFirestore, CACHE_SIZE_UNLIMITED, deleteDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { Building, ChatMessage, AnalysisResult } from '../types';

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
        
        db = initializeFirestore(app, {
            cacheSizeBytes: CACHE_SIZE_UNLIMITED
        });

        enableIndexedDbPersistence(db).catch((err) => {
            console.log('Persistence mode:', err.code);
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
    
    const unsubscribe = onSnapshot(q, { includeMetadataChanges: true },
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
        const snapshot = await getDocs(q);
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

export const updateUnitStatus = async () => {};
export const updateMEPStatus = async () => {};
