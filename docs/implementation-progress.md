# BSS V0 implementációs állapot

Utolsó frissítés: 2026-08-23 (2. fázis vége, fáziskapu zöld)

## Aktuális fázis

**2. fázis – Tartalmi domainek: KÉSZ, felhasználói jóváhagyásra vár.**

Mind a hét kártya (BSS-012 – BSS-018) elkészült, a fáziskapu gate-je zöld.
Következő: **3. fázis – Publikus felület** (BSS-019 – BSS-026), munka csak külön jóváhagyással.

## Kártyák állapota

| Kártya  | Név                                           | Állapot | Ellenőrzések                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------- | --------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BSS-001 | Toolchain stabilizálása                       | done    | `pnpm check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` zöld; nightly/`latest` függőségek eltűntek; dedikált `vitest.config.ts` javítja a Nitro/Vite tesztindítási hibát                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| BSS-002 | Tesztalap és vezérelhető idő                  | done    | unit + integration vitest projektek; `FakeClock` 30 napos törlés szimulációhoz; fetch-mock helper; izolált tesztadatbázis-kezelő (`tests/helpers/test-db.ts`, új: `createMigratedTestDatabase`); integrációs smoke test valódi PostgreSQL-en fut (2× futtatva, ismételhető)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| BSS-003 | OOB konfigurációs szerződés                   | done    | típusos séma + magyar nyelvű validáció (`src/server/config/oob-schema.ts`); 15 unit teszt; `pnpm check:oob` CLI; dokumentáció: `docs/oob-inputs.md`, példa: `docs/examples/oob-config.example.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| BSS-004 | Új adatbázisséma és migrációs alap            | done    | 14 tábla + `auth_sessions` migrációja tiszta PostgreSQL-en lefut (CLI és tesztfuttató egyaránt); DB-szintű invariánsok; integrációs sématesztek                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| BSS-005 | Lokális infrastruktúra és Authentik bootstrap | done    | compose rendezve (healthcheck, blueprint mount); `pnpm infra:bootstrap` idempotens titok- és YAML-generátor; élőben verifikálva; teljes restart után sem duplikál                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| BSS-006 | OIDC belépés és session                       | done    | `/api/auth/login`, `/api/auth/callback`, `/api/auth/logout` PKCE-s flow-val; DB-ben tárolt session (`auth_sessions`), access token csak szerveroldalon; HTTP-only SameSite=Lax cookie-k; returnTo megőrzés nyitott átirányítás ellenőrzéssel; abszolút 60 perces TTL; Authentik-kiesés magyar 503 oldallal; élő dev szerveren: login 302 az Authentik authorize végpontra, callback hibaág 400, publikus oldal 200                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| BSS-007 | Jogosultsági policy és guardok                | done    | viewer szintek (anonymous/schonherz/member/leadership) csoportokból; vezetőség csak tag csoporttal együtt; teljes admin mátrix unit tesztekkel (spec 3.2); `visibleVideoCondition` SQL feltétel valódi adatbázison tesztelve mind a 4 nézői szintre + metaadat-szivárgás ellenőrzés; `requireAdmin`/`requireLeadership` guardok (login redirect returnTo-val / 403); `/api/auth/me` állapotvégpont Authentik-hívás nélkül                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| BSS-008 | Authentik tagcache és szinkron                | done    | `runMemberSync` client_credentials granthasználatával az Authentik API-ról (lapozott users/groups); mapping konfig szerint; nyers félév megőrzése; ismeretlen státusz → syncStatus=error (publikusból kimarad, utolsó ismert adat megmarad); eltűnt tag rekordja megmarad; változatlan futás NEM ír auditot; szerepváltozás audit előtte-utána párral; `member_sync_runs` állapottábla; kézi indítás csak vezetőségnek; élőben verifikálva a lokális Authentikkel (7 tag cache-elve, idempotens)                                                                                                                                                                                                                                                                                                                                                                              |
| BSS-009 | Közös slug, audit és optimista zárolás        | done    | `slugify` magyar ékezet-feloldással; ütközésnél számozott utótag; slug_history lefoglalja a régi slugokat végleges törlés után is; `renameSlugWithHistory` + `resolveSlugRedirect`; `updateWithOptimisticLock`: FOR UPDATE sorzár + verzióellenőrzés (StaleWriteError) + tranzakciós audit előtte-utána értékkel; system aktornál updatedBy NULL; DB-trigger tiltja az audit UPDATE/DELETE-t (custom migráció); plain text és hosszvalidáció (`TEXT_LIMITS`); 14 integrációs teszt                                                                                                                                                                                                                                                                                                                                                                                            |
| BSS-010 | Háttérfeladat-futtató, health, riasztás       | done    | `JobRegistry` + `dueJobs` FakeClock-kal vezérelt ütemezéssel; `runJobWithLock` PostgreSQL advisory lockkal: két példány közül egy futtat (skipped-locked); induláskori + óránkénti sync feladatok regisztrálva, extra feladatok (lomtár, live) regisztrálhatók; `/health/live` mindig 200, `/health/ready` DB és kulcstábla ellenőrzéssel (503, titok nélkül); hibás háttérfeladat nem dönti le az alkalmazást; vezetőségi szinkronriasztás `getRecentSyncAlerts`; élőben: health 200/200                                                                                                                                                                                                                                                                                                                                                                                     |
| BSS-011 | Média- és YouTube-validátor                   | done    | host engedélylista (https + v.bsstudio.hu); publikáláshoz HEAD 200 átirányítás nélkül, video/mp4 vs image/* content-type; 405/501-nél egybájtos Range GET tartalék (bytes=0-0, tartalom letöltése nélkül); piszkozathoz hálózat nélküli formaellenőrzés (hibás URL menthető piszkozatban); YouTube normalizálás (watch/live/youtu.be/embed/nocookie) + oEmbed ellenőrzés magyar hibaüzenetekkel; 16 unit teszt                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| BSS-012 | Címke- és stábszerep-domain                   | done    | `src/server/catalog/` (names/tags/staff-roles): normalizált név (kisbetű + whitespace) egyediség; ékezeti hasonlóság csak figyelmeztetés (`findAccentSimilarTagNames`); használt címke törlése csak vezetőséggel + pontos címbeírással; összevonás tranzakcióban kapcsolatvesztés nélkül (ON CONFLICT DO NOTHING); használatban lévő szerep törlésének tiltása + DB restrict; `displayOrder` sorrendezés; minden művelet auditolt; 13 integrációs teszt                                                                                                                                                                                                                                                                                                                                                                                                                       |
| BSS-013 | Esemény-domain és végleges törlés             | done    | `src/server/events/domain.ts`: piszkozat csak címmel; publikálás = cím + kezdődátum + (ha van) elérhető thumbnail (BSS-011 validátorral); jövőbeli esemény publikálható; end >= start alkalmazás- és DB-szinten; archiválás → újrapublikálás; slug módosítás előzménnyel; végleges törlés vezetőségi + címbeírással EGY tranzakcióban (videók leválasztása `recordedAt` megőrzésével → régi slug történetbe foglalva → teljes audit `detachedVideoIds`-szal); lista kezdődátum desc, lapozás; 12 integrációs teszt. **Sémaváltozás:** `events.start_date` nullable lett (spec 6.1: piszkozathoz csak cím kell) — migráció: `drizzle/20260823184625_salty_jocasta`                                                                                                                                                                                                             |
| BSS-014 | Videó-domain és életciklus                    | done    | `src/server/videos/domain.ts` + `purge.ts` + `highlight-invalidation.ts`: piszkozat csak címmel (hibás média-URL is menthető); publikálás ellenőrzi kötelező mezőket + médiát hálózati validátorral (a tranzakción kívül), többnapos eseménynél `recordedAt`, nem jövőbeli `publishedAt` (múltbeli megadható és megmarad); egynapos esemény csendesen kitölti az üres dátumot, felülírni soha nem írja; leválasztás megtartja a dátumot; intervallumon kívüli dátum csak figyelmeztetés; archiválás/lomtár/visszaállítás (vezetőség, archivált állapotba, kapcsolatokkal); napi 30 napos végleges törlés (`createTrashPurgeJob` a runner extra feladataként, rendszer-audit, slug lefoglalás); kiemelés/Rólunk érvénytelenítés ugyanabban a tranzakcióban állapot- és láthatóságváltozáskor; címkék/stáblista csere verzióellenőrzéssel és auditálással; 14 integrációs teszt |
| BSS-015 | Kapcsolódó videók szolgáltatása               | done    | `src/server/videos/related.ts`: manuális lista felülír mindent (csak publikált választható, önhivatkozás/duplikátum tiltva); azonos esemény öt legutóbb publikált videója (`publishedAt` desc); esemény nélkül közös címkék pontozással (több közös címke erősebb, egyezésnél `publishedAt` desc, stabil `id` tiebreak); megjelenítés minden ágon `visibleVideoCondition`-nal szűrve az SQL-ben — korlátozott videó metaadata nem szivárog; verzióellenőrzött mentés + audit; 8 integrációs teszt                                                                                                                                                                                                                                                                                                                                                                             |
| BSS-016 | Megtekintésszámláló                           | done    | `src/server/views/counter.ts`: anonim session cookie (`bss_view_session`) szándékosan Max-Age nélkül — böngésző bezárásáig él; a DB-ben csak a token SHA-256 kivonata, IP/felhasználói előzmény nélkül; `view_sessions` PK + ON CONFLICT DO NOTHING idempotencia párhuzamos kérésekkel szemben (teszt: Promise.all két hívásból, csak egy számol); csak publikált és a nézőnek látható videó számolható; számláló csak admin lekérdezésben (legalább tagság); 7 integrációs teszt                                                                                                                                                                                                                                                                                                                                                                                             |
| BSS-017 | Homepage, live, kiemelés és Rólunk-domain     | done    | `src/server/homepage/{live,highlight,about,state}.ts`: számított prioritás (aktív live > kiemelt > normál); live ütemezés oEmbed ellenőrzéssel mentéskor is, átfedés alkalmazás- ÉS DB-szinten tiltva (részleges EXCLUDE korlát: `WHERE status <> 'ended'`, így befejezett live fölé mehet másolat) — migráció: `drizzle/20260823191647_melted_mojo` (btree_gist + korlátcsere); `Indítás most` oEmbed-fallbackkel (hiba rögzül, ütemezett marad), `Lezárás most`; befejezett live nem módosítható/törölhető (csak másolatként); perces `createLiveTransitionJob` runner-feladat system audittal; kiemelés csak publikált+publikus videó; Rólunk legfeljebb hat rendezett publikus videó, érvénytelen SQL-ben kiesik; homepage: 5/6 publikus videó (hero nélkül), hat esemény, `Adás hamarosan` 24 órás sáv; 10 integrációs teszt                                             |

## Fáziskapu eredménye (0. fázis, megtörtént)

- [x] rögzített, kompatibilis függőségek (lockfile + nincs `latest`/nightly)
- [x] zöld format check, lint, typecheck, test, build
- [x] tiszta adatbázison lefutó migráció
- [x] dokumentált config séma (`docs/oob-inputs.md`)
- [x] idempotens lokális Authentik bootstrap (élőben ellenőrizve)
- [x] mindhárom nézői szint és mindkét adminszerep tesztadata létrehozható

## OOB bemenetek állapota

| Fájl                     | Hely                                                  | Állapot                                                          |
| ------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Authentik mapping config | `oob/config.json` (vagy `BSS_OOB_CONFIG`)             | lokális változat generált és valid; éles értékek továbbra is OOB |
| Helyi titkok             | `.env`, `oob/local-secrets.json`, `oob/authentik.env` | generálva, gitignore-olt, nem kerülnek gitbe                     |
| Seed JSON                | `oob/seed.json`                                       | helye a configban rögzített; tartalma az 5. fázisban (BSS-034)   |

## Elfogadott felhasználói döntések ebben a fázisban

Új termékdöntés nincs; a specifikációból következő technikai döntések:

- A telepített TanStack Start verzió nem támogat server-route fájlokat; helyette testre szabott
  `src/server.ts` entry szolgálja ki a `/api/*` és `/health/*` útvonalakat, minden mást az SSR handlernek adva.
- Session modell: `auth_sessions` tábla, a cookie-ban csak véletlen token van, a DB-ben annak SHA-256 hash-e.
  Az access token csak a DB-ben él. Abszolút 60 perces lejárat adja a „legfeljebb órás szerepfrissítés”
  garanciáját (nincs refresh token, mert a lokális provider nem kér `offline_access` scope-ot).
- Az `auth_sessions.member_sub` NEM idegen kulcs a `member_cache.sub`-ra: így a belépés akkor is működik,
  ha a tag még nem szerepel a cache-ben (BSS-008 szinkron feltölti).
- A jogosultsághoz szükséges csoportlistát a szabványos `groups` OIDC claim hordozza; a lokális blueprint
  profile scope-ját bővítettük (`scripts/lib/local-bootstrap.ts`), a generált YAML regenerálódott.
- Az OIDC tranzakció (state/PKCE/returnTo) rövid életű, HMAC-SHA256 aláírt cookie-ban utazik; az aláíró
  kulcs a config clientId+clientSecret titkából származik (új OOB titok bevezetése nélkül).
- Az id_token signature-ét nem ellenőrizzük (backchannel token), de iss/aud/exp/nonce igen.

## Ismert hibák és technikai tartozás

- A publikus prototípus oldalai még statikus placeholder tartalmat mutatnak (2–3. fázis).
- `@tanstack/router-cli` (tsr) Node 24-es circular-dependency figyelmeztetése ártalmatlan.
- docker-compose: HTTPS portfeltárás elhagyva (HTTP :9000).
- A belépési felület navbar-integrációja (Belépés/Kilépés gomb) a BSS-019/BSS-027 kártyákhoz tartozik;
  addig közvetlen URL-lel (`/api/auth/login`) érhető el a belépés.

## Fáziskapu eredménye (2. fázis)

- [x] `pnpm check` zöld
- [x] `pnpm lint` zöld
- [x] `pnpm typecheck` zöld (0 hiba)
- [x] `TEST_DATABASE_URL=... pnpm test` zöld — 25 fájl / 234 teszt (1. fázis: 160)
- [x] `pnpm build` zöld (nitro .output)
- [x] migrációk tiszta adatbázison lefutnak (7 migráció, 16 tábla; EXCLUDE korlát és `bss_norm` függvény ellenőrizve)
- [x] git diff átnézve: titkok csak gitignore-olt `.env` és `oob/` fájlokban; idegen módosítás nincs

## Új migrációk a 2. fázisban

| Migráció                       | Tartalom                                                                                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260823184625_salty_jocasta` | `events.start_date` nullable (spec 6.1: piszkozathoz csak cím kell)                                                                                  |
| `20260823191647_melted_mojo`   | live átfedés-tilalom cseréje részleges EXCLUDE korlátra (`WHERE status <> 'ended'`, btree_gist) — befejezett live fölé mehet másolatként új ütemezés |
| `20260823193237_organic_ego`   | `pg_trgm` kiterjesztés + `bss_norm(text)` IMMUTABLE SQL függvény (kisbetűs + magyar ékezetlevétel a kereséshez)                                      |

## Elfogadott technikai döntések a 2. fázisban

- A domainlogika szerveroldali szolgáltatás-modulokban él (`src/server/{catalog,events,videos,views,homepage,search}`),
  route-/UI-wiring a 3–4. fázisban csatlakozik. Minden írás tranzakcióban, auditálva, optimista verzióval.
- `updateWithOptimisticLock` bővítve: opcionális `action` (auditnév) és `afterWrite` callback
  (tranzakción belüli kiegészítő írás, pl. homepage-hivatkozás érvénytelenítés).
- Videó életciklus: publikálási médiaellenőrzés (hálózati) szándékosan a tranzakció előtt fut,
  hogy ne tartsunk sorzárat hívás közben; az állapotváltás + kiemelés/Rólunk érvénytelenítés egy tranzakció.
- Lomtár-purge és live állapotváltások `JobDefinition`-ként regisztrálhatók a runner extra feladataiként
  (`createTrashPurgeJob`, `createLiveTransitionJob`); rendszer-audit csak tényleges változásnál.
- Megtekintésszám: a `videos.view_count` oszlop és a `view_sessions` sorok ugyanabban a tranzakcióban
  frissülnek; ON CONFLICT DO NOTHING adja az idempotenciát párhuzamos kérésekkel szemben.
- Keresés: `bss_norm` + pg_trgm `similarity` (küszöb 0.3); a keresőkifejezés paraméterezve megy az SQL-be;
  üres/1 karakteres keresés nem ér adatbázist. Részletes videószűrés `count(*) over()`-ral lapoz.
- Keresési súlyok (spec 11.2): pontos 100 > előtag 80 > címke 70/55 > trigram ≤50 > eseménycím 40 >
  vendégek/stáb 30/25 > leírás/bemutatkozás 20.

## Ismert hibák és technikai tartozás

- A publikus prototípus oldalai még statikus placeholder tartalmat mutatnak (3. fázis).
- `@tanstack/router-cli` (tsr) Node 24-es circular-dependency figyelmeztetése ártalmatlan.
- docker-compose: HTTPS portfeltárás elhagyva (HTTP :9000).
- A belépési felület navbar-integrációja (Belépés/Kilépés gomb) a BSS-019/BSS-027 kártyákhoz tartozik;
  addig közvetlen URL-lel (`/api/auth/login`) érhető el a belépés.
- Az integrációs tesztek futtatásához továbbra is `TEST_DATABASE_URL` kell (nélküle skipelnek).

## Fáziskapu eredménye (1. fázis)

- [x] `pnpm check` zöld
- [x] `pnpm lint` zöld
- [x] `pnpm typecheck` zöld (0 hiba)
- [x] `TEST_DATABASE_URL=... pnpm test` zöld — 18 fájl / 160 teszt
- [x] `pnpm build` zöld (nitro .output)
- [x] migrációk tiszta adatbázison lefutnak (CLI próba: bss_gate_check, 16 tábla)
- [x] git diff átnézve: titkok csak gitignore-olt oob/ fájlokban; idegen módosítás nincs

## Elfogadott technikai döntések az 1. fázisban

- TanStack Start server entry (`src/server.ts`) szolgálja ki a `/api/*` és `/health/*`
  útvonalakat; a telepített verziónál a createFileRoute-os server routes még nem elérhetők.
- Session: `auth_sessions` tábla; a cookie-ban véletlen token van, a DB-ben annak
  SHA-256 hash-e; abszolút 60 perces TTL adja az órás szerepfrissítést.
  Az `auth_sessions.member_sub` NEM idegen kulcs (a belépés cache-szinkron előtt is működjön).
- OIDC tranzakció HMAC-SHA256 aláírt cookie-ban; az aláíró kulcs a clientId+clientSecretből
  képzett. Az id_token signature-ét nem ellenőrizzük (backchannel token), de
  iss/aud/exp/nonce igen.
- Blueprint változások a szinkronhoz: `sub_mode: user_id` (az API pk-ja = OIDC sub,
  így a cache összekapcsolható az API adataival), explicit `grant_types`
  (authorization_code + refresh_token + client_credentials), `svc-bss-sync`
  szolgáltatási fiók app-password tokennel és csak olvasási jogokkal
  (`authentik_core.view_user/view_group`). Új OOB mező: `authentik.sync.{username,token}`
  — a docs/oob-inputs.md frissült.
- Tagsági státusz nélküli felhasználók (pl. schönherzesek) NEM kerülnek a tagcache-be;
  a korábban ok profil hibás státuszra váltásnál megtartja utolsó adatait,
  syncStatus=error jelöléssel (publikus nézetek erre szűrnek).
- Audit immunitás DB-triggerrel védve: UPDATE és DELETE exception-t dob.
- A média HEAD „kapcsolódási” fázisa a fetch API-val nem különíthető el:
  egyetlen 15 mp-es teljes timeout van (dokumentált eltérés az 5 mp-es connect
  timeout helyett).

## Parancsok

| Parancs                                | Funkció                              |
| -------------------------------------- | ------------------------------------ |
| `pnpm check`                           | formátumellenőrzés                   |
| `pnpm lint`                            | ESLint                               |
| `pnpm typecheck`                       | route-generálás + `tsc --noEmit`     |
| `TEST_DATABASE_URL=... pnpm test`      | unit + integrációs tesztek           |
| `pnpm build`                           | produkciós build                     |
| `pnpm db:generate` / `pnpm db:migrate` | migráció generálása / futtatása      |
| `pnpm check:oob`                       | OOB config validáció                 |
| `pnpm infra:bootstrap`                 | lokális titkok + Authentik blueprint |
