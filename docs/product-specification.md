# BSS Website V0 Requirements Specification

## Document status

| Field              | Value                                                                |
| ------------------ | -------------------------------------------------------------------- |
| Status             | V0 specification prepared on the basis of accepted product decisions |
| Language           | English                                                              |
| Time zone          | Europe/Budapest                                                      |
| Target environment | Locally runnable environment with documented startup                 |
| Production rollout | Not part of V0                                                       |
| Visual basis       | The public prototype in the repository                               |

This document is the single source of truth for the decisions accepted during consultation. If the current prototype, Figma, or the legacy bsstudio.hu site behaves differently, this specification prevails.

## 1. Goal and delivery boundary

V0 is a locally operating video archive and editorial system. In addition to the public pages, the admin workflows must also be usable. Manual database modifications must not stand in for a missing admin feature.

V0 is considered complete when it can be demonstrated locally with:

- anonymous, Schönherz-level, and BSS-member viewer access;
- member and board-member admin privileges;
- the full video lifecycle;
- event management;
- member synchronization from Authentik;
- global and detailed search;
- live, featured, and normal homepage priority;
- the audit log and the 30-day video deletion simulation.

## 2. External inputs

The following files arrive out-of-band (OOB) and are not committed to git:

- config containing Authentik attribute and group mapping;
- local secrets;
- pre-extracted seed JSON.

The README must list the exact location, format, and verification method of these files. When a file is missing, the application must stop with a specific error message. It must not fall back to invented default values.

## 3. Actors and permissions

### 3.1 Viewer levels

| Actor                    | Visible videos               | Admin                     |
| ------------------------ | ---------------------------- | ------------------------- |
| Anonymous visitor        | `public`                     | No                        |
| Logged-in Schönherz user | `public`, `schonherz`        | No                        |
| BSS member               | `public`, `schonherz`, `bss` | Yes                       |
| Board member             | `public`, `schonherz`, `bss` | Yes, with extended rights |

The Authentik `vezetoseg` group complements membership. It does not replace it.

### 3.2 Admin rights

| Action                                     | Member | Board member                 |
| ------------------------------------------ | ------ | ---------------------------- |
| Create, edit, publish video and event      | Yes    | Yes                          |
| Archive video and event                    | Yes    | Yes                          |
| Move video to trash                        | Yes    | Yes                          |
| View video trash                           | Yes    | Yes                          |
| Restore video                              | No     | Yes                          |
| Permanently delete event                   | No     | Yes                          |
| Assign existing tags to a video            | Yes    | Yes                          |
| Manage the tag catalog                     | No     | Yes                          |
| Manage crew roles                          | No     | Yes                          |
| Manage the credits of one video            | Yes    | Yes                          |
| Manage live, featured, and About videos    | No     | Yes                          |
| Member list and Authentik sync diagnostics | No     | Yes, read-only profiles only |
| View audit log                             | No     | Yes                          |

Every member can see and edit other members' drafts. There is no content ownership by author. The server re-checks authorization for every action.

## 4. Common content rules

### 4.1 Status and visibility

Status and visibility are separate data.

Video and event statuses:

- `draft`;
- `published`;
- `archived`.

A video can additionally be moved to `trash` status. Only live uses scheduling.

Archived content is not visible on the public site. Any member can restore it to published status. A video restored from trash goes into archived status and can then be published separately.

Video visibility levels:

- `public`;
- `schonherz`;
- `bss`.

The default visibility of a new video is `public`. Events and member profiles are public. Their associated videos and derived data must be filtered according to the viewer's access level.

### 4.2 Identifiers and slugs

- The internal identifier is a UUID.
- The public path uses a unique slug.
- The slug is derived from the title in lowercase, accent-free, hyphenated form.
- On collision, a numbered suffix is appended.
- The slug can be changed.
- The old slug is kept as a redirect and is never reused even after permanent deletion.
- A member profile's stable internal key is the Authentik `sub` value. The profile's slug is derived from the Authentik username.

### 4.3 Texts

All descriptions are plain text with line break support. HTML, Markdown, and rich text are not part of V0.

