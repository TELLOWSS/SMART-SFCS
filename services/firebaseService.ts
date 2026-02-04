
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, onSnapshot, doc, setDoc, addDoc, writeBatch, getDocs, query, orderBy, limit, enableIndexedDbPersistence, initializeFirestore, CACHE_SIZE_UNLIMITED } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { Building, ChatMessage } from '../types';

// --- CONFIGURATION START ---
// [중요] Firebase 콘솔에서 복사한 새로운 '무료 프로젝트'의 설정값으로 아래 내용을 덮어씌우세요.
// 위치: Firebase Console > 프로젝트 설정 > 일반 > 내 앱 > SDK 설정 및 구성
const firebaseConfig = {
  apiKey: "여기에_새_API_KEY_입력",
  authDomain: "project-id.firebaseapp.com",
  projectId: "project-id",
  storageBucket: "project-id.firebasestorage.app",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxx"
};
// --- CONFIGURATION END ---

let db: any = null;
let auth: any = null;
let isRealDbConnected = false;

// Firebase 초기화 및 실시간 연결 설정
try {
    // apiKey가 기본값(placeholder)이 아닐 때만 초기화
    if (firebaseConfig.apiKey && firebaseConfig.apiKey !== "여기에_새_API_KEY_입력") {
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        
        // [중요] 오프라인에서도 작동하도록 로컬 캐시 우선 설정
        db = initializeFirestore(app, {
            cacheSizeBytes: CACHE_SIZE_UNLIMITED
        });

        // 오프라인 지속성(Persistence) 활성화 시도
        enableIndexedDbPersistence(db).catch((err) => {
            // 웹 브라우저 탭을 여러 개 띄우면 발생할 수 있는 경고이므로 무시해도 됨
            console.log('Persistence mode:', err.code);
        });

        // [핵심] 익명 로그인 실행 (실시간 데이터 접속 권한 강제 획득)
        signInAnonymously(auth).then(() => {
            console.log("✅ 실시간 접속 승인 완료 (Anonymous Auth)");
            isRealDbConnected = true;
        }).catch((error) => {
            console.error("🚫 접속 승인 실패:", error);
        });

        // 인증 상태 모니터링
        onAuthStateChanged(auth, (user) => {
            if (user) {
                console.log("📡 실시간 데이터 채널 연결됨 (User ID:", user.uid, ")");
                isRealDbConnected = true;
            }
        });

        isRealDbConnected = true;
    } else {
        console.warn("⚠️ Firebase 설정이 비어있습니다. 코드를 수정하여 API Key를 입력해주세요.");
    }
} catch (e) {
    console.warn("Firebase 초기화 실패:", e);
}

// 1. 실시간 동기화 (듣기 모드) - 정확한 연결 상태(isLive) 반환
export const syncBuildings = (
    onUpdate: (data: Building[], isLive: boolean) => void, 
    onError?: (error: any) => void
) => {
    if (!db) return () => {};

    const q = collection(db, "buildings");
    
    const unsubscribe = onSnapshot(q, { includeMetadataChanges: true },
        (snapshot) => {
            const buildings: Building[] = [];
            
            // [정밀 판독] 데이터가 캐시(로컬)에서 왔는지 서버에서 왔는지 확인
            // fromCache가 true면 오프라인 상태이거나 아직 서버 응답 대기중인 상태
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

// 2. 초기 데이터 업로드 (최초 1회 실행용)
export const initializeDataIfEmpty = async (initialBuildings: Building[]) => {
    if (!db) return;

    try {
        // 잠시 대기하여 인증이 처리될 시간을 줌
        if (!auth.currentUser) await new Promise(resolve => setTimeout(resolve, 1500));

        const q = collection(db, "buildings");
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            console.log("데이터베이스 초기화 시작...");
            const batch = writeBatch(db);
            initialBuildings.forEach((b) => {
                const ref = doc(db, "buildings", b.id);
                batch.set(ref, b);
            });
            await batch.commit();
            console.log("✅ 초기 데이터 업로드 완료");
        }
    } catch (e: any) {
        console.warn("초기 데이터 확인 건너뜀 (권한 또는 연결 문제):", e.code);
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

    // 최근 50개 메시지만 가져오기 (데이터 절약)
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

export const updateUnitStatus = async () => {};
export const updateMEPStatus = async () => {};
