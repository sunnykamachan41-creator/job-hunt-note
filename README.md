# Job Hunt Note

個人用の就活・インターン管理Webアプリ。

## コンセプト

企業ごとの横軸タイムラインを中心に、就活全体を俯瞰するためのアプリです。

Phase1では、Google Sheetsをデータベースとして利用するCRUD基盤と、接続確認用の簡素な一覧・編集画面を実装します。

## 技術スタック

- Next.js App Router
- TypeScript
- Tailwind CSS
- Google Sheets API
- Google Calendar API（Phase3）
- Vercel
- PWA（Phase4）

## 重要資料

- `AGENTS.md`
- `01_requirements/requirements.md`
- `02_ui_reference/UI_image.png`
- `03_db_schema/`

## 環境変数

`.env.local` を作成し、サービスアカウント方式でGoogle Sheets APIへ接続します。

```env
GOOGLE_SHEETS_ID=
GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"...","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"...","universe_domain":"googleapis.com"}'
```

対象のGoogle Sheetsは、サービスアカウントのメールアドレスに共有してください。
