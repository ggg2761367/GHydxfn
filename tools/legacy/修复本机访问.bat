@echo off
cd /d "%~dp0"

net session >nul 2>&1
if errorlevel 1 (
  echo 正在申请管理员权限...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo ========================================
echo  修复本机打不开 github.io 的问题
echo ========================================
echo.
echo [1/3] 备份 hosts...
powershell -NoProfile -Command "$p='C:\Windows\System32\drivers\etc\hosts'; Copy-Item $p ($p + '.bak-' + (Get-Date -Format yyyyMMddHHmmss)) -Force"

echo [2/3] 注释掉 127.0.0.1 github.io ...
powershell -NoProfile -Command "$p='C:\Windows\System32\drivers\etc\hosts'; $l=Get-Content $p; $l=$l -replace '^127\.0\.0\.1\s+github\.io\s*$','# 127.0.0.1 github.io (disabled)'; [IO.File]::WriteAllLines($p,$l,(New-Object Text.UTF8Encoding($false)))"

echo [3/3] 清理 DNS 缓存...
ipconfig /flushdns >nul

echo.
echo 完成。现在用手机或电脑浏览器打开：
echo https://ggg2761367.github.io/GHydxfn/
echo.
echo 如果本机仍然打不开，多半是当前网络到 GitHub 不稳定，开代理后再试。
echo 手机流量访问不需要做任何设置。
echo.
pause
