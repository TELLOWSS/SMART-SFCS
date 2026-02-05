
import React, { useState, useRef, useEffect } from 'react';
import { Upload, Loader2, CheckCircle, AlertTriangle, FileText, Scan, Zap, X, Image as ImageIcon, Shield, AlertOctagon, ClipboardList, Activity, FileSpreadsheet, Info, Download, RotateCcw, Check, Lock, Eye } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { analyzeDrawing, FileInput } from '../services/geminiService';
import { Building, AnalysisResult, UserRole } from '../types';

interface AnalysisViewProps {
  onAnalysisComplete: (result: AnalysisResult) => void;
  buildings: Building[];
  persistedResult?: AnalysisResult | null;
  userRole: UserRole;
}

interface UploadedFile extends FileInput {
  name: string;
  id: string;
  previewUrl?: string;
  isText?: boolean;
}

const AnalysisView: React.FC<AnalysisViewProps> = ({ onAnalysisComplete, buildings, persistedResult, userRole }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [processingStatusText, setProcessingStatusText] = useState("");
  
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [result, setResult] = useState<AnalysisResult | null>(persistedResult || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (persistedResult) {
      setResult(persistedResult);
    }
  }, [persistedResult]);

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = (e) => { img.src = e.target?.result as string; };
      reader.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_DIMENSION = 1536;
        if (width > height) {
          if (width > MAX_DIMENSION) { height = Math.round((height * MAX_DIMENSION) / width); width = MAX_DIMENSION; }
        } else {
          if (height > MAX_DIMENSION) { width = Math.round((width * MAX_DIMENSION) / height); height = MAX_DIMENSION; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error("Canvas context error")); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const fileList: File[] = Array.from(e.target.files);
      const newFiles: UploadedFile[] = [];
      
      setIsProcessing(true);
      setProcessProgress(0);
      setProcessingStatusText("파일 분석 준비 중...");

      try {
        for (let i = 0; i < fileList.length; i++) {
            const file = fileList[i];
            setProcessingStatusText(`[${i + 1}/${fileList.length}] 최적화 중...`);

            const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv');
            const isImage = file.type.startsWith('image/');
            const isPdf = file.type === 'application/pdf';

            if (!isImage && !isPdf && !isExcel) continue;

            let data: string;
            let mimeType = file.type || 'application/octet-stream';

            if (isImage) {
                data = await compressImage(file);
                const matches = data.match(/^data:([^;]+);base64,(.+)$/);
                if (matches) { mimeType = matches[1]; data = matches[2]; }
            } else if (isPdf) {
                const base64 = await readFileAsBase64(file);
                const matches = base64.match(/^data:([^;]+);base64,(.+)$/);
                if (matches) { mimeType = matches[1]; data = matches[2]; }
            } else {
                const text = await readFileAsText(file);
                data = btoa(unescape(encodeURIComponent(text)));
                mimeType = 'text/plain';
            }

            newFiles.push({
                id: Math.random().toString(36).substr(2, 9),
                name: file.name,
                mimeType: mimeType,
                data: data,
                previewUrl: isImage ? `data:${mimeType};base64,${data}` : undefined,
                isText: isExcel
            });

            setProcessProgress(Math.round(((i + 1) / fileList.length) * 100));
        }

        setUploadedFiles(prev => [...prev, ...newFiles]);
        setIsProcessing(false);
      } catch (error) {
        setIsProcessing(false);
      }
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsText(file);
    });
  };

  const removeFile = (id: string) => setUploadedFiles(prev => prev.filter(f => f.id !== id));

  const performBatchAnalysis = async () => {
    if (uploadedFiles.length === 0) return;
    setIsAnalyzing(true);
    setResult(null);
    try {
      const inputs: FileInput[] = uploadedFiles.map(f => ({ data: f.data, mimeType: f.mimeType }));
      const analysisData = await analyzeDrawing(inputs);
      if (analysisData) {
        setResult(analysisData);
        onAnalysisComplete(analysisData);
      } else {
         alert("분석 결과가 없습니다. 파일을 다시 확인해주세요.");
      }
    } catch (error) {
      alert("AI 분석 중 오류가 발생했습니다.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const radarData = result?.riskFactors.map(r => ({ subject: r.category, A: r.score, fullMark: 100 })) || [];

  return (
    <div className="bg-white rounded-[2.5rem] shadow-tech border border-slate-200 overflow-hidden min-h-[700px] flex flex-col relative animate-fade-in-up">
      {isProcessing && (
        <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center p-8 text-center">
            <div className="w-full max-w-xs">
                <div className="flex justify-between text-[11px] font-black text-slate-600 mb-2 uppercase tracking-tighter">
                    <span className="truncate pr-4">{processingStatusText}</span>
                    <span>{processProgress}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 mb-4 overflow-hidden border border-slate-200">
                    <div className="bg-brand-primary h-full rounded-full transition-all duration-300" style={{ width: `${processProgress}%` }}></div>
                </div>
                <p className="text-[10px] text-slate-400 font-medium">AI 정밀 스캔 엔진 구동 중...</p>
            </div>
        </div>
      )}

      <div className="bg-slate-900 text-white p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 gap-4">
         <div>
            <h2 className="text-xl font-bold flex items-center tracking-tight"><Scan className="w-6 h-6 mr-3 text-brand-accent" /> AI 도면-구조 정밀 분석 엔진</h2>
            <p className="text-[10px] text-slate-500 mt-1 font-mono uppercase tracking-widest">Global Engineering Sync Interface v3.2</p>
         </div>
         <div className="flex items-center space-x-2">
            <span className="text-[10px] bg-slate-800 px-4 py-2 rounded-xl border border-slate-700 font-mono text-brand-accent flex items-center shadow-inner">
               <Zap className="w-3.5 h-3.5 mr-2 text-yellow-400" fill="currentColor" /> GEMINI 3.0 FLASH-PRIME
            </span>
            {/* 리셋 버튼은 제작자에게만 표시 */}
            {result && userRole === UserRole.CREATOR && (
              <button onClick={() => {setResult(null); setUploadedFiles([]);}} className="p-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl hover:bg-red-500/20 transition-all">
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
         </div>
      </div>

      <div className="flex-1 p-6 md:p-10 grid grid-cols-1 lg:grid-cols-12 gap-10 bg-slate-50/50">
        
        {/* 업로드 섹션: 제작자(CREATOR)에게만 표시 */}
        {userRole === UserRole.CREATOR ? (
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-full -mr-16 -mt-16 group-hover:bg-blue-100 transition-colors"></div>
                  <h3 className="font-black text-slate-800 mb-6 flex items-center text-xs uppercase tracking-widest relative z-10"><FileText className="w-4 h-4 mr-2 text-brand-primary" /> Analysis Source</h3>
                  
                  <label className={`relative z-10 group flex flex-col items-center justify-center w-full h-48 border-2 border-slate-200 border-dashed rounded-[2rem] cursor-pointer bg-slate-50/50 hover:bg-white transition-all hover:border-brand-primary mb-6 ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div className="flex flex-col items-center justify-center p-6 text-center">
                      <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 mb-4 group-hover:scale-110 transition-transform">
                        <Upload className="w-7 h-7 text-brand-primary" />
                      </div>
                      <p className="text-sm font-black text-slate-700">도면 또는 데이터 업로드</p>
                      <p className="text-[10px] text-slate-400 mt-2 font-medium">PDF, 이미지, 엑셀 정밀 분석 지원</p>
                    </div>
                    <input ref={fileInputRef} type="file" className="hidden" accept="image/*,.pdf,.csv,.xlsx,.xls" multiple onChange={handleFileChange} />
                  </label>

                  {uploadedFiles.length > 0 && (
                    <div className="bg-slate-50/50 rounded-2xl border border-slate-200 p-4 max-h-[250px] overflow-y-auto custom-scrollbar mb-6 space-y-2">
                        {uploadedFiles.map((file) => (
                            <div key={file.id} className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                                <div className="flex items-center space-x-3 overflow-hidden">
                                    <div className="w-10 h-10 flex-shrink-0 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-200">
                                        {file.isText ? <FileSpreadsheet className="w-5 h-5 text-emerald-500" /> : file.previewUrl ? <img src={file.previewUrl} alt="thumb" className="w-full h-full object-cover rounded-lg" /> : <FileText className="w-5 h-5 text-brand-primary" />}
                                    </div>
                                    <div className="flex flex-col overflow-hidden">
                                        <span className="text-[11px] font-black truncate text-slate-700">{file.name}</span>
                                        <span className="text-[9px] text-slate-400 uppercase font-mono tracking-tighter">{file.mimeType.split('/')[1]}</span>
                                    </div>
                                </div>
                                <button onClick={() => removeFile(file.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><X className="w-4 h-4" /></button>
                            </div>
                        ))}
                    </div>
                  )}

                  <button 
                    onClick={performBatchAnalysis}
                    disabled={uploadedFiles.length === 0 || isAnalyzing || isProcessing}
                    className={`w-full py-5 rounded-2xl font-black text-sm flex items-center justify-center transition-all shadow-xl active:scale-95 relative overflow-hidden ${
                        uploadedFiles.length > 0 && !isAnalyzing && !isProcessing
                        ? 'bg-brand-dark text-white hover:bg-slate-800' 
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                    }`}
                  >
                     {isAnalyzing ? <><Loader2 className="w-5 h-5 mr-3 animate-spin" /> 구조적 맵핑 분석 중...</> : <><Scan className="w-5 h-5 mr-3" /> 데이터 동기화 실행</>}
                  </button>
              </div>

              <div className="p-6 bg-blue-50/30 rounded-[2rem] border border-blue-100/50 text-[12px] text-blue-700 leading-relaxed shadow-sm">
                  <p className="font-black flex items-center mb-2"><Info className="w-4 h-4 mr-2" /> 정밀 분석 가이드 (Guideline)</p>
                  <ul className="space-y-1.5 opacity-80 font-medium">
                    <li>• 평면도 내 '죽은 세대'는 범례를 기준으로 자동 탐지됩니다.</li>
                    <li>• 엑셀의 '동/호' 리스트와 도면 배치를 상호 교차 검증합니다.</li>
                    <li>• 결과가 동기화되면 즉시 관제 보드에 반영됩니다.</li>
                  </ul>
              </div>
            </div>
        ) : (
            // 관리자/작업자에게는 "보기 전용 모드" 안내만 작게 표시
            <div className="lg:col-span-4 space-y-6">
                 <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center h-[200px]">
                      <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-100">
                          <Eye className="w-6 h-6 text-slate-400" />
                      </div>
                      <h3 className="text-sm font-black text-slate-800 mb-1">분석 결과 조회 모드</h3>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                          제작자가 공유한 최신 분석 결과를 열람 중입니다.<br/>
                          데이터 변경 및 재분석은 <span className="font-bold text-slate-700">제작자(Creator)</span>만 가능합니다.
                      </p>
                 </div>
                 
                 {/* 분석 결과가 있을 때만 요약 표시 */}
                 {result && (
                     <div className="p-6 bg-emerald-50 rounded-[2rem] border border-emerald-100 text-emerald-800">
                         <div className="flex items-center mb-2">
                             <CheckCircle className="w-4 h-4 mr-2" />
                             <span className="text-xs font-black">Sync Completed</span>
                         </div>
                         <p className="text-[10px] opacity-80">
                             분석 데이터가 서버와 동기화되었습니다.
                         </p>
                     </div>
                 )}
            </div>
        )}

        <div className="lg:col-span-8 h-full">
            {isAnalyzing ? (
                <div className="h-full min-h-[500px] flex flex-col items-center justify-center bg-white rounded-[2.5rem] border border-slate-200 p-12 shadow-sm animate-pulse">
                    <div className="relative mb-10">
                        <div className="w-24 h-24 border-[6px] border-slate-100 border-t-brand-primary rounded-full animate-spin"></div>
                        <Zap className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-brand-primary w-10 h-10" />
                    </div>
                    <h3 className="text-xl font-black text-slate-800">동별 독립 구조 추출 및 분석 중...</h3>
                    <p className="text-sm text-slate-400 mt-3 text-center leading-relaxed">평면 가변성 및 고층부 비활성 세대 규칙을<br/>정밀 스캐닝하여 디지털 트윈 데이터로 변환하고 있습니다.</p>
                </div>
            ) : result ? (
                <div className="space-y-8 animate-fade-in-up pb-10">
                    <div className="bg-white p-8 md:p-12 rounded-[3rem] border border-slate-200 shadow-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-8 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-2 h-full bg-brand-primary"></div>
                        <div className="w-full sm:w-auto">
                            <div className="flex items-center space-x-2 mb-3">
                               <span className="px-2 py-0.5 bg-brand-primary text-white text-[9px] font-black rounded-lg uppercase tracking-widest">AI Result</span>
                               <span className="text-[10px] font-black text-slate-400 tracking-widest uppercase">Drawing Intelligence Report</span>
                            </div>
                            <h2 className="text-3xl md:text-4xl font-black text-slate-800 tracking-tighter leading-tight">{result.siteName}</h2>
                            <div className="flex items-center space-x-4 mt-4">
                                <p className="text-[10px] text-slate-400 font-mono uppercase tracking-widest">PRJ: {result.projectCode}</p>
                                <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                                <p className="text-[10px] text-slate-400 font-mono uppercase tracking-widest">SYNC: {new Date().toLocaleTimeString()}</p>
                            </div>
                        </div>
                        <div className="flex items-center bg-slate-50/80 px-8 py-6 rounded-[2rem] border border-slate-100 self-stretch sm:self-auto shadow-inner">
                             <Shield className={`w-12 h-12 mr-6 ${result.overallSafetyScore > 80 ? 'text-emerald-500' : 'text-brand-accent'}`} />
                             <div>
                                 <div className="text-[10px] text-slate-400 uppercase font-black tracking-widest mb-1">Safety Index</div>
                                 <div className="text-4xl font-black font-mono leading-none tracking-tighter">{result.overallSafetyScore}<span className="text-base text-slate-300 ml-1 font-normal">/100</span></div>
                             </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm min-h-[400px] flex flex-col relative overflow-hidden group">
                             <h4 className="font-black text-slate-800 text-xs flex items-center mb-8 uppercase tracking-widest relative z-10"><AlertOctagon className="w-4 h-4 mr-3 text-brand-accent" /> Risk Analysis Profile</h4>
                             <div className="flex-1 relative z-10">
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                                        <PolarGrid stroke="#e2e8f0" strokeWidth={1} gridType="polygon" />
                                        <PolarAngleAxis 
                                          dataKey="subject" 
                                          tick={{ fontSize: 11, fontWeight: 900, fill: '#334155' }} 
                                        />
                                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                        <Radar 
                                          name="Score" 
                                          dataKey="A" 
                                          stroke="#0055A5" 
                                          strokeWidth={4} 
                                          fill="#0055A5" 
                                          fillOpacity={0.2} 
                                          dot={{ r: 4, fill: '#0055A5', stroke: '#fff', strokeWidth: 2 }}
                                        />
                                        <Tooltip 
                                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', fontSize: '12px', fontWeight: 800 }} 
                                        />
                                    </RadarChart>
                                </ResponsiveContainer>
                             </div>
                             <div className="absolute top-0 right-0 w-64 h-64 bg-brand-primary/5 rounded-full blur-[80px] -mr-32 -mt-32"></div>
                        </div>

                        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col">
                             <h4 className="font-black text-slate-800 text-xs flex items-center mb-6 uppercase tracking-widest"><ClipboardList className="w-4 h-4 mr-3 text-brand-primary" /> Structional Synthesis</h4>
                             <div className="bg-slate-50 p-6 rounded-2xl text-[14px] text-slate-600 leading-relaxed border border-slate-100 font-bold mb-8 shadow-inner">
                                 {result.summary}
                             </div>
                             
                             <div className="space-y-4 flex-1">
                                 <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex justify-between items-center">
                                   <span>Detected Dynamic Structures</span>
                                   <span className="text-brand-primary">{result.buildingStructures.length} Buildings</span>
                                 </h5>
                                 <div className="grid grid-cols-1 gap-3 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
                                     {result.buildingStructures.map((s, idx) => (
                                         <div key={idx} className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-brand-primary transition-colors flex justify-between items-center">
                                             <div>
                                                 <div className="text-sm font-black text-slate-800">{s.name}</div>
                                                 <div className="text-[11px] text-slate-400 mt-1 uppercase font-mono">{s.totalFloors} FL / {s.unitsPerFloor} Units per level</div>
                                             </div>
                                             {s.deadUnitLogic ? (
                                                <div className="text-right">
                                                   <span className="text-[10px] bg-orange-50 text-brand-accent font-black px-3 py-1.5 rounded-lg border border-orange-100 flex items-center">
                                                     <AlertTriangle className="w-3 h-3 mr-1.5" /> {s.deadUnitLogic}
                                                   </span>
                                                </div>
                                             ) : (
                                               <div className="w-6 h-6 bg-emerald-50 rounded-full flex items-center justify-center border border-emerald-100"><Check className="w-3 h-3 text-emerald-500" /></div>
                                             )}
                                         </div>
                                     ))}
                                 </div>
                             </div>
                             
                             <button className="mt-8 w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center hover:bg-slate-800 transition-all shadow-lg active:scale-95">
                                <Download className="w-4 h-4 mr-3" /> Full Analysis PDF Export
                             </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 h-full min-h-[500px] flex flex-col items-center justify-center text-slate-400 bg-white rounded-[2.5rem] border border-slate-200 border-dashed p-12">
                    <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] flex items-center justify-center mb-8 opacity-40">
                      <ImageIcon className="w-10 h-10" />
                    </div>
                    {userRole === UserRole.CREATOR ? (
                        <>
                            <p className="text-lg font-black uppercase tracking-widest text-slate-300">Ready for Intelligence Scan</p>
                            <p className="text-sm mt-4 opacity-60 text-center leading-relaxed font-medium">단지 배치도, 층별 평면도, 또는 구조 일람표를 업로드하십시오.<br/>AI가 비활성 세대(죽은세대)를 포함한 전체 디지털 트윈을 구성합니다.</p>
                        </>
                    ) : (
                        <>
                            <p className="text-lg font-black uppercase tracking-widest text-slate-300">No Analysis Data</p>
                            <p className="text-sm mt-4 opacity-60 text-center leading-relaxed font-medium">아직 공유된 분석 결과가 없습니다.<br/>제작자가 도면 분석을 완료할 때까지 기다려주세요.</p>
                        </>
                    )}
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default AnalysisView;
