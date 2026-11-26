"""Bounded read-only collectors -> A:Q only. No ranking or application actions."""
import argparse
import base64
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
from datetime import datetime, timezone, timedelta
from urllib.parse import quote, urlparse

HEADERS = ['平台岗位键','平台','平台岗位ID','公司','岗位','城市','薪资原文','经验原文','学历原文','平台岗位链接','原始JD','搜索关键词','首次抓取时间','最近抓取时间','抓取批次','内容指纹','来源状态']
SHEET_ID = '10Mdham0m-ML1aJqsSKPSJhJVWbjeqz41-vxPsNwr0h4'
TAB = '国内招聘平台线索'
KEYWORDS = ['用户研究','海外用户研究','研究助理','项目专员','产品助理','公益项目','国际合作']
CITIES = ['广州','北京','深圳']
ROOT = Path(__file__).resolve().parent


def now():
    return datetime.now(timezone(timedelta(hours=8))).isoformat(timespec='seconds')


def canonical_id(platform, card):
    # Liepin /job/ URLs prefix some IDs with 19; canonicalize to URL identity
    # so later detail-only ingestion resolves to the same key as search ingestion.
    url = card.get('url', '') if platform == 'liepin' else card.get('job_url', '')
    import re
    if platform == 'liepin':
        match = re.fullmatch(r'https://www\.liepin\.com/(job|a)/(\d+)\.shtml', url)
        if not match:
            raise ValueError('Invalid Liepin public job URL')
        return match.group(2)
    jid = str(card.get('job_id', '')).strip()
    if not jid:
        raise ValueError('Missing platform job ID')
    return jid


def normalize(platform, card, detail, keyword, batch):
    jid = canonical_id(platform, card)
    fields = dict(card)
    fields.update({k:v for k,v in detail.items() if v is not None and v != ''})
    jd = fields.get('description', '')
    if not isinstance(jd, str) or not jd.strip():
        raise ValueError('JD_MISSING')
    url = card.get('url') if platform == 'liepin' else card.get('job_url')
    if not url:
        url = 'https://www.zhipin.com/job_detail/' + jid + '.html'
    if urlparse(url).hostname != ('www.liepin.com' if platform == 'liepin' else 'www.zhipin.com'):
        raise ValueError('Invalid platform URL')
    row = [f'{platform}:{jid}', platform, jid, fields.get('company',''), fields.get('title',''),
           fields.get('location', fields.get('city','')), fields.get('salary',''),
           fields.get('workYears', fields.get('experience','')), fields.get('eduLevel', fields.get('education','')),
           url, jd, keyword, now(), now(), batch, '', '抓取成功']
    row = [str(v) if v is not None else '' for v in row]
    if not row[3] or not row[4]:
        raise ValueError('Missing company or title')
    if any(len(v) > 49000 for v in row):
        raise ValueError('CELL_TOO_LONG: preserve raw JD in pending batch; do not truncate')
    row[15] = hashlib.sha256(json.dumps(row[3:11], ensure_ascii=False).encode()).hexdigest()
    return row


def plan_updates(existing, incoming):
    """Return explicit row writes; caller writes exactly 17 columns, never R:W."""
    index = {}
    for n, source in enumerate(existing[1:], 2):
        row = (list(source) + [''] * 23)[:23]
        if row[0]:
            if row[0] in index:
                raise ValueError('Duplicate existing platform key: manual repair required')
            index[row[0]] = (n, row[:17])
    next_row = max([1] + [n for n, r in enumerate(existing, 1) if any(r)]) + 1
    changed = {}
    counts = {'new':0, 'updated':0}
    for row in incoming:
        row = list(row)
        if row[0] in index:
            n, old = index[row[0]]
            row[12] = old[12] or row[12]
            row[11] = '；'.join(dict.fromkeys(filter(None, (old[11]+'；'+row[11]).split('；'))))
            # Incomplete re-scrapes cannot replace an already complete record.
            if not row[10].strip():
                row = old[:]
            if n not in changed:
                counts['updated'] += 1
        else:
            n = next_row
            next_row += 1
            counts['new'] += 1
        index[row[0]] = (n, row)
        changed[n] = row
    return sorted(changed.items()), counts


