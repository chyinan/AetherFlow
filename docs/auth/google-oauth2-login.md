# Google OAuth2 Login

## Architecture

AetherFlow uses Google only as an external identity provider. The frontend redirects the browser to Auth Service, Auth Service verifies Google through Spring Security OAuth2 Client, creates or binds the local user, and then issues the normal AetherFlow access and refresh JWT pair.

The frontend must not validate Google tokens. Business APIs continue to trust only AetherFlow JWTs.

## Endpoints

- Start login: `GET /oauth2/authorization/google?redirect=/projects`
- Google callback: `GET /login/oauth2/code/google`
- Frontend callback: `/auth/oauth/callback#accessToken=...&refreshToken=...`

## Required Environment

Auth Service:

```bash
GOOGLE_OAUTH_CLIENT_ID=<google-web-client-id>
GOOGLE_OAUTH_CLIENT_SECRET=<google-web-client-secret>
GOOGLE_OAUTH_REDIRECT_URI={baseUrl}/login/oauth2/code/{registrationId}
FRONTEND_BASE_URL=http://localhost:5173
GOOGLE_OAUTH_SUCCESS_PATH=/auth/oauth/callback
GOOGLE_OAUTH_FAILURE_PATH=/login
GOOGLE_OAUTH_DEFAULT_REDIRECT=/projects
GOOGLE_OAUTH_STATE_TTL_MINUTES=10
```

`GOOGLE_OAUTH_REDIRECT_URI` can be omitted. Auth Service then uses Spring Security's default `{baseUrl}/login/oauth2/code/{registrationId}` template.

Gateway must route and permit unauthenticated access to:

- `/oauth2/**`
- `/login/oauth2/**`

## Google Cloud Console

1. Open Google Cloud Console and select or create a project.
2. Configure OAuth consent screen.
3. Create an OAuth Client ID.
4. Choose application type `Web application`.
5. Add authorized redirect URIs:
   - Local gateway: `http://localhost:8080/login/oauth2/code/google`
   - Production gateway: `https://<api-domain>/login/oauth2/code/google`
6. Add authorized JavaScript origins:
   - Local frontend: `http://localhost:5173`
   - Local gateway: `http://localhost:8080`
   - Production frontend and gateway origins.
7. Copy the Client ID and Client Secret into Auth Service environment variables.

## Database

Google accounts reuse `af_oauth_account`:

- `provider`: `GOOGLE`
- `provider_user_id`: Google `sub`
- `provider_email`: verified Google email
- `avatar_url`: Google profile picture

Flyway-style SQL is provided at:

`backend/auth-service/src/main/resources/db/V20260603_01__google_oauth_account.sql`

## Test Flow

1. Start Gateway, Auth Service, Redis and MySQL.
2. Open the frontend login page.
3. Click the Google button.
4. Complete Google login.
5. Verify the browser lands on `/projects`.
6. Verify `localStorage.af_auth_session` contains AetherFlow access and refresh tokens.
7. Call a protected API through Gateway and confirm the Gateway forwards `X-User-Id`, `X-Username`, and `X-Roles`.
