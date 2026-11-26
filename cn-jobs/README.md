# 国内平台岗位 -> Google Sheets

独立定时采集服务，供现有「02 岗位核验与Temp入表」读取。不会启动 Job Hub Web 服务。

- 目标：`10Mdham0m-ML1aJqsSKPSJhJVWbjeqz41-vxPsNwr0h4`，工作表「国内招聘平台线索」，只写 A:Q。
- Boss 使用 `boss-agent-cli`，猎聘使用保留 MIT 许可的上游 CLI。只调用 search/detail。
- 广州、北京、深圳；用户研究、海外用户研究、研究助理、项目专员、产品助理、公益项目、国际合作。
- 平台 + URL 对应的稳定岗位 ID 去重；保留首次时间、合并关键词；RAW 写入后回读，R:W 原样保留。
- 首批每渠道2条；当前试跑取消原20条上限，每轮按全部21个城市与词组合检索，每组合读取一页40条；遇平台限制或600秒运行预算则保留准确断点，不保证穷尽全站新增。
- 已有完整 JD 的岗位再次出现时更新最近观察时间，不再次请求详情；不会用空 JD 覆盖正文。
- 登录失效、限流、风控时停止当前来源，其他服务独立运行；没有重试风控或切换通道逻辑。
- 抓取失败、缺正文、写表失败都返回非零退出码。已成功的条目照常保存，未写入批次保留在持久卷 pending 文件。
- 云端保存 state 在各自独立 /data 卷：游标、限重入锁、批次、待重试数据；不可放入 Git。

## 运行

Python 3.12，Node 24；`pip install -r requirements.txt`。

```sh
python collector.py --platform liepin --max-new 2  # 本地只抓取
python collector.py --platform liepin --max-new 2 --write
python -m pytest -q
```

`GOOGLE_SERVICE_ACCOUNT_JSON` 使用 Railway 原 jobcloud-runner 中的服务账号引用，不在代码保存密钥。服务账号必须能编辑目标表。

环境变量：`PLATFORM`、`MAX_NEW`（默认0，无条数上限）、`MAX_QUERIES`（默认21）、`SEARCH_LIMIT`（默认40）、`MAX_SECONDS`（默认600）、`SHEETS_WRITE_ENABLED`（默认关闭）、`STATE_DIR`（云端 /data）、`REQUEST_INTERVAL_SECONDS`（默认3）。

## 定时（验收后启用，UTC）

- Boss：`0 1 * * *`，北京时间每天09:00。
- 猎聘：`30 1 * * *`，北京时间每天09:30（从核验转化率倒推补货量，30条合格为目标而非承诺）。
- 重启策略 NEVER，执行完成退出；不创建 GPT 定时任务。

## Boss 登录

需要在允许登录的浏览器环境执行 `boss --data-dir <持久目录>/boss login`，用户扫码。先验证搜索和详情，再将该私有认证目录安全迁移到 Boss 服务持久卷，使用同一个 `BOSS_AGENT_MACHINE_ID` 维持加密身份。不将 Cookie/cURL/密钥贴进聊天、日志或 Git。当前无登录态时不得声称 Boss 抓取成功，也不得开启定时空转。

## 验收

真实记录写入回读；同批再次写入新增0；首次时间不变；R:W不变；运行日志无密钥；定时仅在对应渠道通过后开启。

### 一次性登录迁移助手

在自己的电脑运行 `python boss_login_bundle.py`。它调用官方 CLI 登录并生成私有认证包。将包内容直接保存到 Railway `cn-boss-collector` 的 `BOSS_AUTH_JSON` 私有变量；不要发到聊天或提交 Git。启动时仅在认证包版本改变时导入持久卷，后续 CLI 刷新会保留。登录过期时重新登录并替换认证包。此助手只准备登录，不开启抓取或定时。