| Field                 | Maximum length |
| --------------------- | -------------: |
| Title                 |      200 chars |
| Slug                  |      200 chars |
| Tag and crew role     |       64 chars |
| Description and bio   |   10,000 chars |
| Guests and music used |    5,000 chars |
| URL                   |    2,048 chars |

Client and server must enforce the same limits.

### 4.4 Dates

- Exact timestamps are stored as UTC timestamps.
- `recordedAt`, as well as an event's start and end, are time-zone-less calendar dates.
- For display, Europe/Budapest applies.
- Public date format: `2026. június 6.`
- Admin and audit format: `2026. június 6. 14:32`
- Event interval: `2026. június 6-8.`
- Joining semester: `2023 ősz`

## 5. Videos

### 5.1 Data model

The fields of a video:

- UUID and slug;
- title;
- description;
- guests, free text;
- music used, free text;
- encoding group (`4a3_SD`, `16a9_SD`, or `16a9_HD`);
- HQ and LQ availability flags;
- base filename;
- visibility and status;
- `createdAt`, `updatedAt`, `publishedAt`, `recordedAt`;
- view count;
- optional event;
- tags;
- crew members and crew roles;
- ordered manual related videos;
- creator and last modifier.

The format of the music used is one item per line:

```text
Előadó - Szám címe
Másik előadó - Másik szám
```

A video can belong to at most one event. The event link is optional.

### 5.2 Date rules

- `createdAt` is system data and cannot be modified.
- On publication, `publishedAt` receives the current time, but a member can change it to a past point in time.
- Future `publishedAt` values are not allowed.
- For videos without an event, `recordedAt` is optional.
- Assigning a one-day event fills in an empty `recordedAt`.
- For a multi-day event, `recordedAt` must be provided before publishing.
- A date outside the event interval is allowed but triggers a warning.
- Changing the event or the event date does not silently overwrite the video date.
- When detaching an event, `recordedAt` is preserved.

### 5.3 Draft and publishing

Only the title is required to save a draft.

Required for publishing:

- title;
- encoding group;
- at least one available quality;
- base filename;
- visibility;
- non-future `publishedAt`;
- `recordedAt` for multi-day events.

On save, the admin form offers selectable actions: `Save draft` and `Publish`. There is no autosave. Navigating away with unsaved changes requires confirmation.

### 5.4 Media URLs

The application does not upload, transcode, or delete media files. For each video it stores the encoding group, base filename, and two availability flags named `hasHq` and `hasLq`. Both qualities may be available. It derives media URLs from these fields and prefers HQ for normal playback.

The supported encoding groups are:

| Group     | Aspect ratio | Storage directory        | HQ filename        |
| --------- | ------------ | ------------------------ | ------------------ |
| `4a3_SD`  | 4:3          | `bss_vagott_web_4a3_SD`  | `<name>_hq_SD.mp4` |
| `16a9_SD` | 16:9         | `bss_vagott_web_16a9_SD` | `<name>_hq_SD.mp4` |
| `16a9_HD` | 16:9         | `bss_vagott_web_16a9_HD` | `<name>_hq_HD.mp4` |

Within each storage directory, the application uses these paths:

- LQ video: `low_quality/<name>_lq.mp4`;
- HQ video: `high_quality/<name>_hq_SD.mp4` or `high_quality/<name>_hq_HD.mp4`;
- thumbnail: `thumbnail/<name>_tn.png`;
- keyframe: `keyframe/<name>_lq.png`;
- mobile playback: the LQ video.

`hq` selects the best encoding in the chosen group. It does not imply HD.

Before publishing, the server checks the derived video and thumbnail URLs:

- only the `https://v.bsstudio.hu` host is allowed;
- the server sends a `HEAD` request with a 5-second connection timeout and a 15-second total timeout;
- only a `200` response without redirection is accepted;
- videos require `video/mp4` and thumbnails require `image/*` content types;
- `3xx`, `4xx`, timeout, and `5xx` do not allow publishing;
- incomplete media fields can be saved as a draft;
- on `405` or `501`, a one-byte Range GET may be used as a fallback check.

Visibility only protects page metadata. The external MP4 URL is public, so anyone holding the link can access the file bypassing the application.

