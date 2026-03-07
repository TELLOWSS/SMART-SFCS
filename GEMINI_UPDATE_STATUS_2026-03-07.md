# SMART-SFCS 업그레이드 현황 + 디자인 전체 반영사항 (Gemini 공유용)

> 안내: 본 문서는 상세 레퍼런스입니다. 실제 운영 시에는 `GEMINI31_PROMPTER_GUIDE.md`(마스터 통합본)를 우선 사용하세요.

기준일: 2026-03-07

## 1) 프로젝트 현재 상태 요약
- 제품명: SMART-SFCS (스마트 골조 통합 관제)
- 프론트엔드: React 19 + TypeScript + Vite
- 시각화/아이콘: Recharts, Lucide
- AI: Google `@google/genai` (Gemini `gemini-3-flash-preview`)
- 실시간 데이터: Firebase Firestore + 익명 인증 + IndexedDB persistence
- PTW 기록 아카이브: Supabase(`gangform_ptw_records` 테이블)

---

## 2) 현재까지 업그레이드 완료 항목 (기능)

### A. 역할 기반 운영 고도화
- 역할 체계: 제작자(CREATOR), 관리자(ADMIN), 작업자(WORKER), 협력사(SUBCONTRACTOR)
- 권한 차등:
  - 제작자: AI 업로드/재분석, DB 초기화/재동기화, 시스템 제어
  - 관리자: 승인/반려, 데이터 안전 기능(백업/복구), 채팅 관리
  - 작업자: 상태 진행/승인요청, PTW 작성/증빙 업로드
  - 협력사: 운영 소통 대상자(역할 기반 메시지 번들 포함)
- 관리자/제작자 로그인 모달(비밀번호 분기)로 모드 전환 지원

### B. 대시보드/공정 상태 플로우 고도화
- 상태 체계: `미착수 → 설치중 → 승인요청 → 승인완료 → 타설중 → 양생완료`
- 작업자/관리자별 상태 전이 규칙 분리
- 승인요청 긴급 리스트, 즉시 승인 액션, 위치 점프(동/층) 지원
- 승인 반려 기능 추가(관리자/제작자 전용)
- 단지 배치도 + 동별 카드에서 실시간 진행층 표시
- Dead Unit(비활성 세대) 제외 로직 적용

### C. AI 도면/데이터 분석 엔진 강화
- 입력: 이미지/PDF/엑셀(CSV 포함) 멀티 업로드
- 전처리: 이미지 압축/최적화, 파일별 mime 처리, 진행률 UI
- 분석 핵심:
  - 동별 독립 구조 인식
  - 층/호수 구조 추출
  - Dead Unit 규칙 추론(`N층 이상 N호 세대 없음` 형식)
- 출력 구조 표준화:
  - `buildingStructures`, `riskFactors`, `actionItems`
- 후처리 정규화:
  - 리스크 카테고리 코드 매핑
  - 심각도(high/medium/low) 자동 산정
  - 액션 항목 코드/우선순위 정규화
- 분석 결과 Firestore 영속화 + 실시간 구독
- 제작자만 재분석 가능, 관리자/작업자는 조회 전용 모드 제공

### D. 소통/알림 체계 강화
- Live Chat 실시간 채팅(역할 뱃지/버블 스타일 분기)
- 관리자/제작자만 채팅 전체 삭제 가능
- 시스템 알림 토스트 + 브라우저 알림 + 사운드 알림
- 고우선 액션 발생 시 역할별 커뮤니케이션 번들 생성
  - 관리자/작업자/협력사/통합 브리핑 메시지 포맷 분리
- 카카오톡/문자 공유를 위한 메시지 복사/공유 흐름 제공

### E. 갱폼 PTW 모듈 신설/확장
- PTW 탭/페이지/히스토리 대시보드 분리
- Worker 화면:
  - 필수 체크(압축강도, TBM/PPE, 하부통제, 낙하물 제거)
  - 작업 전 사진 4장 + 작업 중 사진 1장(총 5장 증빙 구조)
  - 승인요청/완료 처리, 연습모드, 되돌리기(undo), 로컬 임시저장
- Admin 화면:
  - 제출 데이터 검토, 승인/반려
- 상태 흐름: `draft → requested → approved → completed / rejected`
- 실시간 상태 저장: Firestore `site_data/gangform_ptw`
- 완료 기록 아카이브: Supabase insert + 조회(필터/상세 모달)

### F. 운영 안정성/데이터 안전
- 전체 현황 JSON 백업/복구 기능
- 제작자 전용 배치 동작(전체 초기화/강제 재동기화)
- Firestore persistence 및 연결상태 UI(online/offline)

---

## 3) 디자인 전체 반영사항 (현재 기준)

### A. 디자인 시스템 토큰
- 폰트
  - 기본: Pretendard + Inter
  - 모노: JetBrains Mono
- 브랜드 컬러
  - `brand.dark`: `#002E6C`
  - `brand.primary`: `#0055A5`
  - `brand.accent`: `#F97316`
  - `brand.bg`: `#F1F5F9`
  - `brand.surface`: `#FFFFFF`
