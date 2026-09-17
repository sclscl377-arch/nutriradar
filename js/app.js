import { PRESET_FOODS } from './data/preset_foods.js';
import { NUTRITION_GLOSSARY } from './data/nutrition_glossary.js';
import { analyzeFoodNutrition } from './engine/scoring_engine.js';
import { processNutritionImage } from './engine/ocr_engine.js';

let radarChart = null;

document.addEventListener('DOMContentLoaded', () => {
  initFontScaler();
  initPresets();
  initRadarChart();
  initCameraAndOCR();
  initCollapsibleForm();
  initFormInputs();
  initInfoModal();
  initApiKeyModal();
  initScanHistory();
  
  // 初始載入第一筆（使用者照片案例）
  loadFoodData(PRESET_FOODS[0]);
});

// 1. 初始化經典範例直式清單 (直向滑動拉霸)
function initPresets() {
  const track = document.getElementById('presetTrack');
  if (!track) return;
  track.innerHTML = '';

  PRESET_FOODS.forEach((food, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `preset-card ${index === 0 ? 'active' : ''}`;
    card.innerHTML = `
      <div class="preset-card-left">
        <span class="preset-card-icon">${food.icon || '🥗'}</span>
        <div class="preset-card-text">
          <div class="preset-card-name">${food.name}</div>
          <div class="preset-card-meta">${food.category} • ${food.calories} kcal</div>
        </div>
      </div>
      <div class="preset-card-badge">${food.tag || '查看'}</div>
    `;

    card.addEventListener('click', () => {
      document.querySelectorAll('.preset-card').forEach(p => p.classList.remove('active'));
      card.classList.add('active');
      
      // 隱藏自訂照片預覽，切回範例模式
      document.getElementById('previewContainer').style.display = 'none';
      document.getElementById('cameraPrompt').style.display = 'block';
      const ocrSuccessBar = document.getElementById('ocrSuccessBar');
      ocrSuccessBar.style.display = 'none';
      ocrSuccessBar.className = 'ocr-success-banner';

      loadFoodData(food);
    });
    track.appendChild(card);
  });
}

// 2. 初始化拍照與真實 OCR 辨識
function initCameraAndOCR() {
  const dropzone = document.getElementById('cameraDropzone');
  const fileInput = document.getElementById('imageFileInput');
  const quickBtn = document.getElementById('quickCameraBtn');
  const rephotoBtn = document.getElementById('rephotoBtn');

  const triggerUpload = () => {
    fileInput.value = '';
    fileInput.click();
  };

  dropzone.addEventListener('click', (e) => {
    if (e.target !== rephotoBtn && !e.target.closest('#rephotoBtn')) {
      triggerUpload();
    }
  });

  if (quickBtn) {
    quickBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerUpload();
    });
  }

  if (rephotoBtn) {
    rephotoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerUpload();
    });
  }

  // 拖曳上傳支援
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = '#10b981';
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = '';
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = '';
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageSelected(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleImageSelected(e.target.files[0]);
    }
  });
}

