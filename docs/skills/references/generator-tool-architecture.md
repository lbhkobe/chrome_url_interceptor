# 生成器工具架构与核心算法（tools/txcs-rule-generator.html）

维护 D:\Whale\chrome_url_interceptor\tools\txcs-rule-generator.html（单文件、零依赖、双击即用、深色 UI）时使用。核心逻辑在 `<script id="core">`（纯函数无 DOM），UI 在第二个 `<script>`（state 全局对象 + renderXxx() 重渲染），localStorage key `txcs_rulegen_v1` 持久化 {storeName, fileName, rules}。

## 核心算法

### normalizePattern — 模板组分组 key
URL query 中日期参数（date|startDate|endDate|dateRange|dateFrom|dateTo|bizDate|statDate|startTime|endTime|beginDate|finishDate）值 → `<DATE>` 占位。同接口跨月归一组（京麦旧版 54 组→3 组）。

### extractMonthOf — 基底月份提取（顺序 fallback）
1. `京麦(?:新版)?_?(\d{4})_` / `微信小店(\d{4})` → YYMM
2. `(\d{2,4})年(\d{1,2})月` → 2 位年 +2000（**必须 2-4 位都收**：'26年1月' 用 4 位正则匹配不到 → 生意参谋曾整组分组失败）
3. `(?:hsh?[- ])?(\d{2})\.(\d{1,2})-(\d{2}|total)`（电子税 26.3-01）
4. `startDate":"YYYY-MM`
5. bodyPattern `"value":"YYYYMMDD"` 多行取**日期最大**（猫超：上月末+本月末两行，取本月）

### generateRule — 日期联动（replaceDateValue + makeMonthCtx）
- makeMonthCtx(y,m)：目标月全套 token + 环比上月 prevCtx（YYMM/YYYY-MM/YYYYMMDD/月末/月初/dash 格式）
- ctxDay(ctx,y0,m0,d0)：基底月初→目标月初、基底月末→目标月末、其他→min(d0,目标月末)
- replaceBodyPattern 行级语义：key 含 compare → prevCtx；否则值年月 < 基底月（猫超 value 行含上月末）→ prevCtx；否则 tgt
- **日期正则必须校验合法性** validYMD/validYM（y∈1900-2100, m∈01-12）——否则 `"code":"1757"` 会被当 YYYYMM 替换成 202609（真实 bug）
- response 结构级替换 walkDates：字符串日期替换；compare 键用 prevCtx；trend 每日数组（>15 项）按目标月天数对齐（截断/补 0/日期重排）；短对象数组（≤2，猫超 data.data[0]）展开为 `data.data.0.*` 路径
- pattern（URL）整串 replaceDateValue；生成后 clearPeriodOverPeriod 清空字符串 `*_tb/_ind`（不沿用旧环比；_lfl 数字不清）
- 指标速填 applyMetrics：getSummary 8 指标重算 `##compare`；getTrend 按 new/old 总量缩放每日序列

### collectFormFields — 响应→表单
- 微信小店：metaConfig.viewMap.*.viewLabel 优先做中文标签（viewMap.key == total.key）
- 其他：CN_FIELD_MAP 子串匹配 + cnLabelFull 带口径后缀（_1d→日/_28d→28天/real_→实际/itm_→商品…）防重复标签
- 跳过：metaConfig/tips 子树、长数组（trend）、非数字字符串；数字字符串（"6936"）可编辑
- essential 精简模式：ESSENTIAL_FIELDS 白名单（猫超 7 列），按白名单顺序；无白名单接口强制 all
- applyFormValues 按 path 写回，类型保持（number/string）
- computeCompare：同组上月规则逐字段 (cur-prev)/prev 写 `*_tb`；prev=0/空 → 留空
- **function 限制模式**：数据用 `/*__DATA_START__*/…/*__DATA_END__*/` 标记内嵌，extractFnData/replaceFnData 提取/写回；更新模式插入月份行后保持 function 格式；「🔒 隐藏当前月」按钮把 static JSON 一键转 function（返回前 `filter(x => x.stat_date.slice(0,6) < 当前年月)`），去掉限制=responseType 改回 static

## 生成规则关键回归点
- 猫超支付金额/趋势表日期联动（value 上月+本月、compareStartDate 上月）
- code 值 1757 不被 YYYYMM 误替换
- 趋势表"更新模式"插入行（16→18 行、头部新月末）
- **getTrend 生成后 series 必须保持单条（仅支付金额）**：基底若含 6 series（旧源数据/旧规则）生成物会带崩图表；applyMetrics trend 分支按 code 缩放存在的 series，单条时只缩放支付金额
- function 限制模式用 `new Function(fnCode)()` 执行验证过滤当前月（断言不含当月行）
- 表单字段提取/写回往返、computeCompare
- 过滤视图索引映射（idxMap：renderRules 在平台/模板组过滤后，行按钮 data-i 必须用全量数组索引 `idxMap = new Map(); state.rules.forEach((r,i)=>idxMap.set(r,i))`，否则点 A 编辑 B——真实踩过）

## 测试方法
1. node 读 HTML → `html.match(/<script id="core">([\s\S]*?)<\/script>/)` 提取 → **剥掉 'use strict' 后 eval**（严格模式下 eval 的函数声明不泄漏；测试脚本自身也不能有 'use strict'）
2. 用真实规则文件跑 buildGroups + generateRule 断言（模式见 scripts/test_txcs_gen.js 33 断言、scripts/verify-core.js 模板组全量）
3. UI 层语法：提取全部 script 写临时 .js 后 `node --check`（单文件 HTML 无 linter，write_file 不报 JS 错）
4. DOM 行为验证：browser_navigate 打开 `file:///mnt/e/Whale/tmcs_extension/tools/txcs-rule-generator.html`；注入规则用临时 `_test_rules.js`（`window.__RULES__ = [...]`）+ `<script src>` 标签（file:// 页面 fetch 被 CORS 挡、script 标签不受限）；测完删除临时文件
5. 用户报告 UI 状态与代码不符：先 browser 复现（临时 script 注入真实规则，console 驱动 state/render）验证代码能否产生该状态；代码产生不了 → 大概率浏览器缓存旧版或 localStorage 旧数据 → Ctrl+F5 强刷 + 点「清空」重导

## 用户工作流约定（工具设计准则）
- 每月更新：导入最新文件 → 模板组 → 勾选月份（京麦填 8 指标）→ 生成（绿色高亮）→ 表单改值 → 🔄计算环比 → 导出
- 导出文件名 `txcs-interceptor-rules - {店铺}{MMDD}.json`（店铺从导入文件名解析）
- 编辑规则默认「表单编辑」tab，JSON tab 保留；**用户强烈偏好表单配置，不要让他手写 JSON**（非程序员同事也在用）
- 扩展 Import 按 pattern 去重合并 → 同接口新月份规则 pattern 相同会被跳过 → 导入前先清空扩展旧规则
- tools/ 下可能存在并行会话产物 rule-generator.html/js（浅色 UI 拆分版，非本工具）—— 勿混淆勿误删