- 상태 컬러
  - ready `#94A3B8`, active `#3B82F6`, warning `#F59E0B`, success `#10B981`, danger `#EF4444`
- 그림자
  - `shadow-tech`, `shadow-glow`, `shadow-card`

### B. 레이아웃/비주얼 언어
- 핵심 컨셉: “Digital Concrete”
  - 현장 견고함 + 데이터 투명성 결합
- 스타일 키워드
  - 대형 라운드 코너(`rounded-2xl`, `rounded-[2.5rem]`)
  - 유리질감(backdrop blur), 그리드 패턴, 소프트 섀도우
  - 고대비 다크 사이드바 + 라이트 컨텐츠 캔버스
- 애니메이션
  - `fadeInUp`, `slideUp`, `scaleIn`

### C. 상태/공정 색상 규칙 (UI 일관성)
- 미착수: 슬레이트 계열
- 설치중: 옐로우 계열
- 승인요청: 오렌지(브랜드 accent)
- 승인완료: 블루 계열
- 타설중: 퍼플 계열
- 양생완료: 에메랄드 계열
- Dead Unit: 저채도/비활성 처리 + Ghost 아이콘

### D. 핵심 화면별 디자인 특징
- 사이드바
  - 역할/권한별 메뉴, Data Safety/Creator Controls 분리
  - 브랜드 아이덴티티 패널 내장(색상/컴포지션 안내)
- 헤더
  - 실시간 연결 뱃지, 시계/기상 정보, 현장명 입력 강조형 UI
- 대시보드
  - 긴급 승인 대기 카드, 동별 그리드, 검색/점프 UX
- SiteMap
  - 1공구/2공구 색상 구분 배지
  - 동별 진행층(상태색) 시각화
- Analysis
  - 업로드/분석/결과를 카드 기반 2단 컬럼으로 구성
  - 제작자 편집 가능, 타 역할 조회 전용 분기
- PTW
  - 작업 전/중 증빙 5장 구조를 중심으로 법적 증빙 UX 설계
- Manual
  - 사용자 가이드 + 기술 아키텍처 2탭 문서형 인터페이스

---

## 4) 제미나이에 전달할 점검 프롬프트 (복붙용)

```text
너는 건설 현장 디지털 관제 시스템의 제품 점검/정보구조(IA)/UX 감사 전문가다.
아래 "SMART-SFCS 업그레이드 현황"을 기준으로, 실제 운영 관점에서 업데이트 누락/충돌/개선 우선순위를 점검해줘.

[입력 데이터]
- 기준일: 2026-03-07
- 기능 요약:
  1) 역할 기반 운영(CREATOR/ADMIN/WORKER/SUBCONTRACTOR)
  2) 공정 상태 흐름(미착수~양생완료) + 승인 반려
  3) AI 분석(도면/엑셀, dead unit, 리스크/액션 정규화)
  4) 실시간 채팅/알림/역할별 소통 번들
  5) PTW 모듈(작업자/관리자/히스토리, 5장 증빙, Supabase 기록)
  6) 백업/복구/초기화 등 운영 안전 기능
- 디자인 시스템 요약:
  - Digital Concrete 컨셉
  - 브랜드 토큰(brand.dark/primary/accent/bg)
  - 상태 색상 규칙, 카드형 라운드 UI, 유리질감, 그리드 패턴, 모션(fade/slide/scale)

[요청사항]
A. 현재 업그레이드 상태 진단 (잘 된 점 5개)
B. 기능 리스크/충돌 가능성 (상/중/하, 원인, 영향, 완화안)
C. 디자인 일관성 점검 (컴포넌트별 이탈 지점)
D. 다음 2주 실행 로드맵 (즉시/1주/2주)
E. 운영 KPI 제안 (현장 반응속도, 승인 리드타임, PTW 완결률, 오탐률 등)
F. 반드시 한국어로, 표 + JSON 예시 함께 출력

출력 형식:
1) 요약(5줄)
2) 점검표(카테고리, 현재수준, 문제, 개선안, 우선순위)
3) 실행 로드맵(즉시/1주/2주)
4) KPI JSON
```

---

## 5) 제미나이 응답 확인 체크리스트
- 기능 누락 없이 6개 축(권한/공정/AI/소통/PTW/운영안전)을 모두 다뤘는가
- 디자인 점검에서 토큰/상태색/레이아웃/모션 일관성을 분리 평가했는가
- 개선안이 “즉시 실행 가능” 수준(담당/범위/기한)으로 제시됐는가
- KPI가 현장 운영 데이터로 추적 가능한 지표인가
- 추상적 표현만 있고 실제 액션이 없는 항목은 없는가

---

## 6) 참고 파일(근거)
- App.tsx
- components/AnalysisView.tsx
- components/BuildingSection.tsx
- components/SiteMap.tsx
- components/LiveChat.tsx
- components/Manual.tsx
- components/GangformPTW.tsx
- components/GangformPTWWorker.tsx
- components/GangformPTWHistory.tsx
- services/geminiService.ts
- services/firebaseService.ts
- services/gangformPtwActions.ts
- types.ts
- index.html
- GEMINI31_PROMPTER_GUIDE.md
