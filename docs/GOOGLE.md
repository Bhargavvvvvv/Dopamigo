# Google assignments

Dopamigo discovers assignments automatically. You do not select individual calendar events. After connecting, it checks accessible calendars for upcoming deadlines, creates subject-grouped task workspaces, and matches documents in your Assignments folder. It syncs on launch, after system wake, and every 10 minutes while running, including with the main window closed. Quitting the app stops syncing.

## One-time setup for this local build

Google needs an OAuth application registration; the existing Gemini API key does not provide access to a personal Calendar or Drive account. This is a developer setup step, separate from signing in. The Google account was **not connected during development** because no Desktop OAuth client was supplied.

1. Open [Google Cloud Console](https://console.cloud.google.com/apis/credentials) and choose a project for Dopamigo.
2. Enable **Google Calendar API** and **Google Drive API** in the API Library.
3. Configure the Google Auth Platform consent screen/branding and audience. For personal testing, add your Google email as a test user.
4. Add these data-access scopes: `openid`, `email`, `https://www.googleapis.com/auth/calendar.calendarlist.readonly`, `https://www.googleapis.com/auth/calendar.events.readonly`, `https://www.googleapis.com/auth/drive.metadata.readonly`.
5. Create an OAuth client with application type **Desktop app**. Download its JSON. A Web client or Gemini API key will not work for this flow.
6. Restart the updated Dopamigo app. Open **Settings → Google assignments → Import Google setup JSON**, and choose the downloaded file.
7. Click **Connect Google**, sign in in your system browser, and approve Calendar and Drive metadata access. Return to Dopamigo; the first sync begins automatically.

Keep the JSON local; never paste it into chat or commit it. The importer stores the configuration and refresh credentials encrypted in the app's data directory. Alternatively, set `GOOGLE_OAUTH_CLIENT_ID` and optional `GOOGLE_OAUTH_CLIENT_SECRET` in the app's local `.env`; the successful connection saves the configuration for later use. `GEMINI_ASSIGNMENT_MODEL` defaults to your planning model. The Gemini key remains required for semantic assignment discovery, even when sample planning is enabled.

Google's [desktop OAuth documentation](https://developers.google.com/identity/protocols/oauth2/native-app) describes the system-browser, PKCE and loopback callback flow used here.

## Moving from testers to a public app

Google requires complete Branding before switching this app to external production. Set the app name to **Dopamigo**, select a monitored support email, and enter real public HTTPS homepage and privacy-policy URLs. The homepage must explain the app and link to the same privacy policy used on the consent screen. For brand verification, use a domain you control and verify it in Google Search Console with a project owner/editor account. Complete the Branding checks shown in the console, then return to Audience to publish. Publishing and data-access verification are separate steps; unapproved scopes can still cause warnings and a user cap.

The `website/` subdirectory contains a Sites-managed homepage, privacy policy and Terms of Service. The owner authorised public access on 3 October 2026, including `bhargavjoshie@gmail.com` as the support contact. Current public homepage: `https://dopamigo.bhargavjoshie.chatgpt.site/`; privacy: `/privacy/`; terms: `/terms/`. Google rejected this homepage because ownership is unverified. Adding `bhargavjoshie.chatgpt.site` to Authorised domains clears the missing-domain field but does not establish ownership. The available Sites tools do not provide DNS control over that hosted namespace.

Google's current [OAuth domain-verification instructions](https://support.google.com/cloud/answer/13804266?hl=en) require a Search Console **Domain property with DNS verification**, not a URL-prefix property or an HTML meta tag. Use a Google account that owns the Cloud project. Connect a custom domain whose DNS you control to the existing Site, add Google's TXT record at its DNS provider, and confirm verification in Search Console. Update Branding's homepage/privacy/terms URLs and Authorised domains to match. The user's verification result instructs waiting **24 hours after successful ownership verification** before retrying. Waiting alone does not resolve missing ownership.

Custom-domain setup is awaiting a domain supplied by the owner; no domain has been purchased or attached. Google data-access verification remains separate. Before public distribution of the desktop app, review provider configuration and actual data practices against the published documents. See [Google's branding requirements](https://support.google.com/cloud/answer/15549049?hl=en).

## Persistent connection

Refresh tokens allow normal restarts and access-token renewal without signing in again. The app uses PKCE, a random state value, a temporary loopback-only callback, and owner-only encrypted files protected with Electron's macOS Keychain-backed safeStorage. Tokens never enter the renderer or logs. Disconnect removes local account credentials, attempts to revoke the grant with Google, and keeps imported tasks and notes.

Google external apps left in **Testing** receive refresh tokens that expire after seven days for these scopes. Long-lived use requires an appropriate production/internal app configuration and any verification Google requires. Revoked access or a university administrator's restrictions can also require reconnecting. See [Google token expiration](https://developers.google.com/identity/protocols/oauth2#expiration).

The current hackathon app is not Developer ID signed. macOS may prompt for Keychain access again after replacing the build; consistent signing is needed for a polished distributed app. See [Electron secure storage](https://www.electronjs.org/docs/latest/api/safe-storage).

## What happens automatically

- All readable calendars are inspected; no assignment-by-assignment selection is needed. The discovery window includes today through the day 14 days ahead.
- Gemini classifies event titles, descriptions (up to 3,000 characters), calendar names and event start dates. Clear assignment deadlines with confidence at least 0.85 become tasks. Ambiguous academic events appear under **Possible assignments**; normal meetings, lectures, study sessions and social events should not import.
- The due date comes from the event's start, not a date invented by Gemini. All-day dates remain date-only. Put the actual deadline on the calendar; a reminder to work on an assignment is not its deadline.
- New workspaces receive a small, clearly labelled starter step. No assignment requirements are invented. You can start working immediately or add the professor's brief and build a plan inside that same task.
- A stable account/event identity prevents repeated imports. Shared copies with the same iCalUID are deduplicated; recurring occurrences remain distinct. Existing imported events are checked individually when they leave the window, so a deadline moved farther out still updates.
- Changed dates preserve notes, plans, completion state and custom next actions. Cancelled or inaccessible events are labelled; work is never deleted automatically.
- An unambiguous folder whose name contains “Assignment” or “Assignments” is selected automatically. If none or several exist, choose the folder once in Settings. Subfolders are included. Folder discovery can miss folders outside My Drive/shared-with-me listings; Shared Drive-specific discovery and shortcuts are not implemented.
- Document matching uses file names and folder context. Clear matches become saved resource links. Ambiguous matches are labelled and can be linked manually in Work. “Document found” does not imply started, completed, or submitted. A professor's brief can also match the name; the app makes no claim about its contents.

## Removed or ignored calendar assignments

Deleting an imported task or ignoring a possible assignment adds its event to a local exclusion list. Scheduled sync and reconnecting the same Google account do not recreate it. In **Settings → Google assignments → Not being imported**, choose **Import again** beside the assignment to remove just that exclusion and run sync. Google must be connected and automatic sync enabled. Upcoming clear deadlines are recreated; ambiguous events return under Possible assignments. Events outside the discovery window are not recreated until they become eligible. Other exclusions and existing tasks remain unchanged.

## Briefs and privacy

Imported assignments support pasted text and local text-based PDF, TXT and Markdown files (10 MB, 100 PDF pages, 30,000 extracted characters). Scans need pasted/OCR text; DOCX import is not included. Importing extracts text locally. Pressing **Build plan from brief** sends it to Gemini, unless sample planning is enabled. Only the initial starter plan can be replaced, so an established edited plan is preserved.

Calendar event snippets are sent to Gemini for classification. Drive metadata is used locally for matching, and Drive document contents are never downloaded by this integration. Google grants account-wide read-only metadata scope; filtering to the chosen folder is enforced by Dopamigo, not by a folder-specific OAuth permission. Read-only access does not create, edit or delete anything in Calendar or Drive. Task “folders” are subject groups inside Dopamigo. See [Google Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

Calendar-derived titles/steps can subsequently be included in the existing Gemini planning and nudge features. Notes remain local. Parsed briefs remain local until you request a Gemini plan. Classification results are cached locally for unchanged events, reducing repeat API calls. Pause automatic sync or disconnect in Settings at any time.

## Verification and limits

- `npm test`: 30 tests, including real loopback OAuth state/PKCE, denied/partial consent, serialized refresh, pagination, recurring identities, all-day dates, duplicate prevention, deadline movement, document ambiguity, cancellation and legacy-save compatibility.
- `npm run smoke:google`: actual Electron UI, real loopback callback and macOS encryption; Google provider responses are fixtures. Covers setup import, automatic task/document discovery, PDF brief import, same-task planning, saved notes across changed deadlines, restart refresh without another login, and disconnect.
- `npm run test:google-live`: live Gemini classification of synthetic assignment, social and study events. Requires the local Gemini key and makes one request. It does not read a real calendar.
- Personal Google OAuth/Calendar/Drive access remains unverified until you complete the one-time setup and consent.

Bounds are 100 calendars, 1,000 upcoming events, 2,000 folders for discovery, 200 traversed folders/eight nesting levels and 2,000 documents per scan. Oversized/incomplete scans do not report false document absence. The local workspace remains capped at 100 tasks. Errors preserve existing work and are shown in Settings; the next scheduled sync retries transient failures. No university LMS, background service after quitting, Google file creation, scanned-PDF OCR, or automatic completion is included.
