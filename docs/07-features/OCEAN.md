# Ocean — documentation-aware support assistant

> **Where:** the floating Ocean button (lower right) on every page · **Admin area:** Settings → **Ocean Knowledge**
> **Who can chat:** roles with `copilot.access` + `copilot.read` (Global Admin, IT Admin, Helpdesk by default)
> **Who manages the knowledge base and reads administrator-only documentation:** `ocean.docs.manage` (Global Admin always; IT Admin by default)
> **Search:** local to the server (keyword + semantic + typo tolerance). **No external search or embedding API is needed or used.**
> **AI provider (optional, for written answers):** Google Gemini, the same key the Copilot already uses. Ocean is the Endpoint Operations Copilot; see [AI-COPILOT.md](AI-COPILOT.md) for the live-data tools and confirmed write actions.

## What Ocean does

1. **Answers "how does this tool work" questions from the approved project documentation**: modules, workflows, configuration, access levels, troubleshooting, limitations. Every documentation answer cites the document and section and has a **View source documentation** link.
2. **Says so when it does not know.** If nothing relevant is documented it replies exactly *"I could not find a verified answer in the available project documentation."* followed by numbered next steps. It does not guess, and it does not call the AI model for such questions. The question is recorded as a **documentation gap** for administrators.
3. **Keeps live data separate.** Questions about your devices and users still use the live tools (Intune, Entra, ManageEngine, …) and only for data the signed-in user's role may read. Live answers show *Source: <provider> · <record> · retrieved <time>*; documentation answers show *From documentation*.
4. **Refuses to disclose secrets** (API keys, tokens, passwords, connection strings, `.env` contents) or its own instructions, and masks credential-like text in everything it returns.
5. **Optional web fallback (off by default).** If an administrator switches it on, a "no verified answer" reply can add a few public web results, always labelled *external — not verified project documentation*.

## What Ocean can and cannot read (capability map)
Ocean has exactly two kinds of knowledge, kept separate in every answer:

| Source | What it covers | Limits |
|---|---|---|
| **Indexed documentation** (`README.md`, `CLAUDE.md`, `docs/**`, plus documents an administrator uploads) | How every page works: Dashboard, Managed Devices, Mac Devices and Fleet Reports, Stale Devices, App Intelligence and App Guardian, Windows and Mac Package Builders, Patch Operations, Windows Updates, Security Posture, Policy Conflicts, Risk Scoring, Role Activity Audit, Automation, Entra Intelligence, Reports and Scheduled Reports, Settings, Ocean itself, roles and permissions, integrations, environment variables, troubleshooting | Text files only. Administrator-only documents are used only for roles that may read them. It does not read the source code, so a feature that has no document cannot be explained. |
| **Live data tools** (17, role-filtered) | Risk scores, policy conflicts, security policy status, role activity, Falcon/Zscaler coverage, **Security Posture summary, the devices behind each pillar, one device's missing patches and the reconciliation diagnostics**, scheduled reports, audit log, user intelligence, Intune scripts, device lookup; plus confirmed actions (Jira ticket, automation test run, Teams alert) | Read tools for Global Admin, IT Admin and Helpdesk; write tools for Global Admin and IT Admin and only after the user confirms. Full list: [AI-COPILOT.md](AI-COPILOT.md). |

Every page in the sidebar has a feature document, listed in [the feature index](README.md). Whenever a feature is added or changed, update its document in `docs/07-features/` and re-index (Settings → Ocean Knowledge → Re-index, or wait up to 6 hours), otherwise Ocean will answer from the old text or say it has no verified answer.

Example questions Ocean can answer from live data: "What is our security posture score?", "Which Windows devices have encryption off?", "Which Macs are missing critical patches?", "What patches is device WIN-123 missing?", "How well did the sources match?". Example questions it answers from documentation: "How is the posture score calculated?", "What does 'Verdict based on' mean?", "Why do some Macs show not reported?", "How do I roll out the Endpoint Central agent coverage?".

