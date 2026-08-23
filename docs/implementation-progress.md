# BSS V0 implementációs állapot

Utolsó frissítés: 2026-08-23 (1. fázis közbeni állapot, BSS-006 után)

## Aktuális fázis

**1. fázis – Auth és közös infrastruktúra: KÉSZ, felhasználói jóváhagyásra vár.**

Mind a hat kártya (BSS-006 – BSS-011) elkészült, a fáziskapu gate-je zöld.
Következő: **2. fázis – Tartalmi domainek** (BSS-012 – BSS-018), munka csak külön jóváhagyással.

## Kártyák állapota

| Kártya  | Név                                           | Állapot | Ellenőrzések                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------- | --------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BSS-001 | Toolchain stabilizálása                       | done    | `pnpm check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` zöld; nightly/`latest` függőségek eltűntek; dedikált `vitest.config.ts` javítja a Nitro/Vite tesztindítási hibát                                                                                                                                                                                                                                                                                                          |
| BSS-002 | Tesztalap és vezérelhető idő                  | done    | unit + integration vitest projektek; `FakeClock` 30 napos törlés szimulációhoz; fetch-mock helper; izolált tesztadatbázis-kezelő (`tests/helpers/test-db.ts`, új: `createMigratedTestDatabase`); integrációs smoke test valódi PostgreSQL-en fut (2× futtatva, ismételhető)                                                                                                                                                                                                                      |
| BSS-003 | OOB konfigurációs szerződés                   | done    | típusos séma + magyar nyelvű validáció (`src/server/config/oob-schema.ts`); 15 unit teszt; `pnpm check:oob` CLI; dokumentáció: `docs/oob-inputs.md`, példa: `docs/examples/oob-config.example.json`                                                                                                                                                                                                                                                                                              |
| BSS-004 | Új adatbázisséma és migrációs alap            | done    | 14 tábla + `auth_sessions` migrációja tiszta PostgreSQL-en lefut (CLI és tesztfuttató egyaránt); DB-szintű invariánsok; integrációs sématesztek                                                                                                                                                                                                                                                                                                                                                  |
| BSS-005 | Lokális infrastruktúra és Authentik bootstrap | done    | compose rendezve (healthcheck, blueprint mount); `pnpm infra:bootstrap` idempotens titok- és YAML-generátor; élőben verifikálva; teljes restart után sem duplikál                                                                                                                                                                                                                                                                                                                                |
| BSS-006 | OIDC belépés és session                       | done    | `/api/auth/login`, `/api/auth/callback`, `/api/auth/logout` PKCE-s flow-val; DB-ben tárolt session (`auth_sessions`), access token csak szerveroldalon; HTTP-only SameSite=Lax cookie-k; returnTo megőrzés nyitott átirányítás ellenőrzéssel; abszolút 60 perces TTL; Authentik-kiesés magyar 503 oldallal; élő dev szerveren: login 302 az Authentik authorize végpontra, callback hibaág 400, publikus oldal 200                                                                               |
| BSS-007 | Jogosultsági policy és guardok                | done    | viewer szintek (anonymous/schonherz/member/leadership) csoportokból; vezetőség csak tag csoporttal együtt; teljes admin mátrix unit tesztekkel (spec 3.2); `visibleVideoCondition` SQL feltétel valódi adatbázison tesztelve mind a 4 nézői szintre + metaadat-szivárgás ellenőrzés; `requireAdmin`/`requireLeadership` guardok (login redirect returnTo-val / 403); `/api/auth/me` állapotvégpont Authentik-hívás nélkül                                                                        |
| BSS-008 | Authentik tagcache és szinkron                | done    | `runMemberSync` client_credentials granthasználatával az Authentik API-ról (lapozott users/groups); mapping konfig szerint; nyers félév megőrzése; ismeretlen státusz → syncStatus=error (publikusból kimarad, utolsó ismert adat megmarad); eltűnt tag rekordja megmarad; változatlan futás NEM ír auditot; szerepváltozás audit előtte-utána párral; `member_sync_runs` állapottábla; kézi indítás csak vezetőségnek; élőben verifikálva a lokális Authentikkel (7 tag cache-elve, idempotens) |
| BSS-009 | Közös slug, audit és optimista zárolás        | done    | `slugify` magyar ékezet-feloldással; ütközésnél számozott utótag; slug_history lefoglalja a régi slugokat végleges törlés után is; `renameSlugWithHistory` + `resolveSlugRedirect`; `updateWithOptimisticLock`: FOR UPDATE sorzár + verzióellenőrzés (StaleWriteError) + tranzakciós audit előtte-utána értékkel; system aktornál updatedBy NULL; DB-trigger tiltja az audit UPDATE/DELETE-t (custom migráció); plain text és hosszvalidáció (`TEXT_LIMITS`); 14 integrációs teszt               |
| BSS-010 | Háttérfeladat-futtató, health, riasztás       | done    | `JobRegistry` + `dueJobs` FakeClock-kal vezérelt ütemezéssel; `runJobWithLock` PostgreSQL advisory lockkal: két példány közül egy futtat (skipped-locked); induláskori + óránkénti sync feladatok regisztrálva, extra feladatok (lomtár, live) regisztrálhatók; `/health/live` mindig 200, `/health/ready` DB és kulcstábla ellenőrzéssel (503, titok nélkül); hibás háttérfeladat nem dönti le az alkalmazást; vezetőségi szinkronriasztás `getRecentSyncAlerts`; élőben: health 200/200        |
| BSS-011 | Média- és YouTube-validátor                   | done    | host engedélylista (https + v.bsstudio.hu); publikáláshoz HEAD 200 átirányítás nélkül, video/mp4 vs image/* content-type; 405/501-nél egybájtos Range GET tartalék (bytes=0-0, tartalom letöltése nélkül); piszkozathoz hálózat nélküli formaellenőrzés (hibás URL menthető piszkozatban); YouTube normalizálás (watch/live/youtu.be/embed/nocookie) + oEmbed ellenőrzés magyar hibaüzenetekkel; 16 unit teszt                                                                                   |

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
