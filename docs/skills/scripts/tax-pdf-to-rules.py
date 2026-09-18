#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""电子税务局 PDF → TXCS 拦截规则生成（DescribeSbmxxqcx 报表 HTML 数值替换）。

用法:
  python3 tax-pdf-to-rules.py <基底月 PDF 或 txt> <目标月 PDF 或 txt> <规则文件.json> \
                              [输出.json=原地改] [目标月=06] [基底月=03] [公司=蓝色海洋]

例（蓝色海洋 26.3 基底 → 26.6）:
  python3 tax-pdf-to-rules.py 26.3蓝海.pdf 26.6蓝海.pdf \
      /mnt/d/Whale/chrome_url_interceptor/rules/蓝色海洋_20260918_01.json 06 03 蓝色海洋

原理：H3(基底HTML数值) ↔ P3(基底月PDF数值) ↔ P6(目标月PDF数值) 三段 difflib 序列对齐
（float 归一化比较），按映射替换；日期联动；页6 合计行手工按列修正。

⚠ 提取顺序决定成败：三段对齐要求 P 的数值顺序与当年做 H 时一致（当年用 pdftotext -layout）。
  本机没有 pdftotext/pdftoppm（无 sudo），所以 .pdf 走 `layout_text()` —— 用 PyMuPDF 的
  word 坐标重建「先按 y 分行、行内按 x」的排版顺序，实测 H↔P 映射可达 119/119、自洽=0
  （直接用 page.get_text('text') 只有 102/119 且有 2 处不一致）。.txt 走 pdftotext 输出格式。

⚠ 同月数据修订（税局重出同月申报表）不要用本脚本重跑三段对齐：那时基底与前一个月对不上，
  映射会大面积失配并产生假差异；改用 references/electron-tax-pdf-mapping.md「同月数据修订」
  （以现有当月规则为基底做定向值替换 + 多重集比对 + 逐行语义核对 + 渲染视觉复核）。