## What can Ocean read? Does the Ocean assistant read the source code?
No. The Ocean assistant does not read the application source code. It reads (1) the indexed documentation (README, CLAUDE.md and everything in `docs/`, plus documents uploaded in Settings → Ocean Knowledge) and (2) live data through its role-filtered tools. Every sidebar page has a feature document in `docs/07-features/`, so Ocean can explain every page from documentation. A feature with no document cannot be explained, and a page's live data is only available when a tool exists for it (Security Posture, risk scores, policy conflicts, role activity, coverage, scheduled reports, audit log, user intelligence, device lookup, Intune scripts). See the capability map above.

## Architecture and workflow

```
Question ──► POST /api/copilot/chat
              │  1. validate (≤ 2000 chars) · per-user rate limit · RBAC (copilot.read)
              │  2. request guard: secret / instruction-override attempts are refused here (no model call)
              │  3. local retrieval over the knowledge base (only documents the caller may read)
              │       BM25 keyword search + phrase match + typo correction + local latent-semantic similarity → relevance gate
              ├─ nothing relevant + "how does the tool work" question
              │      ─► fixed no-verified-answer reply (+ admin-only hint) · logged as a documentation gap
              │      ─► [if the admin enabled it] + labelled external web results (keywords only)
              ├─ AI model not configured + relevant sections ─► the top excerpts with citations
              └─ otherwise ─► Gemini tool-calling loop
                     system rules: answer product facts ONLY from the supplied excerpts, cite [D1]…, say so when absent
                     live tools: role-scoped, read-only inline, writes need confirmation
              ▼
          answer sanitised (secrets masked) → stored with citations (per user, when DATABASE_URL is set) → audit event
```

Code: `server/src/services/ocean/` (rules, chunker, search, lsa, store, indexer, retrieval, guard, webSearch), `server/src/routes/ocean.ts`, `server/src/routes/copilot.ts`, `server/src/services/copilotEngine.ts`; UI in `src/components/copilot/` and `src/components/settings/OceanKnowledgeSection.tsx`.

### Page context
The current page (sent as `context.page`) boosts documents whose title or file name matches it and supplies the subject for short questions such as "Explain this dashboard". Quick-prompt chips are generated from the page: *Explain this dashboard / page*, *Why is this status N/A?*, *How is this report generated?*, *Show required permissions*, *Troubleshoot this issue*.

## How search works (all local)
| Layer | What it does |
|---|---|
| Keyword (BM25) | stemmed terms; headings and titles weigh more than body text; everyday phrasings are expanded with documentation vocabulary (for example *log in* → authentication, *access control* → roles/permissions, *N/A* → unavailable/unknown) |
| Typo tolerance | a question word the documentation never uses (`notificaton`, `stael`, `authentification`) is mapped to the closest word it does use (swapped letters count as one typo); words with no close match are kept and count against a match |
| Phrase match | consecutive question words found next to each other in a section rank higher ("stale device report") |
| Local semantic search | latent semantic analysis (truncated SVD of the TF-IDF matrix, 48 dimensions) computed on the server from the indexed documents themselves, rebuilt whenever the knowledge base changes (about a second for the current ~1,000 sections). Words that occur in the same kinds of sections end up close together, so differently-worded questions still reach the right section. One space is built per access level so a standard user's search never includes administrator-only text |
| Fusion and gate | keyword and semantic rankings are combined with reciprocal-rank fusion, so the semantic layer improves the **order** of sections. Whether a section is offered at all is decided by the word match: it must cover most of the question's *weighted* terms (distinctive words count more; words the documentation never uses count against it), or at least three terms with a fair share of the weight, or one dominant distinctive term. Semantic closeness alone never makes a section pass: measured on the real documentation it added no recall and only added false positives |

Measured on this repository's documentation (30 real, mistyped and re-worded questions; 22 off-topic ones): 29 of 30 questions were answered with the right section; 18 of 22 off-topic questions returned nothing. The ones that still match are domain-adjacent questions that share two ordinary words with a document (for example "request a new laptop"), and they are shown with their citation so the reader can judge.

No embedding service, model download or external call is involved. Nothing leaves the network for documentation search.

## Knowledge sources

