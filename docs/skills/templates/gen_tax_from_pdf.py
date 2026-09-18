#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""电子税务局 VAT 报表 PDF → 拦截规则（模板 / 参考用法，可直接照抄改 CONFIG）。

路线：H3(基底月规则 HTML 数值) ↔ P3(基底月 PDF 数值) ↔ P6(目标月 PDF 数值)
      三段 difflib 序列对齐（float 归一化比较），得到 H6 后**按 td 单元格**写回。

用法（参数覆盖 CONFIG）:
  python3 gen_tax_from_pdf.py [基底月PDF/txt] [目标月PDF/txt] [规则文件.json] [输出.json] \
                             [目标月=06] [基底月=03] [公司=蓝色海洋]

必须先懂的四条（都是踩过的坑）:
  1. **提取顺序决定成败**：P 的数值顺序必须与当年做 H 时一致（当年用 `pdftotext -layout`）。
     本机没有 pdftotext/pdftoppm（无 sudo）→ .pdf 走 `layout_text()`：用 PyMuPDF 的 word 坐标
     重建「先按 y 分行、行内按 x」的排版顺序。实测 H↔P 映射 119/119、自洽=0；直接用
     page.get_text('text') 只有 102/119 且有 2 处不一致（会写出错值）。.txt 走 pdftotext 输出。
  2. **两道硬门槛，不过就不写文件**：① 自洽校验（H3 经 h2p 映射到 P3 后逐值相等；页6 合计行
     因千分位/跨行特殊，放宽为映射覆盖 ≥90%）② 生成后多重集校验（新 HTML 的值必须都能在目标
     PDF 里找到，只放行多出的 0.00——页6 减免性质代码列）。任何一条不过 = 对齐失败，跳过该条。
  3. **写回必须按 td 单元格**：HTML 数值可能被 <br> 拆开（`6,386,<br>939.74`），用
     `>\s*NUM\s*<` 正则计数会漏，导致后续全体错位。
  4. **同月修订（税局重出同月申报表）不要用本脚本**：基底与前一个月对不上，对齐必崩。见
     references/electron-tax-pdf-mapping.md「同月数据修订」（以现有当月规则为基底做定向替换 +
     多重集比对 + 逐行语义核对 + 渲染视觉复核）。