class Sheets:
    def __init__(self):
        from google.oauth2.service_account import Credentials
        from google.auth.transport.requests import AuthorizedSession
        info = json.loads(os.environ['GOOGLE_SERVICE_ACCOUNT_JSON'])
        self.http = AuthorizedSession(Credentials.from_service_account_info(info, scopes=['https://www.googleapis.com/auth/spreadsheets']))
        self.base = 'https://sheets.googleapis.com/v4/spreadsheets/' + SHEET_ID

    def request(self, method, path='', **kwargs):
        res = self.http.request(method, self.base + path, timeout=40, **kwargs)
        if res.status_code >= 400:
            # Error body may contain credentials or job text; log status only.
            raise RuntimeError(f'Sheets HTTP {res.status_code}')
        return res.json()

    def read(self):
        meta = self.request('GET', params={'fields':'sheets(properties(sheetId,title,gridProperties))'})
        prop = next(s['properties'] for s in meta['sheets'] if s['properties']['title'] == TAB)
        last = prop['gridProperties']['rowCount']
        result = self.request('GET', '/values/' + quote(f"'{TAB}'!A1:W{last}", safe=''))
        values = result.get('values', [])
        if not values or values[0][:17] != HEADERS:
            raise ValueError('Sheet header mismatch: abort without writing')
        return values, prop

    def write_verify(self, incoming):
        existing, prop = self.read()
        writes, counts = plan_updates(existing, incoming)
        if not writes:
            return counts
        if max(n for n, _ in writes) > prop['gridProperties']['rowCount']:
            raise ValueError('Sheet capacity reached: extend rows explicitly before retry')
        data = [{'range':f"'{TAB}'!A{n}:Q{n}", 'values':[row]} for n,row in writes]
        self.request('POST', '/values:batchUpdate', json={'valueInputOption':'RAW','data':data})
        current, _ = self.read()
        for n, row in writes:
            actual = (current[n-1] + ['']*23)[:23]
            if actual[:17] != row:
                raise RuntimeError('Readback mismatch; retain pending batch')
            before = ((existing[n-1] if n <= len(existing) else []) + ['']*23)[17:23]
            if actual[17:23] != before:
                raise RuntimeError('QA columns changed concurrently; inspect downstream run')
        return counts


class CLI:
    def __init__(self, platform, state, deadline):
        self.platform, self.state, self.deadline = platform, state, deadline
        self.last = 0.0

    def call(self, args):
        # Applies across subprocesses (upstream Liepin delay alone does not).
        time.sleep(max(0, float(os.getenv('REQUEST_INTERVAL_SECONDS','3')) - (time.monotonic()-self.last)))
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError('Run time budget exhausted')
        self.last = time.monotonic()
        if self.platform == 'liepin':
            cmd = ['node', str(ROOT/'vendor/liepin/src/cli.ts')] + args + ['--format','json']
        else:
            cmd = ['boss','--data-dir',str(self.state/'boss'),'--json','--browser-source','httpx-only'] + args
        result = subprocess.run(cmd, text=True, capture_output=True, timeout=min(60, remaining))
        try:
            body = json.loads(result.stdout if result.stdout.strip() else result.stderr)
        except ValueError:
            raise RuntimeError('CLI_FAILED: non-JSON response (see local environment)') from None
        if result.returncode or body.get('ok') is False:
            error = body.get('error', {})
            code = error.get('code') if isinstance(error, dict) else body.get('code')
            # Stop this source on auth, rate limit and risk errors. No channel switching.
            raise RuntimeError('CLI_' + str(code or 'FAILED'))
        return body

    def search(self, query, city, limit):
        if self.platform == 'liepin':
            return self.call(['search','-q',query,'-l',city,'--limit',str(limit)])['results']
        return self.call(['search',query,'--city',city,'--no-cache'])['data'][:limit]

    def detail(self, card):
        if self.platform == 'liepin':
            return self.call(['detail',card['url']])
        return self.call(['detail', card['security_id'], '--job-id',card['job_id']])['data']



def bootstrap_boss(state):
    """Optional private handoff from the user's local CLI; never log the payload."""
    payload = os.environ.get('BOSS_AUTH_JSON')
    if not payload:
        return
    auth = json.loads(payload)
    machine_id = auth['machine_id']
    if not isinstance(machine_id, str) or not machine_id:
        raise ValueError('Invalid Boss authentication bundle')
    os.environ['BOSS_AGENT_MACHINE_ID'] = machine_id
    digest = hashlib.sha256(payload.encode()).hexdigest()
    auth_dir = state/'boss'/'auth'
    auth_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    marker = auth_dir/'import-version'
    if marker.exists() and marker.read_text() == digest:
        return
    files = {name:base64.b64decode(auth[name], validate=True) for name in ('salt','session.enc')}
    if len(files['salt']) != 16 or not files['session.enc']:
        raise ValueError('Invalid Boss authentication bundle')
    for name, data in files.items():
        path = auth_dir/name
        path.write_bytes(data)
        os.chmod(path, 0o600)
    marker.write_text(digest)
    os.chmod(marker, 0o600)


