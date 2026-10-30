M2 共享連線設定修正版

1. 在 GitHub erita2114/princess-stock 專案主目錄上傳新版 mobile-cloud.js，取代同名檔。
2. 上傳 cloud-config.json 到專案根目錄。
3. 在 GitHub 將 cloud-config.json 的 projectUrl 改成真實 Supabase Project URL，publishableKey 改成 publishable 公開金鑰。
4. 絕對不可填入 Secret/service_role/資料庫密碼/券商 API Key。
5. GitHub Pages 更新後，手機開網頁即可自動取得雲端專案設定，但各裝置仍需各自 Email 登入。
6. 原本 V3.6 交易功能和網頁 index.html 不變。
