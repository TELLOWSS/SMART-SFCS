
import { initializeApp } from 'firebase/app';
import { collection, onSnapshot, doc, setDoc, addDoc, writeBatch, getDocs, getDocsFromServer, getDoc, query, orderBy, limit, initializeFirestore, memoryLocalCache, deleteDoc, updateDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { supabase } from '../lib/supabaseClient';
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
const FIREBASE_WRITE_BLOCK_MS = 5 * 60 * 1000;
let blockedWriteError: { code: string; message: string; until: number } | null = null;

const createFirebaseWriteError = (code: string, message: string) => {
    const error = new Error(message) as Error & { code: string };
    error.code = code;
    return error;
};

const ensureFirebaseWritable = () => {
    if (!blockedWriteError) return;
    if (blockedWriteError.until <= Date.now()) {
        blockedWriteError = null;
        return;
    }

    throw createFirebaseWriteError(blockedWriteError.code, blockedWriteError.message);
};

const rememberWriteFailure = (error: any) => {
    if (error?.code === 'resource-exhausted') {
        blockedWriteError = {
            code: 'resource-exhausted',
            message: 'Firebase 쓰기 한도를 초과했습니다. 추가 쓰기를 5분간 중단합니다.',
            until: Date.now() + FIREBASE_WRITE_BLOCK_MS
        };
    }
};

const runFirebaseWrite = async <T>(operation: () => Promise<T>): Promise<T> => {
    ensureFirebaseWritable();

    try {
        const result = await operation();
        blockedWriteError = null;
        return result;
    } catch (error) {
        rememberWriteFailure(error);
        throw error;
    }
};

const BUILDINGS_SYNC_TABLE = 'sfcs_buildings';
let preferredBuildingsBackend: 'unknown' | 'firebase' | 'supabase' = 'unknown';

const sortBuildingsById = (buildings: Building[]) => {
    if (buildings.length > 0) {
        buildings.sort((a, b) => a.id.localeCompare(b.id));
    }
    return buildings;
};

const toSupabaseBuildingRow = (building: Building) => ({
    id: building.id,
    name: building.name,
    total_floors: building.totalFloors,
    floors: building.floors,
    updated_at: new Date().toISOString()
});

const fromSupabaseBuildingRow = (row: any): Building => ({
    id: String(row.id),
    name: row.name,
    totalFloors: Number(row.total_floors ?? row.totalFloors ?? 0),
    floors: Array.isArray(row.floors) ? row.floors : []
});

const shouldFallbackToFirebase = (error: any) => {
    const message = String(error?.message || '').toLowerCase();
    return error?.code === 'PGRST205'
        || error?.code === '42P01'
        || message.includes('could not find the table')
        || message.includes('relation')
        || message.includes(BUILDINGS_SYNC_TABLE);
};

const fetchSupabaseBuildings = async (): Promise<Building[]> => {
    const { data, error } = await supabase
        .from(BUILDINGS_SYNC_TABLE)
        .select('id, name, total_floors, floors')
        .order('id', { ascending: true });

    if (error) throw error;
    return sortBuildingsById((data || []).map(fromSupabaseBuildingRow));
};

const upsertSupabaseBuildings = async (buildings: Building[]) => {
    const { error } = await supabase
        .from(BUILDINGS_SYNC_TABLE)
        .upsert(buildings.map(toSupabaseBuildingRow), { onConflict: 'id' });

    if (error) throw error;
};

const syncBuildingsWithFirebase = (
    onUpdate: (data: Building[], isLive: boolean) => void,
    onError?: (error: any) => void
) => {
    if (!db) return () => {};

    const q = collection(db, 'buildings');
    const unsubscribe = onSnapshot(q,
        (snapshot) => {
            const buildings: Building[] = [];
            const isLive = !snapshot.metadata.fromCache;
            snapshot.forEach((doc) => {
                buildings.push(doc.data() as Building);
            });
            onUpdate(sortBuildingsById(buildings), isLive);
        },
        (error) => {
            console.error('🔴 실시간 동기화 끊김:', error.code);
            if (onError) onError(error);
        }
    );
    return unsubscribe;
};

const initializeDataIfEmptyWithFirebase = async (initialBuildings: Building[]) => {
    if (!db) return;
    try {
        if (!auth.currentUser) await new Promise(resolve => setTimeout(resolve, 1500));
        const q = collection(db, 'buildings');
        const snapshot = await getDocsFromServer(q);
        if (snapshot.empty) {
            const batch = writeBatch(db);
            initialBuildings.forEach((b) => {
                const ref = doc(db, 'buildings', b.id);
                batch.set(ref, b);
            });
            await batch.commit();
        }
    } catch (e: any) {
        console.warn('초기 데이터 확인 건너뜀:', e.code);
    }
};

const saveBuildingWithFirebase = async (building: Building) => {
    if (!db) return;
    try {
        await runFirebaseWrite(() => setDoc(doc(db, 'buildings', building.id), building));
    } catch (e) {
        console.error('데이터 저장 실패:', e);
        throw e;
    }
};

const saveAllBuildingsWithFirebase = async (buildings: Building[]) => {
    if (!db) return;
    try {
        await runFirebaseWrite(async () => {
            const batch = writeBatch(db);
            buildings.forEach((b) => {
                const ref = doc(db, 'buildings', b.id);
                batch.set(ref, b);
            });
            await batch.commit();
        });
    } catch (e) {
        console.error('Batch update failed:', e);
        throw e;
    }
};

const fetchAllBuildingsWithFirebase = async (): Promise<Building[]> => {
    if (!db) return [];

    try {
        if (auth && !auth.currentUser) {
            try {
                await signInAnonymously(auth);
            } catch {
                // 이미 로그인 진행 중이거나 익명 인증이 비활성화된 경우 대기 후 재시도한다.
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const snapshot = await getDocs(collection(db, 'buildings'));
        const buildings: Building[] = [];
        snapshot.forEach((snapshotDoc) => {
            const data = snapshotDoc.data() as Building;
            buildings.push({ ...data, id: data?.id || snapshotDoc.id });
        });
        return sortBuildingsById(buildings);
    } catch (error) {
        console.warn('Firebase 건물 백필 소스 조회 실패:', error);
        return [];
    }
};

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
    if (preferredBuildingsBackend === 'firebase') {
        return syncBuildingsWithFirebase(onUpdate, onError);
    }

    let fallbackUnsubscribe = () => {};
    let closed = false;

    const startFirebaseFallback = (error?: any) => {
        if (closed || preferredBuildingsBackend === 'firebase') return;
        preferredBuildingsBackend = 'firebase';
        if (error) {
            console.warn('Supabase 건물 실시간 동기화를 사용할 수 없어 Firebase로 전환합니다.', error);
        }
        fallbackUnsubscribe = syncBuildingsWithFirebase(onUpdate, onError);
    };

    const channel = supabase
        .channel('sfcs-buildings-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: BUILDINGS_SYNC_TABLE }, async () => {
            try {
                const buildings = await fetchSupabaseBuildings();
                preferredBuildingsBackend = 'supabase';
                onUpdate(buildings, true);
            } catch (error) {
                if (shouldFallbackToFirebase(error)) {
                    await channel.unsubscribe();
                    startFirebaseFallback(error);
                    return;
                }
                console.error('Supabase buildings sync error:', error);
                if (onError) onError(error);
            }
        })
        .subscribe(async (status) => {
            if (status !== 'SUBSCRIBED') return;
            try {
                const buildings = await fetchSupabaseBuildings();
                preferredBuildingsBackend = 'supabase';
                onUpdate(buildings, true);
            } catch (error) {
                if (shouldFallbackToFirebase(error)) {
                    await channel.unsubscribe();
                    startFirebaseFallback(error);
                    return;
                }
                console.error('Supabase buildings initial sync error:', error);
                if (onError) onError(error);
            }
        });

    return () => {
        closed = true;
        fallbackUnsubscribe();
        void channel.unsubscribe();
    };
};

// 2. 초기 데이터 업로드
export const initializeDataIfEmpty = async (initialBuildings: Building[]) => {
    if (preferredBuildingsBackend === 'firebase') {
        await initializeDataIfEmptyWithFirebase(initialBuildings);
        return;
    }

    try {
        const { data, error } = await supabase
            .from(BUILDINGS_SYNC_TABLE)
            .select('id');

        if (error) throw error;
        preferredBuildingsBackend = 'supabase';

        const existingIds = new Set((data || []).map((row: any) => String(row.id)));

        // 1) 기존 Firebase 데이터가 더 많다면 이를 우선 백필해 과거 동 목록을 보존한다.
        const firebaseSeedBuildings = await fetchAllBuildingsWithFirebase();
        const missingFromSupabaseByFirebase = firebaseSeedBuildings.filter(b => !existingIds.has(b.id));
        if (missingFromSupabaseByFirebase.length > 0) {
            await upsertSupabaseBuildings(missingFromSupabaseByFirebase);
            missingFromSupabaseByFirebase.forEach(b => existingIds.add(b.id));
        }

        // 2) Firebase에도 없는 경우를 대비해 정적 초기 데이터 누락분도 채운다.
        const missingFromInitial = initialBuildings.filter(b => !existingIds.has(b.id));
        if (missingFromInitial.length > 0) {
            await upsertSupabaseBuildings(missingFromInitial);
        }
    } catch (error) {
        if (shouldFallbackToFirebase(error)) {
            preferredBuildingsBackend = 'firebase';
            await initializeDataIfEmptyWithFirebase(initialBuildings);
            return;
        }
        throw error;
    }
};

// 3. 변경 사항 저장
export const saveBuilding = async (building: Building) => {
    if (preferredBuildingsBackend === 'firebase') {
        await saveBuildingWithFirebase(building);
        return;
    }

    try {
        await upsertSupabaseBuildings([building]);
        preferredBuildingsBackend = 'supabase';
    } catch (error) {
        if (shouldFallbackToFirebase(error)) {
            preferredBuildingsBackend = 'firebase';
            await saveBuildingWithFirebase(building);
            return;
        }
        throw error;
    }
};

// 4. 전체 데이터 일괄 저장
export const saveAllBuildings = async (buildings: Building[]) => {
    if (preferredBuildingsBackend === 'firebase') {
        await saveAllBuildingsWithFirebase(buildings);
        return;
    }

    try {
        await upsertSupabaseBuildings(buildings);
        preferredBuildingsBackend = 'supabase';
    } catch (error) {
        if (shouldFallbackToFirebase(error)) {
            preferredBuildingsBackend = 'firebase';
            await saveAllBuildingsWithFirebase(buildings);
            return;
        }
        throw error;
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
        await runFirebaseWrite(() => addDoc(collection(db, "messages"), msg));
    } catch (e) {
        console.error("Message send failed:", e);
        throw e;
    }
};

// 7. 채팅 메시지 전체 삭제 (초기화용)
export const clearChatMessages = async () => {
    if (!db) return;
    try {
        const q = collection(db, "messages");
        const snapshot = await getDocs(q);
        await runFirebaseWrite(async () => {
            const batch = writeBatch(db);
            snapshot.forEach((doc) => {
                batch.delete(doc.ref);
            });
            await batch.commit();
        });
        console.log("채팅 데이터 초기화 완료");
    } catch (e) {
        console.error("채팅 초기화 실패:", e);
        throw e;
    }
};

// 8. [신규] AI 분석 결과 저장 (Persistence)
export const saveAnalysisResult = async (result: AnalysisResult) => {
    if (!db) return;
    try {
        // site_data 컬렉션의 analysis 문서를 덮어씁니다.
        await runFirebaseWrite(() => setDoc(doc(db, "site_data", "analysis"), result));
    } catch (e) {
        console.error("Analysis save failed:", e);
        throw e;
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

const GANGFORM_PTW_SYNC_TABLE = 'sfcs_gangform_ptw_state';
let preferredGangformPtwBackend: 'unknown' | 'firebase' | 'supabase' = 'unknown';

interface SupabaseGangformPtwStateRow {
    building_id: string;
    payload: unknown;
    status: GangformPtwStatus;
    updated_at: string;
    requested_at?: string | null;
    approved_at?: string | null;
    completed_at?: string | null;
}

const shouldFallbackToFirebaseForGangform = (error: any) => {
    const message = String(error?.message || '').toLowerCase();
    return error?.code === 'PGRST205'
        || error?.code === '42P01'
        || message.includes('could not find the table')
        || message.includes('relation')
        || message.includes(GANGFORM_PTW_SYNC_TABLE);
};

const toGangformSupabaseRow = (buildingId: string, record: GangformPtwStoredRecord): SupabaseGangformPtwStateRow => ({
    building_id: buildingId,
    payload: record.payload,
    status: record.status,
    updated_at: record.updatedAt,
    requested_at: record.requestedAt || null,
    approved_at: record.approvedAt || null,
    completed_at: record.completedAt || null
});

const fromGangformSupabaseRows = (rows: SupabaseGangformPtwStateRow[]): GangformPtwStoredMap => {
    return rows.reduce((acc, row) => {
        acc[row.building_id] = {
            payload: row.payload,
            status: row.status,
            updatedAt: row.updated_at,
            requestedAt: row.requested_at || null,
            approvedAt: row.approved_at || null,
            completedAt: row.completed_at || null
        };
        return acc;
    }, {} as GangformPtwStoredMap);
};

const fetchGangformPtwRowsFromSupabase = async (): Promise<GangformPtwStoredMap> => {
    const { data, error } = await supabase
        .from(GANGFORM_PTW_SYNC_TABLE)
        .select('building_id, payload, status, updated_at, requested_at, approved_at, completed_at');

    if (error) throw error;
    return fromGangformSupabaseRows((data || []) as SupabaseGangformPtwStateRow[]);
};

const saveGangformPtwDataWithFirebase = async (ptwByBuilding: GangformPtwStoredMap) => {
    if (!db) return;

    await runFirebaseWrite(() => setDoc(doc(db, "site_data", "gangform_ptw"), {
        records: ptwByBuilding,
        updatedAt: new Date().toISOString()
    }));
};

const fetchGangformPtwDataFromFirebase = async (): Promise<GangformPtwStoredMap> => {
    if (!db) return {};

    try {
        const snapshot = await getDoc(doc(db, "site_data", "gangform_ptw"));
        if (!snapshot.exists()) return {};
        const data = snapshot.data() as { records?: GangformPtwStoredMap };
        return data.records || {};
    } catch (error) {
        console.warn('Firebase 갱폼 PTW 백필 소스 조회 실패:', error);
        return {};
    }
};

const saveGangformPtwRecordWithFirebase = async (buildingId: string, record: GangformPtwStoredRecord) => {
    if (!db) return;

    const persistedAt = record.updatedAt || new Date().toISOString();
    const nextRecord: GangformPtwStoredRecord = {
        ...record,
        updatedAt: persistedAt
    };
    const ptwRef = doc(db, "site_data", "gangform_ptw");

    try {
        await runFirebaseWrite(() => updateDoc(ptwRef, {
            [`records.${buildingId}`]: nextRecord,
            updatedAt: persistedAt
        }));
    } catch (error: any) {
        if (error?.code === 'not-found') {
            await runFirebaseWrite(() => setDoc(ptwRef, {
                records: {
                    [buildingId]: nextRecord
                },
                updatedAt: persistedAt
            }, { merge: true }));
            return;
        }

        throw error;
    }
};

const subscribeToGangformPtwDataWithFirebase = (callback: (records: GangformPtwStoredMap) => void) => {
    if (!db) return () => {};

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

const backfillSupabaseGangformPtwIfEmpty = async (supabaseRecords: GangformPtwStoredMap): Promise<GangformPtwStoredMap> => {
    if (Object.keys(supabaseRecords).length > 0) return supabaseRecords;

    const firebaseRecords = await fetchGangformPtwDataFromFirebase();
    if (Object.keys(firebaseRecords).length === 0) return supabaseRecords;

    const rows = Object.entries(firebaseRecords).map(([buildingId, record]) => {
        const persistedAt = record.updatedAt || new Date().toISOString();
        return toGangformSupabaseRow(buildingId, { ...record, updatedAt: persistedAt });
    });

    const { error } = await supabase
        .from(GANGFORM_PTW_SYNC_TABLE)
        .upsert(rows, { onConflict: 'building_id' });

    if (error) throw error;
    return firebaseRecords;
};

export const saveGangformPtwData = async (ptwByBuilding: GangformPtwStoredMap) => {
    if (preferredGangformPtwBackend === 'firebase') {
        await saveGangformPtwDataWithFirebase(ptwByBuilding);
        return;
    }

    try {
        const rows = Object.entries(ptwByBuilding).map(([buildingId, record]) => {
            const persistedAt = record.updatedAt || new Date().toISOString();
            return toGangformSupabaseRow(buildingId, { ...record, updatedAt: persistedAt });
        });

        if (rows.length > 0) {
            const { error } = await supabase.from(GANGFORM_PTW_SYNC_TABLE).upsert(rows, { onConflict: 'building_id' });
            if (error) throw error;
        }
        preferredGangformPtwBackend = 'supabase';
    } catch (error) {
        if (shouldFallbackToFirebaseForGangform(error)) {
            preferredGangformPtwBackend = 'firebase';
            await saveGangformPtwDataWithFirebase(ptwByBuilding);
            return;
        }

        console.error("Gangform PTW save failed:", error);
        throw error;
    }
};

export const saveGangformPtwRecord = async (buildingId: string, record: GangformPtwStoredRecord) => {
    if (preferredGangformPtwBackend === 'firebase') {
        await saveGangformPtwRecordWithFirebase(buildingId, record);
        return;
    }

    const persistedAt = record.updatedAt || new Date().toISOString();
    const nextRecord: GangformPtwStoredRecord = { ...record, updatedAt: persistedAt };

    try {
        const { error } = await supabase
            .from(GANGFORM_PTW_SYNC_TABLE)
            .upsert(toGangformSupabaseRow(buildingId, nextRecord), { onConflict: 'building_id' });

        if (error) throw error;
        preferredGangformPtwBackend = 'supabase';
    } catch (error) {
        if (shouldFallbackToFirebaseForGangform(error)) {
            preferredGangformPtwBackend = 'firebase';
            await saveGangformPtwRecordWithFirebase(buildingId, nextRecord);
            return;
        }

        console.error("Gangform PTW record save failed:", error);
        throw error;
    }
};

export const subscribeToGangformPtwData = (callback: (records: GangformPtwStoredMap) => void) => {
    if (preferredGangformPtwBackend === 'firebase') {
        return subscribeToGangformPtwDataWithFirebase(callback);
    }

    let fallbackUnsubscribe = () => {};
    let closed = false;

    const startFirebaseFallback = (error?: any) => {
        if (closed || preferredGangformPtwBackend === 'firebase') return;
        preferredGangformPtwBackend = 'firebase';
        if (error) {
            console.warn('Supabase 갱폼 PTW 실시간 동기화를 사용할 수 없어 Firebase로 전환합니다.', error);
        }
        fallbackUnsubscribe = subscribeToGangformPtwDataWithFirebase(callback);
    };

    const channel = supabase
        .channel('sfcs-gangform-ptw-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: GANGFORM_PTW_SYNC_TABLE }, async () => {
            try {
                const records = await fetchGangformPtwRowsFromSupabase();
                preferredGangformPtwBackend = 'supabase';
                callback(records);
            } catch (error) {
                if (shouldFallbackToFirebaseForGangform(error)) {
                    await channel.unsubscribe();
                    startFirebaseFallback(error);
                    return;
                }
                console.error("Gangform PTW sync error:", error);
            }
        })
        .subscribe(async (status) => {
            if (status !== 'SUBSCRIBED') return;
            try {
                const fetched = await fetchGangformPtwRowsFromSupabase();
                const records = await backfillSupabaseGangformPtwIfEmpty(fetched);
                preferredGangformPtwBackend = 'supabase';
                callback(records);
            } catch (error) {
                if (shouldFallbackToFirebaseForGangform(error)) {
                    await channel.unsubscribe();
                    startFirebaseFallback(error);
                    return;
                }
                console.error("Gangform PTW initial sync error:", error);
            }
        });

    return () => {
        closed = true;
        fallbackUnsubscribe();
        void channel.unsubscribe();
    };
};

export const saveApprovalLeadTimeEvent = async (event: Omit<ApprovalLeadTimeEventRecord, 'createdAt'>) => {
    if (!db) return;

    try {
        await runFirebaseWrite(() => addDoc(collection(db, "ptw_leadtime_events"), {
            ...event,
            createdAt: new Date().toISOString()
        }));
    } catch (e) {
        console.error("Approval lead-time event save failed:", e);
        throw e;
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
        await runFirebaseWrite(() => addDoc(collection(db, "ptw_force_edit_events"), {
            ...event,
            createdAt: new Date().toISOString()
        }));
    } catch (e) {
        console.error("PTW force-edit event save failed:", e);
        throw e;
    }
};

export const updateUnitStatus = async () => {};
export const updateMEPStatus = async () => {};