### 5.5 Player and view count

- Native video controls.
- When both encodings exist, the player offers an HQ/LQ selector and keeps the
  playback position when switching.
- The thumbnail serves as the poster.
- `preload="metadata"`.
- No autoplay.
- No separate download button.
- No playback position saving.
- On media error, a Hungarian error message and a retry option are displayed.

The counter increments at the first successful `play` event. One browser session counts the same video once, even across multiple tabs. The session cookie lives until the browser closes. There is no IP address, no per-user viewing history, and no manual counter modification. The view count is visible only in admin.

### 5.6 Related videos

Selection order:

1. ordered manual list, if present;
2. the five most recently published videos of the same event;
3. without an event, the five best videos sharing at least one common tag.

For common-tag matches, more common tags rank stronger. On ties, descending `publishedAt` decides.

Manually, any published video can be selected regardless of visibility. Drafts, archived videos, trashed videos, self-references, and duplicates are not allowed. At display time, the viewer's access level always filters.

### 5.7 Video detail block

Block order:

1. player;
2. title;
3. recorded and uploaded dates;
4. event link;
5. description;
6. guests;
7. music used;
8. tags;
9. crew grouped by role;
10. related videos.

Empty optional blocks are not displayed. A crew member's name links to their member profile. A tag opens the video list with that tag filter active.

### 5.8 Video list

The video card shows only a thumbnail and a title.

Sortings:

- default and latest uploads: `publishedAt` descending;
- chronological: `recordedAt` descending, missing values at the end;
- most viewed: view count descending.

On ties, `publishedAt` followed by UUID provides stable ordering.

Filters:

- free text;
- multiple tags joined by `AND`;
- event;
- `recordedAt` date range;
- crew member;
- crew role.

Default page size is 50. Selectable values: 10, 25, 50, 100. Sorting, pagination, and filters persist in the URL.

## 6. Events

### 6.1 Data model and publishing

The fields of an event:

- UUID and slug;
- title;
- plain-text description;
- optional thumbnail URL;
- start date;
- optional end date;
- status;
- creator, last modifier, and timestamps.

A draft needs only a title. Publishing requires title and start date. The end date cannot precede the start date. A future event can be published.

The event thumbnail is optional. If missing, the thumbnail of the newest video visible to the viewer may be used, followed by a placeholder.

### 6.2 Visibility and derived data

An event is always public. The video list, the video count, and the credits are built only from videos visible to the viewer.

There is no separate credits list for an event. The page shows the unique crew members of its videos, sorted by name, without titles.

### 6.3 List and detail page

Shown on the event card:

- thumbnail;
- title;
- the number of videos visible to the viewer in an overlay placed on the thumbnail.

The event list is sorted descending by start date. Its default page size is 50, with the same selectable sizes as the video list.

Shown on the event detail page:

- title, thumbnail, date interval, and description;
- videos sorted descending by `recordedAt`, paginated by 50;
- the derived credits list.

### 6.4 Permanent deletion

Only a board member can delete an event. The action is immediate and final.

Within one transaction:

1. every video's event link is removed;
2. the event is deleted;
3. a full audit entry is created.

The videos' `recordedAt` values are preserved. To confirm, the event title must be typed in.

## 7. Tags and crew roles

### 7.1 Tags

There is no separate category system. Multiple tags can belong to a video, and multiple videos to a tag.

- A member can only assign existing tags to a video.
- A board member can create, rename, merge, and delete tags.
- A tag in use can be deleted after a warning and typing in its name.
- On deletion, all video links are removed.
- On merge, all links move to the target tag.
- Letter case and redundant whitespace must not create duplicates.
- Accents are meaning-distinguishing. The system only warns about names similar when unaccented.

### 7.2 Crew roles

Authorization roles and crew roles live in separate tables.

- Only a board member can create, rename, order, and merge crew roles.
- A role has a `displayOrder` value.
- A role in use cannot be deleted.
- Multiple members can hold the same role on one video.
- A member can hold multiple roles on the same video.

## 8. Members

### 8.1 Authentik as source

