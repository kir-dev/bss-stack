# BSS V0 implementációs állapot

Utolsó frissítés: 2026-08-23 (0. fázis lezárása után)

## Aktuális fázis

**0. fázis – Stabil alap és tiszta séma: KÉSZ, felhasználói jóváhagyásra vár.**

A következő fázis az **1. fázis: auth és közös infrastruktúra** (BSS-006 – BSS-011). Munka csak a felhasználó külön jóváhagyása után kezdhető.

## Kártyák állapota

| Kártya  | Név                                           | Állapot | Ellenőrzések                                                                                                                                                                                                                                                                                  |
| ------- | --------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BSS-001 | Toolchain stabilizálása                       | done    | `pnpm check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` zöld; nightly/`latest` függőségek eltűntek; dedikált `vitest.config.ts` javítja a Nitro/Vite tesztindítási hibát                                                                                                       |
| BSS-002 | Tesztalap és vezérelhető idő                  | done    | unit + integration vitest projektek; `FakeClock` 30 napos törlés szimulációhoz; fetch-mock helper; izolált tesztadatbázis-kezelő (`tests/helpers/test-db.ts`); integrációs smoke test valódi PostgreSQL-en fut (2× futtatva, ismételhető)                                                     |
| BSS-003 | OOB konfigurációs szerződés                   | done    | típusos séma + magyar nyelvű validáció (`src/server/config/oob-schema.ts`); 15 unit teszt; `pnpm check:oob` CLI; dokumentáció: `docs/oob-inputs.md`, példa: `docs/examples/oob-config.example.json`                                                                                           |
| BSS-004 | Új adatbázisséma és migrációs alap            | done    | 14 tábla migrációja tiszta PostgreSQL-en lefut (CLI és tesztfuttató egyaránt); régi prototípus-táblákon is lefut; DB-szintű invariánstesztek: published↔publishedAt, önhivatkozás-tilalom, live átfedés-tilalom (EXCLUDE), eseménydátum-check, Rólunk pozíció-limit; 3 integrációs sémateszt  |
| BSS-005 | Lokális infrastruktúra és Authentik bootstrap | done    | compose rendezve (healthcheck, blueprint mount); `pnpm infra:bootstrap` idempotens titok- és YAML-generátor; élőben verifikálva: Authentik 2026.5.4 elindul, blueprint alkalmazódik, discovery végpont válaszol; teljes restart után is 3 csoport / 8 felhasználó / 1 provider (nem duplikál) |

## Fáziskapu eredménye (0. fázis)

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

Az éles Authentik mapping és seed hiánya miatt semmilyen szerződéses vagy lokális értéket nem kellett kitalálni: a lokális bootstrap saját, véletlenszerű titkokkal dolgozik.

## Elfogadott felhasználói döntések ebben a fázisban

Nincs új termékdöntés; minden a specifikációból és a meglévő prototípusból következik. Technikai döntések, amiket dokumentáltan hoztam:

- OIDC callback útvonal szerződése: `/api/auth/callback` (1. fázis implementálja).
- A migrációs alap a régi lokális prototípus-objektumokat célzottan eldobja (a specifikáció szerint a séma eldobható). Csak fejlesztői adatbázisra fusson.
- `routeTree.gen.ts` committed marad; `tsr generate` a typecheck része.
- drizzle-orm/drizzle-kit pontosan rögzítve `1.0.0-rc.4`-en (a v1 relációs API-hoz); programmatikus migrátor helyett CLI + tesztfuttató.

## Ismert hibák és technikai tartozás

- A publikus prototípus oldalai még statikus placeholder tartalmat mutatnak (ez várható; a tartalmi domainek a 2–3. fázisban épülnek).
- `@tanstack/router-cli` (tsr) futáskor ártalmatlan circular-dependency figyelmeztetést ad Node 24 alatt.
- Az Authentik 2026.5.4-ben nincsenek gyári default flow-k/mappingek; a lokális blueprint ezért saját authentication/authorization flow-t és scope mappingeket definiál (dokumentálva a generált YAML-ben).
- docker-compose: a 9443-as külső port ütközött a gépen futó másik szolgáltatással, ezért a lokális stack HTTPS portfeltárása elhagyva (HTTP :9000 használatos).

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