def run(platform, max_new, write):
    state = Path(os.getenv('STATE_DIR', str(ROOT/'state')))
    state.mkdir(parents=True, exist_ok=True)
    os.chmod(state, 0o700)
    with (state/f'{platform}.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if platform == 'boss':
            bootstrap_boss(state)
        client = Sheets() if write else None
        # Retry a previous exact batch before any new scrape. Idempotency comes from sheet keys.
        pending = state/f'{platform}-pending.json'
        if client and pending.exists():
            client.write_verify(json.loads(pending.read_text()))
            pending.unlink()
        print(json.dumps({'platform':platform,'phase':'reading_sheet' if client else 'dry_run'}), flush=True)
        existing = client.read()[0] if client else [HEADERS]
        known = {r[0] for r in existing[1:] if r}
        batch = platform + '-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        queries = [(q,c) for c in CITIES for q in KEYWORDS]
        cursor_path = state/f'{platform}-cursor.json'
        cursor = json.loads(cursor_path.read_text()) if cursor_path.exists() else 0
        cli = CLI(platform, state, time.monotonic()+int(os.getenv('MAX_SECONDS','600')))
        rows, observed = [], {}
        new_count = 0
        error = None
        next_cursor = cursor
        try:
            for offset in range(min(int(os.getenv('MAX_QUERIES','21')), len(queries))):
                pos = (cursor + offset) % len(queries)
                keyword, city = queries[pos]
                print(json.dumps({'platform':platform,'phase':'search','query':keyword,'city':city}, ensure_ascii=False), flush=True)
                cards = cli.search(keyword, city, int(os.getenv('SEARCH_LIMIT','40')))
                for card in cards:
                    jid = canonical_id(platform, card)
                    key = f'{platform}:{jid}'
                    if key in observed:
                        row = observed[key]
                        row[11] = '；'.join(dict.fromkeys((row[11]+'；'+keyword).split('；')))
                        continue
                    if key in known:
                        # Existing complete JD and first-seen stay intact; update observation metadata.
                        old = next(r for r in existing[1:] if r and r[0] == key)
                        row = (old + ['']*17)[:17]
                        if not row[10].strip():
                            row = normalize(platform, card, cli.detail(card), keyword, batch)
                        else:
                            row[11], row[13], row[14] = keyword, now(), batch
                    else:
                        if max_new and new_count >= max_new:
                            break
                        row = normalize(platform, card, cli.detail(card), keyword, batch)
                        new_count += 1
                    rows.append(row)
                    observed[key] = row
                next_cursor = (pos+1) % len(queries)
                if max_new and new_count >= max_new:
                    break
        except Exception as exc:
            error = type(exc).__name__ + ': ' + str(exc)[:160]
        artifact = state/f'{batch}.json'
        artifact.write_text(json.dumps(rows, ensure_ascii=False, indent=2))
        os.chmod(artifact, 0o600)
        if client and rows:
            pending.write_text(json.dumps(rows, ensure_ascii=False))
            os.chmod(pending, 0o600)
            counts = client.write_verify(rows)
            pending.unlink()
        else:
            counts = {'new':new_count, 'updated':len(rows)-new_count}
        # Failed queries are retried next run; rotate successful queries to cover all cities/terms.
        cursor_path.write_text(json.dumps(next_cursor))
        report = {'platform':platform,'batch':batch,'write':write,**counts,'rows':len(rows),'error':error}
        (state/'last-run.json').write_text(json.dumps(report, ensure_ascii=False))
        print(json.dumps(report, ensure_ascii=False))
        if error:
            raise SystemExit(1)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--platform', choices=['boss','liepin'], default=os.getenv('PLATFORM','liepin'))
    parser.add_argument('--max-new', type=int, default=int(os.getenv('MAX_NEW','0')))
    parser.add_argument('--write', action='store_true', default=os.getenv('SHEETS_WRITE_ENABLED') == 'true')
    args = parser.parse_args()
    if args.max_new < 0:
        parser.error('--max-new must be non-negative; 0 means no row-count cap')
    run(args.platform, args.max_new, args.write)
