# 洗澡狀態與共享塗鴉

家人洗完澡後，點亮自己對應的 1、2、3 號燈，並可在同一個畫布上畫圖。三盞燈使用相同的灰色／淡黃色效果，各自切換。沒有每日重設，也不會因關燈清空畫布。畫布不以燈光狀態作為編輯鎖。

## 目前實作

React、TypeScript、Vite 手機介面，觸控與滑鼠畫筆、粗細、顏色、整個物件橡皮擦、可拖曳貼圖、圖片上傳。Supabase PostgreSQL 儲存每個作品與每盞燈，Realtime 通知後重新讀取；新增作品不覆寫整張畫布。只有自己的作品可移動或移除，撤回由伺服器選取這位訪客的最後一個尚未撤回操作（包括燈光）。另一人已再次切換同一盞燈時，撤回會被拒絕，以免覆蓋別人的操作。

**必須完成下列 Supabase 設定才可使用。** 缺少設定時顯示「尚未設定共享服務」，按鈕停用，不會退回 localStorage 假裝共享。本機舊版作品不會自動搬到資料庫。Supabase SDK 只在瀏覽器保存登入 session，畫布與燈光均存於伺服器。

## 第一次設定 Supabase（不需要提供密碼給開發者）

1. 開啟 <https://supabase.com/dashboard>，自行註冊／登入，按 **New project**。選擇自己的組織、專案名稱與靠近家人的地區。建立時要求的資料庫密碼由你自行設定、保管，不必貼到聊天或 Repository。
2. 開啟專案，進入 **Authentication → Sign In / Providers → Anonymous Sign-Ins**，開啟 **Allow anonymous sign-ins**，儲存。網站會自動匿名登入，家人不需要輸入帳號。
3. 進入 **SQL Editor → New query**，複製 [這份 SQL 的完整內容](supabase/migrations/202610120001_family_board.sql)，貼上並按 **Run**。它會建立三盞燈、作品表、操作紀錄、權限、逐筆更新／撤回函式、私有圖片 bucket，並將表加入 Realtime publication。重跑不會重設既有燈光或作品。
4. 到 **Project Settings → API / API Keys**（也可從專案的 **Connect** 視窗查看），取得 **Project URL** 與 **Publishable key**；舊專案的 **anon public key** 也可使用。**不要使用 secret key 或 service_role key。**
5. 本機／Codex：把 `.env.example` 複製成 `.env.local`，填入 `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_PUBLISHABLE_KEY`。`.env.local` 不會被 Git 提交。更改後重新啟動開發伺服器。
6. Vercel：專案 **Settings → Environment Variables** 新增同樣兩個變數，套用 **Production** 及 **Preview**（如果預覽也使用此資料庫）。值是上述網址及允許公開的 key，沒有管理金鑰。儲存後 **重新部署**，Vite 才會把新設定編入網站。
7. 使用兩個不同瀏覽器／手機開啟同一個部署網址：一邊亮燈，另一邊應更新；同時畫兩筆應都保留；加入貼圖／圖片並重新整理確認保留；按撤回不應刪除另一人的筆畫。若顯示連線錯誤，檢查匿名登入、SQL、環境變數及 Realtime 是否完成。

目前只有一份家庭畫布，不需要房間代碼。**任何能匿名登入此專案的訪客都可讀取畫布和切換燈光；網址不是存取密碼。** 如需只允許指定家人存取，需另外實作邀請名單／正式登入，不能只隱藏網址。

## 在 Codex 開啟

Node.js 24：

```sh
cd /workspace/three-lights-website
npm ci
npm run dev -- --port 5173
```

在有預覽功能的 Codex 工作區，選 **Ports／預覽 → 5173**。開發伺服器監聽 `0.0.0.0`。目前 onboarding UI 若沒有預覽入口，使用 Vercel 的 HTTPS 預覽部署。不要把雲端 localhost 當作家人能開啟的網址。雲端開發環境若採網域白名單，須允許自己專案的 `<project-ref>.supabase.co`（HTTPS 和 Realtime WebSocket）。

## 更新目前的 Vercel 網站

1. 在 GitHub 審查此分支的 PR，合併到 Vercel 追蹤的 `main`。
2. 完成上方 Supabase 的步驟 1–4。
3. 在 Vercel 原有專案加入步驟 6 的兩個變數，不必建立另一個 Vercel 專案。
4. 到 **Deployments**，選最新部署右側選單 **Redeploy**。確認 Framework 是 **Vite**、Build Command 是 `npm run build`、Output Directory 是 `dist`、Install Command 是 `npm ci`，Node.js 為 24。
5. 用原有網址完成雙裝置驗收。未填設定就先部署，網站會顯示未設定錯誤，並停用共享操作。

## 建置與測試

```sh
npm install
npm test
npm run build
```

`npm ci` 可依 lockfile 重複安裝。單元測試使用明確標示的 repository test double，只驗證 UI／失敗處理；不能當成 Supabase 共享已運作的證據。