// 處理圖片選擇與 OCR 提取
async function handleImageSelected(file) {
  const promptEl = document.getElementById('cameraPrompt');
  const previewContainer = document.getElementById('previewContainer');
  const imagePreview = document.getElementById('imagePreview');
  const ocrOverlay = document.getElementById('ocrOverlay');
  const ocrStatusText = document.getElementById('ocrStatusText');
  const ocrProgressFill = document.getElementById('ocrProgressFill');
  const ocrSuccessBar = document.getElementById('ocrSuccessBar');
  const ocrStatusMsg = document.getElementById('ocrStatusMsg');

  // 1. 清空所有舊數據，絕不殘留舊食品數值
  clearFormValues();

  // 2. 切換為預覽與辨識載入狀態
  promptEl.style.display = 'none';
  previewContainer.style.display = 'block';
  ocrOverlay.style.display = 'flex';
  ocrSuccessBar.style.display = 'none';
  ocrSuccessBar.className = 'ocr-success-banner';

  // 3. 取消預設範例的選中態
  document.querySelectorAll('.preset-card').forEach(p => p.classList.remove('active'));

  // 4. 即時顯示新圖片預覽
  const tempUrl = URL.createObjectURL(file);
  imagePreview.src = tempUrl;

  const fileName = file.name.replace(/\.[^/.]+$/, "");
  const displayName = `拍照標籤 (${fileName})`;
  document.getElementById('foodName').value = displayName;
  document.getElementById('displayFoodName').textContent = displayName;

  // 5. 執行真實影像增強與 OCR 表格解析
  const result = await processNutritionImage(file, (progress, statusText) => {
    ocrProgressFill.style.width = `${progress}%`;
    ocrStatusText.textContent = statusText;
  });

  if (result.imageSrc) {
    imagePreview.src = result.imageSrc;
  }
  ocrOverlay.style.display = 'none';
  ocrSuccessBar.style.display = 'flex';

  const extracted = result.data;

  // 6. 依真實辨識結果處理：成功填入真實值；部分辨識時顯示「自動填入 X 項數值，缺 Y 項數值」
  const mandatoryFields = [
    { key: 'calories', name: '熱量' },
    { key: 'protein', name: '蛋白質' },
    { key: 'fat', name: '總脂肪' },
    { key: 'saturatedFat', name: '飽和脂肪' },
    { key: 'transFat', name: '反式脂肪' },
    { key: 'carbs', name: '碳水化合物' },
    { key: 'sugar', name: '糖' },
    { key: 'sodium', name: '鈉' }
  ];

  if (extracted && extracted.hasParsedAny) {
    const parsedMandatory = mandatoryFields.filter(f => extracted[f.key] !== null);
    const missingMandatory = mandatoryFields.filter(f => extracted[f.key] === null);

    const parsedCount = parsedMandatory.length;
    const missingCount = missingMandatory.length;
    const missingNames = missingMandatory.map(f => f.name).join('、');

    if (missingCount === 0) {
      ocrSuccessBar.className = 'ocr-success-banner';
      ocrStatusMsg.innerHTML = `✅ 標籤辨識完全成功！已自動填入全部 <strong>${parsedCount}</strong> 項基礎數值。`;
    } else {
      ocrSuccessBar.className = 'ocr-success-banner warning-state';
      ocrStatusMsg.innerHTML = `⚠️ 標籤辨識部分成功：自動填入 <strong>${parsedCount}</strong> 項數值，缺 <strong>${missingCount}</strong> 項數值（${missingNames}），請於下方補齊！`;
    }

    // 僅填入實際辨識到的數值，未辨識到的欄位保留空白
    document.getElementById('calories').value = extracted.calories !== null ? extracted.calories : '';
    document.getElementById('protein').value = extracted.protein !== null ? extracted.protein : '';
    document.getElementById('fat').value = extracted.fat !== null ? extracted.fat : '';
    document.getElementById('saturatedFat').value = extracted.saturatedFat !== null ? extracted.saturatedFat : '';
    document.getElementById('transFat').value = extracted.transFat !== null ? extracted.transFat : '';
    document.getElementById('carbs').value = extracted.carbs !== null ? extracted.carbs : '';
    document.getElementById('sugar').value = extracted.sugar !== null ? extracted.sugar : '';
    document.getElementById('sodium').value = extracted.sodium !== null ? extracted.sodium : '';
    document.getElementById('fiber').value = extracted.fiber !== null ? extracted.fiber : '';
    document.getElementById('potassium').value = extracted.potassium !== null ? extracted.potassium : '';
    document.getElementById('calcium').value = extracted.calcium !== null ? extracted.calcium : '';
  } else {
    // 辨識失敗：顯示具體錯誤訊息，清空表單，要求使用者手動輸入
    ocrSuccessBar.className = 'ocr-success-banner error-state';
    const errDetail = result.error ? `（${result.error}）` : '（可能因曲面反光或字體模糊）';
    ocrStatusMsg.innerHTML = `❌ 標籤讀取失敗 ${errDetail}：未讀取到數值，缺 <strong>8</strong> 項基礎數值，請於下方手動輸入！`;
    console.error('[NutriRadar] OCR 失敗詳情:', result.error, result);
    clearFormValues();
  }

  // 7. 自動展開數值明細面板，方便使用者直接檢查或補填
  const body = document.getElementById('collapsibleBody');
  const icon = document.getElementById('collapseIcon');
  if (body) {
    body.style.display = 'block';
    if (icon) icon.textContent = '▲';
  }

  // 8. 即時觸發計算（若全空則顯示待輸入狀態）
  triggerRecalculate();

  // 9. 拍照辨識成功時，自動存入歷史紀錄
  if (extracted && extracted.hasParsedAny) {
    const finalName = (extracted.foodName && extracted.foodName.trim()) ? extracted.foodName.trim() : displayName;
    saveScanHistoryRecord(finalName, result.imageSrc);
  }
}

