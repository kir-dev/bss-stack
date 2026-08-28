# BSS weboldal V0

A Budavári Schönherz Studió videóarchívum és szerkesztői rendszerének lokálisan
futtatható V0 megvalósítása (TanStack Start + PostgreSQL + Authentik).

## Dokumentáció

- [V0 követelményspecifikáció](./docs/product-specification.md)
- [Kártyákra bontott implementációs terv](./docs/implementation-plan.md)
- [Implementációs állapot](./docs/implementation-progress.md)
- [OOB bemenetek](./docs/oob-inputs.md)
- [Példa OOB config](./docs/examples/oob-config.example.json)
- [Példa seed JSON](./docs/examples/seed.example.json)

## Előfeltételek

- Node 24+ és pnpm (`corepack enable`)
- Docker (PostgreSQL + Authentik)

## Telepítés és indítás (tiszta klónból)

A sorrend a specifikáció 17.2 fejezetét követi. Adatbázis-kézi módosítás
nincs szükség egyik lépéshez sem.

```bash
# 1. Függőségek telepítése
pnpm install

# 2. Helyi titkok és Authentik blueprint generálása (idempotens)
pnpm infra:bootstrap

# 3. PostgreSQL és Authentik indítása
docker compose -f docker-compose.dev.yml up -d
export DATABASE_URL=postgres://bss:bss@127.0.0.1:5582/bss

# 4. Migrációk futtatása tiszta adatbázison
pnpm db:migrate

# 5. OOB fájlok ellenőrzése (konkrét magyar hibaüzenet hiány esetén)
pnpm check:oob

# 6. Seed betöltése (opcionális; az oob/seed.json-t a scraper állítja elő,
#    lásd docs/oob-inputs.md). Idempotens: újrafuttatás nem duplikál.
pnpm db:seed

# 7. Tagfrissítő webhook kliens (az első tokenhez, bejelentkezés nélkül)
pnpm webhook:client create "lokális push"

# 8. Alkalmazás indítása
pnpm dev               # http://localhost:3000

# 9. Minőségi kapu
pnpm typecheck && pnpm lint && pnpm check
TEST_DATABASE_URL=postgres://bss:bss@127.0.0.1:5582/bss pnpm test
pnpm build
```

Megjegyzések:

- A `pnpm infra:bootstrap` meglévő titkokat nem ír felül; újraindítás nem
  duplikál.
- A tagadatokat az alkalmazás birtokolja: a `POST /api/webhooks/members`
  végpontra beküldött frissítések írják őket (lásd
  [`docs/member-webhook.md`](docs/member-webhook.md)). Authentikből automatikus
  szinkron nincs — az Authentik már csak a bejelentkezést és a csoportokat adja.
- A webhook OpenAPI 3.1 leírása generált:
  [`docs/api/members-webhook.openapi.yaml`](docs/api/members-webhook.openapi.yaml).
  Kézzel ne szerkeszd — `pnpm openapi:generate` írja újra a szerver
  mezőspecifikációjából; eltérés esetén a unit teszt elbukik.
- A seed stáblistája a bootstrap tesztprofiljaihoz kötődik (`tag-dev`,
  `vezetoseg-dev`, …); ha a tagtábla még üres, az importer magyar hibaüzenettel
  kéri a tagok beküldését.
- Az Authentik felülete: http://127.0.0.1:9000

## Tesztfelhasználók

Jelszavak: `oob/local-secrets.json` (gitignore-olt).

| Felhasználó           | Szerep                                                                |
| --------------------- | --------------------------------------------------------------------- |
| (nincs bejelentkezés) | névtelen látogató — csak publikus videók                              |
| schonherz-dev         | bejelentkezett schönherzes — publikus + schönherz videók, admin nincs |
| tag-dev               | BSS-tag — minden láthatóság, adminjogok                               |
| vezetoseg-dev         | vezetőség — kibővített adminjogok                                     |
| további `-dev` userek | szintetikus tagprofilok minden tagsági státuszhoz                     |

## Demo forgatókönyvek szereplőnként

### Névtelen látogató

1. Nyisd meg http://localhost:3000 — homepage normál vagy kiemelt/live hero-val.
2. `/videos`: csak publikus videók jelennek meg; korlátozott tartalom metaadata
   sem szivárog (keresésben, eseményoldalakon és kapcsolódó videóknál sem).
3. Nyiss meg egy videót: player, kapcsolódó videók, címkére kattintva aktív
   szűrős videólista.
4. A navbar Belépés gombja belépésre visz, megtartva a kért oldalt.

### Schönherzes (schonherz-dev)

1. Jelentkezz be; a `/videos` listában már a schönherz láthatóságú videók is
   megjelennek.
2. `/admin` közvetlenül: magyar tiltóoldal (403), sidebar sem látszik.

