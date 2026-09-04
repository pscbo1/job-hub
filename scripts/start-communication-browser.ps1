$ErrorActionPreference = 'Stop'
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$profile = Join-Path $PSScriptRoot '..\.communication-chrome'
$profile = [IO.Path]::GetFullPath($profile)
New-Item -ItemType Directory -Force -Path $profile | Out-Null
Start-Process -FilePath $chrome -ArgumentList @(
  '--remote-debugging-port=9222',
  "--user-data-dir=$profile",
  '--no-first-run',
  '--no-default-browser-check',
  '--start-minimized',
  'https://www.zhipin.com/web/geek/chat'
)
Write-Output "Communication Chrome started with profile: $profile"
Write-Output 'Complete login in that window. Keep it running while using Communication Hub.'