规则文件是 1 空格缩进 + CRLF：读用二进制，写用 newline=''。
"""
import json, re, difflib, copy, sys, glob
from collections import Counter

NUM_RE = r'\d{1,3}(?:,\d{3})*\.\d{2,6}'
REPO = '/mnt/d/Whale/chrome_url_interceptor'

# ── CONFIG（按当月数据改；命令行参数优先）───────────────────────────────────────
CFG = dict(
    src_json=None,           # None = 自动取 rules/ 下日期最新的规则文件
    out_json=None,           # None = 覆盖 src_json（改前先 git 备份）
    store='蓝色海洋',         # 公司（alias 前缀）：蓝色海洋 / 海盛和食品
    base_yy='26', base_mm='03',
    tgt_yy='26',  tgt_mm='06',
    # 页6 合计行 10 个单元格（含减免性质代码列）；PDF 原文若有 432.47/432.46 并存，照抄
    total_fix=['21,623.34', '0.00', '0.00', '0.00', '864.93', '0.00', '432.47', '0.00', '0.00', '432.46'],
)
# PDF 第 1/2/3/6 页 ↔ 报表后缀（与 alias `{公司}-{YY}年{M}月-{后缀}` 对应）
SUFFIXES = [(0, '增值税及附加税费申报表'), (1, '增值税及附加税费申报附列资料'),
            (2, '增值税及附加税费申报附列资料（二）'), (5, '附加税费情况表')]
LENIENT = {'附加税费情况表'}          # 页6 合计行格式特殊，自洽校验放宽为覆盖 ≥90%


def layout_text(page, ytol=3.0):
    """用 word 坐标重建近似 pdftotext -layout 的阅读顺序（先按 y 分行，行内按 x）"""
    words = page.get_text('words')
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
    if src.lower().endswith('.pdf'):
        import fitz
        doc = fitz.open(src)
        return [layout_text(doc[i]) for i in range(doc.page_count)]
    return [p for p in open(src, encoding='utf-8').read().split('\f') if p.strip()]


def nums(t):
    return re.findall(NUM_RE, t)


def html_nums(d):
    return nums(re.sub(r'\s+', '', re.sub(r'<br\s*/?>', '', d)))


def num_cells(d):
    """按文档顺序取出「内容就是一个数」的 td 单元格：(start, end, 值)"""
    out = []
    for m in re.finditer(r'<td[^>]*>([\s\S]*?)</td>', d):
        inner = re.sub(r'\s+', '', re.sub(r'<[^>]+>', '', m.group(1)))
        if re.fullmatch(NUM_RE, inner):
            out.append((m.start(1), m.end(1), inner))
    return out


def write_cells(d, new_vals):
    cells = num_cells(d)
    assert len(cells) == len(new_vals), f'数值单元格 {len(cells)} != 新值 {len(new_vals)}'
    out, prev = [], 0
    for (s, e, _old), v in zip(cells, new_vals):
        out.append(d[prev:s]); out.append(v); prev = e
    out.append(d[prev:])
    return ''.join(out)


def align(a, b):
    fa = [float(x.replace(',', '')) for x in a]
    fb = [float(x.replace(',', '')) for x in b]
    m = {}
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, fa, fb, autojunk=False).get_opcodes():
        if tag == 'equal':
            for k in range(i2 - i1):
                m[i1 + k] = j1 + k
        elif tag == 'replace':
            for k in range(min(i2 - i1, j2 - j1)):
                m[i1 + k] = j1 + k
    return m


def multiset_bad(html_vals, pdf_vals, allow_zero=True):
    ch, cp = Counter(float(x.replace(',', '')) for x in html_vals), Counter(float(x.replace(',', '')) for x in pdf_vals)
    extra = {k: v - cp[k] for k, v in ch.items() if v > cp[k]}
    if allow_zero:
        extra.pop(0.0, None)
    return extra


def fix_total_row(d, total_fix):
    def repl(m):
        row = m.group(0)
        texts = [re.sub(r'<[^>]+>', '', c).replace('\r', '').replace('\n', '').strip()
                 for c in re.findall(r'<td[^>]*>([\s\S]*?)</td>', row)]
        if '合计' not in ''.join(texts[:2]):
            return row
        idx = {'i': 0}

        def repl_td(mm):
            raw = mm.group(0)
            txt = re.sub(r'<[^>]+>', '', raw).replace('\r', '').replace('\n', '').strip()
            if re.match(r'^[\d,]+\.\d{2,6}$', txt) and idx['i'] < len(total_fix):
                v = total_fix[idx['i']]; idx['i'] += 1
                return re.sub(r'>[\s\S]*?<', '>' + v + '<', raw, count=1)
            return raw
        return re.sub(r'<td[^>]*>[\s\S]*?</td>', repl_td, row)
    return re.sub(r'<tr[^>]*>[\s\S]*?</tr>', repl, d)


def newest_rules():
    cands = sorted(glob.glob(f'{REPO}/rules/*_20*_*.json'))
    if not cands:
        raise SystemExit('✗ rules/ 下没有 {店铺}_{YYYYMMDD}_{序号}.json')
    return cands[-1]


def main():
    a = sys.argv[1:]
    if len(a) < 2:
        print(__doc__); sys.exit(1)
    c = dict(CFG)
    base_src, tgt_src = a[0], a[1]
    c['src_json'] = a[2] if len(a) > 2 else (c['src_json'] or newest_rules())
    c['out_json'] = a[3] if len(a) > 3 else (c['out_json'] or c['src_json'])
    c['tgt_mm'] = a[4] if len(a) > 4 else c['tgt_mm']
    c['base_mm'] = a[5] if len(a) > 5 else c['base_mm']
    c['store'] = a[6] if len(a) > 6 else c['store']

    pb, pt = page_texts(base_src), page_texts(tgt_src)
    data = json.loads(open(c['src_json'], 'rb').read().decode('utf-8'))

    bm, tm = int(c['base_mm']), int(c['tgt_mm'])
    tgt_skssqq = f'20{c["tgt_yy"]}-{tm:0>2}-01'
    date_repl = [
        (f'20{c["base_yy"]}年{bm}月1日', f'20{c["tgt_yy"]}年{tm}月1日'),
        (f'20{c["base_yy"]}年{bm}月31日', f'20{c["tgt_yy"]}年{tm}月30日'),
        (f'20{c["base_yy"]}年{bm:0>2}月01日', f'20{c["tgt_yy"]}年{tm:0>2}月01日'),
        (f'20{c["base_yy"]}年{bm:0>2}月31日', f'20{c["tgt_yy"]}年{tm:0>2}月30日'),
    ]

    made = []
    for idx, suffix in SUFFIXES:
        alias = f'{c["store"]}-{c["base_yy"]}年{bm}月-{suffix}'
        base = next((r for r in data['rules'] if r.get('alias') == alias), None)
        if base is None:
            print(f'✗ 缺基底规则 {alias}'); continue
        d = json.loads(base['response'])['Response']['Data']
        h3, p3, p6 = html_nums(d), nums(pb[idx]), nums(pt[idx])
        h2p, p2p = align(h3, p3), align(p3, p6)
        note = ''
        if len(p3) == len(p6) and len(p2p) < len(p3):
            # 同一提取器 + 同一张表 → 等长即按位对应（比 difflib 更稳；结果由多重集门禁兜底）
            note = f' · p3↔p6 等长 {len(p3)} 但对齐只覆盖 {len(p2p)} → 改用按位映射'
            p2p = {i: i for i in range(len(p3))}
        bad = [i for i, j in h2p.items() if float(h3[i].replace(',', '')) != float(p3[j].replace(',', ''))]
        print(f'[{suffix}] H3={len(h3)} P3={len(p3)} P6={len(p6)} '
              f'映射 h2p={len(h2p)}/{len(h3)} p2p={len(p2p)}/{len(p3)} 自洽不一致={len(bad)}{note}')
        # 硬门槛 = 自洽校验（页6 合计行格式脏，放宽为覆盖 ≥90%）；映射未全覆盖只告警 ——
        # 真正的兜底是生成后的多重集校验，能拦住「bad=0 但整体错位」的情况
        cov = ''
        if len(h2p) < len(h3) or len(p2p) < len(p3):
            cov = f' ⚠映射未全覆盖(h2p {len(h2p)}/{len(h3)}, p2p {len(p2p)}/{len(p3)})'
        ok = (not bad) if suffix not in LENIENT else (len(h2p) >= 0.9 * len(h3))
        if not ok:
            print('   ✗ 自洽校验未通过 → 基底规则与该月 PDF 对不上，或数值提取顺序不同。')
            print('     确认基底月份；若给 .txt 请用 pdftotext -layout 输出；「同月数据修订」场景')
            print('     改用 references/electron-tax-pdf-mapping.md 的定向替换流程。本条跳过不写。')
            continue
        h6 = [p6[p2p[h2p[i]]] if i in h2p and h2p[i] in p2p else v for i, v in enumerate(h3)]
        d2 = write_cells(d, h6)
        if suffix == '附加税费情况表':
            d2 = fix_total_row(d2, c['total_fix'])
        for x, y in date_repl:
            d2 = d2.replace(x, y)
        extra = multiset_bad(html_nums(d2), p6)
        if extra:
            hint = ('（页6 合计行 PDF 跨行拆散，需按 electron-tax-pdf-mapping.md 手工按列修正 total_fix）'
                    if suffix == '附加税费情况表' else '')
            print(f'   ✗ 生成结果出现目标 PDF 没有的值 {extra} → 对齐失败，本条跳过不写{hint}')
            continue
        nr = copy.deepcopy(base)
        nr['alias'] = f'{c["store"]}-{c["tgt_yy"]}年{tm}月-{suffix}'
        nr['bodyPattern'] = re.sub(r'20\d\d-\d\d-01', tgt_skssqq, nr['bodyPattern'])
        resp = json.loads(base['response'])
        resp['Response']['Data'] = d2
        nr['response'] = json.dumps(resp, ensure_ascii=False, indent=2)
        made.append(nr)
        print(f'   ✓ {nr["alias"]}{cov}')

    for nr in made:
        hit = next((i for i, r in enumerate(data['rules']) if r.get('alias') == nr['alias']), None)
        if hit is None:
            data['rules'].append(nr)
        else:
            data['rules'][hit] = nr
    if made:
        with open(c['out_json'], 'w', encoding='utf-8', newline='') as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
        print('已写出:', c['out_json'], '| 规则总数:', len(data['rules']))
    else:
        print('未生成任何规则（校验未通过，文件未改动）')


if __name__ == '__main__':
    main()