### Indexed
| Source | Notes |
|---|---|
| `README.md` and `CLAUDE.md` at the repository root | `CLAUDE.md` is administrator-only |
| `docs/**` files ending `.md`, `.markdown`, `.txt` | README files, feature guides, API/integration docs, installation, deployment, troubleshooting, configuration, roles |
| Documents added by an administrator (Settings → Ocean Knowledge) | stored in the data folder, so they survive re-deploys |

Default access class: **administrator-only** for `docs/04-integrations/`, `05-api-integrations`, `06-development/`, `07-installation`, `08-deployment`, `09-database`, `13-api-permission-matrix`, `14-environment-variable-reference`, `HANDOVER*`, `plans/`, `CLAUDE.md`, `AGENTS.md`; **general** for everything else. Both defaults can be changed per document and the choice survives re-scans. Internal plans (`docs/plans/`) are indexed but start **disabled**.

### Excluded (never indexed)
- Files named `.env*`; `*.pem *.key *.pfx *.p12 *.crt *.cer *.jks *.keystore *.kdbx *.ppk *.asc *.gpg`; SSH keys; `.npmrc .netrc .pgpass .htpasswd .git-credentials`; `*.log *.out *.sqlite *.db *.bak *.dump *.sql`; any file whose name contains *secret, credential, password, apikey, access-token, private-key, connection-string*; `session-secret`.
- Anything that is not `.md/.markdown/.txt` (Word, PDF, JSON, images, scripts), documents over 1 MB, binary content.
- Folders `node_modules .git screenshots assets images img dist build coverage .cache`; symbolic links are never followed.
- **Content check:** a document containing credential-like content (private key block, cloud/API/Slack/GitHub/GitLab tokens, JWTs, connection strings with passwords, long `client_secret/api_key/password = value` assignments) is **excluded with the reason shown** (repository documents) or **rejected** (uploads). Placeholders such as `<your key>`, `your-client-secret`, `********` are fine. As defence in depth, credential-like text is also redacted before a document is chunked and before an answer is returned.
- The in-app **Documentation** page is hard-coded in the UI and is not indexed; keep the markdown in `docs/` as the source of truth.

## Indexing process
1. On first server start, if nothing is indexed, Ocean scans `README.md`, `CLAUDE.md` and `docs/` in the background (`OCEAN_DOCS_ROOT` overrides the folder).
2. Each file is validated (name, type, size, binary, credentials), hashed, split into sections by headings (long sections are split on paragraph boundaries; code fences stay intact; screenshot-only lines are dropped; each section remembers its heading path), redacted and stored with: title, path, source, access class, enabled flag, status and reason, size, file modified time, **last indexed time**, section count.
3. **Automatic re-index:** every `OCEAN_AUTO_REINDEX_HOURS` (default 6, `0` = off) the documentation is re-scanned; only changed files are re-processed. Administrators can also re-index on demand.
4. A re-index removes documents that disappeared from disk and keeps administrator choices (enabled / access class).

Storage: `ocean-knowledge.json` (documents, settings, documentation gaps, counters, audit trail), `ocean-chunks.json` and `ocean-docs/` in the app data folder (`DATA_DIR`), written atomically. No database is required. The semantic space is derived in memory and is not stored.

