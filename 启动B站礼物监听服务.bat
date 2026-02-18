@echo off
cd /d C:\Users\user\minimal-games-site
set BILI_COOKIE_PATH=C:\Users\user\AppData\Local\BiliPKTool\cookie.txt
set SERVER_URL=https://www.wuguijiang.com
set BILIPK_SCRIPT=C:\Users\user\Desktop\jiaobenbili\checkpk.py
set BILIPK_PYTHON=python
set BILIPK_CONFIG=C:\Users\user\Desktop\jiaobenbili\config_gift_only.json
set THREESERVER_SCRIPT=C:\Users\user\Desktop\jiaobenbili\threeserver.py
set THREESERVER_PYTHON=python
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
