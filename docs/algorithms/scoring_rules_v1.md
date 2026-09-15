# 食物營養評分演算法 V1.0 規範手冊 (Scoring Rules Specification)

## 1. 核心評分指標設計

### ① 綜合營養價值分數 (Nutrient Value Score, 0 - 100)
公式設計由「正向營養貢獻 (60%)」與「負向代謝負擔 (40%)」組合而成：

$$S_{\text{raw}} = (\text{Positive Score} \times 0.6) - (\text{Negative Risk} \times 0.4) + 40$$
（將結果 Clamp 限制在 0 ~ 100 之間）

#### A. 正向分數 (Positive Score, 0 - 100)
- **蛋白質密度指標 (Protein Density Index)**：權重 30%
  - 每 100 kcal 蛋白質克數：$E_{\text{protein}} = \frac{\text{Protein (g)}}{\text{Calories}} \times 100$
  - 標準：$\ge 10\text{g/100kcal}$ (滿分), $5\text{g/100kcal}$ (70分), $2\text{g/100kcal}$ (30分)
- **膳食纖維密度 (Dietary Fiber Index)**：權重 30%
  - 每 100 kcal 纖維克數：$E_{\text{fiber}} = \frac{\text{Fiber (g)}}{\text{Calories}} \times 100$
  - 標準：$\ge 3\text{g/100kcal}$ (滿分), $1.5\text{g/100kcal}$ (70分)
- **微量營養素與優質脂肪**：權重 40%
  - 鈣、鐵、鉀、維生素含量相對於每日建議量 (DRI) 之百分比。
  - 不飽和脂肪酸（單元/多元不飽和）佔總脂肪比例。

#### B. 負向風險 (Negative Risk, 0 - 100)
- **游離糖/添加糖比例 (Sugar Calorie Ratio)**：
  - 糖熱量佔比：$R_{\text{sugar}} = \frac{\text{Sugar (g)} \times 4}{\text{Calories}}$
  - 標準：$<5\%$ (0分), $5\%\sim 10\%$ (低負擔), $>20\%$ (高扣分)
- **飽和脂肪熱量比 (Saturated Fat Ratio)**：
  - 飽和脂肪熱量佔比：$R_{\text{sat}} = \frac{\text{SatFat (g)} \times 9}{\text{Calories}}$
  - 標準：$<5\%$ (0分), $>10\%$ (開始扣分), $>25\%$ (極重扣分)
- **反式脂肪 (Trans Fat Penalty)**：
  - 任何 $>0.1\text{g/100g}$ 直接給予重大風險扣分。
- **鈉熱量密度 (Sodium Density)**：
  - 每 100 kcal 鈉毫克數：$\text{Sodium (mg)} / (\text{Calories} / 100)$
  - 標準：$<100\text{mg/100kcal}$ (優), $>400\text{mg/100kcal}$ (重扣)

---

## 2. 空熱量比例 (Empty Calorie Ratio, 0 - 100%)
- 定義：**沒有伴隨足量蛋白質、纖維或微量營養素之精緻糖與純油脂熱量比例**。
- 精緻糖熱量 + 純非健康油脂熱量 $\div$ 總熱量 $\times (1 - \text{Nutrient Shield})$
- *重要防禦*：複合全穀碳水與富含多酚/鉀的天然澱粉不屬於空熱量。

---

## 3. 情境與族群適配度矩陣 (Persona Fit Matrix)

| 族群/情境 | 關注核心 | 演算法加權邏輯 |
| :--- | :--- | :--- |
| 🏋️ **運動補給 / 增肌** | 蛋白質效率、糖原快速回補 | 高蛋白質密度 + 適量碳水加分，極低飽和脂肪加分 |
| ⚖️ **減脂控卡** | 飽足感 (高蛋白/高纖維)、低熱量密度 | 熱量密度 $>3.0\text{kcal/g}$ 扣分，高纖高蛋白大幅加分 |
| 🩺 **血糖管理 / 低 GI** | 總糖量、糖/碳水比、膳食纖維 | 糖量 $>5\text{g/100g}$ 扣分，純碳水無纖維扣分 |
| 👨 **日常全能健康** | 均衡度、低鈉、低飽和脂肪、天然加工程度 | 綜合平衡各項指標 |

---

## 4. 資料完整度指標 (Data Completeness Index, DCI)
$$DCI = 60\% (\text{基礎 8 大標示}) + 20\% (\text{含膳食纖維}) + \sum (\text{微量元素}) \times 5\%$$
- 若 $DCI < 75\%$，系統會發出警示，說明該食品微量價值為預估值。
