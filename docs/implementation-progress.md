# BSS V0 implementációs állapot

Utolsó frissítés: 2026-08-24 (5. fázis vége, fáziskapu zöld)

## Aktuális fázis

**5. fázis – Seed, SEO, minőség és átadás: KÉSZ, felhasználói jóváhagyásra vár.**

Mind az öt kártya (BSS-034 – BSS-038) elkészült, a fáziskapu gate-je zöld.
Ez volt az utolsó végrehajtási hullám; a következő a production előtti, külön
backlog (implementation-plan 5. fejezet), munka csak külön jóváhagyással.

## Kártyák állapota

| Kártya  | Név                                             | Állapot | Ellenőrzések                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------- | ----------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BSS-001 | Toolchain stabilizálása                         | done    | `pnpm check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` zöld; nightly/`latest` függőségek eltűntek; dedikált `vitest.config.ts` javítja a Nitro/Vite tesztindítási hibát                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| BSS-002 | Tesztalap és vezérelhető idő                    | done    | unit + integration vitest projektek; `FakeClock` 30 napos törlés szimulációhoz; fetch-mock helper; izolált tesztadatbázis-kezelő (`tests/helpers/test-db.ts`, új: `createMigratedTestDatabase`); integrációs smoke test valódi PostgreSQL-en fut (2× futtatva, ismételhető)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| BSS-003 | OOB konfigurációs szerződés                     | done    | típusos séma + magyar nyelvű validáció (`src/server/config/oob-schema.ts`); 15 unit teszt; `pnpm check:oob` CLI; dokumentáció: `docs/oob-inputs.md`, példa: `docs/examples/oob-config.example.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| BSS-004 | Új adatbázisséma és migrációs alap              | done    | 14 tábla + `auth_sessions` migrációja tiszta PostgreSQL-en lefut (CLI és tesztfuttató egyaránt); DB-szintű invariánsok; integrációs sématesztek                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| BSS-005 | Lokális infrastruktúra és Authentik bootstrap   | done    | compose rendezve (healthcheck, blueprint mount); `pnpm infra:bootstrap` idempotens titok- és YAML-generátor; élőben verifikálva; teljes restart után sem duplikál                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| BSS-006 | OIDC belépés és session                         | done    | `/api/auth/login`, `/api/auth/callback`, `/api/auth/logout` PKCE-s flow-val; DB-ben tárolt session (`auth_sessions`), access token csak szerveroldalon; HTTP-only SameSite=Lax cookie-k; returnTo megőrzés nyitott átirányítás ellenőrzéssel; abszolút 60 perces TTL; Authentik-kiesés magyar 503 oldallal; élő dev szerveren: login 302 az Authentik authorize végpontra, callback hibaág 400, publikus oldal 200                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| BSS-007 | Jogosultsági policy és guardok                  | done    | viewer szintek (anonymous/schonherz/member/leadership) csoportokból; vezetőség csak tag csoporttal együtt; teljes admin mátrix unit tesztekkel (spec 3.2); `visibleVideoCondition` SQL feltétel valódi adatbázison tesztelve mind a 4 nézői szintre + metaadat-szivárgás ellenőrzés; `requireAdmin`/`requireLeadership` guardok (login redirect returnTo-val / 403); `/api/auth/me` állapotvégpont Authentik-hívás nélkül                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| BSS-008 | Authentik tagcache és szinkron                  | done    | `runMemberSync` client_credentials granthasználatával az Authentik API-ról (lapozott users/groups); mapping konfig szerint; nyers félév megőrzése; ismeretlen státusz → syncStatus=error (publikusból kimarad, utolsó ismert adat megmarad); eltűnt tag rekordja megmarad; változatlan futás NEM ír auditot; szerepváltozás audit előtte-utána párral; `member_sync_runs` állapottábla; kézi indítás csak vezetőségnek; élőben verifikálva a lokális Authentikkel (7 tag cache-elve, idempotens)                                                                                                                                                                                                                                                                                                                                                                                  |
| BSS-009 | Közös slug, audit és optimista zárolás          | done    | `slugify` magyar ékezet-feloldással; ütközésnél számozott utótag; slug_history lefoglalja a régi slugokat végleges törlés után is; `renameSlugWithHistory` + `resolveSlugRedirect`; `updateWithOptimisticLock`: FOR UPDATE sorzár + verzióellenőrzés (StaleWriteError) + tranzakciós audit előtte-utána értékkel; system aktornál updatedBy NULL; DB-trigger tiltja az audit UPDATE/DELETE-t (custom migráció); plain text és hosszvalidáció (`TEXT_LIMITS`); 14 integrációs teszt                                                                                                                                                                                                                                                                                                                                                                                                |
| BSS-010 | Háttérfeladat-futtató, health, riasztás         | done    | `JobRegistry` + `dueJobs` FakeClock-kal vezérelt ütemezéssel; `runJobWithLock` PostgreSQL advisory lockkal: két példány közül egy futtat (skipped-locked); induláskori + óránkénti sync feladatok regisztrálva, extra feladatok (lomtár, live) regisztrálhatók; `/health/live` mindig 200, `/health/ready` DB és kulcstábla ellenőrzéssel (503, titok nélkül); hibás háttérfeladat nem dönti le az alkalmazást; vezetőségi szinkronriasztás `getRecentSyncAlerts`; élőben: health 200/200                                                                                                                                                                                                                                                                                                                                                                                         |
| BSS-011 | Média- és YouTube-validátor                     | done    | host engedélylista (https + v.bsstudio.hu); publikáláshoz HEAD 200 átirányítás nélkül, video/mp4 vs image/* content-type; 405/501-nél egybájtos Range GET tartalék (bytes=0-0, tartalom letöltése nélkül); piszkozathoz hálózat nélküli formaellenőrzés (hibás URL menthető piszkozatban); YouTube normalizálás (watch/live/youtu.be/embed/nocookie) + oEmbed ellenőrzés magyar hibaüzenetekkel; 16 unit teszt                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| BSS-012 | Címke- és stábszerep-domain                     | done    | `src/server/catalog/` (names/tags/staff-roles): normalizált név (kisbetű + whitespace) egyediség; ékezeti hasonlóság csak figyelmeztetés (`findAccentSimilarTagNames`); használt címke törlése csak vezetőséggel + pontos címbeírással; összevonás tranzakcióban kapcsolatvesztés nélkül (ON CONFLICT DO NOTHING); használatban lévő szerep törlésének tiltása + DB restrict; `displayOrder` sorrendezés; minden művelet auditolt; 13 integrációs teszt                                                                                                                                                                                                                                                                                                                                                                                                                           |
| BSS-013 | Esemény-domain és végleges törlés               | done    | `src/server/events/domain.ts`: piszkozat csak címmel; publikálás = cím + kezdődátum + (ha van) elérhető thumbnail (BSS-011 validátorral); jövőbeli esemény publikálható; end >= start alkalmazás- és DB-szinten; archiválás → újrapublikálás; slug módosítás előzménnyel; végleges törlés vezetőségi + címbeírással EGY tranzakcióban (videók leválasztása `recordedAt` megőrzésével → régi slug történetbe foglalva → teljes audit `detachedVideoIds`-szal); lista kezdődátum desc, lapozás; 12 integrációs teszt. **Sémaváltozás:** `events.start_date` nullable lett (spec 6.1: piszkozathoz csak cím kell) — migráció: `drizzle/20260823184625_salty_jocasta`                                                                                                                                                                                                                 |
| BSS-014 | Videó-domain és életciklus                      | done    | `src/server/videos/domain.ts` + `purge.ts` + `highlight-invalidation.ts`: piszkozat csak címmel (hibás média-URL is menthető); publikálás ellenőrzi kötelező mezőket + médiát hálózati validátorral (a tranzakción kívül), többnapos eseménynél `recordedAt`, nem jövőbeli `publishedAt` (múltbeli megadható és megmarad); egynapos esemény csendesen kitölti az üres dátumot, felülírni soha nem írja; leválasztás megtartja a dátumot; intervallumon kívüli dátum csak figyelmeztetés; archiválás/lomtár/visszaállítás (vezetőség, archivált állapotba, kapcsolatokkal); napi 30 napos végleges törlés (`createTrashPurgeJob` a runner extra feladataként, rendszer-audit, slug lefoglalás); kiemelés/Rólunk érvénytelenítés ugyanabban a tranzakcióban állapot- és láthatóságváltozáskor; címkék/stáblista csere verzióellenőrzéssel és auditálással; 14 integrációs teszt     |
| BSS-015 | Kapcsolódó videók szolgáltatása                 | done    | `src/server/videos/related.ts`: manuális lista felülír mindent (csak publikált választható, önhivatkozás/duplikátum tiltva); azonos esemény öt legutóbb publikált videója (`publishedAt` desc); esemény nélkül közös címkék pontozással (több közös címke erősebb, egyezésnél `publishedAt` desc, stabil `id` tiebreak); megjelenítés minden ágon `visibleVideoCondition`-nal szűrve az SQL-ben — korlátozott videó metaadata nem szivárog; verzióellenőrzött mentés + audit; 8 integrációs teszt                                                                                                                                                                                                                                                                                                                                                                                 |
| BSS-016 | Megtekintésszámláló                             | done    | `src/server/views/counter.ts`: anonim session cookie (`bss_view_session`) szándékosan Max-Age nélkül — böngésző bezárásáig él; a DB-ben csak a token SHA-256 kivonata, IP/felhasználói előzmény nélkül; `view_sessions` PK + ON CONFLICT DO NOTHING idempotencia párhuzamos kérésekkel szemben (teszt: Promise.all két hívásból, csak egy számol); csak publikált és a nézőnek látható videó számolható; számláló csak admin lekérdezésben (legalább tagság); 7 integrációs teszt                                                                                                                                                                                                                                                                                                                                                                                                 |
| BSS-017 | Homepage, live, kiemelés és Rólunk-domain       | done    | `src/server/homepage/{live,highlight,about,state}.ts`: számított prioritás (aktív live > kiemelt > normál); live ütemezés oEmbed ellenőrzéssel mentéskor is, átfedés alkalmazás- ÉS DB-szinten tiltva (részleges EXCLUDE korlát: `WHERE status <> 'ended'`, így befejezett live fölé mehet másolat) — migráció: `drizzle/20260823191647_melted_mojo` (btree_gist + korlátcsere); `Indítás most` oEmbed-fallbackkel (hiba rögzül, ütemezett marad), `Lezárás most`; befejezett live nem módosítható/törölhető (csak másolatként); perces `createLiveTransitionJob` runner-feladat system audittal; kiemelés csak publikált+publikus videó; Rólunk legfeljebb hat rendezett publikus videó, érvénytelen SQL-ben kiesik; homepage: 5/6 publikus videó (hero nélkül), hat esemény, `Adás hamarosan` 24 órás sáv; 10 integrációs teszt                                                 |
| BSS-018 | Kereső-domain                                   | done    | `src/server/search/service.ts`: globális keresés videó/esemény/tag/címke csoportokra, súlyozással (spec 11.2); részletes, stabil lapozású videószűrés (`searchVideosDetailed`, címkék ÉS kapcsolattal, `count(*) over()`); láthatóság minden lekérdezésben az SQL-ben (`bss_norm` + pg_trgm, küszöb 0.3); üres/1 karakteres kifejezés nem ér adatbázist; zeneszövegben nincs keresés                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| BSS-019 | Alkalmazásváz, publikus route-ok és hibaoldalak | done    | `src/routes/__root.tsx`: magyar 404 (`notFoundComponent`), hiba- és betöltési állapotok; viewer-állapot sessionből (`src/server/pages/viewer.ts` + `fetchViewerState` server fn), navbar Belépés/Kilépés gombbal és mobilmenüvel; publikus slug-feloldás régi slug redirecttel (`src/server/pages/slug-route.ts`) — piszkozat/archív/lomtár/nem látható egységesen 404; route-struktúra: `/videos/$slug`, `/events/$slug`, `/members/$slug`, `/members/archived`, `/members/contributors`, `/search`; magyar üres/betöltési/hibaállapot-komponensek (`PageStates.tsx`); 7 integrációs teszt                                                                                                                                                                                                                                                                                       |
| BSS-020 | Publikus videólista                             | done    | `/videos`: thumbnail+cím kártyák; három rendezés (legutóbb feltöltött/időrendi/legnézettebb); szűrők URL-ben (szabad szöveg, címkék ÉS-kapcsolattal tag-pickerben, esemény slug szerint, recordedAt dátumtartomány, stábtag, stábszerep); oldalméret 10/25/50/100, alap 50; `parseVideoListSearch` ismeretlen értékeknél alapérték-re esik; `getVideoListPage` a BSS-018 szolgáltatást hívja, láthatóság az SQL-ben; szűrőlisták (`getVideoFilterOptions`); magyar üres/betöltési/hibaállapot; 8 integrációs teszt                                                                                                                                                                                                                                                                                                                                                                |
| BSS-021 | Videórészlet, player és kapcsolódó tartalom     | done    | `/videos/$slug`: spec 5.7 blokksorrend (player → cím → készült/feltöltve → eseménylink → leírás → vendégek → zenék → címkék aktív szűrőre linkelve → stáb pozíciónként profil-linkekkel → kapcsolódó videók a BSS-015 szolgáltatásból, SQL-szintű szűréssel); natív player posterrel és `preload="metadata"`, autoplay és letöltés gomb nélkül (`VideoDetailPlayer.tsx`); első `play` → `POST /api/videos/:id/view` (BSS-016 számláló, anonim session cookie, idempotens); médiahiba magyar üzenettel + újrapróbálás; OG/canonical meta; magyar dátumformátum (`formatDateHu`, Europe/Budapest); 7 integrációs teszt                                                                                                                                                                                                                                                              |
| BSS-022 | Publikus eseménylista és részletoldal           | done    | `/events`: kezdődátum desc, csak publikált; kártyán a néző számára látható videók száma overlay-ben; thumbnail fallback = legfrissebb látható videó thumbnailje (DISTINCT ON), majd placeholder; 50-es alaplapozás; `/events/$slug`: dátumintervallum, leírás, videók `recordedAt` desc nulls last, 50-es lapozás; származtatott stáblista csak látható videókból, titulus nélkül, név szerint rendezve; videó nélküli esemény is publikus; 6 integrációs teszt                                                                                                                                                                                                                                                                                                                                                                                                                   |
| BSS-023 | Publikus taglista és tagprofil                  | done    | `/members`: vezetőség/stúdiósok/jelöltek/jelölt-jelöltek/aktív öregtagok blokkok lapozás nélkül; vezetőségi tag csak a Vezetőség blokkban; `/members/archived` és `/members/contributors` külön aloldalak 50-es lapozással; `/members/$slug` profil (státusz, csatlakozási félév `2023 ősz` formában, bemutatkozás) — email/mobil a sémában sincs; tevékenység év- és szerepnézettel (URL-ben marad), `recordedAt` desc nulls last, 50-es `Továbbiak betöltése`, több szerepnél tudatos ismétlés (`groupActivity` kliensbiztos modulban); csak `sync_status='ok'` profilok publikusak; jogosultsági videószűrés SQL-ben; 6 integrációs teszt                                                                                                                                                                                                                                      |
| BSS-024 | Homepage és YouTube live felület                | done    | `/`: `getHomepagePage` DTO a BSS-017 state szolgáltatásból; live állapotban youtube-nocookie embed autoplay nélkül; kiemelt hero beágyazott lejátszóval (a cím a videóoldalra visz) + hat, live mellett öt, normálban hat friss videó, hero nem ismétlődik; mindhárom állapot alatt hat esemény; `Adás hamarosan` sáv; percenkénti refetch frissítés nélküli váltással (`refetchInterval: 60_000`); 2 fókuszált integrációs teszt (a prioritás-logika a BSS-017 tesztjeiben)                                                                                                                                                                                                                                                                                                                                                                                                      |
| BSS-025 | Globális kereső és találati oldal               | done    | Navbar popover (`SearchBox.tsx`): 2 karaktertől, 250 ms debounce, csoportonként öt találat, nyíl/Enter/Esc billentyűzetkezelés, Tag/Címke megnevezés nem keveredik; `GET /api/search?q=&limit=` végpont viewer-szintű SQL-szűréssel (tiltott videó metaadata nem kerül válaszba); `/search` fülek Összes/Videók/Események/Tagok, Összes fülön típusonként max 10 találat, Videók fül a részletes lista-szűrést használja query megtartásával, címke-találat `/videos?tags=` aktív szűrőre visz; üres keresés útmutatót ad; 4 integrációs teszt                                                                                                                                                                                                                                                                                                                                    |
| BSS-026 | Rólunk oldal és tanfolyam-átirányítás           | done    | `/about`: verziókezelt plain text szöveg kódban (`ABOUT_TEXT_VERSION`), legfeljebb hat vezetőségi videó a BSS-017 `getAboutPageVideos`-ból (archivált/lomtári/nem publikus SQL-ben kiesik); `/courses`: szerveroldali 302 a `https://tanfolyam.bsstudio.hu/` címre (`src/server.ts` entry + `isCoursesPath`), kliens navigáció ugyanoda, helyi űrlap és ál-sikerüzenet törölve; 2 integrációs teszt                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| BSS-027 | Adminváz és sidebar                             | done    | `/admin` layout route szerveroldali guarddal: névtelen → belépés megtartott returnTo-val, jogosulatlan → magyar 403 (`ForbiddenContent`); spec 12.1 szerinti sidebar (Tagok/Live/Címkék/Stábszerepek/Audit csak vezetőségnek látja és éri el — közvetlen URL-en is külön guard minden leadership oldalon); belépés után Videók lista nyílik, dashboard nincs; közös `ResponsiveTable` asztali tábla → mobil kártyanézet váltással; magyar admin feliratok (`src/lib/admin-labels.ts`), admin dátumformátum (`formatAdminDateTimeHu`); 9 integrációs teszt (`tests/integration/admin-access.test.ts`)                                                                                                                                                                                                                                                                              |
| BSS-028 | Videó-adminlista és szerkesztő                  | done    | Admin videólista (spec 12.2 oszlopok) keresés + állapot/láthatóság/esemény/címke szűrőkkel, URL-ben maradó állapottal, 25-es alaplapozással; teljes életciklus API-n: create/update/publish/archive/trash/restore/tags/staff/related (`src/server/api/admin/video-routes.ts` a router diszpécserben); szerkesztő oldal piszkozat/publikálás gombokkal, nincs automatikus mentés, mentetlen változásnál `beforeunload` megerősítés; hibás média-URL piszkozatban menthető, publikálásnál mockolt hálózati ellenőrzéssel tiltva; StaleWriteError → 409 konfliktusbanner „Legfrissebb állapot betöltése" gombbal (sosem utolsó mentés nyer); lejárt session → 401 `loginUrl`, az űrlapadat megőrződik, új belépés után újraküldhető; egynapos esemény csendes dátumkitöltése és dátumwarningok átlátszanak a válaszban; tag nem hozhat létre címkét az űrlapon; 13 integrációs teszt |
| BSS-029 | Esemény-adminlista és szerkesztő                | done    | Eseménylista (spec 12.3): cím, intervallum, állapot, videószám (minden állapot), módosító+idő; keresés/állapot/dátum szűrők; szerkesztő piszkozat–publikálás–archiválás életciklussal, slug-előzménnyel; végleges törlés csak vezetőségnek, címbeírással, leválasztandó videók számának előzetes megjelenítésével; tömeges művelet nincs; API: create/update/publish/archive/delete_permanent (`src/server/api/admin/event-routes.ts`); 6 integrációs teszt                                                                                                                                                                                                                                                                                                                                                                                                                       |
| BSS-030 | Címke- és stábszerep-admin                      | done    | Két vezetőségi katalógusoldal: címke létrehozás/átnevezés/összevonás/törlés használati számmal; ékezeti hasonlóság figyelmeztetés `GET /api/admin/tags/similar`-rel; használt címke törlése csak pontos névbeírással (kapcsolatszám előre látszik); stábszerep létrehozás/átnevezés/összevonás/gombos sorrendezés (`displayOrder` mentéssel); használt szerep törlése blokkolva (409 `role_in_use`); tag és schonherz közvetlen API-hívással sem fér hozzá (integrációs teszt bizonyítja); 7 integrációs teszt                                                                                                                                                                                                                                                                                                                                                                    |
| BSS-031 | Live, kiemelés és Rólunk admin                  | done    | Egy vezetőségi oldal három szekcióval: kiemelt videó kiválasztása/levétele (csak publikált+publikus, korai magyar validációval); live ütemezés YouTube URL normalizálással + oEmbed ellenőrzéssel (hibás azonosító → 400), átfedés kliensen jelzett és szerveren EXCLUDE-korláttal tiltva (409 `overlap`), Indítás most / Lezárás most / törlés / ütemezett élő átütemezés, befejezett live olvasható előzményben, aktiválási hiba rögzítve; Rólunk legfeljebb hat sorrendezett publikus videó, érvénytelen elemek jelölve; tag egyetlen műveletet sem hívhat; 8 integrációs teszt                                                                                                                                                                                                                                                                                                |
| BSS-032 | Rejtett tagdiagnosztika                         | done    | Vezetőségi `/admin/members`: profilok csak olvashatóan (státusz, félév, szinkronállapot, utolsó látvány), tartós szinkronhiba-sáv, utolsó futások listája, kézi szinkron gomb (`POST /api/admin/members/sync` → `triggerManualMemberSync`, auditált, trigger=`manual`), Authentik admin link az OOB issuerből; eltűnt tagok felismerése (lastSeenAt az utolsó sikeres futásnál régebbi); helyi profil-/jogosultságszerkesztés nincs; nyers token nem szivárog a hibaüzenetekbe (tesztelve); 4 integrációs teszt                                                                                                                                                                                                                                                                                                                                                                   |
| BSS-033 | Lomtár és audit admin                           | done    | `/admin/trash` minden tagnak: lomtári videók törlővel, időponttal, hátralévő napokkal és a purge állapotával; visszaállítás gomb csak vezetőségnek jelenik meg, szerveren is tiltva (tag → 403), restore után archivált állapot, kapcsolatok megmaradnak, elavult verzió 409; `/admin/audit` csak vezetőségnek: szereplő/művelet/entitás/dátum szűrők, lapozás, előtte-utána JSON részletnézet; audit-mutáció útvonal nem létezik (API 404), export/törlés nincs; rendszerfeladatok csak tényleges változásnál írnak auditot (a BSS-010/014 domainjeiből); 5 integrációs teszt                                                                                                                                                                                                                                                                                                    |