// 清空表單欄位
function clearFormValues() {
  document.getElementById('calories').value = '';
  document.getElementById('protein').value = '';
  document.getElementById('fat').value = '';
  document.getElementById('saturatedFat').value = '';
  document.getElementById('transFat').value = '';
  document.getElementById('carbs').value = '';
  document.getElementById('sugar').value = '';
  document.getElementById('sodium').value = '';
  document.getElementById('fiber').value = '';
  document.getElementById('potassium').value = '';
  document.getElementById('calcium').value = '';
}

// 3. 折疊面板初始化
function initCollapsibleForm() {
  const header = document.getElementById('formToggleHeader');
  const body = document.getElementById('collapsibleBody');
  const icon = document.getElementById('collapseIcon');
  const linkBtn = document.getElementById('toggleFormBtn');

  const toggle = () => {
    const isClosed = body.style.display === 'none';
    body.style.display = isClosed ? 'block' : 'none';
    icon.textContent = isClosed ? '▲' : '▼';
  };

  header.addEventListener('click', toggle);
  if (linkBtn) {
    linkBtn.addEventListener('click', () => {
      body.style.display = 'block';
      icon.textContent = '▲';
      body.scrollIntoView({ behavior: 'smooth' });
    });
  }
}

// 4. 表單輸入即時監聽
function initFormInputs() {
  const form = document.getElementById('nutritionForm');
  const inputs = form.querySelectorAll('input, select');
  inputs.forEach(input => {
    input.addEventListener('input', () => {
      triggerRecalculate();
    });
  });
}

// 5. 初始化 Chart.js 雷達圖
function initRadarChart() {
  const ctx = document.getElementById('radarChart').getContext('2d');

  radarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: [
        '有益營養密度',
        '無空熱量優勢',
        '低代謝風險',
        '天然加工程度',
        '全能適配度'
      ],
      datasets: [{
        label: '食物五維指標',
        data: [70, 85, 95, 72, 75],
        backgroundColor: 'rgba(16, 185, 129, 0.25)',
        borderColor: '#10b981',
        borderWidth: 2,
        pointBackgroundColor: '#10b981',
        pointBorderColor: '#fff',
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: {
            stepSize: 20,
            display: false,
            backdropColor: 'transparent'
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.08)'
          },
          angleLines: {
            color: 'rgba(255, 255, 255, 0.1)'
          },
          pointLabels: {
            color: '#9ca3af',
            font: {
              size: 11,
              weight: 'bold',
              family: "'Plus Jakarta Sans', 'Noto Sans TC'"
            }
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.92)',
          titleColor: '#10b981',
          bodyColor: '#f9fafb',
          borderColor: 'rgba(16, 185, 129, 0.3)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: function(context) {
              return ` 指標評分: ${context.raw} / 100`;
            }
          }
        }
      }
    }
  });
}

// 6. 載入食品資料到表單
function loadFoodData(food) {
  document.getElementById('foodName').value = food.name || '';
  document.getElementById('calories').value = food.calories !== undefined && food.calories !== null ? food.calories : '';
  document.getElementById('protein').value = food.protein !== undefined && food.protein !== null ? food.protein : '';
  document.getElementById('fat').value = food.fat !== undefined && food.fat !== null ? food.fat : '';
  document.getElementById('saturatedFat').value = food.saturatedFat !== undefined && food.saturatedFat !== null ? food.saturatedFat : '';
  document.getElementById('transFat').value = food.transFat !== undefined && food.transFat !== null ? food.transFat : '';
  document.getElementById('carbs').value = food.carbs !== undefined && food.carbs !== null ? food.carbs : '';
  document.getElementById('sugar').value = food.sugar !== undefined && food.sugar !== null ? food.sugar : '';
  document.getElementById('sodium').value = food.sodium !== undefined && food.sodium !== null ? food.sodium : '';
  document.getElementById('fiber').value = food.fiber !== undefined && food.fiber !== null ? food.fiber : '';
  document.getElementById('potassium').value = food.potassium !== undefined && food.potassium !== null ? food.potassium : '';
  document.getElementById('calcium').value = food.calcium !== undefined && food.calcium !== null ? food.calcium : '';
  document.getElementById('processingLevel').value = food.processingLevel || 3;

  triggerRecalculate();
}

