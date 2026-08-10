---
name: txcs-rule-ops
description: "TXCS 拦截规则全流程：生成/排查/税务PDF/工具维护。Use when 涉及 tmcs_extension 规则。"
version: 1.0.0
---

# TXCS 拦截规则运维（tmcs_extension 全场景）

Chrome MV3 扩展「TXCS URL Interceptor」，拦截京东/京麦、淘宝生意参谋、天猫超市(猫超)、微信小店、电子税务局等数据后台接口，返回 mock 响应展示定制业绩数据。覆盖：每月生成新规则、排查"规则不生效"、电子税务局 PDF→规则、维护规则生成器工具。

## 项目地图
- 扩展本体：`D:\Whale\chrome_url_interceptor`（2026-08 起实际位置，旧文档的 E:\Whale\tmcs_extension 已不存在）
  - `background.js`：declarativeNetRequest 网络层拦截（仅 URL 匹配规则）+ webNavigation.onCommitted 提前注入
  - `injected.js`：MAIN world 覆写 fetch/XHR，规则匹配 = pattern（子串/通配符*/正则 /re/）+ bodyPattern（逐行 AND 子串）+ cookiePattern；**按数组顺序返回第一个命中**
  - `content.js`：规则经 `<html data-txcs-rules>` 属性跨 world 传给 MAIN world（CSP 下唯一通道）
  - `popup.js/html`：规则管理（增删改查/导入导出），v1.1.0+ 平台→接口两级分组
  - `rules/{店铺}_{YYYYMMDD}_{序号}.json`（如 `海盛和食品_20260810_01.json`）：规则文件（{version:1, rules:[]}），**按店铺分文件（海盛和食品/蓝色海洋），每月更新**；**改完规则后必须按此命名重命名最新文件**（2026-08-10 起约定：店铺_下划线_日期_下划线_序号，同一天多次改动序号 01/02/03 递增）
- 规则生成工具：`tools/txcs-rule-generator.html`（单文件、零依赖、双击即用，核心逻辑在 `<script id="core">` 纯函数可 node 提取测试）
- **改扩展源码必须同步升 manifest.json 版本号**（用户硬性要求）

## 规则格式
```json
{ "alias": "猫超-26年6月支付金额", "pattern": "ascp-dc.tmall.com/.../olap",
  "bodyPattern": "\"value\":\"20260531\"\n\"value\":\"20260630\"\n\"code\":\"1757\"",
  "cookiePattern": null, "contentType": "application/json", "status": 200, "enabled": true,
  "response": "{...mock JSON 或 JS function 源码...}", "responseType": "static|function" }
```
- pattern：子串/通配符*/正则 /re/；bodyPattern 每行 AND 子串匹配 POST body
- responseType=function：response 是 JS 函数体（new Function 执行），可用 Date/Math 做动态逻辑；**勿依赖 window/document**（有 bodyPattern 的规则只走 JS 拦截）；数据用 `/*__DATA_START__*/…/*__DATA_END__*/` 标记内嵌以便表单编辑

## 平台分类（按 pattern 自动识别，classifyPlatform）
| 平台 | pattern 特征 | 子类型/要点 |
|---|---|---|
| 京东·京麦新版 | .jd.com/api/lowcode/tradeSummary | getSummary/getTrend（8 指标速填；月份在 bodyPattern；**getTrend 响应 series 必须只有 1 条=支付金额**，多 1 条图表就崩） |
| 京东·京麦旧版 | jd.com/brand、ppzh.jd.com | getProSummary/getProTrend/getVenderDealSummayData（**月份在 URL query**） |
| 淘宝·生意参谋 | sycm.taobao.com | overview/trend（dateRange 在 URL） |
| 天猫超市 | ascp-dc.tmall.com/.../olap | **1757=支付金额 / 1772+value=month=趋势表**（同 URL 靠 code/value 区分模块） |
| 微信小店 | store.weixin.qq.com | liner/query（响应自带 viewLabel 中文标签） |
| 电子税务局 | szc/szzh/sjswszzh（V2 短 pattern 无此前缀） | DescribeSbmxxqcx / DescribeSbmxcx2；**classifyPlatform 必须加 DescribeSbmxxqcx/DescribeSbmxcx2 子串判断**，否则 V2 规则漏归"自定义" |

