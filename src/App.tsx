/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { 
  Upload, 
  RotateCcw, 
  Download, 
  Printer,
  ArrowRight,
  CheckCircle2, 
  Loader2, 
  Camera, 
  Image as ImageIcon,
  User,
  Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { detectGenderAndGetPrompt, generateIdPhoto } from "./lib/gemini";

type Step = "upload" | "review-prompt" | "generating" | "result";

interface CropResult {
  url: string;
  label: string;
  ratio: string;
}

export default function App() {
  const [step, setStep] = useState<Step>("upload");
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [crops, setCrops] = useState<CropResult[]>([]);
  const [originalCrops, setOriginalCrops] = useState<CropResult[]>([]);
  const [activeCropIdx, setActiveCropIdx] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>("gemini-2.5-flash-image");
  const [previewImage, setPreviewImage] = useState<CropResult | null>(null);
  const [activeTypes, setActiveTypes] = useState<string[]>(["shirt"]);
  const [activeStyle, setActiveStyle] = useState<string>("solid");
  const [activeBg, setActiveBg] = useState<string>("blue");
  const [clothingHue, setClothingHue] = useState<number>(195);
  const [specialColor, setSpecialColor] = useState<"none" | "white" | "black">("none");
  const [gender, setGender] = useState<"Nam" | "Nữ">("Nam");
  const [history, setHistory] = useState<{ id: string; timestamp: number; crops: CropResult[] }[]>([]);
  const [activeSidebarTab, setActiveSidebarTab] = useState<"setup" | "outfit">("setup");

  const getColorName = (hue: number, special: "none" | "white" | "black" = "none") => {
    if (special === "white") return "trắng tinh khôi";
    if (special === "black") return "đen huyền bí chuyên nghiệp";

    if (hue >= 0 && hue < 15) return "đỏ đậm";
    if (hue >= 15 && hue < 30) return "đỏ cam";
    if (hue >= 30 && hue < 45) return "cam";
    if (hue >= 45 && hue < 75) return "vàng";
    if (hue >= 75 && hue < 105) return "vàng chanh";
    if (hue >= 105 && hue < 150) return "xanh lá";
    if (hue >= 150 && hue < 185) return "xanh ngọc";
    if (hue >= 185 && hue < 205) return "xanh da trời nhạt (baby blue)";
    if (hue >= 205 && hue < 235) return "xanh dương trung tính";
    if (hue >= 235 && hue < 260) return "xanh navy/xanh đậm";
    if (hue >= 260 && hue < 290) return "tím nhạt";
    if (hue >= 290 && hue < 320) return "hồng cánh sen";
    if (hue >= 320 && hue < 345) return "hồng đậm";
    if (hue >= 345 && hue <= 360) return "đỏ tươi";
    return "trắng";
  };

  const CLOTHING_TYPES = [
    { id: "shirt", label: "Sơ mi", desc: "formal white shirt with a sharp collar" },
    { id: "tie", label: "Cà vạt", desc: "professional shirt with a formal necktie" },
    { id: "vest", label: "Áo vest", desc: "formal business suit with a dark blazer and necktie" },
    { id: "aodai", label: "Áo dài", desc: "traditional Vietnamese Ao Dai with elegant details" },
    { id: "polo", label: "Áo Polo", desc: "clean professional polo shirt" },
    { id: "suit", label: "Suit (no tie)", desc: "formal suit blazer over a shirt without a necktie" },
    { id: "tshirt", label: "Áo thun", desc: "clean minimal crew neck t-shirt" },
  ];

  const CLOTHING_STYLES = [
    { id: "solid", label: "Màu trơn", desc: "clean solid color finish" },
    { id: "check", label: "Họa tiết Karo", desc: "classic checkered / plaid pattern" },
    { id: "pattern", label: "Họa tiết", desc: "subtle elegant patterns" },
  ];

  const BACKGROUND_COLORS = [
    { id: "blue", label: "Xanh Azure", desc: "solid Azure blue background", class: "bg-blue-600" },
    { id: "white", label: "Trắng", desc: "solid plain white background", class: "bg-white" },
    { id: "grey", label: "Xám nhạt", desc: "solid light gray professional background", class: "bg-gray-200" },
  ];

  const fileInputRef = useRef<HTMLInputElement>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load history from localStorage
    const saved = localStorage.getItem("ai_id_photo_history");
    if (saved) {
      try {
        setHistory(JSON.parse(saved).slice(0, 10)); // Keep only last 10
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("ai_id_photo_history", JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (lightboxRef.current && !lightboxRef.current.contains(event.target as Node)) {
        setPreviewImage(null);
      }
    };

    if (previewImage) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [previewImage]);

  const updatePrompt = (typeIds: string[], styleId: string, bgId: string, hue: number, currentGender?: "Nam" | "Nữ", special: "none" | "white" | "black" = "none") => {
    setActiveTypes(typeIds);
    setActiveStyle(styleId);
    setActiveBg(bgId);
    setClothingHue(hue);
    setSpecialColor(special);
    const g = currentGender || gender;
    if (currentGender) setGender(currentGender);
    
    const typeLabels: Record<string, string> = {
      shirt: "áo sơ mi cổ bẻ",
      tie: "thắt cà vạt trang trọng",
      vest: "áo vest ngoài",
      aodai: "áo dài truyền thống",
      polo: "áo polo",
      suit: "suit (không cà vạt)",
      tshirt: "áo thun"
    };

    const styleLabels: Record<string, string> = {
      solid: "không có họa tiết",
      check: "họa tiết kẻ caro",
      pattern: "có họa tiết"
    };

    const bgLabels: Record<string, string> = {
      blue: "xanh trời nhạt (blue sky)",
      white: "trắng sạch",
      grey: "xám nhạt"
    };

    const colorName = getColorName(hue, special);
    const selectedLabels = typeIds.map(id => typeLabels[id] || "");
    const clothingDesc = selectedLabels.join(" kết hợp với ");
    const styleLabel = styleLabels[styleId] || "không có họa tiết";
    const bgLabel = bgLabels[bgId] || "trắng sạch";

    let basePrompt = "";
    
    if (g === "Nam") {
      basePrompt = `Tạo một ảnh thẻ 1×1 chân thực (dựa trên ảnh tham chiếu đã tải lên) theo phong cách chụp chân dung chuyên nghiệp, trong trang phục ${clothingDesc} màu ${colorName} ${styleLabel} trang trọng phù hợp để xin việc và với biểu cảm trung tính. Khuôn mặt dựa trên ảnh tham chiếu 100%, xóa mụn và làm mịn da 70% nhưng vẫn giữ chi tiết lỗ chân lông, nếp nhăn của da để đảm bảo tính chân thật của da. Đảm bảo khuôn mặt giống hệt với người trong ảnh đã tải lên, không thay đổi cấu trúc khuôn mặt, mắt, mũi, miệng, tông màu da hoặc màu kiểu tóc. Không thay đổi bất kỳ đặc điểm nào trên khuôn mặt như mắt, mũi và miệng. Ánh sáng studio, phông nền ${bgLabel} không tạp chất và đổ bóng, nét rõ và sắc, chất lượng cao 8K. Kiểu tóc và các chi tiết trên khuôn mặt giữ nguyên. Làm cho hình ảnh cuối cùng trông chân thực, khuôn mặt được chiếu sáng đều.`;
    } else {
      basePrompt = `Tạo một ảnh thẻ 1×1 chân thực (dựa trên ảnh tham chiếu đã tải lên) theo phong cách chụp chân dung chuyên nghiệp, trong trang phục ${clothingDesc} màu ${colorName} ${styleLabel} trang trọng phù hợp để xin việc và với biểu cảm trung tính. Khuôn mặt dựa trên ảnh tham chiếu 100%, xóa mụn và làm mịn da 80% nhưng vẫn giữ chi tiết lỗ chân lông, nếp nhăn của da để đảm bảo tính chân thật của da. Đôi môi đầy đặn với sắc son hồng nhạt tự nhiên, hơi hé mở. Đảm bảo khuôn mặt giống hệt với người trong ảnh đã tải lên, không thay đổi cấu trúc khuôn mặt, mắt, mũi, miệng, tông màu da hoặc màu kiểu tóc. Không thay đổi bất kỳ đặc điểm nào trên khuôn mặt như mắt, mũi và miệng. Ánh sáng studio, phông nền ${bgLabel} không tạp chất và đổ bóng, nét rõ và sắc, chất lượng cao 8K. Kiểu tóc và các chi tiết trên khuôn mặt giữ nguyên. Làm cho hình ảnh cuối cùng trông chân thực, khuôn mặt được chiếu sáng đều.`;
    }

    setPrompt(basePrompt);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Vui lòng chọn tệp hình ảnh.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setOriginalImage(base64);
      setError(null);
      
      setIsLoading(true);
      try {
        const { gender: detectedGender } = await detectGenderAndGetPrompt(base64);
        
        // Use professional template based on detected gender
        updatePrompt(["shirt"], "solid", "white", 195, detectedGender as "Nam" | "Nữ", "none");
        
        setStep("review-prompt");
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Không thể nhận diện ảnh. Vui lòng thử lại với ảnh rõ nét hơn.");
        setOriginalImage(null);
        setStep("upload");
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleGenerate = async () => {
    if (!originalImage || !prompt) return;

    setIsLoading(true);
    setStep("generating");
    setError(null);

    try {
      const result = await generateIdPhoto(originalImage, prompt, selectedModel);
      setResultImage(result);
      
      // Create crops for BOTH original and result for comparison
      const [cropResults, origCropResults] = await Promise.all([
        createCrops(result),
        originalImage ? createCrops(originalImage) : Promise.resolve([])
      ]);

      setCrops(cropResults);
      setOriginalCrops(origCropResults);
      setStep("result");
      setActiveCropIdx(1);

      // Add to history
      setHistory(prev => [
        {
          id: Date.now().toString(),
          timestamp: Date.now(),
          crops: cropResults
        },
        ...prev
      ].slice(0, 5)); // Keep only last 5 in UI for "recent"
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Đã xảy ra lỗi khi tạo ảnh. Vui lòng thử lại.");
      setStep("review-prompt");
    } finally {
      setIsLoading(false);
    }
  };

  const createCrops = async (imageUrl: string): Promise<CropResult[]> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const results: CropResult[] = [];
        results.push({ label: "Ảnh 3x4", ratio: "3:4", url: getCroppedImage(img, 3/4) });
        results.push({ label: "Ảnh 4x6", ratio: "4:6", url: getCroppedImage(img, 2/3) });
        resolve(results);
      };
      img.src = imageUrl;
    });
  };

  const getCroppedImage = (img: HTMLImageElement, aspectRatio: number): string => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    let width = img.width;
    let height = img.height;
    let cropWidth, cropHeight;
    if (width / height > aspectRatio) {
      cropHeight = height;
      cropWidth = height * aspectRatio;
    } else {
      cropWidth = width;
      cropHeight = width / aspectRatio;
    }
    const startX = (width - cropWidth) / 2;
    const startY = (height - cropHeight) / 2;
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    ctx.drawImage(img, startX, startY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    return canvas.toDataURL("image/jpeg", 0.9);
  };

  const downloadImage = (url: string, filename: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = (imageUrl: string) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>In Ảnh Thẻ</title>
          <style>
            @page {
              size: A4;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              display: flex;
              flex-direction: column;
              align-items: center;
              background-color: white;
            }
            .a4-container {
              width: 210mm;
              height: 297mm;
              position: relative;
              background: white;
              padding-top: 20mm; /* Start point */
            }
            .row-container {
              display: flex;
              justify-content: center;
              align-items: flex-start;
              position: relative;
            }
            .photo-strip {
              display: flex;
              border: 0.1mm solid #ccc; /* Very light border to see boundaries if white bg */
            }
            .photo {
              width: 38mm;
              height: 57.1mm;
              display: block;
              object-fit: cover;
            }
            /* Alignment / Crop Marks */
            .guide-lines {
              position: absolute;
              pointer-events: none;
            }
            /* Vertical lines at start and end */
            .line-v {
              position: absolute;
              top: -10mm;
              bottom: -10mm;
              width: 0.1mm;
              background: #666;
            }
            .line-v-start { left: 0; }
            .line-v-end { right: 0; }
            
            /* Horizontal lines at top and bottom */
            .line-h {
              position: absolute;
              left: -10mm;
              right: -10mm;
              height: 0.1mm;
              background: #666;
            }
            .line-h-top { top: 0; }
            .line-h-bottom { bottom: 0; }

            @media print {
              .no-print { display: none; }
              body { background: white; }
            }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="a4-container">
            <div class="row-container">
              <!-- Guides -->
              <div class="line-h line-h-top"></div>
              <div class="line-h line-h-bottom"></div>
              <div class="line-v line-v-start"></div>
              <div class="line-v line-v-end"></div>
              
              <div class="photo-strip">
                <img src="${imageUrl}" class="photo" />
                <img src="${imageUrl}" class="photo" />
                <img src="${imageUrl}" class="photo" />
                <img src="${imageUrl}" class="photo" />
                <img src="${imageUrl}" class="photo" />
              </div>
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const reset = () => {
    setStep("upload");
    setOriginalImage(null);
    setGender("Nam");
    setPrompt("");
    setResultImage(null);
    setCrops([]);
    setOriginalCrops([]);
    setActiveCropIdx(1);
    setError(null);
  };

  return (
    <div className="flex flex-col w-full h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans selection:bg-amber-400 selection:text-slate-950">
      {/* Header Section */}
      <header className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-3 cursor-pointer" onClick={reset}>
          <div className="w-8 h-8 bg-amber-400 rounded-lg flex items-center justify-center">
            <span className="text-slate-950 font-black text-xs">ID</span>
          </div>
          <h1 className="text-lg font-bold tracking-tight">AI Photo <span className="text-amber-400">Pro</span></h1>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2 px-3 py-1 bg-slate-800 rounded-full border border-slate-700 text-xs">
            <span className={`w-2 h-2 rounded-full ${isLoading ? 'bg-amber-400 animate-pulse' : 'bg-green-500'}`}></span>
            {isLoading ? 'Processing' : 'Engine Ready'}
          </div>
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden">
        {/* Sidebar Controls */}
        <aside className="w-80 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 z-10 overflow-hidden">
          {/* Tab Switcher */}
          <div className="flex p-2 bg-slate-950/50 border-b border-slate-800">
            <button 
              onClick={() => setActiveSidebarTab("setup")}
              className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeSidebarTab === "setup" ? 'bg-slate-800 text-amber-400 border border-slate-700 shadow-lg' : 'text-slate-500 hover:text-slate-400'}`}
            >
              Cấu hình
            </button>
            <button 
              onClick={() => setActiveSidebarTab("outfit")}
              className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeSidebarTab === "outfit" ? 'bg-slate-800 text-amber-400 border border-slate-700 shadow-lg' : 'text-slate-500 hover:text-slate-400'}`}
            >
              Trang phục
            </button>
          </div>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-8">
            {activeSidebarTab === "setup" ? (
              <>
                {/* Step 1 */}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-[10px] font-black">1</div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">Ảnh gốc</h2>
                  </div>
                  <div 
                    onClick={handleUploadClick}
                    className="group relative h-40 border-2 border-dashed border-slate-700 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-amber-400 hover:bg-slate-800 transition-all cursor-pointer bg-slate-900/50 overflow-hidden"
                  >
                    {originalImage ? (
                      <>
                        <img src={originalImage} className="absolute inset-0 w-full h-full object-cover opacity-30 group-hover:opacity-40 transition-opacity" />
                        <CheckCircle2 className="w-8 h-8 text-green-500 z-10" />
                        <span className="text-xs font-mono text-slate-300 z-10">Ảnh đã tải lên</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-slate-500 group-hover:text-amber-400" />
                        <span className="text-sm text-slate-400">Chọn hoặc thả ảnh chân dung</span>
                      </>
                    )}
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
                  </div>
                </section>

                {/* Step 2 */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between shrink-0 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-[10px] font-black">2</div>
                      <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">AI Prompt</h2>
                    </div>
                    <div className="flex gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800">
                      <button 
                        onClick={() => setSelectedModel("gemini-3.1-flash-image-preview")}
                        className={`px-2 py-0.5 text-[10px] rounded font-bold transition-all ${selectedModel === "gemini-3.1-flash-image-preview" ? 'bg-amber-400 text-slate-950' : 'text-slate-500 hover:text-slate-300'}`}
                        title="Nano Banana 2 (High Quality)"
                      >
                        NB2
                      </button>
                      <button 
                        onClick={() => setSelectedModel("gemini-2.5-flash-image")}
                        className={`px-2 py-0.5 text-[10px] rounded font-bold transition-all ${selectedModel === "gemini-2.5-flash-image" ? 'bg-amber-400 text-slate-950' : 'text-slate-500 hover:text-slate-300'}`}
                        title="Nano Banana 1 (Fallback)"
                      >
                        NB1
                      </button>
                    </div>
                  </div>
                  <textarea 
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={step === "upload" || isLoading}
                    className="w-full h-48 bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm font-mono text-amber-200 focus:outline-none focus:ring-1 focus:ring-amber-500/50 resize-none disabled:opacity-30 transition-all shadow-inner"
                    placeholder="AI prompt sẽ xuất hiện ở đây sau khi bạn tải ảnh..."
                  />
                </section>
              </>
            ) : (
              /* Step 1.5: Clothing Options */
              <section className="shrink-0 space-y-6 animate-in fade-in slide-in-from-left-4 duration-300">
                <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                  <div className="w-5 h-5 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-[10px] font-black">1.5</div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">Tùy chỉnh trang phục</h2>
                </div>
                
                <div className="space-y-6">
                  <div className="grid grid-cols-1 gap-2">
                    <span className="text-[10px] font-bold text-slate-600 uppercase">Giới tính:</span>
                    <div className="flex gap-2">
                      {(["Nam", "Nữ"] as const).map(g => (
                        <button
                          key={g}
                          onClick={() => updatePrompt(activeTypes, activeStyle, activeBg, clothingHue, g, specialColor)}
                          disabled={step === "upload" || isLoading}
                          className={`flex-1 py-2 text-[10px] font-bold uppercase rounded-lg border transition-all ${gender === g ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-lg shadow-amber-400/10' : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-600'}`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <span className="text-[10px] font-bold text-slate-600 uppercase">Loại áo (chọn nhiều):</span>
                    <div className="flex flex-wrap gap-2">
                      {CLOTHING_TYPES.map(t => {
                        const isActive = activeTypes.includes(t.id);
                        return (
                          <button
                            key={t.id}
                            onClick={() => {
                              const next = isActive 
                                ? activeTypes.filter(id => id !== t.id)
                                : [...activeTypes, t.id];
                              if (next.length === 0) next.push("shirt");
                              updatePrompt(next, activeStyle, activeBg, clothingHue, gender, specialColor);
                            }}
                            disabled={step === "upload" || isLoading}
                            className={`px-3 py-1.5 text-[10px] font-bold uppercase rounded-lg border transition-all ${isActive ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-lg shadow-amber-400/10' : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-600'}`}
                          >
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <span className="text-[10px] font-bold text-slate-600 uppercase flex justify-between">
                      Màu sắc: <span className="text-amber-400">{getColorName(clothingHue, specialColor).toUpperCase()}</span>
                    </span>
                    <div className="flex gap-2 mb-1">
                      <button 
                        onClick={() => updatePrompt(activeTypes, activeStyle, activeBg, clothingHue, gender, "white")}
                        className={`flex-1 py-1 text-[9px] font-black uppercase border rounded-md transition-all ${specialColor === "white" ? 'bg-white text-slate-950 border-white' : 'bg-slate-950 text-white border-slate-800'}`}
                      >
                        Màu Trắng
                      </button>
                      <button 
                        onClick={() => updatePrompt(activeTypes, activeStyle, activeBg, clothingHue, gender, "black")}
                        className={`flex-1 py-1 text-[9px] font-black uppercase border rounded-md transition-all ${specialColor === "black" ? 'bg-slate-200 text-slate-950 border-white' : 'bg-slate-950 text-slate-400 border-slate-800'}`}
                      >
                        Màu Đen
                      </button>
                      <button 
                        onClick={() => updatePrompt(activeTypes, activeStyle, activeBg, clothingHue, gender, "none")}
                        className={`flex-1 py-1 text-[9px] font-black uppercase border rounded-md transition-all ${specialColor === "none" ? 'bg-amber-400 text-slate-950 border-amber-400' : 'bg-slate-950 text-slate-400 border-slate-800'}`}
                      >
                        Dải Màu
                      </button>
                    </div>
                    {specialColor === "none" && (
                      <div className="relative h-6 flex items-center group">
                        <input 
                          type="range"
                          min="0"
                          max="360"
                          value={clothingHue}
                          onChange={(e) => updatePrompt(activeTypes, activeStyle, activeBg, parseInt(e.target.value), gender, "none")}
                          disabled={step === "upload" || isLoading}
                          className="w-full h-3 rounded-full appearance-none cursor-pointer outline-none transition-opacity disabled:opacity-30"
                          style={{
                            background: "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)"
                          }}
                        />
                        <div className="absolute inset-0 pointer-events-none rounded-full border border-slate-800 ring-2 ring-slate-950" />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <span className="text-[10px] font-bold text-slate-600 uppercase">Kiểu dáng / Họa tiết:</span>
                    <div className="grid grid-cols-3 gap-2">
                      {CLOTHING_STYLES.map(s => (
                        <button
                          key={s.id}
                          onClick={() => updatePrompt(activeTypes, s.id, activeBg, clothingHue, gender, specialColor)}
                          disabled={step === "upload" || isLoading}
                          className={`px-1 py-1.5 text-[9px] font-bold uppercase rounded-lg border transition-all truncate text-center ${activeStyle === s.id ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-lg shadow-amber-400/10' : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-600'}`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <span className="text-[10px] font-bold text-slate-600 uppercase">Màu phông nền:</span>
                    <div className="grid grid-cols-3 gap-2">
                      {BACKGROUND_COLORS.map(b => (
                        <button
                          key={b.id}
                          onClick={() => updatePrompt(activeTypes, activeStyle, b.id, clothingHue, gender, specialColor)}
                          disabled={step === "upload" || isLoading}
                          className={`flex items-center justify-center gap-1 px-2 py-2 text-[9px] font-bold uppercase rounded-lg border transition-all ${activeBg === b.id ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-lg shadow-amber-400/10' : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-600'}`}
                        >
                          <div className={`w-2.5 h-2.5 rounded-full border border-slate-700 shrink-0 ${b.class}`} />
                          <span className="truncate">{b.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>

          {/* Footer Actions */}
          <div className="p-5 border-t border-slate-800 bg-slate-900/80 backdrop-blur-sm shrink-0">
            <div className="flex gap-2">
              <button 
                onClick={handleGenerate}
                disabled={!prompt || isLoading}
                className="flex-1 py-4 bg-amber-400 text-slate-950 rounded-xl font-bold uppercase tracking-widest text-sm hover:bg-amber-300 transition-colors shadow-lg shadow-amber-900/20 active:scale-95 transform disabled:opacity-20 disabled:cursor-not-allowed shrink-0 overflow-hidden"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2 font-black">
                    <Loader2 className="animate-spin" size={16} />
                    <span>ĐANG CHẠY...</span>
                  </div>
                ) : "CHỈNH SỬA"}
              </button>
              
              {isLoading && (
                <button 
                  onClick={reset}
                  className="px-4 py-4 bg-red-900/40 border border-red-500/30 text-red-100 hover:bg-red-800 rounded-xl transition-all shadow-sm active:scale-95 font-bold text-xs uppercase"
                >
                  Dừng
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Main Output Area */}
        <div className="flex-1 bg-slate-950 p-8 overflow-y-auto relative">
          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-8 left-8 right-8 z-50 p-4 bg-red-900/20 border border-red-500/50 rounded-xl text-red-200 text-sm flex items-center gap-3 backdrop-blur-md"
              >
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="flex-1">{error}</span>
                <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">✕</button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex-1 flex flex-col items-center justify-center pt-8">
            <AnimatePresence mode="wait">
              {step === "upload" && !isLoading && (
                <motion.div 
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center space-y-4"
                >
                  <div className="w-24 h-24 rounded-full border border-slate-800 flex items-center justify-center mx-auto text-slate-800">
                    <ImageIcon size={48} />
                  </div>
                  <p className="text-slate-600 font-mono text-sm max-w-xs uppercase tracking-widest">Vui lòng tải ảnh lên từ bên trái để bắt đầu</p>
                </motion.div>
              )}

              {isLoading && (
                <motion.div 
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-6"
                >
                  <div className="relative">
                    <div className="w-32 h-32 border-4 border-slate-900 rounded-full" />
                    <div className="w-32 h-32 border-4 border-amber-400 rounded-full border-t-transparent animate-spin absolute inset-0 shadow-[0_0_15px_-3px_rgba(251,191,36,0.5)]" />
                    <Sparkles className="absolute inset-0 m-auto text-amber-400 animate-pulse" size={40} />
                  </div>
                  <div className="text-center">
                    <h3 className="text-amber-400 font-bold uppercase tracking-widest">Nano Banana v2 Processing</h3>
                    <p className="text-slate-500 text-xs mt-2 font-mono italic">Mô hình hóa trang phục, ánh sáng và phông nền...</p>
                  </div>
                </motion.div>
              )}

              {step === "result" && crops.length > 0 && (
                <motion.div 
                   key="results"
                   initial={{ opacity: 0, scale: 0.95 }}
                   animate={{ opacity: 1, scale: 1 }}
                   className="flex flex-col items-center gap-8 w-full max-w-5xl mx-auto"
                >
                  <div className="flex flex-col items-center gap-6 group w-full">
                    <div className="flex gap-4 md:gap-8 items-center justify-center w-full">
                      {/* Original Comparison */}
                      {originalCrops.length > 0 && (
                        <div className="flex flex-col items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Ảnh gốc (đã crop)</span>
                          <div className={`relative bg-slate-900 rounded-xl p-2 border border-slate-800/50 opacity-60 ${crops[activeCropIdx].ratio === "3:4" ? 'w-[150px] h-[200px] md:w-[225px] md:h-[300px]' : 'w-[140px] h-[210px] md:w-[210px] md:h-[315px]'}`}>
                            <img src={originalCrops[activeCropIdx].url} className="w-full h-full object-cover rounded-lg" alt="Original Crop" />
                          </div>
                        </div>
                      )}

                      <div className="flex items-center text-slate-700">
                        <ArrowRight size={24} />
                      </div>

                      {/* Result */}
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500">Kết quả AI</span>
                        <div 
                          onClick={() => setPreviewImage(crops[activeCropIdx])}
                          className="relative bg-slate-900 rounded-xl p-3 border border-slate-800 shadow-2xl transition-all group-hover:border-amber-400/30 cursor-pointer"
                        >
                          <div className="text-[10px] absolute -top-3 left-4 px-2 py-0.5 bg-amber-400 text-slate-950 font-bold uppercase rounded shadow-sm z-10">
                            {crops[activeCropIdx].ratio} Ratio
                          </div>
                          <div className={`relative bg-slate-800 rounded-lg overflow-hidden flex items-center justify-center ${crops[activeCropIdx].ratio === "3:4" ? 'w-[200px] h-[266px] md:w-[300px] md:h-[400px]' : 'w-[186px] h-[280px] md:w-[280px] md:h-[420px]'}`}>
                            <img src={crops[activeCropIdx].url} className="w-full h-full object-cover" alt={crops[activeCropIdx].label} />
                            <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <span className="text-[10px] font-black uppercase tracking-widest text-white bg-slate-950/80 px-4 py-2 rounded-full border border-white/20">Xem ảnh lớn</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-center gap-4 w-full">
                      <div className="flex items-center gap-2 p-1.5 bg-slate-900 rounded-xl border border-slate-800">
                        {crops.map((crop, idx) => (
                          <button
                            key={idx}
                            onClick={() => setActiveCropIdx(idx)}
                            className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${activeCropIdx === idx ? 'bg-amber-400 text-slate-950 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                          >
                            Tỉ lệ {crop.ratio}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-3 w-full max-w-sm">
                        <button 
                          onClick={() => downloadImage(crops[activeCropIdx].url, `photo_${crops[activeCropIdx].ratio.replace(':','x')}.jpg`)}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-amber-400 text-slate-950 hover:bg-amber-300 rounded-xl transition-all font-black uppercase tracking-widest text-[10px] shadow-lg shadow-amber-900/20 active:scale-95"
                        >
                          <Download size={14} />
                          Tải {crops[activeCropIdx].label}
                        </button>
                        <button 
                          onClick={() => handlePrint(crops[activeCropIdx].url)}
                          className="w-1/3 flex items-center justify-center gap-2 py-2.5 bg-slate-800 text-slate-200 hover:bg-slate-700 rounded-xl transition-all font-bold uppercase tracking-wider text-[10px] border border-slate-700 active:scale-95"
                          title="In 5 ảnh ra tờ A4"
                        >
                          <Printer size={14} />
                          In Ảnh
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right History Panel */}
        <aside className="w-24 bg-slate-900 border-l border-slate-800 flex flex-col items-center py-6 gap-6 shrink-0 z-10 overflow-y-auto custom-scrollbar">
          <div className="flex flex-col items-center gap-1">
            <h2 className="text-[10px] font-bold uppercase tracking-tighter text-slate-500 whitespace-nowrap">Gần đây</h2>
            {history.length > 0 && (
              <button 
                onClick={() => setHistory([])} 
                className="text-[8px] text-slate-600 hover:text-red-400 uppercase font-bold"
              >
                Xóa
              </button>
            )}
          </div>
          
          <div className="flex flex-col gap-4 px-3 w-full">
            {history.map((item) => (
              <motion.div 
                key={item.id} 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={() => {
                  setCrops(item.crops);
                  setStep("result");
                  setActiveCropIdx(1);
                  setResultImage(item.crops[0].url);
                }}
                className="w-full aspect-square bg-slate-800 rounded-lg border border-slate-700 overflow-hidden cursor-pointer hover:border-amber-400 transition-all hover:scale-110 active:scale-95 shadow-lg group relative"
              >
                <img src={item.crops[0].url} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-amber-400/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              </motion.div>
            ))}
            
            {history.length === 0 && (
              <div className="flex flex-col items-center gap-2 opacity-10 py-10">
                <ImageIcon size={20} />
              </div>
            )}
          </div>
        </aside>
      </main>

      {/* Lightbox */}
      <AnimatePresence>
        {previewImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-sm flex items-center justify-center p-4 sm:p-12"
          >
            <div 
              ref={lightboxRef}
              className="relative max-w-full max-h-full flex flex-col items-center gap-6"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                className="relative bg-slate-900 p-2 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden"
              >
                <img 
                  src={previewImage.url} 
                  alt="Preview" 
                  className="max-w-full max-h-[70vh] object-contain rounded-lg"
                />
                <button 
                  onClick={() => setPreviewImage(null)}
                  className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-slate-950/80 hover:bg-slate-950 rounded-full text-white border border-white/10 transition-colors"
                >
                  ✕
                </button>
              </motion.div>
              
              <div className="flex flex-col items-center gap-3">
                <h3 className="text-amber-400 font-bold uppercase tracking-widest text-lg">{previewImage.label} ({previewImage.ratio})</h3>
                <div className="flex items-center gap-4 w-full max-w-sm">
                  <button 
                    onClick={() => downloadImage(previewImage.url, `photo_${previewImage.ratio.replace(':','x')}.jpg`)}
                    className="flex-1 py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black uppercase tracking-widest text-xs rounded-xl transition-all shadow-lg shadow-amber-900/40 flex items-center justify-center gap-3 active:scale-95"
                  >
                    <Download size={16} />
                    Tải Ảnh Xuống
                  </button>
                  <button 
                    onClick={() => handlePrint(previewImage.url)}
                    className="w-1/3 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold uppercase tracking-wider text-xs rounded-xl transition-all border border-slate-700 flex items-center justify-center gap-3 active:scale-95"
                  >
                    <Printer size={16} />
                    In Ảnh
                  </button>
                </div>
                <p className="text-slate-500 text-[10px] font-mono mt-2">CLICK BÊN NGOÀI ĐỂ ĐÓNG</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="h-10 bg-slate-900 border-t border-slate-800 flex items-center px-6 text-[10px] text-slate-600 font-mono space-x-6 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
          <span>PROCESSOR: IMAGEN-3-NANO-BANANA-2</span>
        </div>
        <span>ENGINE: GEMINI-3-FLASH</span>
        <span>OUTPUT: 4K SUPER RES</span>
        <div className="flex-1"></div>
        <span className="text-slate-500">SYSTEM STATUS: <span className="text-green-500 font-bold">OPTIMIZED</span></span>
      </footer>
    </div>
  );
}