// 讀取當前表單數值
function getFormData() {
  return {
    calories: document.getElementById('calories').value,
    protein: document.getElementById('protein').value,
    fat: document.getElementById('fat').value,
    saturatedFat: document.getElementById('saturatedFat').value,
    transFat: document.getElementById('transFat').value,
    carbs: document.getElementById('carbs').value,
    sugar: document.getElementById('sugar').value,
    sodium: document.getElementById('sodium').value,
    fiber: document.getElementById('fiber').value,
    potassium: document.getElementById('potassium').value,
    calcium: document.getElementById('calcium').value,
    processingLevel: document.getElementById('processingLevel').value
  };
}

// 7. 從表單讀取並觸發計算
function triggerRecalculate() {
  const foodData = {
    name: document.getElementById('foodName').value || '自訂食品',
    ...getFormData()
  };

  const results = analyzeFoodNutrition(foodData);
  updateUI(foodData.name, results);
}

// 8. 全面更新 UI
function updateUI(foodName, results) {
  // A. 食品名稱與總分
  document.getElementById('displayFoodName').textContent = foodName;
  const scoreNum = document.getElementById('scoreNumber');
  scoreNum.textContent = results.overallScore;

  const scoreCircle = document.getElementById('scoreCircle');
  scoreCircle.style.borderColor = results.grade.color;
  scoreCircle.style.boxShadow = `0 0 24px ${results.grade.color}40`;

  const gradeBadge = document.getElementById('gradeBadge');
  gradeBadge.className = `badge ${results.grade.badgeClass}`;
  gradeBadge.textContent = `${results.grade.tag} ${results.grade.text}`;

  // B. 資料完整度 (DCI)
  document.getElementById('completenessText').textContent = `${results.completenessScore}%`;
  document.getElementById('completenessFill').style.width = `${results.completenessScore}%`;
  
  const compNote = document.getElementById('completenessNote');
  if (results.isEmpty) {
    compNote.textContent = "ℹ️ 尚未輸入數值，請於左側數值明細輸入包裝標示。";
  } else if (results.completenessScore >= 90) {
    compNote.textContent = "✅ 標示極為完整（含膳食纖維與微量礦物質），評分具備高度可信度。";
  } else {
    compNote.textContent = `ℹ️ 基礎標示完整度 ${results.completenessScore}%；未標示 ${results.missingFields.join('、')}，系統採用客觀保守模型推估。`;
  }

  // C. 更新五維雷達圖
  if (radarChart) {
    const rm = results.radarMetrics;
    radarChart.data.datasets[0].data = [
      rm.beneficialDensity,
      rm.emptyCalorieScore,
      rm.excessRiskScore,
      rm.processingScore,
      rm.generalFit
    ];
    radarChart.data.datasets[0].borderColor = results.grade.color;
    radarChart.data.datasets[0].backgroundColor = `${results.grade.color}30`;
    radarChart.data.datasets[0].pointBackgroundColor = results.grade.color;
    radarChart.update();
  }

  // D. 更新 Nutrition ROI
  const roi = results.nutritionRoi;
  document.getElementById('roiProtein').textContent = results.isEmpty ? '--' : `${roi.proteinPer100Kcal} g`;
  document.getElementById('roiFiber').textContent = results.isEmpty ? '--' : (roi.fiberPer100Kcal !== null ? `${roi.fiberPer100Kcal} g` : '未標示 (推估)');
  document.getElementById('roiSugar').textContent = results.isEmpty ? '--' : `${roi.sugarPer100Kcal} g`;
  document.getElementById('roiSodium').textContent = results.isEmpty ? '--' : `${roi.sodiumPer100Kcal} mg`;
  document.getElementById('roiCalorieDensity').textContent = results.isEmpty ? '--' : `${roi.calorieDensity} kcal/g`;
  
  const m = roi.macrosRatio;
  document.getElementById('roiMacrosRatio').textContent = results.isEmpty ? '--' : `蛋 ${m.proteinPct}% / 脂 ${m.fatPct}% / 碳 ${m.carbsPct}%`;

  // E. 🌟 更新族群適配度矩陣 (包含 (i) 按鈕)
  const personaGrid = document.getElementById('personaGrid');
  personaGrid.innerHTML = '';
  
  const personaKeyMap = {
    workout: 'persona_workout',
    weightLoss: 'persona_weightloss',
    bloodSugar: 'persona_bloodsugar',
    general: 'persona_general',
    youth: 'persona_youth'
  };

  Object.entries(results.personaFit).forEach(([key, p]) => {
    const card = document.createElement('div');
    card.className = 'persona-card';
    const infoKey = personaKeyMap[key] || 'persona_general';
    card.innerHTML = `
      <div class="persona-header-row">
        <span class="persona-name">${p.label}</span>
        <button type="button" class="info-btn-mini" data-info-key="${infoKey}" title="點擊查看族群說明">ⓘ</button>
      </div>
      <div class="persona-score" style="color: ${p.score >= 80 ? '#34d399' : p.score >= 60 ? '#fbbf24' : '#f87171'}">${results.isEmpty ? '--' : p.score} <small style="font-size:0.7rem;color:#9ca3af;">分</small></div>
    `;
    personaGrid.appendChild(card);
  });

  // F. 更新 AI 一句話智慧點評
  document.getElementById('summaryHeadline').textContent = results.insights.summary;
  document.getElementById('summaryBody').textContent = results.insights.suggestion;

  const highlightsList = document.getElementById('summaryHighlights');
  highlightsList.innerHTML = '';
  results.insights.highlights.forEach(h => {
    const li = document.createElement('li');
    li.textContent = h;
    highlightsList.appendChild(li);
  });

  const warningBox = document.getElementById('summaryWarning');
  if (results.insights.warning) {
    warningBox.textContent = results.insights.warning;
    warningBox.style.display = 'block';
  } else {
    warningBox.style.display = 'none';
  }
}