### 真正的雙瀏覽器測試

`npm run test:e2e` 使用兩個獨立 browser context、不同匿名使用者，連到 `.env.local` 指定的 **真實 Supabase API**，測試：亮燈同步、同時畫圖、貼圖移動、圖片跨訪客讀取、重新整理、個人撤回及關燈保留作品。沒有環境變數會明確 skipped，不會跑 mock。測試會產生並撤回作品，留下操作紀錄和圖片檔案；請用測試專案執行。

一般開發電腦先 `npx playwright install chromium`，再 `npm run test:e2e`。有系統 Chromium 的 Codex 可用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`。

### 使用本機 Supabase

需要 Docker 和 Supabase CLI 2.120.0。使用已提交的 `supabase/config.toml`：

```sh
# Codex 的家目錄唯讀時使用受支援的 SUPABASE_HOME 覆寫，勿改 HOME。
SUPABASE_HOME=/tmp/three-lights-supabase SUPABASE_USE_SLIM_IMAGES=true SUPABASE_INTERNAL_IMAGE_REGISTRY=ghcr.io npx --yes supabase@2.120.0 start -x studio,imgproxy,mailpit,postgres-meta,edge-runtime,logflare,vector,supavisor
```

CLI 會套用 migrations。本次 Codex 的容器 healthcheck 使用 wget，對容器自己的 loopback 請求被環境代理回覆 403；服務本身的 API 正常。因此此環境啟動命令可加 `--ignore-health-check`，但之後必須用下列直接檢查與 e2e 驗證服務，不能只看容器 PID：

```sh
docker exec -e http_proxy= -e HTTP_PROXY= -e https_proxy= -e HTTPS_PROXY= supabase_auth_three-lights-website wget -q --spider http://127.0.0.1:9999/health
docker exec -e http_proxy= -e HTTP_PROXY= -e https_proxy= -e HTTPS_PROXY= supabase_realtime_three-lights-website wget -q --spider --header Host:realtime-dev http://127.0.0.1:4000/api/ping
docker exec -e http_proxy= -e HTTP_PROXY= -e https_proxy= -e HTTPS_PROXY= supabase_storage_three-lights-website wget -q --spider http://127.0.0.1:5000/status
```

一般電腦沒有此代理問題時不需要這個參數。將本機 API URL 和公開 anon/publishable key 放進 `.env.local`，**不要複製管理 key**，再執行 e2e。新 SQL 可用 `supabase db reset` 套用，但此命令會清空本機測試資料，不能拿去重設家人的雲端專案。GitHub CI 執行 UI 測試與建置；Supabase e2e 需另外提供測試後端，未自動放進一般 CI。

## 防濫用與管理

圖片上限 1 MB，輸入僅 PNG/JPEG/WebP，解碼尺寸最多 4096×4096。前端重編碼成 PNG、縮至最長邊 1024 並移除 metadata。Storage 私有 bucket 在伺服器限制 1 MB 和 image/png。所有資料表啟用 RLS，訪客沒有直接寫表權限；只能呼叫驗證作者、座標、顏色、筆畫點數、版本及配額的 RPC。每人每分鐘最多 60 次建立／修改、每日最多 5000 次；畫布最多 500 個未刪除物件。每人最多 20 張、整體最多 200 張儲存圖片（RLS 數量檢查不是強一致的同時上傳配額）。

匿名帳號可重建，以上限制不是對抗惡意公開流量的完整保障。Storage 的 MIME 檢查不等於後端檔案內容掃描；惡意客戶端能繞過前端轉檔。正式公開大規模使用前需補 CAPTCHA（含前端 token）、可信後端圖片掃描／重編碼及 IP 限流。此版本沒有開啟 CAPTCHA，因此不要只在 Supabase 開啟 CAPTCHA 而未接前端，否則登入會失敗。

管理者可在 Supabase SQL Editor 隱藏不當作品；從 Table Editor 的 `family_artworks` 找到作品 id，代入：

```sql
update public.family_artworks
set deleted_at = now(), moderated_at = now(), revision = revision + 1
where id = '要移除的作品 UUID';
```

其他訪客會收到更新。`moderated_at` 防止原作者用撤回恢復被管理者移除的內容。圖片檔案可由管理者在 **Storage → family-images** 移除；刪檔後不保證舊圖片操作可復原。已簽發的圖片連結有效期一小時，內容移除不是立即撤銷所有舊 URL。軟刪除、撤回和操作紀錄不會自動清除檔案；請定期由管理者清理不用的圖片，避免累積到儲存配額。

匿名 session 留在各自瀏覽器；清除瀏覽器資料後作品仍在伺服器，但訪客會得到新身分，不能再撤回／修改舊身分的作品。三個數字是家人辨識，沒有自動綁定姓名或帳號。

詳見 [同步設計](docs/SHARING.md) 與 [審查說明](docs/REVIEW.md)。
