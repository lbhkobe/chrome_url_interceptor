#!/usr/bin/env python3
"""电子税务局 PDF → TXCS 拦截规则生成（DescribeSbmxxqcx 报表 HTML 数值替换）。

用法（先 pdftotext -layout 提取两个 PDF）：
  python3 tax-pdf-to-rules.py <3月pdf.txt> <6月pdf.txt> <基底规则0808.json> <输出.json> [目标月份 06]

原理：H3(基底HTML数值) ↔ P3(3月PDF数值) ↔ P6(目标PDF数值) 三段 difflib 序列对齐
（float 归一化比较），按映射替换；日期联动；页6 合计行手工按列修正。
2026-08 验证：4 条规则数值与 PDF 逐格一致。
"""
import json, re, difflib, copy, sys

NUM_RE = r'\d{1,3}(?:,\d{3})*\.\d{2,6}'

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
            n = min(i2 - i1, j2 - j1)
            for k in range(n):
                a2b[i1 + k] = j1 + k
    return a2b

def main():
    if len(sys.argv) < 5:
        print(__doc__)
        sys.exit(1)
    pdf3_txt, pdf6_txt, src_rules_json, out_json = sys.argv[1:5]
    tgt = sys.argv[5] if len(sys.argv) > 5 else '06'

    pages3 = [p for p in open(pdf3_txt, encoding='utf-8').read().split('\f') if p.strip()]
    pages6 = [p for p in open(pdf6_txt, encoding='utf-8').read().split('\f') if p.strip()]
    all_rules = json.load(open(src_rules_json, encoding='utf-8'))['rules']

    # 基底 = 目标月份的前一个月（3月PDF → 6月PDF 时基底是 26.3）
    base_mon = '03' if tgt == '06' else '03'   # 按需改：基底月份后缀
    META = [
        (0, rf'^26\.{base_mon}-01$', '增值税及附加税费申报表', 'BDA0610606'),
        (1, rf'^26\.{base_mon}-02$', '增值税及附加税费申报附列资料', 'BDA0610607'),
        (2, rf'^26\.{base_mon}-03$', '增值税及附加税费申报附列资料（二）', 'BDA0610608'),
        (5, rf'^26\.{base_mon}-06$', '附加税费情况表', 'BDA0611153'),
    ]
    # 页6 合计行按列修正（10 单元格含减免码列；PDF 原文可能 432.47/432.46 并存，照抄）
    TOTAL_FIX = ['21,623.34', '0.00', '0.00', '0.00', '864.93', '0.00', '432.47', '0.00', '0.00', '432.46']
    DATE_REPL = [
        ('2026年3月1日', '2026年6月1日'), ('2026年3月31日', '2026年6月30日'),
        ('2026年03月01日', '2026年06月01日'), ('2026年03月31日', '2026年06月30日'),
        ('2026年4月20日', '2026年7月15日'), ('2026年04月20日', '2026年07月15日'),
        ('2026年4月13日', '2026年7月13日'), ('2026年04月13日', '2026年07月13日'),
    ]
    store, yym, mmm = '蓝色海洋', f'26年{tgt}月', f'2026-{tgt}-01'

    new_rules = []
    for pdf_idx, base_pat, suffix, report_id in META:
        base = next(r for r in all_rules if 'DescribeSbmxxqcx' in r.get('pattern', '')
                    and re.match(base_pat, r.get('alias', '')))
        d = json.loads(base['response'])['Response']['Data']
        h3, p3, p6 = html_nums(d), extract_nums(pages3[pdf_idx]), extract_nums(pages6[pdf_idx])
        h2p, p2p = align_f(h3, p3), align_f(p3, p6)
        bad = sum(1 for i, j in h2p.items() if float(h3[i].replace(',', '')) != float(p3[j].replace(',', '')))
        print(f'[{suffix}] H3={len(h3)} P3={len(p3)} P6={len(p6)} 映射{len(h2p)}/{len(h3)} 自洽不一致={bad}')
        h6 = [p6[p2p[h2p[i]]] if i in h2p and h2p[i] in p2p else v for i, v in enumerate(h3)]
        counter = {'i': 0}
        def do_repl(m):
            i = counter['i']; counter['i'] += 1
            return '>' + h6[i] + '<'
        d2 = re.sub(r'>\s*' + NUM_RE + r'\s*<', do_repl, d)
        if suffix == '附加税费情况表':
            d2 = fix_total_row(d2, TOTAL_FIX)
        for a, b in DATE_REPL:
            d2 = d2.replace(a, b)
        nr = copy.deepcopy(base)
        nr['alias'] = f'{store}-{yym}-{suffix}'
        nr['bodyPattern'] = nr['bodyPattern'].replace('2026-03-01', mmm)
        nr['enabled'] = True
        nr['_new'] = True
        resp = json.loads(base['response'])
        resp['Response']['Data'] = d2
        nr['response'] = json.dumps(resp, ensure_ascii=False, indent=2)
        new_rules.append(nr)
        print(f'  ✓ {nr["alias"]}')

    data = json.load(open(out_json, encoding='utf-8'))
    for nr in new_rules:
        if not any(r.get('alias') == nr['alias'] for r in data['rules']):
            data['rules'].append(nr)
    json.dump(data, open(out_json, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print('已写出:', out_json, '| 规则总数:', len(data['rules']))

def fix_total_row(d, total_fix):
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
                v = total_fix[idx['i']]; idx['i'] += 1
                return re.sub(r'>[\s\S]*?<', '>' + v + '<', raw, count=1)   # 整段替换，跨行文本也能命中
            return raw
        return re.sub(r'<td[^>]*>[\s\S]*?</td>', repl_td, row_html)
    return re.sub(r'<tr[^>]*>[\s\S]*?</tr>', repl, d)

if __name__ == '__main__':
    main()
