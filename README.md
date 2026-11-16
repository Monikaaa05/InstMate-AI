# InstaMate AI

InstaMate AI is a self-hosted Instagram DM dashboard with an optional AI reply assistant. It uses Meta's official Instagram API with Unified Login and the Instagram Messaging API. It never asks for an Instagram password. The AI key and Meta access token stay on the backend.

This is an early standalone implementation. Live Instagram access requires a Meta developer app, the correct permissions, public HTTPS endpoints, and Meta approval where required. Without credentials, the dashboard still starts but stays disconnected and does not show sample conversations.

## What the parts do

1. **Frontend (`frontend/`)** — React screens for the overview, inbox, and assistant settings. It requests data from this app's backend; it never receives the Instagram access token.
2. **Backend (`backend/instamate/`)** — FastAPI routes for sign-in, settings, conversations, analytics, Instagram OAuth, and webhooks.
3. **Database** — SQLite stores conversations, messages, settings, webhook IDs, and an encrypted Instagram token.
4. **AI service** — Sends a limited conversation context to an OpenAI-compatible chat completions endpoint when configured. Sensitive messages and AI/API failures are escalated instead of being auto-replied to.
5. **Meta integration** — Uses Facebook Login for Business as the login flow for Unified Login. It stores the Business Integration System User Access Token encrypted on the backend, subscribes to message webhooks, checks Meta's webhook signature, ignores duplicate message IDs, and sends replies through Instagram's official API.

## Option A: Run with Docker

You need Docker Desktop with Docker Compose enabled.

1. Copy `.env.example` to `.env` in this folder.
2. Make a random app secret in PowerShell:

   ```powershell
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   ```

   Paste the result into `SECRET_KEY`. Set your own strong `APP_PASSWORD` too. For a local Docker run, set `ENVIRONMENT=development`, `APP_BASE_URL=http://localhost:8000`, and `SESSION_COOKIE_SECURE=false`. For a public HTTPS deployment, set `ENVIRONMENT=production`, set `APP_BASE_URL` to your real HTTPS address, and keep `SESSION_COOKIE_SECURE=true`.
3. Start the app:

   ```powershell
   docker compose up --build
   ```

4. Open `http://localhost:8000` for a local install, then sign in with the `APP_USERNAME` and `APP_PASSWORD` from `.env`.
5. To stop the app, press Ctrl+C. Start it again with `docker compose up -d`. The named Docker volume preserves the SQLite database.

For a public deployment, put the app behind a HTTPS reverse proxy and point `APP_BASE_URL` at that public address. Set `SESSION_COOKIE_SECURE=true`. Do not expose the app directly to the public internet without HTTPS.

## Option B: Run frontend and backend separately

You need Python 3.11 or newer and Node.js 20 or newer. From the project folder, create a root `.env` from `.env.example`. For this local-only setup, set `ENVIRONMENT=development`, `APP_BASE_URL=http://localhost:5173`, `SESSION_COOKIE_SECURE=false`, and `DATABASE_URL=sqlite:///./instamate.db`, then open two PowerShell windows.

**PowerShell window 1 — backend:**

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
$env:PYTHONPATH = "$PWD\backend"
uvicorn instamate.main:app --app-dir backend --reload --port 8000
```

**PowerShell window 2 — frontend:**

```powershell
cd frontend
npm install
npm run dev
```

Open the local address printed by Vite (usually `http://localhost:5173`). The Vite development server forwards `/api` requests to port 8000. Unified Login requires public HTTPS redirect and webhook URLs. A local `http://localhost` address is not sufficient for Meta's callback.

## Connect a real Instagram account

This implementation uses **Instagram API with Unified Login**. Meta's login screen can let the account owner sign in with Instagram or Facebook. The app's Meta setup must use the **Manage messaging & content on Instagram** use case and be owned by a business portfolio. Review Meta's [Unified Login setup guide](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/get-started), [authentication guide](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/authentication), and [permissions list](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-unified-login/permissions).

