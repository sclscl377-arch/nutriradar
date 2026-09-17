/**
 * Gemini Vision 營養標籤辨識引擎
 * 使用 Google Gemini 2.0 Flash 多模態模型直接理解圖片語意，
 * 取代傳統 OCR 正則解析，大幅提升曲面/反光/模糊標籤辨識率。
 */

/**
 * 動態取得 Gemini API 配置
 * 支援本地 config.js 或 localStorage，避免金鑰提交至 Git 倉庫外洩
 */
async function getGeminiConfig() {
  let apiKey = '';
  let model = 'gemini-3.6-flash';

  // 1. 檢查瀏覽器 localStorage（方便自訂或覆蓋）
  try {
    const localKey = localStorage.getItem('nutriradar_gemini_api_key');
    if (localKey && localKey.trim()) {
      apiKey = localKey.trim();
    }
  } catch (e) {}

  // 2. 若無，則讀取本地 config.js（已被 .gitignore 忽略保護）
  if (!apiKey) {
    try {
      const configModule = await import('../config.js');
      if (configModule?.CONFIG?.GEMINI_API_KEY) {
        apiKey = configModule.CONFIG.GEMINI_API_KEY.trim();
        if (configModule.CONFIG.GEMINI_MODEL) {
          model = configModule.CONFIG.GEMINI_MODEL.trim();
        }
      }
    } catch (e) {
      // config.js 不存在（例如新 clone 的公開專案）
    }
  }

  return { apiKey, model };
}

const GEMINI_PROMPT = `你是一個專業的食品營養標籤解析 AI。
請仔細分析這張食品包裝或營養標籤的圖片，找出營養成分表（Nutrition Facts / 營養標示）的數值。

重要規則：
1. 優先讀取「每100公克」或「每100毫升」欄位的數值（若有雙欄，取右欄）。
2. 若只有「每份」數值，則直接使用。
3. 所有數值單位：熱量為 kcal（大卡），其餘皆為公克（g），鈉為毫克（mg）。
4. 若圖片中完全找不到某個欄位，該欄位回傳 null。
5. 絕對不要猜測或捏造數值，看不清楚就回傳 null。
6. 只回傳純 JSON，不要有任何說明文字、markdown 格式或代碼框。

請回傳以下格式的 JSON：
{"calories":數字或null,"protein":數字或null,"fat":數字或null,"saturatedFat":數字或null,"transFat":數字或null,"carbs":數字或null,"sugar":數字或null,"sodium":數字或null,"fiber":數字或null,"potassium":數字或null,"calcium":數字或null,"foodName":字串或null}

foodName 請嘗試從圖片上識別食品名稱，若看不到請回傳 null。`;

/**
 * 主要入口函數（與舊版 OCR 引擎介面完全相容）
 */
export async function processNutritionImage(imageFile, onProgress = () => {}) {
  return new Promise(async (resolve) => {
    try {
      onProgress(5, '正在載入 API 金鑰配置...');
      const { apiKey, model } = await getGeminiConfig();

      if (!apiKey) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('nutriradar:open-apikey-modal'));
        }
        throw new Error('未設定 Gemini API 金鑰！已為您開啟右上角 ⚙️ 設定視窗，請貼上金鑰。');
      }

      onProgress(15, '正在讀取並壓縮圖片...');

      // 將圖片壓縮至最大 1024px，避免 API payload 超限
      const { base64Data, mimeType } = await compressAndEncodeImage(imageFile);

      onProgress(35, '正在連線至 Gemini Vision AI...');

      const requestBody = {
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data
              }
            },
            {
              text: GEMINI_PROMPT
            }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048
        }
      };

      onProgress(55, 'Gemini AI 正在分析標籤圖片...');

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      onProgress(80, '正在解析 AI 回傳結果...');

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        let errMsg = errBody?.error?.message || `HTTP ${response.status}`;
        if (errMsg.includes('API key not valid')) {
          errMsg = '金鑰無效或尚未設定！請點擊右上角 ⚙️ 檢查或重新貼上 Gemini API Key。';
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('nutriradar:open-apikey-modal'));
          }
        }
        throw new Error(`Gemini API 錯誤：${errMsg}`);
      }

      const responseData = await response.json();
      const rawText = responseData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      console.log(`[Gemini Vision] 原始回傳 (長度 ${rawText.length}):`, rawText);

      onProgress(95, '正在整理營養數值...');

      const extractedData = parseGeminiResponse(rawText, imageFile.name);

      // 取得圖片預覽用的 Data URL
      const imageSrc = await readFileAsDataURL(imageFile);

      onProgress(100, '辨識完成！');

      resolve({
        success: extractedData.hasParsedAny,
        rawText,
        data: extractedData,
        imageSrc
      });

    } catch (err) {
      console.error('[Gemini Vision] 辨識失敗:', err);
      const imageSrc = await readFileAsDataURL(imageFile).catch(() => null);
      resolve({
        success: false,
        error: err.message,
        data: {
          foodName: imageFile ? `拍照標籤 (${imageFile.name.replace(/\.[^/.]+$/, '')})` : '拍照標籤',
          calories: null, protein: null, fat: null, saturatedFat: null, transFat: null,
          carbs: null, sugar: null, sodium: null, fiber: null, potassium: null, calcium: null,
          hasParsedAny: false,
          parsedFields: [],
          errorMessage: err.message
        },
        imageSrc
      });
    }
  });
}