Authentik is the single writable source of profile and authorization data. The application's profile pages and admin surface are read-only.

The OOB config maps:

- the stable `sub` identifier;
- username;
- full name;
- nickname;
- profile image URL;
- membership status;
- joining year and semester;
- bio;
- `tag` and `vezetoseg` groups.

The joining semester may arrive as free text. The cache stores the raw value plus the year and the `spring | autumn` value processed according to the config. An unknown format or status causes a sync error. In that case, the profile is not shown on the public list.

The application neither requests, caches, nor displays email addresses or mobile numbers.

### 8.2 Cache and synchronization

- Sync runs at startup, hourly, and on manual trigger by the board.
- Public requests do not call Authentik directly.
- During an Authentik outage, the last cache remains public.
- New logins are impossible; an existing session lives at most one hour.
- A member who has disappeared from Authentik keeps their last known, non-editable record.
- Historical credits and activity are not deleted.
- The hidden board-only surface shows sync status, errors, and the last run.

### 8.3 Membership statuses

A person has exactly one membership status:

- studio member;
- studio candidate;
- candidate candidate;
- active alumnus;
- archived alumnus;
- worked with us before.

The board role is separate from this. A board member appears only in the Board block and is not repeated in the block of their own status.

### 8.4 Member list and profile

Blocks of the active members page:

1. board;
2. studio members;
3. studio candidates;
4. candidate candidates;
5. active alumni.

Archived alumni and former contributors get a separate public subpage with pagination of 50. The active members page has no pagination.

The member card shows a profile image, full name, and nickname.

Profile order:

1. profile image, name, and nickname;
2. status and board role;
3. joining semester;
4. bio;
5. activity.

Activity can switch between year and role views. Both sort descending by `recordedAt`.

- In year view, groups by crew role appear under each year.
- In role view, videos appear chronologically under each role.
- With multiple roles, the same video appears in every affected group.
- Each view loads 50 videos at a time, then `Load more` continues.
- The view and the selected group persist in the URL.
- Only videos visible to the viewer are shown.

## 9. Homepage and live

### 9.1 Priority

The homepage state is a computed priority:

1. active live;
2. featured video;
3. normal state.

In live state, five recent public videos are shown next to the hero. In featured state the featured video plays inline in the hero and six recent public videos are shown next to it; its title links to the video page. The hero video must not repeat in the list. In normal state, six recent public videos are shown.

In all three states, six events are shown, sorted descending by start date. A future published event may also appear.

### 9.2 Featuring

- Only published, public videos can be featured.
- The board selects them.
- Featuring cannot be scheduled.
- Archiving, trashing, or narrowing visibility removes the featuring within the same transaction.

### 9.3 Live

Live is a schedule attached to a YouTube video:

- accepted URL forms: `youtube.com/watch`, `youtube.com/live`, `youtu.be`, YouTube embed;
- the system normalizes the URL to a video ID;
- display uses a `youtube-nocookie.com` embed;
- oEmbed validation runs at save and activation;
- start and end times are required;
- overlapping lives cannot be saved;
- the board gets `Start now` and `Close now` actions;
- no autoplay;
- during the 24 hours before the start, an `Adás hamarosan` banner appears;
- the banner does not replace normal or featured hero content;
- the homepage switches without refresh and checks state once per minute;
- on activation failure, the homepage falls back to featured or normal state;
- a transient YouTube failure does not automatically shut down a running live.

A finished live does not appear in any public archive. Admin retains a readable history. A past live can only be rescheduled as a copy.

No video is automatically created from a live. The editor creates a new normal video and may manually assign the `Adás` tag to it.

## 10. Other public pages

### 10.1 About

- The text is version-controlled plain-text content.
- Modifying it requires a code change.
- At the bottom of the page, at most six public videos chosen and ordered by the board are shown.
- Archived, trashed, or non-public videos drop out automatically.

### 10.2 Course

The `/courses` path redirects to `https://tanfolyam.bsstudio.hu/` in the same browser tab.

There is no local course form, data model, admin, export, or email.

## 11. Search

### 11.1 Global search box

The navbar search activates from two characters with a 250 ms delay. It shows at most five results per group and is keyboard-accessible.

