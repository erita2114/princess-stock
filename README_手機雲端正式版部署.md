# 小公主存股星球 M2｜原版 V3.6 完整功能 × 手機雲端整合

**目的：保留 V3.6 的小公主角色、紫粉介面、KD 分級、成交輸入、賣出、股息、ETF 分割、年度績效、22 年試算、JSON／CSV 匯出，並讓手機登入後儲存至私人雲端。**

> 目前 M2 是**可部署的手機雲端帳本測試版**，不是完整的正式即時行情版。GitHub Pages 上可以使用所有帳本與試算頁；正式 Shioaji 推播、真正即時 KD、背景 Email 通知尚未開通，絕不將模擬報價冒充即時數字。家用電腦關機仍可登入雲端帳本。

## A. 部署之前
1. **先在原本 V3.6 頁面進入「設定與備份」，按「下載完整 JSON 備份」**。請保管備份，不要把含私人交易紀錄的 JSON 放到 GitHub。
2. 到 https://supabase.com/dashboard 新建 Supabase Project（選擇安全密碼並保留在自己的密碼管理工具）。
3. Supabase → SQL Editor → 貼上 `sql/001_cloud_m2.sql` → 執行。SQL 會建立：
   - `portfolio_states`：完整帳本＋revision，僅本人登入可讀，寫入需經版本檢查 RPC，避免兩個裝置互相覆蓋。
   - `market_snapshots`：等待合法授權的雲端行情服務寫入；手機只能讀，不能修改。
4. Supabase → Authentication → Providers → Email：啟用 Email OTP／Magic Link。建議限制公開註冊、做好 Email 登入驗證，並確認郵件配額。
5. Supabase → Project Settings → API Keys：只取 **publishable key**（或傳統 `anon` public key）和 Project URL。
   - **不要用 `service_role`／`sb_secret_`；更不能把永豐 Shioaji API Key／Secret 放在 GitHub 網頁內。**

## B. GitHub Pages 上線
1. 在你的 GitHub 新增 repository，例如 `princess-stock`。此壓縮檔中 `index.html`、`mobile-cloud.js`、`mobile-cloud.css`、`.github/workflows/pages.yml`、`manifest.webmanifest`、`.nojekyll` 全部上傳至 repo 根目錄。**請勿上傳自己的交易 JSON／API 私鑰。**
2. GitHub repo → Settings → Pages → Source 選 **GitHub Actions**，推送 main 後，等待 `Publish mobile site` Actions 成功。
3. GitHub Pages 網址應類似 `https://<使用者>.github.io/princess-stock/`。
4. 回到 Supabase → Authentication → URL Configuration，把正式 GitHub Pages 網址設定為 Site URL 和 Redirect URLs（需符合實際網址及尾斜線）。
5. 在手機 Chrome/Safari 開網站，第一次輸入 Supabase Project URL 和**公開**金鑰。用 Email 登入並按信件中的連結。
6. 第一次登入會看到「匯入 V3.6 備份 JSON」或「建立全新空白帳本」。**有舊資料請選 JSON 匯入，不要選空白帳本。**
7. 等畫面出現「☁️ 雲端同步完成 · 版本 N」再進行下一步；新增一筆真實成交後重新整理，確認資料仍在。另一支手機登入同個帳號，應讀取相同資料。

## C. V3.6 保留內容與注意事項
- 原 V3.6 七大分頁均保留：成長首頁／買點雷達／交易紀錄／年度成績單／22 年旅程／Email 預覽／設定與備份。
- **所有帳本修改以 Supabase 寫入成功為準。** 寫入失敗會撤回本次前端變更並提示；衝突時禁止靜默覆蓋另一台手機的新資料。
- 原先的備份 JSON 能匯入初次建立的雲端帳本。M2 仍能在「設定與備份」下載 JSON／CSV。
- 手機底部導覽保留七分頁，左右滑動導覽可以找到後面的 Email、設定。
- 「行情與指標測試」的手動欄位／歷史 K 線匯入保留，僅供模擬，不是即時授權報價。正式行情服務尚未部署，所以買點雷達不會憑空顯示最新價。
- **現金、股數、績效都來自你輸入的記錄，非券商官方帳戶資料。** 一筆交易的成本、手續費、股息以真實記錄為準。
- 智慧買入金額目前是**未回測的候選規則**：每月 3,000 基本＋1,000 跨月；60 分 K<20 先布局、雙 KD<20 加大、較前次買入價下跌≥3% 進一步加碼。**系統不會自動下單。**
- 原版 22 年圖是 **10 萬元初始＋4,000 元每月，以固定 3%、5%、7% 情境**試算；非保證收益，尚未包含實際交易對未來報酬的影響。
- 原先 Email 預覽只產生模擬信件，現在通知偏好會與雲端帳本同步；**尚未真正寄信**。為保護隱私，公開網站程式碼不含你之前指定的兩個 Email，請第一次登入後在「Email 買點通知」分頁各填一次並儲存。

## D. 尚未完成但屬正式驗收必要項目
- 永豐 Shioaji 正式行情權限確認、雲端執行環境與授權資料分發條款。
- 可靠的行情服務：盤中推播、斷線重連、資料時間戳、完成 K 棒、完成日 K、高點回檔、停市與過期狀態。
- 雲端定時 Email 觸發、雙收件人送達、去重以及真正收信測試。
- 回測 KD 分批策略與純定期定額的長期資產及勝率；確認參數後再將它當成正式買點建議。

## E. 安全與故障排除
- **看得到雲端登入畫面但按登入收不到信**：檢查 Supabase Email OTP 和驗證 URL、寄信配額、垃圾郵件。
- **登入後顯示 table/function 不存在**：先確認 SQL 已完整執行。
- **按新增後顯示 version_conflict**：另一台裝置剛改過。先按右上角重新同步，再重新輸入本次交易，絕不直接覆蓋遠端。
- **行情無法顯示**：行情服務尚未部署，這是預期限制。不要把 `simulation=True` 的本機行情寫成 `production_authorized`。
- **不能離線填交易**：M2 採線上確認寫入，避免手機離線時誤顯示「已保存」。手機需有網路，離線模式未提供。
