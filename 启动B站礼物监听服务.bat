@echo off
cd /d C:\Users\user\minimal-games-site
set BILI_COOKIE_PATH=C:\Users\user\AppData\Local\BiliPKTool\cookie.txt
echo.
echo ========================================
echo    Windows B站礼物发送监听服务
echo ========================================
echo.
echo 正在启动监听服务...
echo.

node windows-gift-listener.js

echo.
echo 服务已停止，按任意键关闭窗口...
pause > nul