Result types:

- video, leading to the video detail page;
- event, leading to the event detail page;
- member, leading to the member profile;
- tag, leading to the video list with that filter active.

In the interface, a person appears as `Tag` and data assigned to videos as `Címke`.

### 11.2 Weighting

Importance order:

1. exact title, name, or nickname;
2. prefix match on title, name, or tag;
3. video tags and event titles;
4. guests and credits;
5. description and bio.

Music used is not searched. Search ignores letter case and accents. Minor typos are handled by trigram-based similarity.

For a search query, relevance is the default sorting; on ties, `publishedAt` descending. The user can override this with the video list sortings.

### 11.3 Full search page

The `/search` tabs:

- All;
- Videos;
- Events;
- Members.

The All tab shows at most ten results per type. Detailed video search uses the accepted filters of the `/videos` page. Dates can only be searched via a dedicated date field; there is no natural-language date recognition.

An empty search does not dump the database. It shows search guidance and a link to the detailed video filter.

### 11.4 Access

The search query already excludes non-visible videos at the database level. Titles, thumbnails, result counts, and other metadata must not leak before client-side post-filtering.

## 12. Admin interface

### 12.1 Navigation

Sidebar items:

- Videos;
- Events;
- Live and featuring;
- Tag catalog;
- Crew roles;
- Members, board-only and read-only;
- Trash;
- Audit log, board-only.

There is no separate dashboard. After login, the Videos list opens. The admin is usable on mobile. Complex tables may switch to card views.

### 12.2 Video list

Columns:

- thumbnail and title;
- status;
- visibility;
- event;
- `recordedAt`;
- `publishedAt`;
- view count;
- last modifier and modification time.

Filters:

- search;
- status;
- visibility;
- event;
- tag.

Bulk deletion, archiving, and visibility changes do not exist in V0.

### 12.3 Event list

Columns:

- title;
- date or interval;
- status;
- number of videos;
- last modifier and modification time.

Filters: search, status, and date. No bulk deletion.

### 12.4 Concurrent editing

The application uses optimistic version checking. If someone else modified the record meanwhile, the second save is blocked. The interface shows a conflict message and offers a refresh option. There is no silent last-write-wins behavior.

When a session expires, the server rejects the save. The client keeps the entered data, requests re-login, and then allows resubmission.

## 13. Deletion and audit

### 13.1 Video trash

- Any member can trash a video after standard confirmation.
- Every member sees the trash and who deleted what and when.
- Only a board member can restore.
- On restore, the video becomes archived.
- Tag, crew, event, and related-video links are preserved in the trash.
- A daily job permanently deletes records that have been in the trash for at least 30 days.
- External media files are not deleted.

### 13.2 Audit log

Every creation, modification, publication, archival, trashing, restoration, permanent deletion, and configured admin action is logged.

Audit contents:

- Authentik ID or the `system` actor;
- exact time;
- entity type and ID;
- action;
- value before and after the change.

Only the board sees the log. It is filterable by actor, action, entity, and date. It cannot be deleted or exported and does not offer automatic rollback. Its retention is unlimited.

System actions write audit entries only on actual changes, errors, or deletions. An unchanged hourly sync does not.

## 14. Authentik and application security

- OIDC Authorization Code flow with PKCE.
- Access token never lands in `localStorage`.
- Session lives in an HTTP-only cookie.
- In production the cookie is `Secure`, always `SameSite=Lax`.
- Every server-side query and modification checks authorization.
- Role changes take effect within at most one hour.
- Anonymous users hitting a restricted link get a login prompt with the return URL preserved.
- Logged-in but unauthorized users get a `403` page.
- The title and thumbnail of forbidden videos never enter the HTML.
- Drafts, archived, trashed, permanently deleted, or nonexistent public paths return a consistent `404` page.

## 15. Background jobs and health

The application server starts:

- the hourly Authentik sync;
- the daily video-trash deletion job;
- the live start and end state transitions.

A PostgreSQL advisory lock prevents parallel double execution. No separate worker or Redis needed.

Health endpoints:

- `/health/live`, which checks that the application is running;
- `/health/ready`, which checks the database and migration state.

