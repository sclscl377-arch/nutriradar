/**
 * 食物營養價值評分核心計算引擎 (Nutrient Value Scoring Engine)
 * 遵循 WHO 健康飲食準則、台灣食藥署營養標示規範與 NOVA 食品分類法
 */

export function analyzeFoodNutrition(food) {
  const isAllEmpty = (!food.calories || food.calories === "") &&
                     (!food.protein || food.protein === "") &&
                     (!food.fat || food.fat === "") &&
                     (!food.carbs || food.carbs === "");

  if (isAllEmpty) {
    return {
      isEmpty: true,
      overallScore: "--",
      grade: { text: "待輸入數值", tag: "⚪ 待輸入", color: "#9ca3af", badgeClass: "badge-gray" },
      completenessScore: 0,
      missingFields: ["熱量", "蛋白質", "總脂肪", "碳水化合物", "糖", "鈉"],
      radarMetrics: { beneficialDensity: 0, emptyCalorieScore: 0, excessRiskScore: 0, processingScore: 0, generalFit: 0 },
      nutritionRoi: { proteinPer100Kcal: 0, fiberPer100Kcal: null, sugarPer100Kcal: 0, sodiumPer100Kcal: 0, calorieDensity: 0, macrosRatio: { proteinPct: 0, fatPct: 0, carbsPct: 0 } },
      personaFit: {
        workout: { label: "🏃 運動補給 / 增肌", score: 0 },
        weightLoss: { label: "⚖️ 減脂控卡 / 飽足感", score: 0 },
        bloodSugar: { label: "🩺 血糖管理 / 低 GI", score: 0 },
        general: { label: "👨 一般成人維持", score: 0 },
        youth: { label: "👧 成長發育期", score: 0 }
      },
      insights: {
        summary: "請於左側手動輸入包裝標示數值以進行評分。",
        suggestion: "輸入熱量、蛋白質、脂肪、碳水化合物、糖、鈉等數值後，系統將即時呈現完整營養雷達與族群適配評估。",
        highlights: ["📸 請手動填入照片標籤之每 100g / 每 100ml 數值"],
        warning: null
      }
    };
  }

  const calories = Math.max(0.1, Number(food.calories) || 0.1);
  const protein = Math.max(0, Number(food.protein) || 0);
  const fat = Math.max(0, Number(food.fat) || 0);
  const satFat = Math.max(0, Number(food.saturatedFat) || 0);
  const transFat = Math.max(0, Number(food.transFat) || 0);
  const carbs = Math.max(0, Number(food.carbs) || 0);
  const sugar = Math.max(0, Number(food.sugar) || 0);
  const sodium = Math.max(0, Number(food.sodium) || 0);
  
  const hasFiber = food.fiber !== null && food.fiber !== undefined && food.fiber !== "";
  const fiber = hasFiber ? Math.max(0, Number(food.fiber)) : null;

  const hasPotassium = food.potassium !== null && food.potassium !== undefined && food.potassium !== "";
  const potassium = hasPotassium ? Math.max(0, Number(food.potassium)) : null;

  const hasCalcium = food.calcium !== null && food.calcium !== undefined && food.calcium !== "";
  const calcium = hasCalcium ? Math.max(0, Number(food.calcium)) : null;

  const processingLevel = Number(food.processingLevel) || 2; // 1: 天然, 2: 料理原料, 3: 加工, 4: 超加工

  // ==========================================
  // 1. 資料完整度評估 (Data Completeness Index, DCI)
  // ==========================================
  let completenessScore = 60; // 基礎8大標示已有 60%
  const missingFields = [];

  if (hasFiber) completenessScore += 20;
  else missingFields.push("膳食纖維 (Fiber)");

  if (hasPotassium) completenessScore += 10;
  else missingFields.push("鉀 (Potassium)");

  if (hasCalcium) completenessScore += 10;
  else missingFields.push("鈣 (Calcium)");

  // ==========================================
  // 2. Nutrition ROI (每 100 kcal 的營養產出)
  // ==========================================
  const proteinPer100Kcal = (protein / calories) * 100;
  const fiberPer100Kcal = hasFiber ? (fiber / calories) * 100 : 0;
  const sugarPer100Kcal = (sugar / calories) * 100;
  const sodiumPer100Kcal = (sodium / calories) * 100;
  const calorieDensity = calories / 100; // kcal/g

  // 三大營養素熱量佔比
  const proteinCals = protein * 4;
  const fatCals = fat * 9;
  const carbsCals = carbs * 4;
  const totalMacroCals = Math.max(0.1, proteinCals + fatCals + carbsCals);

  const proteinPct = (proteinCals / totalMacroCals) * 100;
  const fatPct = (fatCals / totalMacroCals) * 100;
  const carbsPct = (carbsCals / totalMacroCals) * 100;

  // ==========================================
  // 3. 五大維度評分 (0 ~ 100)
  // ==========================================

  // A. 有益營養密度 (Beneficial Nutrient Density)
  // 依據蛋白質效率、纖維、微量元素加權
  let pScore = Math.min(100, (proteinPer100Kcal / 8) * 50); // 8g/100kcal 為極高分
  let fScore = hasFiber ? Math.min(100, (fiberPer100Kcal / 3) * 50) : 40; // 缺值時保守估算 40
  let microScore = 50;
  if (hasPotassium || hasCalcium) {
    let pts = 0;
    if (hasPotassium) pts += Math.min(50, (potassium / 300) * 50);
    if (hasCalcium) pts += Math.min(50, (calcium / 200) * 50);
    microScore = pts;
  }
  const beneficialDensity = Math.round(pScore * 0.45 + fScore * 0.35 + microScore * 0.2);

  // B. 空熱量比例 (Empty Calorie Ratio - 越低越好，此處轉換為分數: 0=全空熱量, 100=無空熱量)
  // 精緻糖熱量比
  const sugarRatio = (sugar * 4) / calories;
  // 純游離不健康油脂比 (若總脂肪高但無蛋白質/微量元素防護)
  let rawEmptyRatio = sugarRatio;
  if (fatPct > 50 && proteinPct < 10) {
    rawEmptyRatio += (fatPct - 40) / 100 * 0.5;
  }
  // 全穀或高蛋白具有營養防護罩 (Nutrient Shield)
  if (hasFiber && fiber >= 3) rawEmptyRatio *= 0.6;
  if (proteinPer100Kcal >= 5) rawEmptyRatio *= 0.7;

  const emptyRatioPct = Math.min(100, Math.max(0, Math.round(rawEmptyRatio * 100)));
  const emptyCalorieScore = Math.max(0, 100 - emptyRatioPct); // 越高代表空熱量越少

  // C. 代謝過量風險 (Excess Risk Index - 0=極高風險, 100=零負擔)
  let penalty = 0;
  // 糖懲罰 (WHO: >10% 總熱量開始扣分)
  const sugarCalPct = (sugar * 4 / calories) * 100;
  if (sugarCalPct > 10) penalty += Math.min(40, (sugarCalPct - 10) * 1.5);

  // 飽和脂肪懲罰 (WHO: >10% 總熱量開始扣分)
  const satFatCalPct = (satFat * 9 / calories) * 100;
  if (satFatCalPct > 10) penalty += Math.min(30, (satFatCalPct - 10) * 2.0);

  // 反式脂肪重大扣分
  if (transFat > 0.1) penalty += 35;

  // 鈉懲罰 (每 100g > 400mg 或每 100kcal > 150mg)
  if (sodium > 400) penalty += Math.min(25, ((sodium - 400) / 200) * 10);
  if (sodiumPer100Kcal > 200) penalty += 10;

  const excessRiskScore = Math.max(5, Math.round(100 - penalty));

  // D. 加工程度分數 (Processing Score: Level 1=95, 2=85, 3=70, 4=40)
  const processingScores = { 1: 95, 2: 85, 3: 72, 4: 38 };
  const processingScore = processingScores[processingLevel] || 70;

  // ==========================================
  // 4. 綜合營養價值分數 (Nutrient Value Score, 0 - 100)
  // ==========================================
  // 整合正向密度 (40%) + 無空熱量 (25%) + 低風險 (25%) + 天然加工 (10%)
  let overallScore = Math.round(
    beneficialDensity * 0.40 +
    emptyCalorieScore * 0.25 +
    excessRiskScore * 0.25 +
    processingScore * 0.10
  );
  overallScore = Math.min(100, Math.max(5, overallScore));

  // ==========================================
  // 5. 五大族群/情境適配度評分 (Persona Fit)
  // ==========================================
  // 🏋️ 運動/增肌 (重視高蛋白效率、中高碳水回補、低脂)
  let workoutFit = Math.round(
    (proteinPer100Kcal >= 6 ? 90 : proteinPer100Kcal >= 3 ? 75 : 45) +
    (carbsPct >= 50 && satFatCalPct < 5 ? 12 : 0) -
    (excessRiskScore < 60 ? 20 : 0)
  );
  workoutFit = Math.min(99, Math.max(10, workoutFit));

  // ⚖️ 減脂/控卡 (重視高飽足感[蛋白+纖維]、低熱量密度、低糖低脂)
  let weightLossFit = Math.round(
    (proteinPer100Kcal >= 5 ? 40 : proteinPer100Kcal * 7) +
    (hasFiber && fiberPer100Kcal >= 1.5 ? 30 : 15) +
    (sugarCalPct <= 5 ? 20 : 0) -
    (calorieDensity > 3.0 ? 25 : 0) -
    (fatPct > 40 ? 20 : 0)
  );
  weightLossFit = Math.min(99, Math.max(10, weightLossFit));

  // 🩺 血糖管理 (重視極低糖、高纖維、複合澱粉)
  let bloodSugarFit = Math.round(
    (sugar <= 2.5 ? 45 : sugar <= 5 ? 30 : 5) +
    (hasFiber && fiber >= 2 ? 35 : 15) +
    (emptyCalorieScore >= 80 ? 20 : 0) -
    (sugarRatio > 0.15 ? 40 : 0)
  );
  bloodSugarFit = Math.min(99, Math.max(10, bloodSugarFit));

  // 👨 一般成人日常 (均衡全面)
  let generalFit = Math.round(overallScore * 0.9 + 8);
  generalFit = Math.min(99, Math.max(10, generalFit));

  // 👧 青少年/發育期 (熱量充足、有蛋白質、有礦物質)
  let youthFit = Math.round(
    (protein >= 8 ? 35 : protein * 4) +
    (excessRiskScore >= 70 ? 30 : 10) +
    (emptyCalorieScore >= 70 ? 25 : 10) +
    (processingScore >= 70 ? 10 : 0)
  );
  youthFit = Math.min(99, Math.max(10, youthFit));

  // ==========================================
  // 6. AI 一句話智慧總結 & 標籤生成
  // ==========================================
  const insights = generateInsights({
    food,
    overallScore,
    proteinPer100Kcal,
    fiberPer100Kcal,
    hasFiber,
    sugar,
    sodium,
    satFat,
    carbsPct,
    proteinPct,
    fatPct,
    calorieDensity,
    completenessScore,
    processingLevel
  });

  return {
    overallScore,
    grade: getGrade(overallScore),
    completenessScore,
    missingFields,
    radarMetrics: {
      beneficialDensity,
      emptyCalorieScore,
      excessRiskScore,
      processingScore,
      generalFit
    },
    nutritionRoi: {
      proteinPer100Kcal: Number(proteinPer100Kcal.toFixed(2)),
      fiberPer100Kcal: hasFiber ? Number(fiberPer100Kcal.toFixed(2)) : null,
      sugarPer100Kcal: Number(sugarPer100Kcal.toFixed(2)),
      sodiumPer100Kcal: Number(sodiumPer100Kcal.toFixed(1)),
      calorieDensity: Number(calorieDensity.toFixed(2)),
      macrosRatio: {
        proteinPct: Number(proteinPct.toFixed(1)),
        fatPct: Number(fatPct.toFixed(1)),
        carbsPct: Number(carbsPct.toFixed(1))
      }
    },
    personaFit: {
      workout: { label: "🏃 運動補給 / 增肌", score: workoutFit },
      weightLoss: { label: "⚖️ 減脂控卡 / 飽足感", score: weightLossFit },
      bloodSugar: { label: "🩺 血糖管理 / 低 GI", score: bloodSugarFit },
      general: { label: "👨 一般成人維持", score: generalFit },
      youth: { label: "👧 成長發育期", score: youthFit }
    },
    insights
  };
}