// 9. 🌟 全局 (i) 資訊解釋彈窗系統
function initInfoModal() {
  const modalBackdrop = document.getElementById('infoModalBackdrop');
  const closeBtn = document.getElementById('modalCloseBtn');
  const confirmBtn = document.getElementById('modalConfirmBtn');
  
  const titleEl = document.getElementById('modalTitle');
  const unitEl = document.getElementById('modalUnit');
  const summaryEl = document.getElementById('modalSummary');
  const defEl = document.getElementById('modalDefinition');
  const scaleEl = document.getElementById('modalScale');

  const closeModal = () => {
    modalBackdrop.style.display = 'none';
  };

  const openModal = (key) => {
    const info = NUTRITION_GLOSSARY[key];
    if (!info) return;

    titleEl.textContent = info.title;
    unitEl.textContent = `單位 / 標示: ${info.unit}`;
    summaryEl.textContent = info.summary;
    defEl.textContent = info.definition;
    scaleEl.textContent = info.scale;

    modalBackdrop.style.display = 'flex';
  };

  // 事件代理：監聽全畫面所有 data-info-key 點擊
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-info-key]');
    if (btn) {
      e.stopPropagation();
      const key = btn.getAttribute('data-info-key');
      openModal(key);
    }
  });

  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (confirmBtn) confirmBtn.addEventListener('click', closeModal);
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) closeModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