| BSS-034 | Scraper eredmény betöltése: seed importer | done | Seed JSON v1 formátum típusos validációval (`src/server/seed/schema.ts`): max 50 videó, tiltott mezők (email/bemutatkozás) elutasítva, médiahost-engedélylista, publikálási előfeltételek, hivatkozási integritás (eventKey/tags/staffRoles) — magyar hibalista helymegjelöléssel; idempotens importer (`src/server/seed/importer.ts`): természetes kulcsok (slug, normalizált név), újrafuttatás nem duplikál és nem ír auditot változatlan entitásra, kapcsolatok determinisztikus szinkronja; stáb a tagcache-beli Authentik sub-hoz kötődik (hiányzó usernél magyar hiba a szinkronról); CLI `pnpm db:seed` (`scripts/import-seed.ts`, config `seed.path`, konkrét hiba hiányzó fájlnál); scraper futtatási szabályai dokumentálva (docs/oob-inputs.md — külön agent-feladat); példa: `docs/examples/seed.example.json`; 9 integrációs teszt |
| BSS-035 | SEO, sitemap és biztonsági headerek | done | Minden publikus videó-, esemény- és tagoldal egyedi title + description + canonical + OG kép/típus leírással (videónál `og:type video.other`, tagnál `profile`); régi slug átirányítás után a canonical az új útvonalra mutat; `/robots.txt` az entryből (Disallow: /admin, /api, /search + Sitemap sor); `/sitemap.xml` (`src/server/pages/sitemap.ts`): statikus útvonalak + publikált ÉS publikus videók + publikált események + `sync_status='ok'` profilok — korlátozott videó metaadata sem kerül bele (integrációs teszt); CSP és alap biztonsági fejlécek (`src/server/http/security-headers.ts`) minden válaszra a `src/server.ts` entryben: media-src/img-src `v.bsstudio.hu`, frame-src youtube-nocookie (+i.ytimg.com thumbnail), nosniff, Referrer-Policy, X-Frame-Options DENY, Permissions-Policy; `/search` és admin noindex; 2 unit + 2 integrációs teszt |
| BSS-036 | Reszponzív, billentyűzetes és állapotpolírozás | done | `AdminTextField` maxLength + karakterhátralék-jelzés (cím/slug/katalógusnevek — a korlátos mezők egységesen jelzik a hátralévő karaktereket, az `AdminTextArea` meglévő képességével együtt); felülvizsgálat: minden admin tábla (`videos`, `events`, `members`, `audit`) `ResponsiveTable`-t használ, a lomtár és a homepage-admin kártyaalapú — mobilon használható; publikus listák (videók, események, tagok, keresés) mind rendelkeznek magyar üres/betöltési/hibaállapotokkal (`PageStates`), a Rólunk oldal címe kiegészült; modáloknál natív `window.confirm` és inline címbeírásos megerősítés van (natív fókuszkezeléssel), nincs egyedi modal; SearchBox nyíl/Enter/Esc kezelése és az űrlapok szabványos elemekből épülnek (billentyűzettel kezelhetők); hibaüzenetek megmondják, mi történt és mi a következő lépés (LoginRequiredBanner belépési linkkel, ConflictBanner újratöltéssel, ValidationProblems listával) |
| BSS-037 | Integrációs és végponttól végpontig tesztcsomag | done | A spec 20. fejezet 17 elfogadási forgatókönyve lefedve: meglévő domain/API/page tesztek + hiánypótló E2E lánc (`tests/integration/e2e-acceptance-chain.test.ts`): tag létrehoz → frissít → publikál a valódi `/api/admin/*` végpontokon session cookie-val, vezetőség kiemel (tag 403), homepage prioritás normal→highlight→(lomtár)normal, hero nem ismétlődő; schönherzes láthatóság anonim homepage-re nem szivárog; külső hívások determinisztikus mockok (`tests/helpers/http-mock.ts`, `reachableMediaFetch`), idő FakeClock; a 17.-hez (tiszta klón) a README dokumentált folyama a kézi ellenőrzés; hibás esetnél a tesztnevek megnevezik a sérült üzleti szabályt |
| BSS-038 | Dokumentáció és lokális átadási próba | done | README átírva magyar átadási dokumentummá: telepítés/indítás a spec 17.2 sorrendjében (függőségek → bootstrap → compose → migráció → OOB ellenőrzés → seed → alkalmazás → minőségi kapu), tesztfelhasználók, szereplőnkénti demo forgatókönyvek (névtelen/schönherzes/tag/vezetőség), ismert V0-korlátok, production előtti backlog, tiszta klónból végzett átadási próba ellenőrzési pontokkal — adatbázis-kézi módosítás nélkül; seed CLI hibaútvonalai élőben ellenőrizve (hiányzó DATABASE_URL és seed fájl konkrét magyar üzenettel) |

