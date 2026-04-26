import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function detectGenderAndGetPrompt(base64Image: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Image.split(",")[1],
          },
        },
        {
          text: `Evaluate the gender of the person in this photo. Return a JSON object with 'gender' (either "Nam" or "Nữ") and a 'prompt' for Imagen 3 to transform this person into a formal ID photo. 
          The person should be wearing a clean formal white shirt with a collar (or a professional suit/blazer). 
          The background must be solid blue (Azure blue). 
          The lighting should be even and professional. 
          The person's expression should be neutral.
          Ensure the output is JSON.`,
        },
      ],
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          gender: { type: Type.STRING },
          prompt: { type: Type.STRING },
        },
        required: ["gender", "prompt"],
      },
    },
  });

  return JSON.parse(response.text || "{}") as { gender: string; prompt: string };
}

export async function generateIdPhoto(base64Image: string, prompt: string, model: string = "gemini-3.1-flash-image-preview") {
  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image.split(",")[1],
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "3:4",
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
    
    throw new Error("Không có ảnh nào được trả về từ AI. Có thể nội dung bị chặn hoặc mô hình đang gặp sự cố.");
  } catch (error: any) {
    console.error("Gemini Image Generation Error:", error);
    
    // Check for structured error from the API
    const errorBody = error.response || error;
    const message = errorBody.message || error.message || "";
    const status = errorBody.status || "";

    if (message.includes("quota") || message.includes("RESOURCE_EXHAUSTED") || status === "RESOURCE_EXHAUSTED") {
      throw new Error(`Hết hạn mức sử dụng cho mô hình ${model}. Vui lòng thử lại sau vài giờ hoặc sử dụng mô hình khác.`);
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