## Web fallback (optional)
- **Off by default.** An administrator switches it on in Settings → Ocean Knowledge (needs `ocean.docs.manage`); the change is audited.
- Used **only** when the documentation has no answer to a "how does the tool work" question. Never for documented questions, live-data questions, greetings, or blocked requests.
- **What is sent:** a short keyword query (at most 8 words) — never the question text, and never e-mail addresses, user names, host names, IP addresses, ids, or anything credential-like. If nothing safe remains, nothing is sent.
- **What comes back:** up to 3 results (title, short snippet, `https` link), shown under *External web results … not verified project documentation* and as amber "External" chips. They are never given to the AI model as facts and never mixed into documentation answers.
- **Providers** (`OCEAN_WEB_SEARCH_PROVIDER`): `microsoft-learn` (default, **no key**: Microsoft Learn's public search, which covers Intune, Entra, Microsoft Graph, Defender and Windows), `brave` (`BRAVE_SEARCH_API_KEY`), `google-cse` (`GOOGLE_CSE_KEY` + `GOOGLE_CSE_ID`), `off`. A 5-second timeout applies; failures degrade to the normal reply with a short note.
- Not used for ManageEngine, Verma-internal or other non-Microsoft topics with the default provider, because Microsoft Learn does not cover them.

## RBAC and security controls
| Control | How |
|---|---|
| Chat access | `copilot.read` (route) — unchanged from the Copilot |
| Administrator-only documents | retrieval filters by the caller's `ocean.docs.manage`; the viewer returns *404* for documents the caller may not read (existence is not disclosed). A standard user whose question is answered only by an admin-only document is told that administrator-only documentation covers it and to contact an administrator — no content is shown |
| Knowledge-base management and settings | every `/api/ocean/admin/*` route requires `ocean.docs.manage` |
| Live data | unchanged: tools are exposed by role (`toolsAllowedForRole`); a role without live tools gets documentation help only; write actions need explicit confirmation |
| Secrets | request guard + content validation + redaction + output masking; provider values are never sent to the model or returned by the admin API (status shows configured / not configured only) |
| Chat history | stored per signed-in user (`user_email`) when `DATABASE_URL` is set; without a database nothing is retained |
| Abuse limits | per-user chat limit (`OCEAN_CHAT_RATE_LIMIT_PER_MIN`, default 20/min), 2,000-character messages, AI timeout (`OCEAN_AI_TIMEOUT_MS`, default 45 s) with a friendly 504 |
| Audit | an in-app trail (last 200 events, shown in Settings → Ocean Knowledge) and console lines, plus `audit_logs` rows (`OCEAN_QUERY`) when a database is configured. Recorded: queries (mode, documentation hits, time, a masked 100-character excerpt), blocked requests, rate-limit hits, errors, web searches (provider and the exact keyword query sent), settings changes, document add/update/enable/disable/delete, re-index |
| Monitoring | Settings → Ocean Knowledge shows index health, provider flags and counters: questions, answered from documentation, no verified answer, web fallback searches, blocked, rate-limited, errors, average retrieval time. Counters are **kept across restarts** |
| Documentation gaps | questions Ocean could not answer are listed (masked, shortened to 100 characters, most asked first, 200 kept) so administrators know what to document; the list can be cleared |

The request guard is a pattern check (verbs such as *show/reveal/print/what is* next to *API key, secret, token, password, connection string, .env*, plus "ignore previous instructions" style prompts). It is one layer, not the security boundary: the real protections are that credentials are never in the knowledge base, never given to the model, and masked on the way out.

## AI provider configuration
Written answers use the Copilot's Gemini configuration: `GEMINI_API_KEY` (and optional `GEMINI_MODEL`, default `gemini-2.5-flash`) from `server/.env` or Settings → Integrations. **Keep keys in environment variables or the Integrations store only.** **Without a key Ocean still works in *documentation-only* mode**: the most relevant excerpts with citations, and it says so. Documentation search itself never uses the key.

`GEMINI_ENABLE_GOOGLE_SEARCH=false` stops Gemini's own web grounding. Ocean's prompt only allows web research for vendor/CVE facts, never for how this tool works.

## Environment variables
All Ocean variables are optional (see `server/.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `GEMINI_API_KEY`, `GEMINI_MODEL` | — / `gemini-2.5-flash` | existing; enables written answers |
| `OCEAN_DOCS_ROOT` | folder above `server/` | folder containing `README.md` and `docs/` |
| `OCEAN_AUTO_REINDEX_HOURS` | `6` (`0` = off) | background re-scan interval |
| `OCEAN_CHAT_RATE_LIMIT_PER_MIN` | `20` | chat messages per user per minute |
| `OCEAN_AI_TIMEOUT_MS` | `45000` (min `5000`) | AI request timeout |
| `OCEAN_WEB_SEARCH_PROVIDER` | `microsoft-learn` | `microsoft-learn`, `brave`, `google-cse` or `off` (the fallback still has to be switched on by an administrator) |
| `BRAVE_SEARCH_API_KEY` | — | only for `brave` |
| `GOOGLE_CSE_KEY`, `GOOGLE_CSE_ID` | — | only for `google-cse` |

## How administrators update Ocean's knowledge
1. **Docs changed in the repository:** deploy; Ocean picks the change up at the next automatic re-index, or use Settings → Ocean Knowledge → **Re-index changed documents** for an immediate update. (The last-indexed time per document is in the table.)
2. **A new document that is not in the repository:** *Add or update an approved document* — paste markdown or choose a `.md/.txt` file, pick who may see it, **Save and index**. Saving under an existing file name updates it.
3. **Close a documentation gap:** open **Documentation gaps**, write or update the document that answers the most-asked question, save it, and ask the question again.
4. **Stop using a document:** switch **Use as source** off (it stays listed and can be re-enabled).
5. **Restrict a document:** change **Access** to *Admins only*.
6. **A document is "Excluded":** read the reason in the Status column (blocked file name, credentials found, too large, …), fix the file, then re-index it.
7. **Remove an uploaded document:** the trash button (repository documents can only be disabled).
8. **Web fallback:** the switch under the status tiles.

## Troubleshooting
| Symptom | Cause / fix |
|---|---|
| "I could not find a verified answer…" for something that is documented | rephrase with the module name; check the document is **enabled and indexed**; re-index; check it is not admin-only for your role. Typos and different wording are handled, but a topic that the documentation never mentions cannot be found |
| Answers are only excerpts ("AI model is not configured") | set `GEMINI_API_KEY` (Settings → Integrations) for written answers; documentation search does not need it |
| "No `docs/` folder was found" in Settings | the deployment does not include `docs/`; set `OCEAN_DOCS_ROOT` or add documents manually |
| A document shows **Excluded: possible credentials found** | remove the credential-looking text (use a placeholder) and re-index |
| Web fallback switch is disabled or "Not available" | the chosen provider has no key (`BRAVE_SEARCH_API_KEY`, or `GOOGLE_CSE_KEY` + `GOOGLE_CSE_ID`), or the provider is `off`; the default `microsoft-learn` needs none |
| Web fallback is on but no web results appear | the question contained no safe keywords, the search timed out, or the provider returned nothing (the reply says which) |
| "Ocean took too long to respond" (504) | Gemini was slow; retry. Raise `OCEAN_AI_TIMEOUT_MS` if it is frequent |
| "You are sending messages too quickly" (429) | per-user limit; wait a minute or raise `OCEAN_CHAT_RATE_LIMIT_PER_MIN` |
| Settings has no *Ocean Knowledge* item | your role lacks `ocean.docs.manage` (Settings → Roles & Permissions) |

## Known limitations
- **Accuracy is the documentation's accuracy.** Ocean repeats what the indexed documents say; stale or wrong documents give stale or wrong answers. (Several older documents still describe OpenAI for the Copilot; the code uses Gemini.)
- **Local semantic search is statistical, not a language model.** It copes with typos and re-worded questions about topics the documentation covers, but it cannot understand a topic the documentation never mentions, and a question that shares only one word with the documentation is deliberately not answered. About one off-topic question in five that sounds close to the tool's vocabulary still gets a loosely related section (the assistant then declines; in documentation-only mode the excerpt is shown with its citation).
- **Web fallback coverage is limited by the provider.** The key-free default covers Microsoft products only. Results are search snippets, not verified facts.
- The index is **file-based per server instance**: uploads, settings, gaps and counters are not shared between multiple instances.
- The request guard is a pattern check, not a security boundary (see above).
- The no-verified-answer short-circuit applies to messages that look like "how does this work" questions; other messages reach the assistant, which is instructed to follow the same rule.
- Custom roles get the same live-tool exposure as before (role names), not a custom split.
- Word/PDF documents and the in-app Documentation page are not indexed.

## Future enhancements
Shared (database-backed) index for multi-instance deployments; Word/PDF ingestion; per-answer thumbs up/down feeding the gap list; a local on-premises embedding model if one is approved; permission-key-based live-tool exposure for custom roles.
