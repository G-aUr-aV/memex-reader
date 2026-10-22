# Memex Reader API contract

All paths are same-origin. Vault data requires an authenticated owner session.
Only `/healthz`, `/readyz`, static UI files, `/api/session` and `/api/login` are public.
JSON errors have `{ error: { code, message } }` and meaningful HTTP status codes.
The configured Host must match. POST requests require the exact configured Origin,
application/json and, except login, the session's `X-Memex-CSRF` value.
Cookies are HttpOnly, SameSite=Strict and Secure on HTTPS; sessions last 24 hours.

| Method and path | Input | Success |
| --- | --- | --- |
| GET /healthz | none | `{status:"ok"}` |
| GET /readyz | none | `{ready:true}` after the vault is indexed |
| GET /api/session | cookie | `{authenticated,username,csrf}`; null identity when signed out |
| POST /api/login | `{username,password}` | session object and session cookie; 401 for wrong credentials; 429 when throttled |
| POST /api/logout | `{}` and CSRF | `{ok:true}` and cleared session cookie |
| POST /api/password | `{currentPassword,newPassword}` and CSRF | `{ok:true}`; minimum 12 characters, other sessions revoked |
| GET /api/search | q (max 160 chars), area (all/engineering/learning/personal), sort (relevance/updated/title), offset, limit (1–50) | `{files,matches,total,offset,limit,indexedAt,query,terms,results}` |
| GET /api/file | path, optional q | `{file,body,backlinks,outgoing,headings,terms}`; 404 for unknown or disallowed files |
| GET /api/resolve | target, optional from | `{path,heading}`; 404 unresolved, 409 ambiguous with `choices` |
| GET /api/stats | none | `{files,areas,indexedAt}` |
| GET /api/asset | path | authenticated raster image; only indexed png/jpg/jpeg/webp/gif files |

Search is case-insensitive literal substring matching. All query terms must match;
quoted strings are phrases. Regex metacharacters are literal. Each result contains
`path,title,area,type,updated,summary,matches,matchedLines,snippets`.
Snippets contain `{line,text}` using original Markdown line numbers and visible
text, capped at 24 passages per file. Counts include all matching occurrences;
the reader highlights the full document. Empty q returns a browsable file list.
Title, aliases and body are searched. Relevance favors title and alias matches.

Index content is limited to Home.md and ordinary Markdown/raster files under
wiki, notes, raw, inbox, journal and outputs. Dotfiles, configuration, symlinks,
other roots and files above 2 MiB are excluded. Every note lookup uses the index,
never an arbitrary caller-selected disk path. No API writes to the vault.
Updates are detected on a short polling interval; last-good content is retained
if a refresh fails, and the API exposes the last successful indexedAt timestamp.

The client never persists a password, CSRF token or note content in localStorage.
No remote images, analytics or external font requests are made.