## 场景导航（按任务加载对应参考）
| 任务 | 加载 |
|---|---|
| 每月生成新规则（工具流程/日期联动/表单编辑） | 本 SKILL「每月例行流程」+ references/date-replacement-engine.md |
| 排查"规则不生效" | 本 SKILL「排查清单」+ references/platform-fingerprints.md |
| 电子税务局 PDF → 规则 | references/electron-tax-pdf-mapping.md + templates/gen_tax_from_pdf.py + **交付前强制全量复核（见下）** |
| 维护生成器工具/改核心算法 | references/generator-tool-architecture.md + scripts/test_txcs_gen.js |
| 两公司规则文件镜像同步 | references/paired-rule-files.md |
| 字段映射细节（猫超 7 列/京麦 8 指标/CN 翻译） | references/platform-fingerprints.md |

## 每月例行流程（工具工作流）
1. 打开 tools/txcs-rule-generator.html → 导入最新规则文件 → 自动识别模板组（按 pattern 归一化分组）
2. 点平台 → 点模板组 → 生成面板**选基底类型**（同接口不同 code/value 是不同模块！如猫超 1757=支付金额 / 1772=趋势表）
3. 勾选目标月份 → 生成：
   - 普通模式：新增规则（alias/pattern/bodyPattern/响应日期全联动）
   - **更新模式**（月份行数组响应，如"趋势分析表-每月数据"）：直接更新现有规则，数组头部插入新行（stat_date=新月末）
4. 点绿色新行 ✏️ → 表单编辑（中文字段；**_lfl 环比必须手动从页面抄**，工具算不出）→ 保存
5. 导出 → **扩展 popup 先清空旧规则再 Import**（扩展按 pattern 去重！）

## 排查"规则不生效"清单（按频率排序）
1. **扩展导入按 pattern 去重**：同接口不同月份规则 pattern 相同 → 不先清空扩展则新规则全被跳过。现象：页面显示旧数据/兜底数据
2. **规则命中顺序**：injected.js 返回第一个命中。bodyPattern 条件少的兜底规则（如"昨日成交概况"仅 code 1757）若排前面会抢走所有同类请求。工具导出已按 bodyPattern 条件数降序排序；排查技巧：**页面显示值 ≈ 某条规则 response 的值 → 就是命中了那条**
3. **接口模块不匹配**：同域名同路径不同 code = 不同页面模块。配了 1757 支付金额，趋势表页面（1772+month）不会请求它 → "没效果"是正常的
4. **分类/分组索引错位**：过滤后按钮 data-index 必须映射全量数组索引（idxMap），否则点 A 开 B
5. 兜底规则补 `"value":"day"` 约束可避免抢请求
6. **getTrend series 数超标 → 图表崩溃**：页面 bar-line-chart 报 `Cannot read properties of undefined (reading 'get')` = mock 返回 6 个 series 而真实 API 只有 1 个（cartesian2d 按 1 条线建轴映射，索引对不上读 undefined）。修复：series 只留第一条 `jdr_sch_trade_deal_ord_ord_amt_sz_trade_deal_snapshot`（支付金额），删其余 5 个（成交单量/商品数/用户数/PV/UV）。2026-08 实测 2501~2608 全部 20 条均中招，已全量修复

## 电子税务局 PDF → 规则（含 2026-08 事故教训）
- reportId 映射：BDA0610606=申报表(-01,PDF第1页) / BDA0610607=附列资料一(-02,第2页) / BDA0610608=附列资料二(-03,第3页) / BDA0611153=附加税费情况表(-06,第6页)；skssqq=税款所属期起
- 响应 Data 是整页报表 HTML，PDF 就是它的渲染；两家公司各 4 条（hsh/hxh=海盛和食品、无前缀=蓝色海洋），reportId 相同仅数值不同
- V2 规则用 pattern 变体 `zhcx/v1/DescribeSbmxxqcx`（原 pattern 子串，仍匹配 URL 但去重键不同 → 与 V1 共存）
- **交付前强制全量复核（缺一不可，教训见 references/electron-tax-pdf-mapping.md）**：
  1. 全表视觉复核：pdftoppm 渲染每页 + 小米 MiMo 视觉（config auxiliary.vision，mimo-v2.5）逐页读出**全部**关键栏次比对（只抽查疑点不算复核）
  2. 独立验证不复用生成逻辑（固定 td 索引验证会"自洽通过"掩盖错位）
  3. 残留旧值全量 grep（上一期所有非零值不得出现在新 HTML）
  4. tr 数量不变