## Fáziskapu eredménye (0. fázis, megtörtént)

- [x] rögzített, kompatibilis függőségek (lockfile + nincs `latest`/nightly)
- [x] zöld format check, lint, typecheck, test, build
- [x] tiszta adatbázison lefutó migráció
- [x] dokumentált config séma (`docs/oob-inputs.md`)
- [x] idempotens lokális Authentik bootstrap (élőben ellenőrizve)
- [x] mindhárom nézői szint és mindkét adminszerep tesztadata létrehozható

## OOB bemenetek állapota

| Fájl                     | Hely                                                  | Állapot                                                                                                                                  |
| ------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Authentik mapping config | `oob/config.json` (vagy `BSS_OOB_CONFIG`)             | lokális változat generált és valid; éles értékek továbbra is OOB                                                                         |
| Helyi titkok             | `.env`, `oob/local-secrets.json`, `oob/authentik.env` | generálva, gitignore-olt, nem kerülnek gitbe                                                                                             |
| Seed JSON                | `oob/seed.json`                                       | helye a configban rögzített; formátuma dokumentált és betölthető (`pnpm db:seed`); tartalmát a scraper állítja elő (külön agent-feladat) |

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

## Fáziskapu eredménye (5. fázis)

- [x] `pnpm check` zöld
- [x] `pnpm lint` zöld
- [x] `pnpm typecheck` zöld (0 hiba)
- [x] `TEST_DATABASE_URL=... pnpm test` zöld — 44 fájl / 344 teszt (4. fázis vége: 40/328)
- [x] `pnpm build` zöld (nitro .output)
- [x] migráció nem változott (7 migráció maradt; az 5. fázis csak seed, meta, polírozás, teszt és doksi)
- [x] git diff átnézve: titkok csak gitignore-olt `.env` és `oob/` fájlokban; idegen módosítás nincs

