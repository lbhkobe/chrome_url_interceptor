#!/usr/bin/env python3
# TXCS 税务报表 PDF → 拦截规则生成（v7 最终版）
# 用法：改 PDF 路径 + 日期替换映射 + TOTAL_FIX 后运行；输出合并到目标规则文件
import json, re, difflib, copy

SRC_RULES = '/mnt/e/Whale/tmcs_extension/rules/txcs-interceptor-rules - 海盛和食品0808.json'
WORK = '/mnt/e/ChromeDownloads/txcs-interceptor-rules - 海盛和食品0808-含6月与25年12月V2.json'
NUM_RE = r'\d{1,3}(?:,\d{3})*\.\d{2,6}'

def clean(s):
    return re.sub(r'\s+', '', s)

def pdf_rows(page):
    rows = []
    for l in page.split('\n'):
        nums = re.findall(NUM_RE, l)
        if nums:
            rows.append({'text': clean(l), 'nums': nums})
    return rows

def html_tr_rows(d):
    out = []
    for row in re.findall(r'<tr[^>]*>([\s\S]*?)</tr>', d):
        cells = [re.sub(r'\s+', '', re.sub(r'<[^>]+>', '', c)) for c in re.findall(r'<td[^>]*>([\s\S]*?)</td>', row)]
        nums = [c for c in cells if re.match(r'^\d{1,3}(?:,\d{3})*\.\d{2,6}$', c)]
        if nums:
            labels = [c for c in cells if not re.match(r'^\d{1,3}(?:,\d{3})*\.\d{2,6}$', c) and len(c) >= 2]
            out.append({'tr': row, 'nums': nums, 'labels': labels})
    return out

def lcs_map(a, b):
    fa = [float(x.replace(',', '')) for x in a]
    fb = [float(x.replace(',', '')) for x in b]
    sm = difflib.SequenceMatcher(None, fa, fb, autojunk=False)
    m = {}
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == 'equal':
            for k in range(i2 - i1):
                m[i1 + k] = j1 + k
        elif tag == 'replace':
            n = min(i2 - i1, j2 - j1)
            for k in range(n):
                m[i1 + k] = j1 + k
    return m

def match_label_row(labels, rows):
    for lab in labels:
        for r in rows:
            if lab in r['text']:
                return r
    return None

def replace_tr_nums(row_html, hstrs):
    counter = {'i': 0}
    def repl_td(mm):
        raw = mm.group(0)
        txt = re.sub(r'\s+', '', re.sub(r'<[^>]+>', '', raw))
        if re.match(r'^\d{1,3}(?:,\d{3})*\.\d{2,6}$', txt) and counter['i'] < len(hstrs):
            v = hstrs[counter['i']]
            counter['i'] += 1
            m2 = re.match(r'(<td[^>]*>)[\s\S]*?(</td>)', raw)
            return m2.group(1) + v + m2.group(2) if m2 else raw
        return raw
    return re.sub(r'<td[^>]*>[\s\S]*?</td>', repl_td, row_html)

def fix_total_row(d, total_fix):
    """页6 合计行手工修正（PDF 增值税税额列跨行拆散，10 值含减免码列）"""
    def repl(m):
        row_html = m.group(0)
        texts = [re.sub(r'\s+', '', re.sub(r'<[^>]+>', '', c)) for c in re.findall(r'<td[^>]*>([\s\S]*?)</td>', row_html)]
        nums = [t for t in texts if re.match(r'^\d{1,3}(?:,\d{3})*\.\d{2,6}$', t)]
        if not nums:
            return row_html
        joined = ''.join(texts[:2])
        if '合计' not in joined and not any('691.600000' in t or '623.34' in t or '864.93' in t for t in texts):
            return row_html
        idx = {'i': 0}
        def repl_td(mm):
            raw = mm.group(0)
            txt = re.sub(r'\s+', '', re.sub(r'<[^>]+>', '', raw))
            if re.match(r'^\d{1,3}(?:,\d{3})*\.\d{2,6}$', txt) and idx['i'] < len(total_fix):
                v = total_fix[idx['i']]
                idx['i'] += 1
                m2 = re.match(r'(<td[^>]*>)[\s\S]*?(</td>)', raw)
                return m2.group(1) + v + m2.group(2) if m2 else raw
            return raw
        return re.sub(r'<td[^>]*>[\s\S]*?</td>', repl_td, row_html)
    return re.sub(r'<tr[^>]*>[\s\S]*?</tr>', repl, d)

def gen_rules(base3_pdf, target_pdf, meta, date_repl, total_fix_map, alias_fn, pattern_fn, skssqq):
    with open(SRC_RULES, encoding='utf-8') as f:
        all_rules = json.load(f)['rules']
    p3_pages = [p for p in open(base3_pdf, encoding='utf-8').read().split('\f') if p.strip()]
    pt_pages = [p for p in open(target_pdf, encoding='utf-8').read().split('\f') if p.strip()]
    out = []
    for pdf_idx, base_pat, suffix, report_id in meta:
        base = next(r for r in all_rules if 'DescribeSbmxxqcx' in r.get('pattern','') and re.match(base_pat, r.get('alias','')))
        d = json.loads(base['response'])['Response']['Data']
        p3r = pdf_rows(p3_pages[pdf_idx])
        ptr = pdf_rows(pt_pages[pdf_idx])
        hrows = html_tr_rows(d)
        d2 = d
        ok = fallback = 0
        for hr in hrows:
            p3row = match_label_row(hr['labels'], p3r)
            ptrow = match_label_row(hr['labels'], ptr)
            if p3row is None or ptrow is None:
                fallback += 1
                continue
            m = lcs_map(hr['nums'], p3row['nums'])
            new_vals = [ptrow['nums'][m[i]] if (i in m and m[i] < len(ptrow['nums'])) else hr['nums'][i]
                        for i in range(len(hr['nums']))]
            if len(new_vals) != len(hr['nums']):
                fallback += 1
                continue
            d2 = d2.replace(hr['tr'], replace_tr_nums(hr['tr'], new_vals))
            ok += 1
        for a, b in date_repl:
            d2 = d2.replace(a, b)
        if suffix in total_fix_map:
            d2 = fix_total_row(d2, total_fix_map[suffix])
        nr = copy.deepcopy(base)
        nr['alias'] = alias_fn(suffix)
        nr['pattern'] = pattern_fn(base)
        nr['bodyPattern'] = nr['bodyPattern'].replace('2026-03-01', skssqq)
        nr['enabled'] = True
        nr['_new'] = True
        resp = json.loads(base['response'])
        resp['Response']['Data'] = d2
        nr['response'] = json.dumps(resp, ensure_ascii=False, indent=2)
        out.append(nr)
        print(f'  [{suffix}] 行匹配 {ok}/{len(hrows)} 兜底 {fallback} → {nr["alias"]}')
    return out

if __name__ == '__main__':
    META = [
        (0, r'^26\.3-01$', '增值税及附加税费申报表', 'BDA0610606'),
        (1, r'^26\.3-02$', '增值税及附加税费申报附列资料', 'BDA0610607'),
        (2, r'^26\.3-03$', '增值税及附加税费申报附列资料（二）', 'BDA0610608'),
        (5, r'^26\.3-06$', '附加税费情况表', 'BDA0611153'),
    ]
    # ===== 按需修改以下配置 =====
    print('参考 skill 说明修改 PDF 路径/日期映射/TOTAL_FIX 后运行')
