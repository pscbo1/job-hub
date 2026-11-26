"""Run on user's own computer, where a login browser is available. Prints no secrets."""
import base64
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess

root = Path.home()/'.cn-jobs-boss-login'
root.mkdir(exist_ok=True, mode=0o700)
identity = root/'machine-id'
if not identity.exists():
    identity.write_text(secrets.token_hex(32))
    os.chmod(identity, 0o600)
os.environ['BOSS_AGENT_MACHINE_ID'] = identity.read_text().strip()
boss = shutil.which('boss')
if not boss:
    raise SystemExit('请先安装：python -m pip install boss-agent-cli==3.4.228')
result = subprocess.run([boss,'--data-dir',str(root/'boss'),'login'])
if result.returncode:
    raise SystemExit('登录未完成，未导出认证资料。')
auth = root/'boss'/'auth'
bundle = {'machine_id':os.environ['BOSS_AGENT_MACHINE_ID']}
for name in ('salt','session.enc'):
    bundle[name] = base64.b64encode((auth/name).read_bytes()).decode()
out = root/'boss-auth-private.json'
out.write_text(json.dumps(bundle), encoding='utf-8')
os.chmod(out, 0o600)
print('登录认证包已保存在：'+str(out))
print('仅将文件内容粘贴到 Railway 的 cn-boss-collector 服务私有变量 BOSS_AUTH_JSON。')
print('不要把认证包发到聊天、GitHub 或日志。保存后告诉助手继续验证；此操作本身不会开启定时。')