## Elfogadott technikai döntések az 5. fázisban

- A scraper maga NEM része a repónak (külön agent-feladat); a repóba a
  gitignore-olt JSON eredményét betöltő, idempotens seed importer került.
  A scraper futtatási szabályait (max 5 párhuzamos kérés, exponenciális
  visszalépés 429/5xx-re, oldalanként max 3 próbálkozás, checkpoint) a
  docs/oob-inputs.md rögzíti.
- A seed JSON formátumverziója `1`; természetes kulcsok a slug (videó,
  esemény) és a normalizált név (címke, stábszerep). Az importer tranzakcióban
  dolgozik: változatlan entitásra nem ír (audit sem készül), így az
  újrafuttatás valódi idempotencia, nem csak duplikáció-tilalom.
- A seedelt stáblista a lokális Authentik bootstrap tesztprofilok
  felhasználónevére hivatkozik; az importer a tagcache-ből oldja fel a sub-ot,
  és hiányzó profilnál magyar hibaüzenettel kéri a szinkron lefuttatását —
  ezzel a bootstrap sub-jaihoz kötődik, nem keménykódolt azonosítókhoz.
- CSP: a TanStack Start streamelő szkriptjei miatt `script-src 'self' 'unsafe-inline'`
  kell (nonce a streaming válaszban nem vezethető be megbízhatóan);
  media-src/img-src a `v.bsstudio.hu`, frame-src a youtube-nocookie (+ i.ytimg.com
  a live-előnézeti thumbnailök); minden válaszra a `src/server.ts` entryben
  érvényesül, az SSR-válasz fejléceit kiegészítve.