### BSS-tag (tag-dev)

1. Jelentkezz be, menj `/admin`-ra: Videók lista nyílik.
2. Hozz létre piszkozatot (Új videó), adj meg érvénytelen média-URL-t —
   piszkozatként menthető; a Publikálás magyar hibával elutasítja.
3. Érvényes URL-lel (`https://v.bsstudio.hu/…`) publikálás — a média
   hálózati ellenőrzése mockolható fejlesztésben, élesben HEAD-kéréssel fut.
4. Egynapos eseményhez rendelve a videó automatikusan dátumot kap; többnaposnál
   a hiányzó dátum publikálást blokkol, a tartományon kívüli figyelmeztet.
5. Címkék és stáblista kezelése; archiválás és lomtárba helyezés.

### Vezetőség (vezetoseg-dev)

1. Lomtár (`/admin/trash`): visszaállítás archivált állapotba, kapcsolatokkal.
2. Live és kiemelés (`/admin/homepage`): YouTube URL ütemezése (átfedés
   kliensen és szerveren is tiltott), Indítás most / Lezárás most, kiemelt
   videó választása, Rólunk-videók rendezése.
3. Katalógusok: címke létrehozás/összevonás/törlés (használt címke csak név
   beírásával), stábszerepek sorrendezése.
4. Tagok (`/admin/members`): webhook végpont URL-je, webhook kliensek
   létrehozása/titokcseréje/visszavonása, beérkezési napló, csak olvasható
   profillista.
5. Auditnapló (`/admin/audit`): minden előző lépés előtte-utána értékkel.
6. Homepage: a kiemelt videó hero-ként jelenik meg; live aktiválásakor a
   prioritás frissítés nélkül vált (percenkénti ellenőrzés).
7. 30 napos törlés szimulációja: lomtárazz egy videót, majd az idő
   előretolásával (tesztóra) a napi feladat véglegesen törli — külső médiafájl
   érintetlen marad.

## Ismert V0-korlátok

- Éles telepítés nem része a V0-nak; a célkörnyezet a dokumentált lokális futtatás.
- A külső MP4 URL-ek publikusak; a média tényleges hozzáférés-védelme külön feladat.
- Email és mobil mezők nem léteznek; a tagprofilok csak olvashatók (Authentik forrás).
- Audit export/visszaállítás és tömeges adminműveletek szándékosan nincsenek.
- Rating, komment, share/download gomb, tanfolyamkezelés nem része a V0-nak.
- A régi Drupal linkek (/video, /event, /user) átirányítása production feladat.
- A kereső popoverje csoportonként öt találtat mutat thumbnail nélkül.

## Production előtti backlog (nem blokkolja a V0-t)

Teljes régioldal-migráció; Drupal linkátirányítások; production telepítési
pipeline; UptimeRobot; backup/visszaállítás; védett média; IP-alapú egyedi
nézettség; tanfolyam- és felkéréskezelő integráció; tömeges adminműveletek;
formális akadálymentességi audit.

## Fejlesztői parancsok

| Parancs                                | Funkció                              |
| -------------------------------------- | ------------------------------------ |
| `pnpm dev`                             | fejlesztői szerver                   |
| `pnpm check`                           | formátumellenőrzés (Prettier)        |
| `pnpm lint`                            | ESLint                               |
| `pnpm typecheck`                       | route-generálás + `tsc --noEmit`     |
| `TEST_DATABASE_URL=… pnpm test`        | unit + integrációs tesztek           |
| `pnpm build`                           | produkciós build (Nitro)             |
| `pnpm db:generate` / `pnpm db:migrate` | migráció generálása / futtatása      |
| `pnpm db:seed`                         | idempotens seed import               |
| `pnpm check:oob`                       | OOB config validáció                 |
| `pnpm infra:bootstrap`                 | lokális titkok + Authentik blueprint |

## Tiszta klónból végzett átadási próba

Az elfogadási bemutató (spec 20/17) a fenti „Telepítés és indítás” szakasz
lépéseit követi adatbázis-kézi módosítás nélkül, majd a négy szereplő
demoforgatókönyvét futtatja végig. Ellenőrzési pontok:

- `pnpm check:oob` hiányzó OOB elemnél konkrét magyar hibát ad, az alkalmazás
  nem indul félkonfiguráltan;
- `pnpm db:migrate` tiszta adatbázison hibátlanul lefut;
- `pnpm db:seed` újrafuttatva nem duplikál;
- a tesztek determinisztikus mockokkal futnak (külső média, YouTube,
  Authentik hívások élő elérése nélkül);
- a kizárt V0 elemek (rating, komment, médiafeltöltés, tömeges műveletek stb.)
  sehol nem jelennek meg.
