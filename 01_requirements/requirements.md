# 就活ノート 要件定義書・実装指示書 v1.1

## 1. プロダクト概要

就活全体を「地図」のように俯瞰できる個人向け管理アプリを作成する。

一般的な就活管理アプリやタスク管理アプリは、企業ごとのカード表示やリスト表示が中心であり、全体の流れが把握しにくい。本アプリでは、**企業ごとの横軸タイムライン（旬カレンダー風・ガントチャート風）**を中心UIとし、「今どの企業がどの段階にあるか」を一目で把握できることを目指す。

情報量は必要最低限に抑え、詳細情報はクリック時のみ表示する。「情報を隠す設計」「一覧性を最優先する設計」を重視する。

## 2. 基本方針

### 対象ユーザー

- 基本は開発者本人が利用する個人用アプリ。
- 将来的には他ユーザーへの展開も想定するが、初期段階ではマルチユーザー機能は不要。

### 設計思想

- カード型UIより一覧性を優先する。
- ダッシュボードよりタイムライン画面を主役にする。
- アプリがマスターデータであり、Googleカレンダーは通知・持ち運び用の補助機能とする。
- 情報は常時表示せず、必要時のみ展開する。
- 入力は最小限、内部処理は自動化する。

## 3. 技術スタック・制約

### 採用技術

- Next.js App Router
- TypeScript
- Tailwind CSS
- Vercelデプロイ
- PWA対応（Phase4）
- Google Sheetsをデータベースとして利用
- Google Sheets APIによるCRUD
- Google Calendar APIによるイベント作成（Phase3）

### 採用しない技術

- Supabase
- Firebase
- Prisma等の本格DB
- 双方向Googleカレンダー同期
- Pages Router

### データ管理方針

- 1ユーザー = 1 Google Sheets を前提に拡張可能な構造とする。
- 現段階では環境変数にGoogle Sheets IDを設定して運用する。
- Google Sheets APIの認証はサービスアカウント方式を採用する。
- OAuthは初期実装では使用しない。
- 将来的には各ユーザーが自身のGoogle Sheetsを紐付けられる構造を想定する。
- タイムゾーンはデフォルト `Asia/Tokyo` とし、イベントごとに変更可能とする。
- UI表示用タイムゾーンと予定入力用タイムゾーンは settings で管理する。

## 4. データベース設計（Google Sheets）

### シート構成

- `companies`
- `events`
- `settings`

### companies シート

| カラム名 | 型 | 説明 |
| --- | --- | --- |
| company_id | string | UUID、一意ID |
| company_name | string | 企業名 |
| industry | string | 業界（任意） |
| status | string | 選考中 / 落選 / 辞退 / 保留 / 内定 |
| recruitment_source | string | 応募媒体とは別に保持する流入元メモ（任意） |
| order_index | number | 将来の表示順調整用。通常UIでは編集しない |
| mypage_url | string | マイページURL（任意） |
| memo | string | 企業メモ |
| created_at | datetime | 登録日時 |
| updated_at | datetime | 更新日時 |
| application_source | string | 応募媒体（任意） |

### events シート

| カラム名 | 型 | 説明 |
| --- | --- | --- |
| event_id | string | UUID、一意ID |
| company_id | string | companiesとの紐付け |
| selection_type | string | 本選考 / インターン。企業ではなくイベントごとに保持する |
| event_type | string | ES / Webテスト / 適性検査 / 面接 / GD / インターン / 説明会 / その他 |
| title | string | 表示名（任意） |
| start_datetime | datetime | 開始日時 |
| end_datetime | datetime | 終了日時。締切系は空でも可 |
| timezone | string | イベント入力時のタイムゾーン。未設定時は予定入力用デフォルトを使用 |
| is_period | boolean | 期間イベントか |
| period_end_date | date | 期間イベント用終了日 |
| status | string | 予定 / 通過 / 落選 / 辞退 / 保留 / 内定 |
| person | string | 担当者名 |
| meeting_url | string | Zoom / Meet等URL |
| memo | string | イベントメモ |
| sync_to_calendar | boolean | Google Calendarへ同期するか |
| google_calendar_event_id | string | Google CalendarイベントID |
| calendar_last_synced_at | datetime | Google Calendarへ最後に同期した日時 |
| created_at | datetime | 登録日時 |
| updated_at | datetime | 更新日時 |

### settings シート

| カラム名 | 型 | 説明 |
| --- | --- | --- |
| setting_id | string | UUID、一意ID |
| group | string | 設定グループ |
| parent | string | 親カテゴリ（任意） |
| value | string | 表示値 |
| sort_order | number | 表示順 |
| created_at | datetime | 登録日時 |
| updated_at | datetime | 更新日時 |

主用途:

- イベントのメインカテゴリ
- イベントのサブカテゴリ
- 応募媒体

例:

```csv
setting_id,group,parent,value,sort_order,created_at,updated_at
uuid,main_category,,面接,10,,
uuid,main_category,,Webテスト,20,,
uuid,sub_category,面接,1次,10,,
uuid,sub_category,面接,最終,90,,
uuid,application_source,,OfferBox,10,,
uuid,application_source,,Wantedly,20,,
```

将来的には以下も追加可能:

- `default_calendar_sync`
- `timezone`
- UI preferences

## 5. ステータス仕様

### イベントステータス

- 予定
- 通過
- 落選
- 辞退
- 保留
- 内定