- A sitemap közvetlenül az entryből szolgálódik (`/sitemap.xml`), lekérdezése
  tesztelhető szervermodulban él (`src/server/pages/sitemap.ts`); csak
  publikált + publikus videó, publikált esemény és sikeresen szinkronizált
  profil kerül bele; `/robots.txt` ugyanonnan, statikus tartalommal.
- SEO-meta: a videórészlet BSS-021 mintáját követte az esemény- és tagoldal
  (canonical az SSR request originjéből a loaderben), leírást az első 300
  karakterből vagy magyar fallback szövegből kapnak.
- Az elfogadási forgatókönyvek lefedettségét a meglévő 40 tesztfájl adja;
  új teszt csak a hiányzó E2E lánc és a fázis saját funkciói (seed, sitemap,
  headerek) körül készült — meglévő lefedettséget nem duplikáltunk.

## Fáziskapu eredménye (4. fázis)

- [x] `pnpm check` zöld
- [x] `pnpm lint` zöld
- [x] `pnpm typecheck` zöld (0 hiba)
- [x] `TEST_DATABASE_URL=... pnpm test` zöld — 40 fájl / 328 teszt (3. fázis vége: 33/276)
- [x] `pnpm build` zöld (nitro .output)
- [x] migráció nem változott (7 migráció maradt; a 4. fázis csak route/UI/API wiring)
- [x] git diff átnézve: titkok csak gitignore-olt `.env` és `oob/` fájlokban; idegen módosítás nincs

