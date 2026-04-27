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
  User as UserIcon,
  Sparkles,
  Settings,
  Key,
  ShieldCheck,
  Zap
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { generateIdPhoto, testApiKey } from "./lib/gemini";
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, db } from "./lib/firebase";
import type { User } from "./lib/firebase";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, increment } from "firebase/firestore";

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
  const [typeConfigs, setTypeConfigs] = useState<Record<string, { h: number; s: number }>>({ shirt: { h: 195, s: 70 } });
  const [focusedType, setFocusedType] = useState<string>("shirt");
  const [activeStyle, setActiveStyle] = useState<string>("solid");
  const [activeBg, setActiveBg] = useState<string>("white");
  const [lightingIntensity, setLightingIntensity] = useState<number>(75);
  const [lightingDirection, setLightingDirection] = useState<string>("front");
  const [gender, setGender] = useState<"Nam" | "Nữ">("Nam");
  const [history, setHistory] = useState<{ id: string; timestamp: number; crops: CropResult[] }[]>([]);
  const [activeSidebarTab, setActiveSidebarTab] = useState<"setup" | "outfit">("setup");
  const [showSettings, setShowSettings] = useState(false);
  const [userApiKey, setUserApiKey] = useState<string>("");
  const [userBearerToken, setUserBearerToken] = useState<string>("");
  const [authMethod, setAuthMethod] = useState<'apikey' | 'bearer'>('apikey');
  const [apiStatus, setApiStatus] = useState<'ok' | 'fail' | 'checking' | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [userUsage, setUserUsage] = useState<{ totalGenerations: number } | null>(null);

  const MODEL_OPTIONS = [
    { id: "gemini-2.5-flash-image", label: "NB 1", desc: "Nano Banana 1 (Tốc độ)" },
    { id: "gemini-3.1-flash-image-preview", label: "NB 2", desc: "Nano Banana 2 (Chất lượng)" },
    { id: "gemini-3-pro-image-preview", label: "Pro", desc: "Nano Banana Pro (Trung thực)" },
  ];

  // Hàm lấy tên màu sắc dựa trên giá trị tông màu (h) và độ bão hòa (s)
  const getColorName = (h: number, s: number = 70) => {
    let intensity = "";
    if (s < 30) intensity = " rất nhạt (pastel)";
    else if (s < 55) intensity = " nhạt";
    else if (s > 85) intensity = " đậm rực rỡ";

    if (h > 360) {
      if (h <= 370) return "trắng tinh khôi";
      if (h <= 385) return "xám nhạt / ghi sáng";
      if (h <= 395) return "xám đậm / màu ghi";
      return "đen chuyên nghiệp";
    }

    let color = "trắng";
    if (h >= 0 && h < 15) color = "đỏ đậm";
    else if (h >= 15 && h < 30) color = "đỏ cam";
    else if (h >= 30 && h < 45) color = "cam";
    else if (h >= 45 && h < 75) color = "vàng";
    else if (h >= 75 && h < 105) color = "vàng chanh";
    else if (h >= 105 && h < 150) color = "xanh lá";
    else if (h >= 150 && h < 185) color = "xanh ngọc";
    else if (h >= 185 && h < 205) color = "xanh da trời nhạt (baby blue)";
    else if (h >= 205 && h < 235) color = "xanh dương trung tính";
    else if (h >= 235 && h < 260) color = "xanh navy / xanh đậm";
    else if (h >= 260 && h < 290) color = "tím nhạt";
    else if (h >= 290 && h < 320) color = "hồng cánh sen";
    else if (h >= 320 && h < 345) color = "hồng đậm";
    else if (h >= 345 && h <= 360) color = "đỏ tươi";

    return color + intensity;
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

  const LIGHTING_DIRECTIONS = [
    { id: "front", label: "Trực diện", prompt: "balanced front studio lighting" },
    { id: "left", label: "Bên trái", prompt: "rim lighting from the left side" },
    { id: "right", label: "Bên phải", prompt: "rim lighting from the right side" },
    { id: "top", label: "Từ trên", prompt: "overhead butterfly lighting" },
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

    const savedKey = localStorage.getItem("ai_id_photo_user_api_key");
    if (savedKey) {
      setUserApiKey(savedKey);
    }
    
    const savedToken = localStorage.getItem("ai_id_photo_bearer_token");
    if (savedToken) {
      setUserBearerToken(savedToken);
    }
    
    const savedAuthMethod = localStorage.getItem("ai_id_photo_auth_method") as "apikey" | "bearer" | null;
    if (savedAuthMethod) {
      setAuthMethod(savedAuthMethod);
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        fetchUserUsage(currentUser.uid);
      } else {
        setUserUsage(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const fetchUserUsage = async (uid: string) => {
    try {
      const docRef = doc(db, "user_usage", uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setUserUsage(docSnap.data() as any);
      } else {
        const initialData = {
          uid,
          email: auth.currentUser?.email || "",
          totalGenerations: 0,
          lastGenerationAt: serverTimestamp()
        };
        await setDoc(docRef, initialData);
        setUserUsage(initialData as any);
      }
    } catch (e) {
      console.error("Error fetching usage:", e);
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error("Login error:", e);
      setError("Đăng nhập thất bại. Vui lòng thử lại.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Logout error:", e);
    }
  };

  useEffect(() => {
    localStorage.setItem("ai_id_photo_history", JSON.stringify(history));
  }, [history]);

  const saveApiKeys = () => {
    localStorage.setItem("ai_id_photo_user_api_key", userApiKey);
    localStorage.setItem("ai_id_photo_bearer_token", userBearerToken);
    localStorage.setItem("ai_id_photo_auth_method", authMethod);
    setShowSettings(false);
  };

  const checkQuota = async () => {
    const key = authMethod === 'apikey' ? (userApiKey || process.env.GEMINI_API_KEY || "") : "";
    const token = authMethod === 'bearer' ? userBearerToken : "";
    
    if (!key && !token) return;

    setApiStatus('checking');
    const result = await testApiKey(key, "gemini-3-flash-preview", token || undefined);
    setApiStatus(result.success ? 'ok' : 'fail');
  };

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

  const updatePrompt = (
    typeIds: string[], 
    styleId: string, 
    bgId: string, 
    configsMap: Record<string, { h: number; s: number }>, 
    currentGender?: "Nam" | "Nữ",
    lintensity?: number,
    ldirection?: string
  ) => {
    setActiveTypes(typeIds);
    setActiveStyle(styleId);
    setActiveBg(bgId);
    setTypeConfigs(configsMap);
    
    const g = currentGender || gender;
    if (currentGender) setGender(currentGender);
    
    const li = lintensity !== undefined ? lintensity : lightingIntensity;
    const ld = ldirection !== undefined ? ldirection : lightingDirection;
    
    setLightingIntensity(li);
    setLightingDirection(ld);
    
    // Nhãn Tiếng Việt cho các lựa chọn
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
      pattern: "có họa tiết tinh tế"
    };

    const bgLabels: Record<string, string> = {
      blue: "xanh Azure",
      white: "trắng sạch",
      grey: "xám nhạt"
    };

    // Tạo mô tả chi tiết trang phục kèm màu sắc từng món
    const clothingParts = typeIds.map(id => {
      const label = typeLabels[id] || "";
      const config = configsMap[id] ?? { h: 195, s: 70 };
      const color = getColorName(config.h, config.s);
      return `${label} màu ${color}`;
    });
    
    const clothingDesc = clothingParts.join(", ");
    const styleLabel = styleLabels[styleId] || "không có họa tiết";
    const bgLabel = bgLabels[bgId] || "trắng sạch";

    // Lighting details
    const lightingOpt = LIGHTING_DIRECTIONS.find(l => l.id === ld) || LIGHTING_DIRECTIONS[0];
    const intensityDesc = li > 85 ? "very bright professional" : li < 35 ? "soft subtle" : "balanced";
    const lightingDesc = `${intensityDesc} ${lightingOpt.prompt}`;

    let basePrompt = `[SYSTEM INSTRUCTION] This is a professional ID photo replacement task. You must keep the face of the person in the attached image EXACTLY the same. Change ONLY the clothes, the background, and the lighting according to the requirements below.

[REQUIREMENTS]
1. FACE: Keep 100% of the person's identity, facial structures, eyes, nose, mouth, skin tone, and hair from the reference image.
2. CLOTHING: Replace current clothes with: ${clothingDesc}, ${styleLabel}. The attire should be professional for a job ID.
3. BACKGROUND: Replace current background with: ${bgLabel} (plain, solid color, no gradients, no shadows).
4. LIGHTING: Use ${lightingDesc}.
5. STYLE: Professional passport-style headshot, sharp focus, neutral expression.

[PROMPT]
Tạo một ảnh thẻ chân thực dựa trên người trong ảnh tham chiếu. 
Giữ nguyên khuôn mặt và đặc điểm nhận dạng. 
Trang phục: ${clothingDesc}, ${styleLabel}, lịch sự. 
Phông nền: ${bgLabel}, trơn.
Ánh sáng: studio, ${lightingOpt.label.toLowerCase()}, cường độ ${li}%.`;

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
      
      // Không cần phân tích giới tính nữa, mặc định sử dụng giới tính hiện tại hoặc cho phép người dùng chọn
      updatePrompt(activeTypes, activeStyle, activeBg, typeConfigs, gender);
      setFocusedType("shirt");
      setStep("review-prompt");
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

    const modelsToTry = [
      selectedModel,
      ...MODEL_OPTIONS.map(m => m.id).filter(id => id !== selectedModel)
    ];

    let lastError = "";
    let success = false;

    for (const modelId of modelsToTry) {
      try {
        const result = await generateIdPhoto(
          originalImage, 
          prompt, 
          modelId, 
          authMethod === 'apikey' ? (userApiKey || undefined) : undefined, 
          authMethod === 'bearer' ? (userBearerToken || undefined) : undefined
        );
        setResultImage(result);
        
        // Update usage in Firestore if logged in
        if (user) {
          const docRef = doc(db, "user_usage", user.uid);
          await updateDoc(docRef, {
            totalGenerations: increment(1),
            lastGenerationAt: serverTimestamp()
          });
          fetchUserUsage(user.uid);
        }
        
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
        
        success = true;
        break; // Exit loop on success
      } catch (err: any) {
        console.error(`Error with model ${modelId}:`, err);
        lastError = err.message || "Đã xảy ra lỗi khi tạo ảnh.";
        
        // If not a quota error or permission error, don't bother trying other models (likely a prompt/safety issue)
        if (!lastError.includes("429") && !lastError.includes("hạn mức") && !lastError.includes("403") && !lastError.includes("quyền truy cập")) {
          break;
        }
        
        // If it is a quota error, the loop will continue to try the next model
      }
    }

    if (!success) {
      setError(lastError);
      setStep("review-prompt");
    }
    
    setIsLoading(false);
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
    setActiveBg("white");
    setLightingIntensity(75);
    setLightingDirection("front");
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
          {user ? (
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-bold text-slate-300">{user.displayName || user.email}</span>
                <span className="text-[8px] text-amber-400 uppercase font-black">Quota: {userUsage?.totalGenerations || 0} used</span>
              </div>
              <button 
                onClick={handleLogout}
                className="p-2 bg-slate-800 hover:bg-red-900/40 text-slate-400 hover:text-red-400 rounded-lg border border-slate-700 transition-all"
                title="Đăng xuất"
              >
                <RotateCcw size={14} />
              </button>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              className="flex items-center gap-2 px-4 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg shadow-lg shadow-amber-900/20 transition-all text-xs font-black uppercase tracking-wider"
            >
              <UserIcon size={14} />
              <span>Đăng nhập</span>
            </button>
          )}
          <button 
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-2 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-400 rounded-lg border border-slate-700 transition-all text-xs font-bold"
          >
            <Settings size={14} />
            <span>Cài đặt API</span>
          </button>
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
                    <div className="flex gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800 overflow-x-auto custom-scrollbar">
                      {MODEL_OPTIONS.map(opt => (
                        <button 
                          key={opt.id}
                          onClick={() => setSelectedModel(opt.id)}
                          className={`px-2 py-0.5 text-[10px] rounded font-bold transition-all whitespace-nowrap ${selectedModel === opt.id ? 'bg-amber-400 text-slate-950' : 'text-slate-500 hover:text-slate-300'}`}
                          title={opt.desc}
                        >
                          {opt.label}
                        </button>
                      ))}
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
                          onClick={() => updatePrompt(activeTypes, activeStyle, activeBg, typeConfigs, g)}
                          disabled={step === "upload" || isLoading}
                          className={`flex-1 py-2 text-[10px] font-bold uppercase rounded-lg border transition-all ${gender === g ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-lg shadow-amber-400/10' : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-600'}`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <span className="text-[10px] font-bold text-slate-600 uppercase">Loại áo (chọn nhiều - nhấn để chỉnh màu):</span>
                    <div className="flex flex-wrap gap-2">
                      {CLOTHING_TYPES.map(t => {
                        const isActive = activeTypes.includes(t.id);
                        const isFocused = focusedType === t.id;
                        return (
                          <button
                            key={t.id}
                            onClick={() => {
                              let nextTypes = [...activeTypes];
                              let nextConfigs = { ...typeConfigs };
                              
                              if (!isActive) {
                                // Nếu chưa chọn: thêm vào danh sách và đặt focus
                                nextTypes.push(t.id);
                                if (nextConfigs[t.id] === undefined) {
                                  nextConfigs[t.id] = { h: 195, s: 70 }; // Mặc định cho món đồ mới
                                }
                                setFocusedType(t.id);
                              } else {
                                // Nếu đang isActive:
                                if (isFocused) {
                                  // Nếu đang focus rồi: bỏ chọn món này
                                  nextTypes = nextTypes.filter(id => id !== t.id);
                                  if (nextTypes.length === 0) {
                                    nextTypes = ["shirt"];
                                    nextConfigs["shirt"] = nextConfigs["shirt"] ?? { h: 195, s: 70 };
                                  }
                                  setFocusedType(nextTypes[nextTypes.length - 1]);
                                } else {
                                  // Nếu chưa focus: chỉ đặt focus để chỉnh màu
                                  setFocusedType(t.id);
                                }
                              }
                              updatePrompt(nextTypes, activeStyle, activeBg, nextConfigs, gender);
                            }}
                            disabled={step === "upload" || isLoading}
                            className={`px-3 py-1.5 text-[10px] font-bold uppercase rounded-lg border transition-all relative ${
                              isActive 
                                ? isFocused 
                                  ? 'bg-amber-400 text-slate-950 border-amber-500 ring-2 ring-amber-400/30' 
                                  : 'bg-amber-600/40 text-amber-200 border-amber-600/50'
                                : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-600'
                            }`}
                          >
                            {t.label}
                            {isActive && isFocused && <div className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full animate-pulse" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 p-3 bg-slate-950/50 rounded-xl border border-slate-800/50">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold text-slate-600 uppercase flex justify-between">
                        Tông màu cho {CLOTHING_TYPES.find(t => t.id === focusedType)?.label || "áo"}: 
                        <span className="text-amber-400">{getColorName(typeConfigs[focusedType]?.h ?? 195, typeConfigs[focusedType]?.s ?? 70).toUpperCase()}</span>
                      </span>
                      <div className="relative h-6 flex items-center group">
                        <input 
                          type="range"
                          min="0"
                          max="400"
                          value={typeConfigs[focusedType]?.h ?? 195}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            const nextConfigs = { ...typeConfigs, [focusedType]: { ...(typeConfigs[focusedType] ?? { h: 195, s: 70 }), h: val } };
                            updatePrompt(activeTypes, activeStyle, activeBg, nextConfigs, gender);
                          }}
                          disabled={step === "upload" || isLoading}
                          className="w-full h-3 rounded-full appearance-none cursor-pointer outline-none transition-opacity disabled:opacity-30"
                          style={{
                            background: "linear-gradient(to right, #ff0000 0%, #ffff00 22.5%, #00ff00 45%, #00ffff 56%, #0000ff 67.5%, #ff00ff 90%, #ff0000 90%, #ffffff 92.5%, #888888 95%, #444444 97.5%, #000000 100%)"
                          }}
                        />
                        <div className="absolute inset-0 pointer-events-none rounded-full border border-slate-800 ring-2 ring-slate-950" />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold text-slate-600 uppercase flex justify-between">
                        Độ bão hòa (Saturation): 
                        <span className="text-amber-400">{(typeConfigs[focusedType]?.s ?? 70)}%</span>
                      </span>
                      <div className="relative h-6 flex items-center group">
                        <input 
                          type="range"
                          min="0"
                          max="100"
                          value={typeConfigs[focusedType]?.s ?? 70}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            const nextConfigs = { ...typeConfigs, [focusedType]: { ...(typeConfigs[focusedType] ?? { h: 195, s: 70 }), s: val } };
                            updatePrompt(activeTypes, activeStyle, activeBg, nextConfigs, gender);
                          }}
                          disabled={step === "upload" || isLoading || (typeConfigs[focusedType]?.h ?? 0) > 360}
                          className="w-full h-3 rounded-full appearance-none cursor-pointer outline-none transition-opacity disabled:opacity-30"
                          style={{
                            background: `linear-gradient(to right, #ffffff, ${
                              (typeConfigs[focusedType]?.h ?? 0) > 360 ? '#888888' : 'hsl(' + (typeConfigs[focusedType]?.h ?? 195) + ', 100%, 50%)'
                            })`
                          }}
                        />
                        <div className="absolute inset-0 pointer-events-none rounded-full border border-slate-800 ring-2 ring-slate-950" />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <span className="text-[10px] font-bold text-slate-600 uppercase">Kiểu dáng / Họa tiết:</span>
                    <div className="grid grid-cols-3 gap-2">
                      {CLOTHING_STYLES.map(s => (
                        <button
                          key={s.id}
                          onClick={() => updatePrompt(activeTypes, s.id, activeBg, typeConfigs, gender)}
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
                          onClick={() => updatePrompt(activeTypes, activeStyle, b.id, typeConfigs, gender)}
                          disabled={step === "upload" || isLoading}
                          className={`flex items-center justify-center gap-1 px-2 py-2 text-[9px] font-bold uppercase rounded-lg border transition-all ${activeBg === b.id ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-lg shadow-amber-400/10' : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-600'}`}
                        >
                          <div className={`w-2.5 h-2.5 rounded-full border border-slate-700 shrink-0 ${b.class}`} />
                          <span className="truncate">{b.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <span className="text-[10px] font-bold text-slate-600 uppercase">Hướng sáng (Lighting):</span>
                    <div className="grid grid-cols-4 gap-2">
                      {LIGHTING_DIRECTIONS.map(l => (
                        <button
                          key={l.id}
                          onClick={() => updatePrompt(activeTypes, activeStyle, activeBg, typeConfigs, gender, lightingIntensity, l.id)}
                          disabled={step === "upload" || isLoading}
                          className={`px-1 py-1.5 text-[9px] font-bold uppercase rounded-lg border transition-all truncate text-center ${lightingDirection === l.id ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-lg shadow-amber-400/10' : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-600'}`}
                        >
                          {l.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-slate-600 uppercase flex justify-between">
                      Cường độ ánh sáng: 
                      <span className="text-amber-400">{lightingIntensity}%</span>
                    </span>
                    <div className="relative h-6 flex items-center group">
                      <input 
                        type="range"
                        min="20"
                        max="100"
                        value={lightingIntensity}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          updatePrompt(activeTypes, activeStyle, activeBg, typeConfigs, gender, val, lightingDirection);
                        }}
                        disabled={step === "upload" || isLoading}
                        className="w-full h-3 rounded-full appearance-none cursor-pointer outline-none transition-opacity disabled:opacity-30"
                        style={{
                          background: `linear-gradient(to right, #1e293b, #fbbf24)`
                        }}
                      />
                      <div className="absolute inset-0 pointer-events-none rounded-full border border-slate-800 ring-2 ring-slate-950" />
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

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-white/5 bg-gradient-to-br from-slate-800/50 to-slate-900/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-400/10 rounded-xl flex items-center justify-center text-amber-400">
                    <Key size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Cài đặt API & Models</h2>
                    <p className="text-xs text-slate-500">Tùy chỉnh API key để tránh giới hạn hạn mức (quota)</p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar bg-slate-900">
                <div className="space-y-4">
                  <div className="flex bg-slate-950 p-1 rounded-xl mb-2">
                    <button
                      onClick={() => setAuthMethod('apikey')}
                      className={`flex-1 text-xs font-bold py-2 rounded-lg transition-all ${authMethod === 'apikey' ? 'bg-slate-800 text-amber-400' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      Gemini API Key
                    </button>
                    <button
                      onClick={() => setAuthMethod('bearer')}
                      className={`flex-1 text-xs font-bold py-2 rounded-lg transition-all ${authMethod === 'bearer' ? 'bg-slate-800 text-amber-400' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                      Bearer Token
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      {authMethod === 'apikey' ? 'Gemini API Key' : 'Google Bearer Token'}
                    </label>
                    <button 
                      onClick={checkQuota}
                      disabled={apiStatus === 'checking'}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold transition-all text-slate-300 border border-white/5"
                    >
                      {apiStatus === 'checking' ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : apiStatus === 'ok' ? (
                        <CheckCircle2 size={12} className="text-green-500" />
                      ) : apiStatus === 'fail' ? (
                        <ShieldCheck size={12} className="text-red-500" />
                      ) : (
                        <Zap size={12} className="text-amber-400" />
                      )}
                      <span>{apiStatus === 'ok' ? 'ĐÃ KIỂM TRA' : apiStatus === 'fail' ? 'LỖI' : 'KIỂM TRA HẠN MỨC'}</span>
                    </button>
                  </div>
                  
                  {authMethod === 'apikey' ? (
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600">
                        <Key size={14} />
                      </div>
                      <input 
                        type="password"
                        value={userApiKey}
                        onChange={(e) => setUserApiKey(e.target.value)}
                        placeholder="Nhập API Key của bạn tại đây..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-xs font-mono text-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all border-slate-700"
                      />
                    </div>
                  ) : (
                    <div className="relative mt-2">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600">
                        <ShieldCheck size={14} />
                      </div>
                      <input 
                        type="password"
                        value={userBearerToken}
                        onChange={(e) => setUserBearerToken(e.target.value)}
                        placeholder="Nhập Bearer Token (Bắt đầu với ya29...)"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-xs font-mono text-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition-all border-slate-700"
                      />
                    </div>
                  )}
                </div>
                
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Model Đang Sử Dụng</label>
                  <div className="grid grid-cols-1 gap-2">
                    {MODEL_OPTIONS.map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setSelectedModel(opt.id)}
                        className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                          selectedModel === opt.id 
                            ? 'bg-amber-400/10 border-amber-400/50 text-amber-400' 
                            : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        <div className="text-left">
                          <p className="text-[11px] font-bold uppercase">{opt.label}</p>
                          <p className="text-[9px] opacity-60">{opt.desc}</p>
                        </div>
                        {selectedModel === opt.id && <CheckCircle2 size={14} />}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="p-4 bg-amber-400/5 border border-amber-400/20 rounded-xl">
                  <p className="text-[10px] text-amber-200/60 leading-relaxed italic">
                    * Lưu ý: Chỉ cần 1 API key duy nhất cho toàn bộ hệ thống. Nếu bạn không nhập, hệ thống sẽ sử dụng key mặc định.
                  </p>
                </div>
              </div>

              <div className="p-6 bg-slate-950/50 flex gap-3">
                <button 
                  onClick={() => setShowSettings(false)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs uppercase tracking-widest transition-all"
                >
                  Hủy
                </button>
                <button 
                  onClick={saveApiKeys}
                  className="flex-1 py-3 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-amber-900/20"
                >
                  Lưu thiết lập
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
