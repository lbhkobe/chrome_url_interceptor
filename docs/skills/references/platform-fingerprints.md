# 平台接口指纹与排查 case study

## 猫超 olap 接口指纹（同 URL 多模块，bodyPattern code/value 区分）

pattern 统一为 `ascp-dc.tmall.com/api/v1/queryData/api-ascp-dc-ai_tj_index_v2/olap`

| 页面模块 | bodyPattern 特征 | alias 模式 |
|---|---|---|
| 支付金额（月度） | `"value":"YYYYMMDD"(上月)\n"value":"YYYYMMDD"(本月)\n"code":"1757"` | 猫超-26年6月支付金额 |
| 趋势分析表-每月数据 | `"value":"mtd"\n"dataType":"array"\n"code":"1772"\n"value":"month"` | 趋势分析表-每月数据（固定名，响应=月份行数组 16~18 行，倒序，每行 stat_date=月末） |
| 趋势分析表（按月多选） | `"value":"[\"20260430\",\"20260331\",...]"`（多月末数组） | 猫超-26年4月趋势分析表 |
| 昨日趋势分析表 | `"code":"1772"\n"value":"day"` | 猫超-昨日-趋势分析表 |
| 昨日成交概况 | `"code":"1757"` | 猫超-昨日成交概况 |
| 实时概况（2 条 JS function） | 无固定 | 猫超-4.8累计支付金额 / 猫超-4.8实时概况指标明细 |

## 猫超趋势表 7 列 → 字段（逐项对过页面截图）

| 列 | 字段 | 备注 |
|---|---|---|
| 日期 | stat_date | 月末日 YYYYMMDD（页面显示 YYYY.MM） |
| 支付金额 | pay_ord_amt_1d | |
| 客单价 | pay_pbt_1d | = 支付金额 ÷ 支付用户数（校验过：1446822.09/20738=69.77 ✓） |
| IPVUV | ipvuv_1d | |
| 支付商品件数 | pay_itm_qty_1d | |
| 支付转化率 | pay_byr_rate_1d | = 支付用户数 ÷ IPVUV，存小数 0.059（页面显示 5.90%） |
| 支付用户数 | pay_byr_cnt_1d | |

趋势表行共 38 键（非 lfl）；支付金额规则行共 146 键（含 28d 等）。新月份行结构深拷贝最新行，数值可从对应月份支付金额规则的 data.data[0] 取（键大多重合）。

## case study：配置了 7/8 月数据但"没效果"

- 症状：用户用工具生成"猫超-26年7月/8月支付金额"（code 1757），趋势分析表页面（15 行表）不显示 mock。
- 根因：趋势分析表页面数据源是"趋势分析表-每月数据"（code 1772 + value=month）的响应数组（16 行，2025.03~2026.06）；用户只加了 1757 规则，1772 规则没更新 → 页面无 7/8 月数据。6 月"有效"是因为 1772 规则本来就带 6 月（金额 1,446,822.09 与截图一致）。
- 修复（脚本侧）：读用户导出文件 → 找"趋势分析表-每月数据" → 深拷贝最新行结构 → 从 7/8 月支付金额规则取对应字段值 → 在数组头部 insert(0)（先 8 月后 7 月，保持倒序）→ 写回。
- 修复（工具侧，已实现）：生成面板"基底类型"下拉可选 趋势分析表-每月数据；该类型生成 = 更新模式（数组头部插行，不新增规则）；表单按 stat_date 分组逐行编辑 7 列。

## case study：过滤视图点编辑弹出生意参谋

- 症状：天猫超市平台视图，点"猫超-26年7月支付金额"✏️，弹窗是"编辑规则（生意参谋-26年1月）"。
- 根因：renderRules 过滤后行按钮 data-i 用的是过滤数组下标（0..22），事件却用 state.rules[i] 全量数组取值 → 错位。
- 修复：idxMap 全量索引映射。注意 renderRules 里 checkbox toggle、edit/dup/del 三按钮都中招，统一修。

## case study：getTrend 图表崩溃（bar-line-chart Cannot read properties of undefined (reading 'get')）

- 症状：京麦新版 7月/8月 趋势图页面报错，图表不渲染
- 根因：真实 API getTrend 只返回 **1 个 series**（支付金额，参考 script/new_version_json/getTrend.json），页面图表按 1 条线初始化坐标轴映射；mock 返回 6 个 series（多出成交单量/商品数/用户数/浏览量PV/访客数UV）→ series Map 索引对不上 → 轴对象 undefined 调 `.get()` 崩溃
- 修复：`series` 只保留第一条 `jdr_sch_trade_deal_ord_ord_amt_sz_trade_deal_snapshot`，删其余 5 个；categories/data 不动（7月/8月各 31 天）
- 排查技巧：报错优先怀疑 series 数与真实 API 不一致，对比 `script/new_version_json/getTrend.json`（1 series）
- 教训：2026-08 发现 **2501~2608 全部 20 条 getTrend 都是 6 series**（同一条生成流水线产出），7/8月只是正在看的月份先爆；已全量裁成单 series。`script/new_version_json/getTrend_*.json` 源数据仍是 6 series，用 gen_rules_new_version.js 重新生成前必须先裁减，否则坑会复发

