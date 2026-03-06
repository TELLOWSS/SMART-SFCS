
import { GoogleGenAI, Type } from "@google/genai";
import { ActionItem, ActionItemCode, ActionPriority, AnalysisResult, RiskCategoryCode, RiskFactor, RiskSeverity } from "../types";

export interface FileInput {
  data: string; // base64 string
  mimeType: string;
}

const RISK_CATEGORY_LABELS: Record<RiskCategoryCode, string> = {
  APPROVAL_DELAY: '승인 지연',
  REJECTION_CLUSTER: '반려 사유 클러스터',
  PROCESS_CHAT_MISMATCH: '공정-채팅 불일치',
  SAFETY_ALERT_PRIORITY: '안전 경고 우선순위',
  MATERIAL_EQUIPMENT_BOTTLENECK: '자재/장비 병목',
  SUBCONTRACTOR_RESPONSE_DELAY: '협력사 응답 지연',
  REWORK_OCCURRENCE: '재작업 발생',
  DEAD_UNIT_EXCEPTION: '데드유닛 예외',
  OTHER: '기타 리스크'
};

const mapRiskCategoryCode = (rawCategory: string): RiskCategoryCode => {
  const category = (rawCategory || '').toLowerCase().replace(/\s+/g, ' ').trim();

  if (/승인\s*지연|approval\s*delay|승인\s*대기/.test(category)) return 'APPROVAL_DELAY';
  if (/반려|reject|rejection/.test(category)) return 'REJECTION_CLUSTER';
  if (/불일치|채팅|chat\s*mismatch|보고\s*누락/.test(category)) return 'PROCESS_CHAT_MISMATCH';
  if (/안전|위험|hazard|safety|경고/.test(category)) return 'SAFETY_ALERT_PRIORITY';
  if (/자재|장비|병목|bottleneck|equipment|material/.test(category)) return 'MATERIAL_EQUIPMENT_BOTTLENECK';
  if (/협력사|응답\s*지연|회신\s*지연|sla/.test(category)) return 'SUBCONTRACTOR_RESPONSE_DELAY';
  if (/재작업|리워크|rework/.test(category)) return 'REWORK_OCCURRENCE';
  if (/dead\s*unit|죽은\s*세대|데드\s*유닛|데드유닛|예외/.test(category)) return 'DEAD_UNIT_EXCEPTION';

  return 'OTHER';
};

const scoreToSeverity = (score: number): RiskSeverity => {
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
};

const mapActionItemCode = (text: string): ActionItemCode => {
  const value = (text || '').toLowerCase().replace(/\s+/g, ' ').trim();

  if (/도면|동기화|정합|검증|sync/.test(value)) return 'VERIFY_DRAWING_SYNC';
  if (/승인\s*요청|승인|결재/.test(value)) return 'REQUEST_APPROVAL';
  if (/반려|사유|재검토|reject/.test(value)) return 'REVIEW_REJECTION_REASON';
  if (/안전|위험|경고|hazard|safety/.test(value)) return 'CHECK_SAFETY_ALERT';
  if (/자재|장비|물량|납품|material|equipment/.test(value)) return 'RESOLVE_MATERIAL_ISSUE';
  if (/협력사|응답|회신|subcontractor|sla/.test(value)) return 'FOLLOWUP_SUBCONTRACTOR';
  if (/dead\s*unit|죽은\s*세대|데드\s*유닛|데드유닛|예외/.test(value)) return 'VERIFY_DEAD_UNIT_EXCEPTION';

  return 'GENERAL_ACTION';
};

const mapActionPriority = (text: string): ActionPriority => {
  const value = (text || '').toLowerCase().replace(/\s+/g, ' ').trim();

  if (/긴급|즉시|지연|위험|중대|critical|urgent|high/.test(value)) return 'high';
  if (/확인|검토|점검|follow|중요|medium/.test(value)) return 'medium';
  return 'low';
};

const normalizeActionItems = (items: unknown): ActionItem[] => {
  if (!Array.isArray(items)) return [];

  return items
    .map((item): ActionItem | null => {
      if (typeof item === 'string') {
        const title = item.trim();
        if (!title) return null;
        return {
          title,
          code: mapActionItemCode(title),
          priority: mapActionPriority(title),
          dueAt: null
        };
      }

      if (item && typeof item === 'object') {
        const raw = item as Partial<ActionItem> & { text?: string; name?: string };
        const title = String(raw.title || raw.text || raw.name || '').trim();
        if (!title) return null;

        const code = raw.code || mapActionItemCode(title);
        const priority = raw.priority || mapActionPriority(title);

        return {
          title,
          code,
          priority,
          dueAt: raw.dueAt || null
        };
      }

      return null;
    })
    .filter((item): item is ActionItem => item !== null);
};