## Elfogadott technikai döntések a 4. fázisban

- Admin olvasás az oldalmodol-mintával: tesztelhető szervermodulok (`src/server/admin/*.ts`),
  a route-ok vékony `createServerFn` GET wrapperekkel hívják őket.
- Admin ÍRÁS `/api/admin/*` JSON végpontokként csatlakozik a `src/server/api/router.ts`
  diszpécserhez (a telepített TanStack Start server-route fájlokat továbbra sem támogat).
  Minden végpont fogad opcionális `deps.db/deps.config/deps.fetchImpl/deps.clock` paramétert,
  így az integrációs tesztek valódi HTTP-kérés objektumokkal, session cookie-val,
  determinisztikus mockokkal futnak — ezzel bizonyítható, hogy a tag közvetlen API-hívással
  sem ér el vezetőségi erőforrást.
- Egységes domainhiba → JSON hiba fordítás (`src/server/api/admin/http.ts`):
  AuthRequiredError → 401+loginUrl, ForbiddenError → 403, StaleWriteError → 409 conflict,
  TextValidationError → 400 validation (problems lista), EventConfirmationError/
  ConfirmationMismatchError → 400 confirmation, CatalogNameConflictError → 409 name_conflict,
  LiveOverlapError → 409 overlap, StaffRoleInUseError → 409 role_in_use.