function getGrade(score) {
  if (score >= 85) return { text: "優質推薦", tag: "🟢 優秀", color: "#10b981", badgeClass: "badge-green" };
  if (score >= 70) return { text: "良好日常", tag: "🟡 良好", color: "#f59e0b", badgeClass: "badge-yellow" };
  if (score >= 50) return { text: "適量食用", tag: "🟠 尚可", color: "#f97316", badgeClass: "badge-orange" };
  return { text: "少吃為妙", tag: "🔴 警示", color: "#ef4444", badgeClass: "badge-red" };
}

function generateInsights(data) {
  const points = [];
  let summary = "";
  let suggestion = "";

  // 評估蛋白質宣稱與實際效率
  if (data.food.protein >= 12 && data.proteinPer100Kcal < 4) {
    points.push("🔍 雖符合台灣『高蛋白質』法規門檻 (≥12g/100g)，但每 100 kcal 產出約 " + data.proteinPer100Kcal.toFixed(1) + "g，主要能量仍由碳水提供。");
  } else if (data.proteinPer100Kcal >= 6) {
    points.push("🥩 極佳蛋白質投資報酬率 (每 100 kcal 獲取 " + data.proteinPer100Kcal.toFixed(1) + "g 蛋白質)。");
  }

  // 風險項目
  if (data.sodium === 0) {
    points.push("🧂 零鈉配方，心血管代謝負擔極低。");
  } else if (data.sodium > 400) {
    points.push("⚠️ 鈉含量偏高 (" + data.sodium + "mg/100g)，需注意水分攝取與血壓調節。");
  }

  if (data.sugar <= 2.5) {
    points.push("🍬 游離糖含量極低 (" + data.sugar + "g/100g)，非精緻糖負擔食品。");
  } else if (data.sugar > 10) {
    points.push("🚨 含糖量偏高 (" + data.sugar + "g/100g)，空熱量風險上升。");
  }

  // 綜合一句話判斷
  if (data.carbsPct > 70 && data.fatPct < 5 && data.sugar <= 3) {
    summary = "純淨優質的複合碳水基底！零鈉、極低飽和脂肪，能量釋放平穩。";
    suggestion = "非常適合作為運動前中後的能量補給；日常正餐食用時，建議搭配優質蛋白質（如雞胸肉、蛋、豆腐）與深色高纖蔬菜，能使營養均衡度達到滿分。";
  } else if (data.proteinPct > 60) {
    summary = "高純度蛋白質營養濃縮來源，高效修復肌肉組織。";
    suggestion = "適合高強度訓練後或蛋白質攝取不足者，日常仍需配合原型蔬果以維持微量元素平衡。";
  } else if (data.sugar > 10 && data.proteinPct < 5) {
    summary = "高空熱量、低營養密度食品，易造成血糖快速波動。";
    suggestion = "建議嚴格控制食用頻率與份量，避免作為常態點心。";
  } else {
    summary = `綜合營養價值分數 ${data.overallScore} 分，整體品質符合健康平衡原則。`;
    suggestion = "注意控制每餐份量，並根據個人生活作息與運動強度彈性搭配。";
  }

  return {
    summary,
    suggestion,
    highlights: points,
    warning: data.completenessScore < 75 ? "⚠️ 提醒：本包裝未標示膳食纖維或微量礦物質數據，評分系統已採用客觀保守模型推估。" : null
  };
}