### 企業ステータス

- 選考中
- 落選
- 辞退
- 保留
- 内定

### 自動更新ルール（Phase3）

- 新しい後続イベントを追加した場合、直前イベントは自動的に「通過」へ変更する。
- 「落選」「辞退」「内定」が設定された場合、その企業の現在ステータスも自動更新する。
- 自動更新後も手動編集は可能とする。

## 6. 画面構成

### PC版

左ドロワー:

- タイムライン
- 予定
- 統計
- 設定

メイン画面:

- 企業ごとの横軸タイムラインを表示する。
- 縦軸は企業、横軸は日付。
- イベントは小さなラベルとして配置する。
- インターン等の期間イベントは帯表示する。
- 今日の日付を示す縦線を固定表示する。
- 起動時は今日が中央付近に来るよう自動スクロールする。

画面下部:

- 近日の予定（3〜5件程度）
- 簡易統計（応募数、選考中、内定数など）

### スマホ版

- 下部タブバーを採用する。
- タブはタイムライン / 予定 / 統計。
- タイムラインは企業名列を固定し、日付部分のみ横スクロール可能とする。
- 企業をタップすると折り畳み式で詳細イベント一覧を展開できる。

## 7. タイムライン仕様

- ページ送り方式ではなく横スクロール方式を採用する。
- 時系列全体の流れを失わないことを重視する。
- 「今日に戻る」ボタンを設置する。
- 今日を示す縦線は常時表示する。

フィルタ:

- 終了イベントを表示 / 非表示
- 落選・辞退企業を表示 / 非表示
- インターンのみ表示
- 企業名検索

## 8. 追加（＋）ボタン仕様

画面右下にFloating Action Buttonを配置する。

企業追加の入力項目:

- 企業名
- カテゴリ（インターン / 本選考）
- 業界
- 応募媒体
- マイページURL
- メモ

イベント追加の入力項目:

- 企業選択（既存 or 新規作成）
- イベント種別
- 開始日時
- 終了日時
- 期間イベントON/OFF
- 期間終了日
- 担当者
- MTG URL
- メモ
- ステータス
- Googleカレンダーにも登録する（チェックボックス、Phase3）

## 9. 日時補完ルール

`end_datetime` が空の場合:

- deadline系（ES、Webテスト、適性検査）は `end_datetime` 不要。
- 面接 / 面談はデフォルト60分をフロントまたはServer Actionで自動補完する。
- インターンは明示入力を推奨する。

## 10. Googleカレンダー連携（Phase3）

- アプリ → Googleカレンダーへの一方向同期のみ。
- Googleカレンダー側の編集内容はアプリへ反映しない。

通常イベントのタイトル例:

- `【一次面接】ワークスアプリケーションズ`

説明欄へ自動挿入:

- 担当者
- MTG URL
- メモ

期間イベントは終日イベントではなく、各日同じ時間帯のイベントとして登録する。

## 11. 統計画面（Phase4）

- 応募企業数
- 選考中企業数
- 落選企業数
- 辞退企業数
- 内定企業数
- イベント総数
- 今週の予定数

将来的な追加候補:

- 業界別応募数
- 月別面接数
- 選考通過率

## 12. UXポリシー

- 情報を詰め込みすぎない。
- 詳細情報は折り畳み・モーダルで表示する。
- カードを大量に並べるUIにしない。
- 一覧性を最優先する。
- やさしい印象のUIにする。
- 余白を十分に取り、淡い色調を採用する。

デザインキーワード:

- シンプル
- ミニマル
- フラットデザイン
- パステルカラー
- 情報を隠す設計
- 「就活の地図」のように俯瞰できるUI

## 13. 実装時の禁止事項

- Supabase / Firebase の導入
- Prismaの導入
- 双方向Googleカレンダー同期
- 派手なカード型UI
- 情報量過多のダッシュボード
- 月送りカレンダー中心の設計
- ページ送りでしか見られないタイムライン
- 初期段階での複雑な認証機能
- 不要なアニメーションや装飾

## 14. 実装優先順位

### Phase1

- Google Sheets設計
- 型定義
- API層実装
- Server Actions中心のCRUD
- companies / events / settings CRUD
- 簡素な確認画面
  - companies一覧
  - events一覧
  - add/edit/delete の最低限UI
  - Google Sheetsと接続確認できる状態

Phase1で不要:

- 横タイムライン完成版
- PWA
- ダッシュボード
- Google Calendar同期
- モーダル完成版

### Phase2

- タイムラインUI
- 企業追加・イベント追加モーダル
- フィルタ機能

### Phase3

- Googleカレンダー連携
- Day1〜DayN自動生成
- 自動ステータス更新

### Phase4

- 統計画面
- PWA対応
- スマホUI最適化

## 15. AI（Codex）への最重要指示

このアプリは「就活管理アプリ」ではなく、**就活全体を俯瞰するためのビジュアルマップ**である。

一般的なタスク管理アプリやカード型UIを参考にしすぎず、企業ごとの横軸タイムラインを主役とした設計を行うこと。

「情報をすべて表示する」のではなく、「普段は最低限だけ表示し、必要な時だけ展開する」という思想を最優先にすること。

UI・設計で迷った場合は、**一覧性、全体の流れの把握、Googleカレンダーとの補完関係**を優先して判断すること。

不明点や実装上の判断が必要な点があれば、勝手に実装せず質問リストを作成してから着手すること。