- Kliensoldali hívási segéd (`src/lib/admin-api.ts`) diszkriminált eredménnyel dolgozik:
  401-nél megőrzi az űrlapállapotot és loginUrl-t ad (új belépés után újraküldés),
  409-nél konfliktusbanner + „legfrissebb állapot betöltése" gomb.
- Guard-kötés oldalakra: a layout route loaderében `adminAreaAccess` /
  `leadershipAreaAccess`; login → `redirect(loginUrl)`, forbidden → `ForbiddenContent`.
  A vezetőségi aloldalak (homepage, katalógus, tagok, audit) a saját `beforeLoad`-jukban
  ÚJRA guardolnak, így közvetlen URL-en is tiltanak.
- A live-létrehozás és a kiemelés/Rólunk-választás végpontjai korai magyar validációt végeznek
  (YouTube oEmbed előszűrés, csak publikált+publikus videó), hogy a domain réteg általános
  Error-a helyett géppel olvasható 400-as hiba menjen; a domain tranzakcióin belüli
  ellenőrzések érintetlenek maradtak.
- A lomtárlista tartalmazza az aktuális verziót, így a visszaállítás gomb a meglévő
  `/api/admin/videos/:id/restore` végpontot hívja optimista verzióellenőrzéssel.
- Tesztinfra: a `createMigratedTestDatabase` poolján `error`-kezelő van (a
  `DROP DATABASE ... WITH (FORCE)` lebontási race által okozott alkalmi
  unhandled exception eltűnt); a teljes széria kétszer egymás után zöld.

