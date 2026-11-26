import copy
import pytest
from collector import HEADERS, Sheets, canonical_id, normalize, plan_updates


def row(jid='1'):
    return [f'liepin:{jid}','liepin',jid,'公司','岗位','广州','','','',f'https://www.liepin.com/job/{jid}.shtml','完整原始JD','用户研究','first','last','batch','fingerprint','抓取成功']


def test_liepin_identity_uses_same_url_for_search_and_detail():
    url = 'https://www.liepin.com/job/1986682939.shtml'
    assert canonical_id('liepin', {'id':'86682939','url':url}) == canonical_id('liepin', {'id':'1986682939','url':url})


def test_duplicate_preserves_first_seen_and_combines_queries():
    old = row() + ['已核验','原因','官网','入口','42','processed']
    new = row(); new[12] = 'new first'; new[11] = '国际合作'
    writes, counts = plan_updates([HEADERS, old], [new,new])
    assert counts == {'new':0,'updated':1}
    assert len(writes) == 1
    assert writes[0][0] == 2
    assert len(writes[0][1]) == 17
    assert writes[0][1][12] == 'first'
    assert writes[0][1][11] == '用户研究；国际合作'


def test_blank_jd_cannot_overwrite_good_record():
    new = row(); new[10] = ''
    writes, _ = plan_updates([HEADERS, row()], [new])
    assert writes[0][1][10] == '完整原始JD'
    with pytest.raises(ValueError, match='JD_MISSING'):
        normalize('liepin', {'url':'https://www.liepin.com/job/123.shtml'}, {}, '词','批次')


def test_new_batch_duplicates_allocate_one_row_after_all_populated_rows():
    existing = [HEADERS, row(), ['']*17 + ['核验结果']]
    writes, counts = plan_updates(existing, [row('2'),row('2')])
    assert [n for n, _ in writes] == [4]
    assert counts['new'] == 1


def test_real_writer_raw_only_A_Q_readback_keeps_QA():
    old = row() + ['已核验','原因','官网','入口','42','processed']
    class Fake(Sheets):
        def __init__(self):
            self.grid = [HEADERS,old]
        def read(self):
            return copy.deepcopy(self.grid), {'gridProperties':{'rowCount':1000}}
        def request(self, method, path='', **kwargs):
            body = kwargs['json']
            assert body['valueInputOption'] == 'RAW'
            assert body['data'][0]['range'] == "'国内招聘平台线索'!A2:Q2"
            assert len(body['data'][0]['values'][0]) == 17
            self.grid[1][:17] = body['data'][0]['values'][0]
            return {}
    api = Fake()
    new = row(); new[10] = '=literal JD, never execute as formula'
    api.write_verify([new])
    assert api.grid[1][17:] == old[17:]
    assert api.grid[1][10].startswith('=literal')
    assert api.write_verify([new]) == {'new':0,'updated':1}