## case study：生意参谋不出现在模板组列表

- 症状：生意参谋 15 条规则没有"批量生成"组。
- 根因：extractMonthOf 的中文年月正则只认 4 位年（(\d{4})年），而 alias 是"生意参谋-26年1月"（2 位年）；猫超恰好有 bodyPattern value 日期兜底所以没事，生意参谋无 bodyPattern → 全灭。
- 修复：(\d{2,4})年，2 位补 2000。

## 猫超 olap 子类型（同 URL 不同模块，bodyPattern code/value 区分）
| 子类型 | bodyPattern 特征 | 页面 | 响应结构 |
|---|---|---|---|
| 支付金额（月度） | `"value":"上月月末"\n"value":"本月月末"\n"code":"1757"` | 6 张指标卡片 | data.data[0] 146 键 |
| 趋势分析表-每月数据 | `"value":"mtd"\n"dataType":"array"\n"code":"1772"\n"value":"month"` | 15 行月度表 | data.data 是**月份行数组**（每行 stat_date=月末，38 键，倒序） |
| 趋势分析表（按月多选） | `"value":"[\"20260430\",...]"`（字符串化数组） | 趋势表多选 | 同 38 键 |
| 昨日趋势 | `"code":"1772"\n"value":"day"` | 昨日 | 38 键 stat_type=day |
| 昨日成交概况 | `"code":"1757"`（**原来缺 value=day，会抢所有 1757 请求**） | 昨日 | 146 键 |

## 表单编辑要点（collectFormFields）
- 标签优先级：微信小店 viewLabel > CN_FIELD_MAP 子串映射 > 原始 key
- 中文化带口径后缀防重复：_1d→日、_28d→28天、real_→实际、itm_→商品…
- 跳过只读子树（metaConfig/tips）、长数组（trend）、非数字字符串；短数组（≤2 对象）展开 `.0.` 路径；月份行数组按行展开 group=stat_date
- 精简白名单 ESSENTIAL_FIELDS 按 pattern+ruleTypeKey（支付金额 13 字段含 _lfl / 趋势表 7 列）
- 写回按 path 遍历，类型跟随原字段
- function 限制模式规则用 extractFnData/replaceFnData 提取/写回 `/*__DATA_START__*/` 内 JSON

## CN 口径翻译（cnLabelFull 前缀/后缀）
前缀：real_→实际 itm_→商品 cate_→行业 on_line_→在线 add_cart_→加购 fhq_→发货前 fhh_→发货后 total_aft_sale_→售后 total_bfr_sale_→售前 br_tag_→品牌 deliver_→发货 send_→出库 collect_→收藏 pay2home_→到家 robot_→机器人 rg_→人工 pay_→支付 refund_→退款
后缀：_1d→日 _28d→28天 _7d→7天 _14d→14天 _24h→24h _end→期末

## 规则命中顺序（injected.js findRule）
- 数组顺序遍历、第一个命中即返回 → **导出时按 bodyPattern 条件数降序排序**（具体在前、兜底在后）
- 兜底规则案例：昨日成交概况原 bodyPattern 只有 `"code":"1757"` → 抢走所有 code 1757 请求（页面显示它的 19170.92 而不是 7 月配置值）。修复 = 补 `"value":"day"` + 排序

## 测试模式（node 提取 core 逻辑）
```js
const html = fs.readFileSync('tools/txcs-rule-generator.html', 'utf8');
const m = html.match(/<script id="core">([\s\S]*?)<\/script>/);
eval(m[1].replace(/'use strict';?\s*/g, ''));  // 必须剥 use strict，否则函数不泄漏
// 测试脚本自身也不要有 'use strict'
const rules = JSON.parse(fs.readFileSync('rules/txcs-interceptor-rules - 海盛和食品0808.json', 'utf8')).rules;
// 断言：buildGroups 组数/基底月份、generateRule 日期联动、code 不被误替换、
// isMonthArrayResponse + insertMonthRow 行数/顺序、collectFormFields 字段数/写回、computeCompare
```
UI 层语法检查：`new Function(src)` 包裹两个 script 块（core + ui）。