Persistent Authentik, live, or media validation failures appear in a board-facing warning banner and a detailed log. No external email or SMS.

## 16. Routes and metadata

Public routes:

- `/videos`;
- `/videos/{slug}`;
- `/events`;
- `/events/{slug}`;
- `/members`;
- `/members/{slug}`;
- separate archived-member and contributor subpages;
- `/about`;
- `/courses`;
- `/search`;
- `/admin`.

Redirecting the old Drupal `/video`, `/event`, and `/user` links is not part of local V0. It is a separate task before production cutover.

Every public video, event, and member page gets:

- a unique title;
- a description;
- a canonical URL;
- an Open Graph image.

Provide robots.txt and a sitemap listing only public content. There is no separate share button.

## 17. Seed and local environment

### 17.1 Scraper

One agent runs the scraper process. The result is pre-extracted, gitignored JSON.

Sample content:

- 50 videos;
- their events and tags;
- titles, descriptions, music, dates, encoding groups, quality availability, and base filenames;
- crew roles and relationships;
- persons consistently replaced with pseudonyms.

Profile bios, emails, and media files are not included in the JSON. The scraper has explicit operator permission to ignore the robots.txt crawl delay.

Execution rules:

- at most five parallel requests;
- exponential backoff on `429` and `5xx`;
- at most three attempts per page;
- resumable operation after interruption.

The seed's pseudonyms are represented by the test profiles of the local Authentik bootstrap.

### 17.2 Startup

The documented local process:

1. install dependencies;
2. verify OOB files;
3. start PostgreSQL and Authentik;
4. run clean migrations;
5. run the Authentik blueprint or bootstrap;
6. load the seed;
7. start the application;
8. run typecheck, lint, and tests.

The current prototype's database schema is disposable. A new, clean migration baseline will be created.

## 18. Quality requirements

- Hungarian UI.
- Responsive public and admin pages.
- Mobile and desktop usage.
- Keyboard-operable search and basic forms.
- Accessibility is a useful goal, but formal WCAG compliance is not a V0 release condition.
- Distinct Hungarian empty, loading, and error states.
- Stable, server-side pagination and sorting.
- Typecheck and lint error-free.
- Migrations running on a clean database.
- Integration tests covering authorization, status, search, and deletion flows.
- End-to-end tests covering login, video publishing, event management, and live priority.
- External media and YouTube calls mocked in tests.
- The 30-day deletion testable with a test clock, without real waiting.

## 19. Out of scope for V0

- rating;
- comments;
- share and download buttons;
- IP-based unique views;
- media upload and transcoding;
- actual access protection of MP4 files;
- course form, admin, export, and email;
- request manager;
- public live archive and automatic replay video;
- full migration of the old site;
- redirects for old Drupal links;
- production deployment;
- external UptimeRobot configuration;
- email and mobile fields;
- audit export and automatic rollback;
- bulk admin operations.

## 20. Acceptance scenarios

1. An anonymous visitor finds and opens only public videos.
2. A Schönherz user sees public and Schönherz videos and cannot enter admin.
3. A member reaches every visibility level, creates drafts, publishes, archives, and trashes.
4. A board member restores a video, permanently deletes an event, and manages tags and crew roles.
5. An invalid or redirecting media URL can be saved as a draft but not published.
6. A video attached to a one-day event receives an automatic date. For multi-day events, an out-of-range date gives a warning.
7. All three branches of related videos — manual, event-based, and shared-tag — work with permission filtering.
8. An event's video count, video list, and credits leak no restricted video.
9. A member profile's activity can be switched between year and role views and is filtered by permissions.
10. The global search emits no invisible video metadata.
11. The homepage's live, featured, and normal priorities switch without refresh.
12. Overlapping lives cannot be saved; a broken YouTube live fails to activate.
13. Of two concurrent edits, the server blocks the stale save.
14. Restoring from trash preserves relationships and yields archived status.
15. The test clock permanently deletes a video record after 30 days, leaving external media untouched.
16. During an Authentik outage the public cache works; new logins do not.
17. A clean clone can be started with documented steps given the OOB package.