"""
import json, re, difflib, copy, sys
from collections import Counter

NUM_RE = r'\d{1,3}(?:,\d{3})*\.\d{2,6}'


def layout_text(page, ytol=3.0):
    """用 word 坐标重建近似 pdftotext -layout 的阅读顺序（先按 y 分行，行内按 x）"""
    words = page.get_text('words')          # (x0,y0,x1,y1,word,block,line,word_no)
    if not words:
        return ''
    words.sort(key=lambda w: (w[1], w[0]))
    lines, cur, cury = [], [], None
    for w in words:
        if cury is None or abs(w[1] - cury) <= ytol:
            cur.append(w)
            cury = w[1] if cury is None else cury
        else:
            lines.append(cur); cur = [w]; cury = w[1]
    if cur:
        lines.append(cur)
    return '\n'.join(' '.join(x[4] for x in sorted(l, key=lambda w: w[0])) for l in lines)


def page_texts(src):
    """返回按页的文本列表：.pdf 用 PyMuPDF 坐标重建排版，其他按 \\f 分页的 txt"""
    if src.lower().endswith('.pdf'):
        import fitz
        doc = fitz.open(src)
        return [layout_text(doc[i]) for i in range(doc.page_count)]
    return [p for p in open(src, encoding='utf-8').read().split('\f') if p.strip()]


def extract_nums(text):
    return re.findall(NUM_RE, text)


def html_nums(d):
    d2 = re.sub(r'<br\s*/?>', '', d)
    d2 = re.sub(r'\s+', '', d2)   # 关键：去全部空白，跨行数字("500,691.600\r\n000")才能提取
    return extract_nums(d2)


def align_f(a, b):
    """a/b 为字符串序列，按 float 值对齐（SequenceMatcher），返回 a下标→b下标"""
    fa = [float(x.replace(',', '')) for x in a]
    fb = [float(x.replace(',', '')) for x in b]
    sm = difflib.SequenceMatcher(None, fa, fb, autojunk=False)
    a2b = {}
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal':
            for k in range(i2 - i1):
                a2b[i1 + k] = j1 + k
        elif tag == 'replace':
            for k in range(min(i2 - i1, j2 - j1)):
                a2b[i1 + k] = j1 + k
    return a2b


def num_cells(d):
    """按文档顺序取出「内容就是一个数」的 td 单元格：(start, end, 值)"""
    out = []
    for m in re.finditer(r'<td[^>]*>([\s\S]*?)</td>', d):
        inner = re.sub(r'\s+', '', re.sub(r'<[^>]+>', '', m.group(1)))
        if re.fullmatch(NUM_RE, inner):
            out.append((m.start(1), m.end(1), inner))
    return out


def write_cells(d, new_vals):
    """按 td 单元格写回（必须！数值可能被 <br> 拆开，正则计数器会失步导致整体错位）"""
    cells = num_cells(d)
    assert len(cells) == len(new_vals), f'数值单元格 {len(cells)} != 新值 {len(new_vals)}'
    out, prev = [], 0
    for (s, e, _old), v in zip(cells, new_vals):
        out.append(d[prev:s]); out.append(v); prev = e
    out.append(d[prev:])
    return ''.join(out)


def multiset_bad(html_vals, pdf_vals, allow_zero=True):
    """新 HTML 里出现、但目标 PDF 没有的值（float 比较；页6 减免性质代码列多出的 0.00 放行）"""
    ch, cp = Counter(float(x.replace(',', '')) for x in html_vals), Counter(float(x.replace(',', '')) for x in pdf_vals)
    extra = {k: v - cp[k] for k, v in ch.items() if v > cp[k]}
    if allow_zero:
        extra.pop(0.0, None)
    return extra


def fix_total_row(d, total_fix):
    """页6 合计行按列修正（PDF 增值税税额列跨行拆散，10 个单元格含减免性质代码列）"""
    def repl(m):
        row_html = m.group(0)
        cells = re.findall(r'<td[^>]*>([\s\S]*?)</td>', row_html)
        texts = [re.sub(r'<[^>]+>', '', c).replace('\r', '').replace('\n', '').strip() for c in cells]
        if not any(t for t in texts if re.match(r'^[\d,]+\.\d{2,6}$', t)):
            return row_html
        if '合计' not in ''.join(texts[:2]) and not any(
                '691.600000' in t or '623.34' in t or '864.93' in t for t in texts):
            return row_html
        idx = {'i': 0}

        def repl_td(mm):
            raw = mm.group(0)
            txt = re.sub(r'<[^>]+>', '', raw).replace('\r', '').replace('\n', '').strip()
            if re.match(r'^[\d,]+\.\d{2,6}$', txt) and idx['i'] < len(total_fix):
                v = total_fix[idx['i']]
                idx['i'] += 1
                return re.sub(r'>[\s\S]*?<', '>' + v + '<', raw, count=1)   # 整段替换，跨行文本也能命中
            return raw
        return re.sub(r'<td[^>]*>[\s\S]*?</td>', repl_td, row_html)
    return re.sub(r'<tr[^>]*>[\s\S]*?</tr>', repl, d)


def multiset_bad(html_vals, pdf_vals, allow_zero=True):
    """新 HTML 里出现、但目标 PDF 没有的值（float 比较；页6 减免性质代码列多出的 0.00 放行）"""
    ch, cp = Counter(float(x.replace(',', '')) for x in html_vals), Counter(float(x.replace(',', '')) for x in pdf_vals)
    extra = {k: v - cp[k] for k, v in ch.items() if v > cp[k]}
    if allow_zero:
        extra.pop(0.0, None)
    return extra


# ── 按当月数据改这里 ────────────────────────────────────────────────────────────
# 页6 合计行 10 个单元格（含减免性质代码列）；PDF 原文可能 432.47/432.46 并存，照抄不改
TOTAL_FIX = ['21,623.34', '0.00', '0.00', '0.00', '864.93', '0.00', '432.47', '0.00', '0.00', '432.46']
# 报表后缀（同 {公司}-{YY}年{M}月-{后缀} 命名），对应 PDF 第 1/2/3/6 页
SUFFIXES = [(0, '增值税及附加税费申报表'), (1, '增值税及附加税费申报附列资料'),
            (2, '增值税及附加税费申报附列资料（二）'), (5, '附加税费情况表')]
# 页6 是合计行格式最脏的一页（跨行 6 位小数/无千分位），自洽不一致容忍度放宽到映射覆盖 ≥90%
LENIENT = {'附加税费情况表'}


def main():
    a = sys.argv[1:]
    if len(a) < 3:
        print(__doc__); sys.exit(1)
    base_src, tgt_src, src_json = a[0], a[1], a[2]
    out_json = a[3] if len(a) > 3 else src_json
    tgt_mon = a[4] if len(a) > 4 else '06'
    base_mon = a[5] if len(a) > 5 else '03'
    store = a[6] if len(a) > 6 else '蓝色海洋'

    pages_base = page_texts(base_src)
    pages_tgt = page_texts(tgt_src)
    data = json.load(open(src_json, encoding='utf-8'))
    all_rules = data['rules']

    by, bm, ty, tm = '26', int(base_mon), '26', int(tgt_mon)
    tgt_skssqq = f'20{ty}-{tm:0>2}-01'
    base_skssqq = f'20{by}-{bm:0>2}-01'

    # 日期联动：基底月 → 目标月（年月 + 填表/受理日期；-01 取 PDF 页眉，-02/-03 顺延）
    DATE_REPL = [
        (f'20{by}年{bm}月1日', f'20{ty}年{tm}月1日'), (f'20{by}年{bm}月31日', f'20{ty}年{tm}月30日'),
        (f'20{by}年{bm:0>2}月01日', f'20{ty}年{tm:0>2}月01日'),
        (f'20{by}年{bm:0>2}月31日', f'20{ty}年{tm:0>2}月30日'),
    ]

    new_rules = []
    for pdf_idx, suffix in SUFFIXES:
        alias = f'{store}-{by}年{bm}月-{suffix}'
        base = next((r for r in all_rules if r.get('alias') == alias), None)
        if base is None:
            print(f'✗ 找不到基底规则 {alias}（先在规则文件里确认命名）'); continue
        d = json.loads(base['response'])['Response']['Data']
        h3, p3, p6 = html_nums(d), extract_nums(pages_base[pdf_idx]), extract_nums(pages_tgt[pdf_idx])
        h2p, p2p = align_f(h3, p3), align_f(p3, p6)
        note = ''
        if len(p3) == len(p6) and len(p2p) < len(p3):
            # 同一提取器 + 同一张表 → 等长即按位对应（比 difflib 更稳；结果由多重集门禁兜底）
            note = f' · p3↔p6 等长 {len(p3)} 但对齐只覆盖 {len(p2p)} → 改用按位映射'
            p2p = {i: i for i in range(len(p3))}
        bad = sum(1 for i, j in h2p.items() if float(h3[i].replace(',', '')) != float(p3[j].replace(',', '')))
        print(f'[{suffix}] H3={len(h3)} P3={len(p3)} P6={len(p6)} '
              f'映射 h2p={len(h2p)}/{len(h3)} p2p={len(p2p)}/{len(p3)} 自洽不一致={bad}{note}')
        # 硬门槛 = 自洽校验（页6 合计行格式脏，放宽为映射覆盖 ≥90%）；
        # 映射未全覆盖只告警（真正的兜底是生成后的多重集校验，能拦住"bad=0 但整体错位"）
        cov = ''
        if len(h2p) < len(h3) or len(p2p) < len(p3):
            cov = f' ⚠映射未全覆盖(h2p {len(h2p)}/{len(h3)}, p2p {len(p2p)}/{len(p3)})'
        ok = (bad == 0) if suffix not in LENIENT else (len(h2p) >= 0.9 * len(h3))
        if not ok:
            print('   ✗ 自洽校验未通过 → 基底规则与该月 PDF 对不上，或两者数值提取顺序不同。')
            print('     先确认基底月份与规则；若用 .txt 请用 pdftotext -layout 输出；若是「同月数据修订」')
            print('     场景改用 references/electron-tax-pdf-mapping.md 的定向替换流程。本条跳过，不写文件。')
            continue
        h6 = [p6[p2p[h2p[i]]] if i in h2p and h2p[i] in p2p else v for i, v in enumerate(h3)]
        d2 = write_cells(d, h6)
        if suffix == '附加税费情况表':
            d2 = fix_total_row(d2, TOTAL_FIX)
        for x, y in DATE_REPL:
            d2 = d2.replace(x, y)
        extra = multiset_bad(html_nums(d2), p6)
        if extra:
            hint = ('（页6 合计行 PDF 跨行拆散，需按 electron-tax-pdf-mapping.md 手工按列修正 TOTAL_FIX）'
                    if suffix == '附加税费情况表' else '')
            print(f'   ✗ 生成结果里出现目标 PDF 没有的值 {extra} → 视为对齐失败，本条跳过不写{hint}')
            continue
        nr = copy.deepcopy(base)
        nr['alias'] = f'{store}-{ty}年{tm}月-{suffix}'
        nr['bodyPattern'] = re.sub(r'20\d\d-\d\d-01', tgt_skssqq, nr['bodyPattern'])
        resp = json.loads(base['response'])
        resp['Response']['Data'] = d2
        nr['response'] = json.dumps(resp, ensure_ascii=False, indent=2)
        new_rules.append(nr)
        print(f'   ✓ {nr["alias"]}  skssqq={tgt_skssqq}（基底 {base_skssqq}）{cov}')

    for nr in new_rules:
        hit = next((i for i, r in enumerate(data['rules']) if r.get('alias') == nr['alias']), None)
        if hit is None:
            data['rules'].append(nr)
        else:
            data['rules'][hit] = nr          # 同月重复生成 = 覆盖，避免 pattern 去重后留旧值
    if new_rules:
        with open(out_json, 'w', encoding='utf-8', newline='') as f:   # 规则文件是 CRLF，newline='' 别改
            json.dump(data, f, ensure_ascii=False, indent=1)
        print('已写出:', out_json, '| 规则总数:', len(data['rules']))
    else:
        print('未生成任何规则（校验全部未通过，文件未改动）')


if __name__ == '__main__':
    main()
