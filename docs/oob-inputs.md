# OOB bemenetek

Az alkalmazás három bemenete out-of-band, azaz nem a git repóban érkezik. Hiányzó vagy érvénytelen fájl esetén az alkalmazás konkrét hibaüzenettel áll meg, kitalált alapértéket soha nem használ.

## 1. BSS OOB config

- Helye alapból: `oob/config.json` (gitignore-olt).
- Felülírható a `BSS_OOB_CONFIG` környezeti változóval.
- Formája: JSON, a szerkezetét a [`docs/examples/oob-config.example.json`](./examples/oob-config.example.json) mutatja.
- Tartalma:
  - Authentik OIDC kapcsolat: issuer URL, client id, client secret, scope-ok;
  - Authentik tagcache-szinkron szolgáltatási fiókja: `authentik.sync.username` és
    `authentik.sync.token` (az `svc-bss-sync` felhasználó app-password tokene, amelyet
    a `pnpm infra:bootstrap` generál; a szinkron ezzel client_credentials granttal
    fér hozzá az Authentik API-hoz a `goauthentik.io/api` scope-pal);
  - claim-leképezés: `sub`, felhasználónév, teljes név, becenév, profilkép URL;
  - csoportleképezés: schönherzes, tag és vezetőség csoport neve;
  - attribútumleképezés: tagsági státusz nyers érték → belső kulcs, csatlakozási félév értelmezési szabályai, bemutatkozás;
  - médiahost-engedélylista (specifikáció szerint `v.bsstudio.hu`);
  - YouTube oEmbed végpont;
  - seed JSON helye.

## 2. Helyi titkok

A titkok (pl. Authentik client secret, session titok) kizárólag OOB fájlokban vagy környezeti változókban élnek:

- `.env` (gitignore-olt) — pl. `DATABASE_URL`;
- a config fájl `clientSecret` mezője.

Titok soha nem kerül kliensbundle-be: a config csak szerveroldalon töltődik be.

Lokális fejlesztésben a titkokat a bootstrap script generálja (`pnpm infra:bootstrap`), a generált fájlok az `oob/` könyvtárba íródnak.

## 3. Előre kinyert seed JSON

- Helye: a config `seed.path` mezője által megadott fájl (alapból `oob/seed.json`, gitignore-olt).
- A scraper kimenete; személyes adatot és médiát nem tartalmaz, álneveket használ.
- Formátumverzió: `1`. Példa: [`docs/examples/seed.example.json`](./examples/seed.example.json).

### Scraper futtatási szabályai (spec 17.1)

A scraper külön agent-feladat, nem része a repónak. Az eredménye a fenti JSON.
Futtatási követelményei:

- legfeljebb öt párhuzamos kérés;
- `429` és `5xx` esetén exponenciális visszalépés;
- oldalanként legfeljebb három próbálkozás;
- megszakítás után folytatható checkpoint (nem indul elölről);
- médiafájl nem töltődik le; email és profilbemutatkozás nem kerül a JSON-ba;
- a személyek konzisztens álnevesítése a lokális Authentik bootstrap
  tesztprofiljainak felhasználónevére mutat (`oob/local-secrets.json`,
  `scripts/lib/local-bootstrap.ts`: `tag-dev`, `vezetoseg-dev`, stb.).

### Seed JSON formátuma

```jsonc
{
  "version": 1,
  "events": [
    {
      "key": "gala-2025", // belső hivatkozási kulcs
      "title": "Tavaszi Gála 2025", // kötelező
      "slug": null, // opcionális; alapból a keyből slugifyolva
      "description": null,
      "thumbnailUrl": null, // csak engedélyezett médiahost
      "startDate": "2025-05-10",
      "endDate": null,
      "status": "published", // published|draft|archived, alap: published
    },
  ],
  "tags": ["Gála", "Adás"], // a videók csak ezeket hivatkozhatják
  "staffRoles": ["Operatőr", "Vágó"],
  "videos": [
    {
      "key": "vid-001",
      "title": "Gálanyitó 2025", // kötelező
      "slug": null, // alapból a címből slugifyolva
      "description": null,
      "guests": null,
      "songs": null, // soronként „Előadó - Szám címe”
      "encodingGroup": "16a9_HD", // 4a3_SD|16a9_SD|16a9_HD
      "hasHq": true,
      "hasLq": true,
      "baseFilename": "galanyito-2025", // könyvtár és kiterjesztés nélkül
      "visibility": "public", // public|schonherz|bss, alap: public
      "status": "published",
      "recordedAt": "2025-05-10",
      "publishedAt": "2025-06-01T12:00:00Z",
      "eventKey": "gala-2025",
      "tags": ["Gála"],
      "staff": [{ "username": "tag-dev", "role": "Operatőr" }],
    },
  ],
}
```

Szabályok:

- legfeljebb 50 videó (spec 17.1);
- `email`, `introduction`/`bemutatkozas` mező bármhol tiltott;
- az esemény-thumbnail URL-je csak `https://` és az OOB config
  `media.allowedHosts` hostjairól jöhet;
- publikált videónál kötelező az `encodingGroup`, a `baseFilename`, valamint
  legalább az egyik minőségjelző (`hasHq` vagy `hasLq`);
- publikált eseménynél kötelező `startDate`; `endDate >= startDate`;
- a `staff[].username` a tagcache-beli felhasználónévre mutat — a betöltés előtt
  futnia kell a tagszinkronnak (alkalmazásindítás vagy kézi szinkron).

### Betöltés

```bash
pnpm db:migrate   # tiszta séma
pnpm db:seed      # a OOB config seed.path fájljának idempotens importja
```

Az importer természetes kulcsok (slug, normalizált név) alapján dolgozik:
újrafuttatás nem duplikál, változatlan entitásra nem ír (audit sem készül),
a módosult mezőket és kapcsolatokat szinkronizálja. Megszakadt betöltés után
biztonságosan újrafuttatható.

## Ellenőrzés

A config fájl ellenőrzése a repó gyökeréből:

```bash
pnpm check:oob
```

A parancs kiírja az összes hiányzó vagy érvénytelen elemet magyarul, felsorolásosan. Sikeres ellenőrzésnél összefoglalja a betöltött értékeket (a titok nélkül).

## Viselkedés hiányzó fájl esetén

- Az alkalmazás indítása megszakad konkrét hibaüzenettel, amely megnevezi a hiányzó fájl elérési útját és az első hibákat.
- Nincs „félig működő” névtelen mód és nincs kitalált mapping.