/**
 * 解析 Gemini 回傳的 JSON 字串
 */
function parseGeminiResponse(rawText, fileName = '') {
  const result = {
    foodName: fileName ? `拍照標籤 (${fileName.replace(/\.[^/.]+$/, '')})` : '拍照標籤',
    calories: null,
    protein: null,
    fat: null,
    saturatedFat: null,
    transFat: null,
    carbs: null,
    sugar: null,
    sodium: null,
    fiber: null,
    potassium: null,
    calcium: null,
    processingLevel: 3,
    hasParsedAny: false,
    parsedFields: []
  };

  if (!rawText || typeof rawText !== 'string') return result;

  // 嘗試從回傳文字中萃取 JSON（兼容 Gemini 可能夾帶說明文字的情況）
  let jsonStr = rawText.trim();

  // 移除可能的 markdown 代碼框
  jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  // 若不是以 { 開頭，嘗試找 { } 之間的內容
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    // JSON 可能被截斷，嘗試自動修補
    console.warn('[Gemini Vision] JSON 解析失敗，嘗試修補，原始文字:', rawText);
    const repaired = repairTruncatedJson(jsonStr);
    if (repaired) {
      try {
        parsed = JSON.parse(repaired);
        console.log('[Gemini Vision] JSON 修補成功:', repaired);
      } catch (e2) {
        console.error('[Gemini Vision] JSON 修補後仍解析失敗:', repaired);
        return result;
      }
    } else {
      return result;
    }
  }

  // 欄位映射
  const fieldMap = [
    { key: 'calories',     label: '熱量' },
    { key: 'protein',      label: '蛋白質' },
    { key: 'fat',          label: '總脂肪' },
    { key: 'saturatedFat', label: '飽和脂肪' },
    { key: 'transFat',     label: '反式脂肪' },
    { key: 'carbs',        label: '碳水化合物' },
    { key: 'sugar',        label: '糖' },
    { key: 'sodium',       label: '鈉' },
    { key: 'fiber',        label: '膳食纖維' },
    { key: 'potassium',    label: '鉀' },
    { key: 'calcium',      label: '鈣' }
  ];

  for (const field of fieldMap) {
    const val = parsed[field.key];
    if (val !== null && val !== undefined && !isNaN(Number(val))) {
      result[field.key] = Number(val);
      result.hasParsedAny = true;
      result.parsedFields.push(field.label);
    }
  }

  // 食品名稱：若 Gemini 有辨識到，覆蓋預設值
  if (parsed.foodName && typeof parsed.foodName === 'string' && parsed.foodName.trim()) {
    result.foodName = parsed.foodName.trim();
  }

  return result;
}

/**
 * 將圖片壓縮至最大 1024px 寬/高，並以 JPEG 格式輸出 Base64
 * 避免大圖片超過 Gemini API 的 inline_data payload 上限
 */
function compressAndEncodeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX_SIZE = 1024;
        let { width, height } = img;

        // 等比縮放
        if (width > MAX_SIZE || height > MAX_SIZE) {
          if (width > height) {
            height = Math.round((height / width) * MAX_SIZE);
            width = MAX_SIZE;
          } else {
            width = Math.round((width / height) * MAX_SIZE);
            height = MAX_SIZE;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // 輸出為 JPEG，品質 0.88
        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        const base64Data = dataUrl.split(',')[1];
        resolve({ base64Data, mimeType: 'image/jpeg' });
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 將圖片 File 讀取為完整 Data URL（供圖片預覽用）
 */
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 修補被截斷的 JSON 字串：補上缺失的括號/引號讓 JSON.parse 能成功
 */
function repairTruncatedJson(str) {
  if (!str) return null;
  let s = str.trim();

  // 若最後一個字元是數字小數點或逗號，先把不完整 token 移除
  s = s.replace(/,?\s*"[^"]*"\s*:\s*[^,}\]]*$/, '')  // 移除最後不完整的 key:value
        .replace(/,\s*$/, '');                           // 移除尾端逗號

  // 計算需要補上的括號
  const openBraces = (s.match(/\{/g) || []).length;
  const closeBraces = (s.match(/\}/g) || []).length;
  const openBrackets = (s.match(/\[/g) || []).length;
  const closeBrackets = (s.match(/\]/g) || []).length;

  s += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
  s += '}'.repeat(Math.max(0, openBraces - closeBraces));

  return s;
}

// 保留舊版 parseNutritionTextAdvanced 出口以防其他地方引用
export function parseNutritionTextAdvanced(rawText, fileName = '') {
  return parseGeminiResponse(rawText, fileName);
}
