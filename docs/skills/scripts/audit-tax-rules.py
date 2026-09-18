#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""税务拦截规则数据审计：规则 HTML ↔ 原始申报表 PDF（非零值反向核对 + 份数逐行对照）。

用法:
  python3 audit-tax-rules.py <规则文件.json> <公司> <月份> <PDF> [页=1,2,3,6]
例:
  python3 audit-tax-rules.py rules/蓝色海洋_20260918_01.json 蓝色海洋 26年6月 "/path/2026.6《增值税...》.pdf"

判据：
  ① **非零值反向核对**：规则里每个非零金额/税额，必须能在 PDF 对应页里找到（float 比较）
     —— 规则有而 PDF 无 = 真疑点；PDF 有而规则无 = 多为格式/未用栏次，仅提示
  ② **份数逐行对照**：附列资料（二）的份数是裸整数，按 栏次 顺序在 PDF 里逐行取值比对
  ③ tr 行数
退出码：有真疑点 = 1。

⚠ 取值方式很关键（2026-09 踩过两版假阳性）：
  - HTML 侧必须**按 td 单元格**取值（把整页标签剥掉再抓数字串会把相邻单元格粘成一个数）
  - PDF 侧必须**按行按 token** 取值（整页去空白抓数字串会把栏次/年份/金额粘起来）
  - PDF 文本层已知格式噪音：千分位缺失（21623.34）、数字中间插空格（19 ,559.49 → token '19' + ',559.49'）、
    6 位小数跨行（500691.600 000）、小数点写成逗号（823,678,75）→ 按下述清洗规则归一
"""
import json, re, sys, os
from collections import Counter

SUF_PAGE = [('增值税及附加税费申报表', 1), ('增值税及附加税费申报附列资料', 2),
            ('增值税及附加税费申报附列资料（二）', 3), ('附加税费情况表', 6)]
# 份数行：栏次 marker（附列资料（二））
CNT_MARKERS = ['1=2+3', '2', '3', '4=5+6+7+8a+8b', '10', '12=1+4+11', '35']


def layout_text(src, page_no):
    """PDF → 近似 pdftotext -layout 的文本（先按 y 分行、行内按 x）"""
    if src.lower().endswith('.pdf'):
        import fitz
        doc = fitz.open(src)
        page = doc[page_no - 1]
        ws = page.get_text('words')
        ws.sort(key=lambda w: (w[1], w[0]))
        lines, cur, cury = [], [], None
        for w in ws:
            if cury is None or abs(w[1] - cury) <= 3.0:
                cur.append(w); cury = w[1] if cury is None else cury
            else:
                lines.append(cur); cur = [w]; cury = w[1]
        if cur:
            lines.append(cur)
        txt = '\n'.join(' '.join(x[4] for x in sorted(l, key=lambda w: w[0])) for l in lines)
        doc.close()
        return txt
    return [p for p in open(src, encoding='utf-8').read().split('\f') if p.strip()][page_no - 1]


def pdf_tokens(txt):
    """PDF 文本 → token 列表（保留顺序；把 ',559.49' 这类被拆的片段并回前一个数字）"""
    toks = []
    for line in txt.split('\n'):
        for t in line.split():
            if t.startswith(',') and toks and re.fullmatch(r'\d+', toks[-1]):
                toks[-1] += t
            else:
                toks.append(t)
    return toks


def norm_num(tok):
    """token → float；仅接受纯数字（去千分位逗号）；否则 None"""
    t = tok.replace(',', '')
    if re.fullmatch(r'\d+\.\d+', t) or re.fullmatch(r'\d+', t):
        try:
            return float(t)
        except ValueError:
            return None
    return None


def pdf_decimals(toks):
    return Counter(norm_num(t) for t in toks if norm_num(t) is not None and '.' in t.replace(',', ''))


def html_cells(d):
    """规则 HTML → 按文档顺序的数值单元格（剥标签/空白后内容必须整格是数字）"""
    out = []
    for m in re.finditer(r'<td[^>]*>([\s\S]*?)</td>', d):
        inner = re.sub(r'\s+', '', re.sub(r'<[^>]+>', '', m.group(1)))
        v = norm_num(inner)
        if v is not None:
            out.append((inner, v, '.' in inner))
    return out


def html_rows(d):
    out = []
    for m in re.finditer(r'<tr[^>]*>([\s\S]*?)</tr>', d):
        out.append([re.sub(r'\s+', '', re.sub(r'<[^>]+>', '', c)) for c in re.findall(r'<td[^>]*>([\s\S]*?)</td>', m.group(1))])
    return out


def main():
    if len(sys.argv) < 5:
        print(__doc__); sys.exit(2)
    rules_path, company, month, pdf = sys.argv[1:5]
    pages = [int(x) for x in sys.argv[5].split(',')] if len(sys.argv) > 5 else [1, 2, 3, 6]
    rules = json.loads(open(rules_path, 'rb').read().decode('utf-8'))['rules']
    fails = 0
    print(f'规则 {os.path.basename(rules_path)} | {company} {month} | PDF {os.path.basename(pdf)}')
    for suf, page_no in SUF_PAGE:
        if page_no not in pages:
            continue
        alias = f'{company}-{month}-{suf}'
        r = next((x for x in rules if x['alias'] == alias), None)
        if r is None:
            print(f'  [缺规则] {alias}'); continue
        d = json.loads(r['response'])['Response']['Data']
        toks = pdf_tokens(layout_text(pdf, page_no))
        cells = html_cells(d)
        hdec = Counter(v for txt, v, isdec in cells if isdec)
        pdec = pdf_decimals(toks)
        only_html = {k: v - pdec[k] for k, v in hdec.items() if v > pdec[k] and k != 0.0}
        only_pdf = {k: v - hdec[k] for k, v in pdec.items() if v > hdec[k] and k != 0.0}
        if only_html:
            fails += 1
        print(f'  {"✓" if not only_html else "✗"} {suf} | enabled={r["enabled"]} '
              f'tr={len(re.findall(r"<tr", d))} 数值格={len(cells)} 小数格={sum(1 for _, _, c in cells if c)} '
              f'| 规则有而PDF无(非0)={sorted(only_html) or "无"}'
              f'{" | PDF多出(非0,多为格式/未用栏次)=" + str(sorted(only_pdf)) if only_pdf else ""}')
        if suf.endswith('（二）'):
            pos = 0
            for cs in html_rows(d):
                if len(cs) >= 4 and cs[1] in CNT_MARKERS:
                    cnt, amt = cs[2], cs[3]
                    idx = next((i for i in range(pos, len(toks)) if toks[i] == cs[1]), None)
                    near, pos = '?', (idx + 1 if idx is not None else pos)
                    if idx is not None:
                        for t in toks[idx + 1:idx + 4]:
                            if re.fullmatch(r'\d{1,3}', t):
                                near = t; break
                    mark = '✓' if near == cnt else '✗'
                    if mark == '✗':
                        fails += 1
                    print(f'      {mark} 栏{cs[1]} 规则份数={cnt} PDF份数={near} 金额={amt}')
    print('审计结论:', '全部一致 ✓' if fails == 0 else f'{fails} 处疑点 ✗')
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