## Fáziskapu eredménye (3. fázis)

- [x] `pnpm check` zöld
- [x] `pnpm lint` zöld
- [x] `pnpm typecheck` zöld (0 hiba)
- [x] `TEST_DATABASE_URL=... pnpm test` zöld — 33 fájl / 276 teszt (2. fázis vége: 25/234)
- [x] `pnpm build` zöld (nitro .output)
- [x] migráció nem változott (7 migráció maradt; a 3. fázis csak route/UI/API wiring)
- [x] git diff átnézve: titkok csak gitignore-olt `.env` és `oob/` fájlokban; idegen módosítás nincs

## Elfogadott technikai döntések a 3. fázisban

- Az oldallogika tesztelhető szervermodulokban él (`src/server/pages/{video-list,video-detail,event-list,members,homepage,slug-route,viewer}.ts`),
  a route-ok `createServerFn` wrapperrel hívják őket; a viewer-t a `getRequest()`
  alapján a session cookie-ból oldjuk fel (Authentik-hívás nélkül).
- A kereső és a megtekintésszámláló `/api/*` végpontként csatlakozik a
  `src/server/api/router.ts` diszpécserhez (`GET /api/search`, `POST /api/videos/:id/view`);
  mindkettő opcionális `deps.db`/`deps.config` paramétert kap az integrációs tesztekhez.
- A `/courses` átirányítás kétféle úton is működik: a `src/server.ts` entry minden
  `/courses` kérést 302-vel szolgál ki (JavaScript nélkül is), a kliensoldali
  navigációt pedig a route `beforeLoad`-ja kezeli.
- A Rólunk-szöveg verziószámmal jelölt plain text konstans a kódban (spec 10.1:
  módosítása kódváltozást igényel).
- A tevékenység-csoportosítás (`groupActivity`) és a magyar dátumformázók
  kliensbiztos modulokban élnek (`src/lib/activity.ts`, `src/lib/format-date.ts`),
  hogy a route-komponensek ne húzzák be a szervermodulokat.
- A homepage percenkénti `refetchInterval`-lel pollolja a state-et; külön WebSocket
  vagy push nem része a V0-nak.

## Ismert hibák és technikai tartozás (aktuális)

- `@tanstack/router-cli` (tsr) Node 24-es circular-dependency figyelmeztetése ártalmatlan.
- docker-compose: HTTPS portfeltárás elhagyva (HTTP :9000).
- A navbar globális keresője popoverben max. öt találtat mutat csoportonként;
  thumbnail-előnézet a találatokban nincs (nem V0 követelmény).
- Az integrációs tesztek futtatásához továbbra is `TEST_DATABASE_URL` kell (nélküle skipelnek).

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
| `pnpm db:seed`                         | idempotens seed import               |
| `pnpm check:oob`                       | OOB config validáció                 |
| `pnpm infra:bootstrap`                 | lokális titkok + Authentik blueprint |
