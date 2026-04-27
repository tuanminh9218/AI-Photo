import { GoogleGenAI } from "@google/genai";

const defaultAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function testApiKey(apiKey: string, model: string = "gemini-3-flash-preview", bearerToken?: string) {
  try {
    const testAi = new GoogleGenAI(bearerToken 
      ? { apiKey: apiKey || process.env.GEMINI_API_KEY || "dummy_key", httpOptions: { headers: { Authorization: `Bearer ${bearerToken}` } } }
      : { apiKey }
    );
    await testAi.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: "test" }] }]
    });
    return { success: true };
  } catch (error: any) {
    console.error("API Key Test Error:", error);
    return { 
      success: false, 
      message: error.message || "Lỗi xác thực hoặc hết hạn mức."
    };
  }
}

export async function generateIdPhoto(base64Image: string, prompt: string, model: string = "gemini-2.5-flash-image", customApiKey?: string, customBearerToken?: string) {
  // Bản đồ tên model sang tên chính thức theo tài liệu @google/genai
  let modelName = model;
  
  // Use custom or default AI instance
  const activeAi = customBearerToken
    ? new GoogleGenAI({ apiKey: customApiKey || process.env.GEMINI_API_KEY || "dummy_key", httpOptions: { headers: { Authorization: `Bearer ${customBearerToken}` } } })
    : customApiKey 
      ? new GoogleGenAI({ apiKey: customApiKey }) 
      : defaultAi;

  if (model.includes("fast") || model.includes("2.5") || model.includes("nb1")) {
    modelName = "gemini-2.5-flash-image";
  } else if (model.includes("generate") || model.includes("3.1") || model.includes("nb2") || model.includes("latest")) {
    modelName = "gemini-3.1-flash-image-preview";
  } else if (model.includes("pro")) {
    modelName = "gemini-3-pro-image-preview";
  }

  // Đảm bảo sử dụng model Nano Banana hỗ trợ generateContent
  if (!modelName.includes("image-preview") && !modelName.includes("flash-image")) {
    modelName = "gemini-2.5-flash-image";
  }

    try {
      // Prepare parts with both text prompt and image data
      const imageParts = [];
      
      // Add text prompt
      imageParts.push({ text: prompt });
      
      // Add image part if provided
      if (base64Image) {
        const base64Data = base64Image.split(',')[1] || base64Image;
        const mimeType = base64Image.split(';')[0]?.split(':')[1] || "image/jpeg";
        
        imageParts.push({
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        });
      }

      const response = await activeAi.models.generateContent({
        model: modelName,
        contents: [{ role: "user", parts: imageParts }],
        config: {
        // @ts-ignore
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: "1K",
        },
      }
    });

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }
    
    // Nếu không có ảnh, kiểm tra văn bản phản hồi
    let refusalText = "";
    try {
      refusalText = response.text || "";
    } catch (e) {
      // response.text might throw if there's no text (e.g. only image returned or error)
    }
    
    if (refusalText) {
      throw new Error(`AI không thể tạo ảnh: ${refusalText}`);
    }
    
    throw new Error("Không có ảnh nào được trả về từ AI. Nội dung có thể đã bị bộ lọc an toàn chặn (Safety Filter).");
  } catch (error: any) {
    console.error("Gemini Image Generation Error:", error);
    
    // Check for structured error from the API
    const errorBody = error.response || error;
    const message = errorBody.message || error.message || "";
    const status = errorBody.status || "";

    if (message.includes("quota") || message.includes("RESOURCE_EXHAUSTED") || status === "RESOURCE_EXHAUSTED" || errorBody?.error?.code === 429) {
      const hint = !customApiKey ? " Hãy thử vào Cài đặt và nhập API Key cá nhân của bạn để có hạn mức cao hơn." : "";
      throw new Error(`Hết hạn mức sử dụng (429) cho mô hình ${modelName}.${hint} Vui lòng thử lại sau hoặc chuyển sang mô hình khác.`);
    }
    
    if (message.includes("PERMISSION_DENIED") || status === "PERMISSION_DENIED" || errorBody?.error?.code === 403) {
      throw new Error(`Không có quyền truy cập (403) cho mô hình ${modelName}. Mô hình này có thể yêu cầu quyền đặc biệt hoặc chưa được mở cho API key của bạn.`);
    }
    
    if (message.includes("API key")) {
      throw new Error("Lỗi xác thực: API Key không hợp lệ hoặc không có quyền truy cập mô hình này.");
    }

    if (message.includes("safety") || message.includes("blocked")) {
      throw new Error("Yêu cầu bị từ chối vì lý do an toàn. Vui lòng thử thay đổi prompt.");
    }

    throw new Error(message || "Đã xảy ra lỗi khi kết nối với AI. Vui lòng thử lại.");
  }
}
