# 日期语义替换引擎（txcs-rule-generator 核心）

## 月份上下文 makeMonthCtx(y, m)
一次算好目标月全部日期 token（含环比上月 prev）：
- yymm(2609) / ym(2026-09) / cn(2026年9月)
- mStart/mEnd (20260901/20260930) + dash 版 (2026-09-01/30)
- prevYm / prevStart / prevEnd + dash 版（环比上月，如 2609→2026-08）

## 替换语义（三档判定）
1. compare 键（键名含 compare，如 compareStartDate/compareEndDate）→ prevCtx（环比上月）
2. 普通键：值中的年月 < 基底月 → prevCtx；否则 → tgt
   （猫超 olap 的 bodyPattern 是 "value":"YYYYMMDD" 多行列表，上月一行+本月一行，
    键名都是 value 无法区分，靠这条判定）
3. 日映射 ctxDay(y0,m0,d0)：d0 >= 基底月末 → 目标月末；d0 <= 1 → 目标月初；
   否则 min(d0, 目标月末日)

## 正则 _RX_DATE 分支（一次 replace 扫描，防二次替换）
分支顺序：(\d{4})-(\d{2})-(\d{2}) | (\d{4})(\d{2})(\d{2}) | (\d{4})-(\d{2}) | (\d{4})年(\d{1,2})月 | (\d{4})(\d{2})
关键：所有分支必须过 validYMD/validYM 校验（y∈[1900,2100] && m∈[01,12]），
否则 4 位 code 值（"1757"/"1779"/"1780"）会被 YYYYMM 分支误改成月份 → mock 规则失效。

## response 结构级替换（shiftResponse）
- JSON 可解析 → JSON.parse → 递归 walk：
  - 字符串值按上述语义替换（key 含 compare → prevCtx）
  - 数组元素全为数字或 YYYY-MM-DD 串且长度 > 15 → 视为 trend 每日序列：
    categories 重新生成目标月日期串；data 按目标月天数对齐（截断/尾部补 0）
  - 数值字段不动（指标值保留基底，靠速填表单改）
- 非 JSON（JS function / raw）→ 字符串级 replaceDateValue 兜底

## 模板组识别（buildGroups）
按 pattern 分组；组内 extractMonthOf 从 alias 优先提取：
- 京麦新版_(\d{4})_ / 微信小店(\d{4}) / (\d{2,4})年(\d{1,2})月 / hsh?-(\d{2})\.(\d{1,2})-(\d{2}|total)
fallback bodyPattern（startDate 键；猫超 "value" 行取日期最大的一行 = 本月）。
组内按月份排序，最近一条 = 生成基底。组可生成 = 能提取出至少一条月份。

## 指标速填（京麦新版）
JD_METRICS 8 键（jdr_sch_* 前缀）：
- detectMetrics：getSummary 读 body.data[0][key]；getTrend 读 trend.series 各 code 总量
- applyMetrics summary 分支：写新值 + ##compare = (nv - compareValue)/compareValue（compareValue 保持基底=上期值）
- applyMetrics trend 分支：series.data *= newTotal/oldTotal（每日分布形态保持基底）

## 测试命令（node，无浏览器）
提取 core 并剥 'use strict' 后 eval（strict 直接 eval 函数声明不泄漏，会 ReferenceError）：
```
node -e "const fs=require('fs');const h=fs.readFileSync('tools/txcs-rule-generator.html','utf8');
const m=h.match(/<script id=\"core\">([\s\S]*?)<\/script>/);
eval(m[1].replace(/'use strict';?\s*/g,'')); ..."
```
- /tmp/test_txcs_gen.js：33 断言（各平台 2609 生成、code 保护、指标速填/环比/趋势缩放、extractMonthOf）
- /tmp/e2e_txcs.js：59 模板组全量生成 → 响应 JSON 合法性 + 旧日期残留（允许环比月）+ 模拟扩展导入
- UI 语法：全部 <script> 写临时文件后 node --check