const normalizeAnalysisResult = (result: AnalysisResult): AnalysisResult => {
  const normalizedRiskFactors: RiskFactor[] = (result.riskFactors || []).map((risk) => {
    const code = mapRiskCategoryCode(risk.category);
    const severity = scoreToSeverity(Number(risk.score || 0));
    const category = RISK_CATEGORY_LABELS[code] || risk.category;

    return {
      ...risk,
      category,
      code,
      severity
    };
  });

  return {
    ...result,
    riskFactors: normalizedRiskFactors,
    actionItems: normalizeActionItems((result as unknown as { actionItems?: unknown }).actionItems)
  };
};

export const analyzeDrawing = async (files: FileInput[]): Promise<AnalysisResult | null> => {
  // Fix: Use process.env.API_KEY directly as per guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const parts = [
      ...files.map(file => {
        if (file.mimeType === 'text/plain') {
            try {
                const decodedText = decodeURIComponent(escape(atob(file.data)));
                return { text: `[파일 데이터 정보]\n${decodedText}` };
            } catch(e) {
                return { inlineData: { mimeType: file.mimeType, data: file.data } };
            }
        }
        return { inlineData: { mimeType: file.mimeType, data: file.data } };
      }),
      { text: `
        당신은 건설 현장 최고의 구조 엔지니어이자 스마트 관제 시스템 설계자입니다.
        업로드된 도면(평면도, 구조일람표, 단지배치도) 및 엑셀 데이터를 정밀 분석하십시오.

        [핵심 분석 및 추출 규칙]
        1. 동별 독립 구조 인식 (Strict Individual Structure):
           - 모든 동이 같은 구조라고 가정하지 마십시오. 
           - 특히 '4세대 동'과 '6세대 동'의 차이를 명확히 구분하십시오.
           - 각 동(예: 2001동, 3001동)마다 고유의 전체 층수와 기준층 호수(Units per floor, 4개 또는 6개 등)를 독립적으로 추출하십시오.

        2. 죽은 세대(Dead Unit/Setback) 정밀 탐색:
           - 고층부로 갈수록 일조권 사선제한이나 층별 평면 가변성으로 인해 사라지는 세대를 찾아내십시오.
           - 결과는 반드시 "N층 이상 N호 세대 없음" (예: "25층 이상 5,6호 세대 없음")의 규격화된 한국어 문구로 deadUnitLogic 필드에 넣으십시오.
           - 도면 구석의 '비고'나 '특기사항', '범례'를 꼼꼼히 확인하십시오.

        3. 데이터 정합성:
           - 엑셀의 동 호수 리스트와 평면도의 배치를 대조하여 가장 정확한 단지 구성을 생성하십시오.

        [응답 형식]
        - 반드시 제공된 JSON 스키마를 준수하십시오.
        - 한국어로 응답하십시오.
      `}
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            siteName: { type: Type.STRING },
            projectCode: { type: Type.STRING },
            overallSafetyScore: { type: Type.NUMBER },
            summary: { type: Type.STRING },
            buildingStructures: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  totalFloors: { type: Type.NUMBER },
                  unitsPerFloor: { type: Type.NUMBER },
                  deadUnitLogic: { type: Type.STRING, description: "예: '22층 이상 4호 세대 없음'" }
                },
                required: ["name", "totalFloors", "unitsPerFloor"]
              }
            },
            riskFactors: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  category: { type: Type.STRING },
                  score: { type: Type.NUMBER },
                  detail: { type: Type.STRING }
                },
                required: ["category", "score", "detail"]
              }
            },
            actionItems: {
              type: Type.ARRAY,
              items: {
                type: Type.STRING
              }
            }
          },
          required: ["siteName", "projectCode", "overallSafetyScore", "summary", "buildingStructures", "riskFactors", "actionItems"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response text");
    const parsed = JSON.parse(text.trim()) as AnalysisResult;
    return normalizeAnalysisResult(parsed);

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return null;
  }
};

export const suggestSitePlan = async (siteName: string) => {
    // Fix: Use process.env.API_KEY directly as per guidelines
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `건설현장 '${siteName}'에 대한 공사 개요와 고층부 세대 가변성에 따른 안전 관리 포인트를 1줄로 요약해서 한국어로 만들어줘.`,
        });
        return response.text || "";
    } catch (e) {
        return "AI 서비스를 연결할 수 없습니다.";
    }
}
