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
- Formáját a seed importer (BSS-034 kártya) definiálja és dokumentálja.
- A scraper kimenete; személyes adatot és médiát nem tartalmaz, álneveket használ.

## Ellenőrzés

A config fájl ellenőrzése a repó gyökeréből:

```bash
pnpm check:oob
```

A parancs kiírja az összes hiányzó vagy érvénytelen elemet magyarul, felsorolásosan. Sikeres ellenőrzésnél összefoglalja a betöltött értékeket (a titok nélkül).

## Viselkedés hiányzó fájl esetén

- Az alkalmazás indítása megszakad konkrét hibaüzenettel, amely megnevezi a hiányzó fájl elérési útját és az első hibákat.
- Nincs „félig működő” névtelen mód és nincs kitalált mapping.
