
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult } from "../types";

export interface FileInput {
  data: string; // base64 string
  mimeType: string;
}

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
    return JSON.parse(text.trim()) as AnalysisResult;

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