// 7. 初始化 API Key 設定彈窗
function initApiKeyModal() {
  const modal = document.getElementById('apiKeyModal');
  const openBtn = document.getElementById('apiKeyBtn');
  const closeBtn = document.getElementById('closeApiKeyModalBtn');
  const saveBtn = document.getElementById('saveApiKeyBtn');
  const clearBtn = document.getElementById('clearApiKeyBtn');
  const input = document.getElementById('apiKeyInput');
  const toggleBtn = document.getElementById('toggleApiKeyVisibilityBtn');
  const statusTip = document.getElementById('apiKeyStatusTip');

  if (!modal) return;

  const updateStatus = async () => {
    const localKey = (localStorage.getItem('nutriradar_gemini_api_key') || '').trim();
    if (localKey) {
      const masked = localKey.length > 10 ? `${localKey.substring(0, 6)}...${localKey.substring(localKey.length - 4)}` : '已儲存';
      statusTip.innerHTML = `✅ 已儲存自訂金鑰：<code style="color:var(--accent-green);font-weight:bold;">${masked}</code>（安全儲存在當前手機/瀏覽器）`;
      input.value = localKey;
      return;
    }

    // 檢查本地 config.js 是否有金鑰
    try {
      const mod = await import('./config.js');
      if (mod?.CONFIG?.GEMINI_API_KEY) {
        const k = mod.CONFIG.GEMINI_API_KEY.trim();
        const masked = k.length > 10 ? `${k.substring(0, 6)}...${k.substring(k.length - 4)}` : '已啟用';
        statusTip.innerHTML = `💻 使用本地 config.js 金鑰：<code style="color:var(--accent-green);font-weight:bold;">${masked}</code>（開發環境自動載入）`;
        input.value = '';
        return;
      }
    } catch (e) {}

    statusTip.innerHTML = `⚠️ <span style="color:#f87171;font-weight:600;">尚未設定金鑰</span>，請貼上您的 Google Gemini API Key 以啟用 AI 拍照辨識。`;
    input.value = '';
  };

  const openModal = () => {
    updateStatus();
    modal.style.display = 'flex';
  };

  const closeModal = () => {
    modal.style.display = 'none';
  };

  if (openBtn) openBtn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // 切換金鑰顯示/隱藏
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  }

  // 儲存金鑰
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const val = input.value.trim();
      if (!val) {
        alert('請先輸入或貼上 API Key！');
        return;
      }
      localStorage.setItem('nutriradar_gemini_api_key', val);
      updateStatus();
      alert('✅ API Key 已安全儲存於您的裝置！');
      closeModal();
    });
  }

  // 清除金鑰
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (confirm('確定要清除瀏覽器中儲存的 API Key 嗎？')) {
        localStorage.removeItem('nutriradar_gemini_api_key');
        updateStatus();
      }
    });
  }

  // 監聽外部自動觸發事件（如辨識時未設定金鑰）
  window.addEventListener('nutriradar:open-apikey-modal', () => {
    openModal();
  });
}

// 8. 🔤 長輩友善：字體大小縮放控制 (標準 / 大字 / 特大)
function initFontScaler() {
  const btn = document.getElementById('fontScaleBtn');
  const label = document.getElementById('fontScaleLabel');
  if (!btn || !label) return;

  const MODES = ['normal', 'large', 'xlarge'];
  const MODE_LABELS = {
    normal: '🔤 標準',
    large: '🔤 大字',
    xlarge: '🔤 特大'
  };

  let currentMode = localStorage.getItem('nutriradar_font_scale') || 'normal';
  if (!MODES.includes(currentMode)) currentMode = 'normal';

  const applyMode = (mode) => {
    currentMode = mode;
    localStorage.setItem('nutriradar_font_scale', mode);
    if (mode === 'normal') {
      document.documentElement.removeAttribute('data-font-size');
    } else {
      document.documentElement.setAttribute('data-font-size', mode);
    }
    label.textContent = MODE_LABELS[mode];
  };

  // 初始化套用
  applyMode(currentMode);

  // 點擊循環切換：標準 -> 大字 -> 特大 -> 標準
  btn.addEventListener('click', () => {
    const nextIdx = (MODES.indexOf(currentMode) + 1) % MODES.length;
    applyMode(MODES[nextIdx]);
  });
}

// 9. 📜 拍照測評歷史紀錄管理 (LocalStorage 輕量縮圖保存)
const HISTORY_STORAGE_KEY = 'nutriradar_scan_history';