- **固定 td 索引替换必错位**：申报表行结构不统一（栏1/11/24/25 带 rowSpan 分组 td，栏2/12/14/27/30/32/40/41 无）→ 必须"按行内小数 td 顺序替换"（clean 后匹配 `[\d,]+\.\d{2}` 的 td 按序替换，栏次号/等式/'——' 天然跳过），每行替换数 assert 相等
- **HTML 内 `\n` 是字面两字符**（反斜杠+n）：clean 顺序 = 去标签 → `.replace('\\n','').replace('\\t','')` → html.unescape → 去空白
- 日期：所属期起/止 + 填表日期（01 用 PDF 页1 页眉，02/03 按基底顺延）；页 6 合计行 PDF 跨行拆散需手工指定
- 一键生成脚本：templates/gen_tax_from_pdf.py（参考用法）+ scripts/tax-pdf-to-rules.py

## 两公司规则文件互为镜像
- `{公司}_{YYYYMMDD}_{序号}.json`（如 `海盛和食品_20260810_01.json`）每个文件含两家全部规则，仅本公司 enabled=True（海盛和文件里蓝色海洋规则 enabled=False，反之亦然）；两文件同日序号一致
- 改一边必须同步另一边 response（**逐字节一致，仅 enabled 不同**），同步后 `hsh[i]['response'] == blue[i]['response']` 逐索引验证；**只同步 response 字段**，保留目标文件 alias/pattern（两文件 alias 命名可能略异如 V2 前缀位置）
- 文件名日期后缀可能被用户重命名（如 20260809_02 → 新约定 `店铺_YYYYMMDD_序号`），操作前先 ls 确认
- 详见 references/paired-rule-files.md

## 关键陷阱（跨场景通用）
- Windows 挂载盘（E:\）write_file/patch 后必须 read_file/wc 验证（返回 success 不代表写入成功）
- alias 年份位数：`生意参谋-26年1月` 是 2 位年，正则必须 `(\d{2,4})年` 并补 2000
- 日期替换必须校验合法性（y∈1900-2100, m∈01-12）：否则 code 值 `"1757"` 会被 YYYYMM 分支误替换成 202609
- 猫超 olap 的 bodyPattern 两行 `"value":"YYYYMMDD"` 同 key（上月+本月），靠"值年月 < 基底月 → 上月语义"判定
- _lfl 月环比是页面真实环比（相对真实后台上月），文件内算不出来 → 必须手填；rate 类字段 _lfl 是 pt 差值
- 规则文件成对复制、popup 导入前清空、工具导出自动排序——见上
- **getTrend 响应 series 必须单条**（仅支付金额 `jdr_sch_trade_deal_ord_ord_amt_sz_trade_deal_snapshot`）；`script/new_version_json/getTrend_*.json` 源数据与 gen_rules_new_version.js 生成物是 6 series（含成交单量/商品数/用户数/PV/UV），重新生成/导入前先裁减，否则页面图表崩溃
- 单文件 HTML 无 linter：改工具后必须提取 script 用 node --check；core 测试要**剥 'use strict'**（strict eval 不泄漏函数声明）

## 支持文件
- references/platform-fingerprints.md — 各平台接口指纹/字段映射（猫超 1757/1772、7 列实测、京麦 8 指标 code、微信小店 viewLabel、CN 口径翻译）
- references/date-replacement-engine.md — 日期语义替换引擎（makeMonthCtx/replaceDateValue/ctxDay 细节与测试命令）
- references/electron-tax-pdf-mapping.md — 电子税务局 PDF↔规则映射 + 生成事故教训 + 全量复核流程
- references/generator-tool-architecture.md — 生成器工具架构/核心算法（normalizePattern/extractMonthOf/generateRule/collectFormFields）/测试
- references/paired-rule-files.md — 两公司镜像文件同步规则与核对法
- scripts/test_txcs_gen.js — 核心单测+e2e（改工具必跑）；scripts/verify-core.js — 冒烟测试；scripts/test-core-scaffold.js — node 测试脚手架
- scripts/tax-pdf-to-rules.py — 税务 PDF 一键生成脚本；templates/gen_tax_from_pdf.py — PDF→规则最终版模板