1. In Meta Developers, open **Use cases > Manage messaging & content on Instagram > Customize > API setup with Unified login**.
2. Create a login configuration. Edit its permissions to keep the DM permissions `instagram_basic` and `instagram_manage_messages`; remove optional permissions such as comments, publishing, ads, and insights if they are not part of your app. Select the Instagram professional account to share and save the configuration.
3. In that configuration, set the redirect URL to the app's public HTTPS callback, for example `https://your-domain.example/api/instagram/oauth/callback`. Copy the configuration ID shown by Meta.
4. Put the **Meta App ID**, **Meta App Secret**, and configuration ID into `META_APP_ID`, `META_APP_SECRET`, and `META_CONFIG_ID` in the backend `.env`. Set `META_REDIRECT_URI` to the exact same HTTPS URL entered in Meta. Never put the app secret in frontend code or chat.
5. Configure the Instagram webhook callback as `https://your-domain.example/api/webhooks/instagram`, use a private verify token matching `META_WEBHOOK_VERIFY_TOKEN`, verify the callback, and subscribe to the `messages` field.
6. In Development mode, add the account as an **Instagram Tester** and accept the invitation in Instagram's **Apps and websites > Tester Invites** page. Make the app reachable over public HTTPS, restart the backend after changing `.env`, sign in to InstaMate, and choose **Connect Instagram** in AI settings. The Meta login screen lets the account owner sign in and approve the requested access.
7. Confirm the dashboard reports the account and webhook as connected. If the webhook is not subscribed, check the `messages` field and permissions, then reconnect.

Meta requires messaging to follow its policies and conversation windows. InstaMate blocks replies after the standard 24-hour window, does not send when the account/AI/webhook is not ready, and flags sensitive cases for human review. Keep automation off until the connection, business facts, and reply personality have been reviewed.

## Configure AI replies

1. Add your AI provider key to `LLM_API_KEY` in the backend environment. It must support the OpenAI-compatible `/chat/completions` API and JSON response mode. The dashboard never displays or sends this key to the browser.
2. Restart the backend so it reads the new key.
3. In **AI settings**, enter only verified business facts (for example, opening hours or a published shipping policy) and choose a tone.
4. Review messages in the inbox. Sensitive or uncertain cases are marked for human attention. Take over a conversation to stop automatic replies for that conversation.
5. Turn on global automation only after reviewing the setup. If the AI provider is missing or fails, messages are kept for manual review.

## Important configuration

| Variable | Purpose |
| --- | --- |
| `SECRET_KEY` | Signs dashboard sessions and derives the encryption key for Instagram tokens. Keep it stable and secret. |
| `APP_USERNAME`, `APP_PASSWORD` | Single-operator dashboard sign-in. |
| `META_APP_ID`, `META_APP_SECRET` | Meta app credentials used by Unified Login and webhook signature verification. Keep them on the backend only. |
| `META_CONFIG_ID` | ID of the Meta login configuration that requests the chosen permissions and Instagram account. |
| `META_REDIRECT_URI` | OAuth callback URL registered in Meta. |
| `META_WEBHOOK_VERIFY_TOKEN` | Secret phrase used when Meta verifies the webhook URL. |
| `LLM_API_KEY` | Optional AI service key. If empty, messages are not auto-replied to. |
| `DATABASE_URL` | SQLite file path. Docker uses `/data/instamate.db`. |

Do not commit `.env`. Back up the SQLite volume and `SECRET_KEY` together: changing the secret prevents decryption of the stored Instagram token, so you will need to reconnect Instagram.

## Current scope

- The dashboard is designed for one operator; it does not provide public user registration or multi-tenant isolation.
- Real inbox history begins when the configured webhook starts delivering messages. The app does not import old conversations.
- Human replies are sent through the same official Instagram API and are also subject to the messaging window.
- SQLite is suitable to get started; a multi-worker or high-volume deployment should move to a server database and durable background queue before scaling.