function initScanHistory() {
  const clearBtn = document.getElementById('clearHistoryBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (confirm('確定要清空所有拍照測評歷史紀錄嗎？')) {
        localStorage.removeItem(HISTORY_STORAGE_KEY);
        renderScanHistory();
      }
    });
  }
  renderScanHistory();
}

function getScanHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

async function saveScanHistoryRecord(foodName, imageSrc) {
  try {
    const history = getScanHistory();
    const currentData = getFormData();
    const thumb = await createThumbnail(imageSrc);

    // 取得當前總分與等級標籤
    const scoreText = document.getElementById('scoreNumber')?.textContent || '--';
    const gradeBadgeText = document.getElementById('gradeBadge')?.textContent || '';

    const newRecord = {
      id: Date.now(),
      name: foodName,
      timeStr: new Date().toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
      score: scoreText,
      gradeBadge: gradeBadgeText,
      thumb: thumb,
      data: currentData
    };

    // 避免名稱與數值完全重複，若有同名項目先過濾移至最前
    const filtered = history.filter(item => item.name !== newRecord.name);
    filtered.unshift(newRecord);

    // 最多保存 25 筆歷史紀錄
    const trimmed = filtered.slice(0, 25);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
    renderScanHistory(newRecord.id);
  } catch (err) {
    console.warn('[NutriRadar] 儲存歷史紀錄失敗:', err);
  }
}

function renderScanHistory(activeId = null) {
  const panel = document.getElementById('scanHistoryPanel');
  const track = document.getElementById('historyTrack');
  const countBadge = document.getElementById('historyCountBadge');
  if (!panel || !track) return;

  const history = getScanHistory();
  if (!history || history.length === 0) {
    panel.style.display = 'none';
    track.innerHTML = '';
    return;
  }

  panel.style.display = 'block';
  if (countBadge) countBadge.textContent = `${history.length} 筆`;
  track.innerHTML = '';

  history.forEach(item => {
    const card = document.createElement('div');
    card.className = `history-card ${activeId === item.id ? 'active' : ''}`;
    card.title = `點擊還原數據與照片：${item.name}`;

    const thumbHtml = item.thumb
      ? `<img class="history-thumb" src="${item.thumb}" alt="${item.name}">`
      : `<div class="history-thumb-placeholder">📷</div>`;

    card.innerHTML = `
      <div class="history-thumb-wrap">
        ${thumbHtml}
      </div>
      <div class="history-card-name">${item.name}</div>
      <div class="history-card-meta">
        <span>${item.timeStr}</span>
        <span class="history-card-score">${item.score}分</span>
      </div>
    `;

    card.addEventListener('click', () => {
      // 標記選中態
      document.querySelectorAll('.history-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      document.querySelectorAll('.preset-card').forEach(p => p.classList.remove('active'));

      // 還原照片預覽（若有縮圖）
      const promptEl = document.getElementById('cameraPrompt');
      const previewContainer = document.getElementById('previewContainer');
      const imagePreview = document.getElementById('imagePreview');
      if (item.thumb) {
        promptEl.style.display = 'none';
        previewContainer.style.display = 'block';
        imagePreview.src = item.thumb;
      }

      // 還原表單數值
      loadFoodData({ ...item.data, name: item.name });

      // 提示狀態條
      const ocrSuccessBar = document.getElementById('ocrSuccessBar');
      const ocrStatusMsg = document.getElementById('ocrStatusMsg');
      if (ocrSuccessBar && ocrStatusMsg) {
        ocrSuccessBar.style.display = 'flex';
        ocrSuccessBar.className = 'ocr-success-banner';
        ocrStatusMsg.innerHTML = `📜 已成功載入拍照歷史：<strong>${item.name}</strong>（${item.timeStr} 測評，得分 ${item.score} 分）`;
      }
    });

    track.appendChild(card);
  });
}

// 產生超輕量縮圖 (寬高最大 140px，體積約 3~5KB，避免擠爆 localStorage)
function createThumbnail(imageSrc, maxWidth = 140, maxHeight = 140) {
  return new Promise((resolve) => {
    if (!imageSrc) return resolve('');
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.65));
    };
    img.onerror = () => resolve('');
    img.src = imageSrc;
  });
}
