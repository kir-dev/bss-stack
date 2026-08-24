# BSS weboldal V0 kártyákra bontott implementációs terve

## 1. A terv használata

Ez a terv a [követelményspecifikációra](./product-specification.md) épül. A kártyák függőségi sorrendben követik egymást. Egy hullámon belül a független kártyák párhuzamosan végezhetők.

Relatív méretek:

- `S`: kis, egy jól körülhatárolt változtatás;
- `M`: közepes, több réteget vagy több tesztesetet érint;
- `L`: nagy, több PR-re bontható, de egy közös elfogadási eredménye van.

Minden kártya V0-prioritású. A sorrendet a függőségek határozzák meg, nem a sorszám önmagában.

## 2. Közös elkészültségi feltétel

Egy kártya akkor kész, ha:

- a kód és az adatbázisváltozás verziókezelt;
- a jogosultságot a szerver ellenőrzi;
- a sikeres, üres, betöltési és hibás állapot kezelve van;
- a releváns unit vagy integrációs teszt elkészült;
- a typecheck, lint és érintett tesztek zöldek;
- az új config és lokális lépés dokumentált;
- a mobil- és asztali felület használható;
- nincs néma adatvesztés vagy utolsó mentés nyer viselkedés.

## 3. Végrehajtási hullámok

| Hullám | Cél                                       | Kártyák           |
| ------ | ----------------------------------------- | ----------------- |
| 0      | Stabil alap és tiszta séma                | BSS-001 - BSS-005 |
| 1      | Auth, jogosultság és közös infrastruktúra | BSS-006 - BSS-011 |
| 2      | Tartalmi domainek                         | BSS-012 - BSS-018 |
| 3      | Publikus felület                          | BSS-019 - BSS-026 |
| 4      | Adminfelület                              | BSS-027 - BSS-033 |
| 5      | Seed, SEO, minőség és átadás              | BSS-034 - BSS-038 |

A fő kritikus út:

`BSS-001 -> BSS-004 -> BSS-005 -> BSS-006 -> BSS-007 -> BSS-008 -> BSS-010 -> BSS-014 -> BSS-028 -> BSS-037 -> BSS-038`

### Lefedettségi térkép

| Specifikációs terület                 | Elsődleges kártyák                           |
| ------------------------------------- | -------------------------------------------- |
| Lokális alap, config és séma          | BSS-001 - BSS-005                            |
| Authentik, session és jogosultság     | BSS-006 - BSS-008                            |
| Slug, audit, háttérfeladat és média   | BSS-009 - BSS-011                            |
| Címkék és stábszerepek                | BSS-012, BSS-030                             |
| Események                             | BSS-013, BSS-022, BSS-029                    |
| Videók és megtekintés                 | BSS-014 - BSS-016, BSS-020, BSS-021, BSS-028 |
| Homepage, live és Rólunk              | BSS-017, BSS-024, BSS-026, BSS-031           |
| Keresés                               | BSS-018, BSS-020, BSS-025                    |
| Tagok                                 | BSS-008, BSS-023, BSS-032                    |
| Lomtár és audit UI                    | BSS-033                                      |
| Seed, SEO, felületi minőség és átadás | BSS-034 - BSS-038                            |

## 4. Kártyák

### BSS-001 - Toolchain stabilizálása

- Méret: `M`
- Függőség: nincs

Cél: reprodukálható, zöld fejlesztői alap létrehozása a jelenlegi nightly és `latest` függőségek helyett.

Tartalom:

- kompatibilis verziók rögzítése;
- a Nitro és Vite tesztindítási hiba javítása;
- a jelenlegi TypeScript- és lint-hibák javítása;
- a generált route-kezelés tisztázása;
- egységes `typecheck`, `lint`, `test`, `build` parancsok.

Elfogadási feltételek:

- tiszta telepítés után ugyanazok a verziók kerülnek fel;
- `pnpm lint`, typecheck, `pnpm test` és build sikeres;
- nincs nightly vagy indokolatlan `latest` production-függőség;
- a változtatás nem módosít termékfunkciót.

### BSS-002 - Tesztalap és vezérelhető idő

- Méret: `M`
- Függőség: BSS-001

Cél: olyan tesztkörnyezet kialakítása, amelyben a jogosultság, külső szolgáltatások és időzített törlés megbízhatóan vizsgálható.

Tartalom:

- unit és integrációs teszt setup;
- külön tesztadatbázis-kezelés;
- vezérelhető óra a 30 napos törléshez és live-váltáshoz;
- HTTP mock a `v.bsstudio.hu`, YouTube oEmbed és Authentik hívásokhoz;
- közös fixture factoryk.

Elfogadási feltételek:

- teszt nem használ élő külső szolgáltatást;
- a tesztóra tetszőleges időpontra állítható;
- egy integrációs smoke test valódi PostgreSQL ellen lefut;
- a tesztek egymástól függetlenül ismételhetők.

### BSS-003 - OOB konfigurációs szerződés

- Méret: `M`
- Függőség: BSS-001

Cél: a hiányzó Authentik mapping, titkok és seed fájlok formájának rögzítése.

Tartalom:

- típusos config séma;
- Authentik claim-, attribútum- és csoportmapping;
- csatlakozási félév és tagsági státusz transzformációs szabályai;
- médiahost- és YouTube-konfiguráció;
- OOB seed fájl helye;
- induláskori validáció és konkrét hibaüzenetek.

Elfogadási feltételek:

- hiányzó kötelező config mellett az alkalmazás nem indul félkonfigurált auth módban;
- ismeretlen Authentik státusz vagy félév nem kap kitalált értéket;
- titok nem kerül kliensbundle-be vagy gitbe;
- lokális tesztconfig külön használható.

### BSS-004 - Új adatbázisséma és migrációs alap

- Méret: `L`
- Függőség: BSS-001

Cél: a prototípus követelményekkel ütköző sémájának lecserélése.

Tartalom:

- videók, események, címkék, stábszerepek és stábkapcsolatok;
- videónként legfeljebb egy opcionális esemény;
- tagcache és Authentik `sub` kulcs;
- csatlakozási félév nyers és normalizált értékei;
- slug és slugtörténet;
- tartalomállapotok és videólomtár;
- manuális kapcsolódóvideó-sorrend;
- live, kiemelés és Rólunk-videólista;
- auditnapló;
- megtekintésszám és anonim session tárolás;
- szükséges indexek, egyediségek és idegen kulcsok.

Elfogadási feltételek:

- tiszta PostgreSQL adatbázison a migráció lefut;
- ugyanaz a videó nem kapcsolható két eseményhez;
- jogosultsági és stábszerep nem ugyanaz a tábla;
- profilkép bináris tárolása megszűnik;
- timestamp és naptári dátum mezők nem keverednek;
- a séma adatbázis-korlátokkal is védi a legfontosabb invariánsokat.

### BSS-005 - Lokális infrastruktúra és Authentik bootstrap

- Méret: `L`
- Függőség: BSS-003, BSS-004

Cél: dokumentáltan felépíthető PostgreSQL és Authentik tesztkörnyezet.

Tartalom:

- compose konfiguráció rendezése;
- Authentik blueprint vagy bootstrap script;
- schönherzes, tag és vezetőségi tesztesetek;
- szintetikus tagprofilok és csoportok;
- helyi titkok biztonságos előállítása;
- adatbázis-migrációs parancs.

Elfogadási feltételek:

- új fejlesztő dokumentált lépésekkel felépíti a környezetet;
- mindhárom nézői szint és mindkét adminjog tesztelhető;
- tesztjelszó nem kerül gitbe;
- újraindítás nem duplikálja a bootstrap adatokat.

### BSS-006 - OIDC belépés és session

- Méret: `L`
- Függőség: BSS-003, BSS-005

Cél: Authentik OIDC Authorization Code flow PKCE-vel és szerveroldali sessionnel.

Tartalom:

- login, callback és logout útvonal;
- HTTP-only, `SameSite=Lax` cookie;
- access token szerveroldali kezelése;
- visszatérési URL megőrzése;
- legfeljebb órás szerepfrissítés;
- Authentik-kiesési viselkedés.

Elfogadási feltételek:

- token nem kerül `localStorage`-ba;
- névtelen felhasználó belépés után visszajut az eredeti oldalra;
- Authentik-kieséskor új login nem sikerül, a publikus oldal működik;
- lejárt sessionnel mutáció nem hajtható végre.

### BSS-007 - Jogosultsági policy és szerveroldali guardok

- Méret: `M`
- Függőség: BSS-006

Cél: egyetlen, tesztelt helyen érvényesíteni a nézői és adminjogokat.

Tartalom:

- névtelen, schönherzes, tag és vezetőségi policy;
- videóláthatóság SQL-feltételei;
- adminműveletek jogosultsági mátrixa;
- `403`, `404` és loginra irányítás szabályai;
- kliensoldali navigáció szűrése a szerveroldali guard mellett.

Elfogadási feltételek:

- tiltott videó metaadata nem kerül a válaszba;
- tag nem kezelhet címkekatalógust, live-ot vagy auditot;
- vezetőségi jog magában foglalja a tagjogot;
- minden policy-ág integrációs tesztet kap.

### BSS-008 - Authentik tagcache és szinkron

- Méret: `L`
- Függőség: BSS-002, BSS-003, BSS-004, BSS-006, BSS-007

Cél: publikus tagadatok kiszolgálása helyi, csak olvasható cache-ből.

Tartalom:

- induláskori, óránkénti és kézi szinkron;
- mapping és normalizálás;
- nyers csatlakozási félév megőrzése;
- ismeretlen státusz és formátum hibakezelése;
- eltűnt tag utolsó ismert rekordjának megtartása;
- szinkronállapot és hibák;
- szerepváltozás frissítése.

Elfogadási feltételek:

- publikus kérés nem hívja az Authentiket;
- eltűnt tag stáblistája nem szakad el;
- hibás profil nem kerül publikus csoportba;
- változatlan szinkron nem ír auditbejegyzést;
- kézi szinkront csak vezetőség indíthat.

### BSS-009 - Közös slug, audit és optimista zárolás

- Méret: `L`
- Függőség: BSS-004, BSS-007

Cél: közös infrastruktúra minden szerkeszthető entitáshoz.

Tartalom:

- slugképzés, ütközéskezelés és átirányítási előzmény;
- `createdBy`, `updatedBy`, verzió és timestamp kezelés;
- elavult mentés blokkolása;
- tranzakciós audit előtte-utána értékekkel;
- `system` szereplő;
- plain text és hosszvalidációk.

Elfogadási feltételek:

- régi slug az újra irányít;
- két párhuzamos mentés közül az elavult kérés konfliktust kap;
- sikertelen tranzakció nem hagy auditot vagy félkész adatot;
- audit nem módosítható az alkalmazásból.

### BSS-010 - Háttérfeladat-futtató, health és adminriasztás

- Méret: `M`
- Függőség: BSS-002, BSS-004, BSS-008, BSS-009

Cél: biztonságos időzített feladatok külső worker nélkül.

Tartalom:

- PostgreSQL advisory lock;
- induláskori és óránkénti sync ütemezés;
- regisztrálható napi lomtártörlési és live időzítő feladatok;
- `/health/live` és `/health/ready`;
- tartós vezetőségi hibasáv és részletes hibanapló.

Elfogadási feltételek:

- két alkalmazáspéldány nem futtatja ugyanazt a feladatot kétszer;
- health válasz nem szivárogtat titkot;
- a tesztóra vezérli a regisztrált feladatokat;
- háttérhiba nem állítja le a publikus cache-t.

### BSS-011 - Média- és YouTube-validátor

- Méret: `M`
- Függőség: BSS-002, BSS-003

Cél: csak valóban használható média kerüljön publikált tartalomba.

Tartalom:

- `v.bsstudio.hu` hostellenőrzés;
- `HEAD`, timeout, redirect és content type ellenőrzés;
- Range GET tartalék `405` és `501` esetére;
- YouTube URL-normalizálás;
- oEmbed ellenőrzés;
- piszkozat és publikálás eltérő hibakezelése.

Elfogadási feltételek:

- a bsstudio.hu főoldalára irányító hiányzó média nem fogadható el;
- MP4 helyén kép és thumbnail helyén HTML nem publikálható;
- hibás URL piszkozatban menthető;
- teszt nem tölt le teljes médiafájlt.

### BSS-012 - Címke- és stábszerep-domain

- Méret: `M`
- Függőség: BSS-004, BSS-008, BSS-009

Cél: a két katalógus szabályainak szerveroldali megvalósítása.

Tartalom:

- címke létrehozás, átnevezés, összevonás és törlés;
- használt címke kapcsolatainak tranzakciós bontása;
- kisbetű- és whitespace-normalizálás;
- ékezeti hasonlóságra figyelmeztetés;
- stábszerep létrehozás, átnevezés, sorrendezés és összevonás;
- használatban lévő stábszerep törlésének tiltása.

Elfogadási feltételek:

- tag csak hozzárendelni tud meglévő címkét;
- használt címke törléséhez vezetőségi jog és címbeírás kell;
- szerepösszevonás nem veszít stábkapcsolatot;
- egy videón egy tag több szerepet is kaphat.

### BSS-013 - Esemény-domain és végleges törlés

- Méret: `L`
- Függőség: BSS-004, BSS-007, BSS-009, BSS-011

Cél: esemény CRUD, állapotkezelés és biztonságos végleges törlés.

Tartalom:

- piszkozat, publikált és archivált állapot;
- dátum- és thumbnail-validáció;
- jövőbeli esemény támogatása;
- publikálási feltételek;
- vezetőségi végleges törlés címbeírással;
- videókapcsolatok tranzakciós bontása;
- lista- és részletlekérdezések alapja.

Elfogadási feltételek:

- befejezés nem előzheti meg a kezdést;
- tag archiválhat, de nem törölhet végleg;
- eseménytörlés megtartja a videók `recordedAt` értékét;
- esemény és kapcsolatok félállapot nélkül törlődnek.

### BSS-014 - Videó-domain és életciklus

- Méret: `L`
- Függőség: BSS-004, BSS-007, BSS-009, BSS-010, BSS-011, BSS-012, BSS-013

Cél: a videó minden mezőjének, állapotának és publikálási szabályának szerveroldali megvalósítása.

Tartalom:

- piszkozat mentése és azonnali publikálás;
- kötelező thumbnail és MP4;
- alapértelmezett publikus láthatóság;
- múltbeli, de nem jövőbeli `publishedAt`;
- esemény- és `recordedAt` szabályok;
- címke- és stáblista-hozzárendelés;
- archiválás és publikálás;
- lomtár és vezetőségi visszaállítás archivált állapotba;
- napi 30 napos végleges törlési feladat regisztrálása;
- eseménydátum-eltérés figyelmeztetése;
- kiemelés és Rólunk-lista érvénytelenítése állapotváltozáskor.

Elfogadási feltételek:

- piszkozat csak címmel menthető;
- publikálás minden kötelező mezőt és médiát ellenőriz;
- egy videónak legfeljebb egy eseménye van;
- eseménymódosítás nem írja felül csendben a videódátumot;
- visszaállítás megőrzi a kapcsolatait.

### BSS-015 - Kapcsolódó videók szolgáltatása

- Méret: `M`
- Függőség: BSS-012, BSS-013, BSS-014

Cél: manuális, eseményes és közöscímkés kapcsolódó videók egységes kiszolgálása.

Tartalom:

- sorrendezett manuális lista;
- azonos esemény öt legutóbbi videója;
- esemény nélkül közös címkéken alapuló rangsor;
- önhivatkozás és duplikáció tiltása;
- állapot- és jogosultsági szűrés.

Elfogadási feltételek:

- manuális lista teljesen felülírja az automatikusat;
- az aktuális videó nem szerepel;
- korlátozott videó nem szivárog ki jogosulatlan nézőnek;
- egyező pontszámnál stabil a sorrend.

### BSS-016 - Megtekintésszámláló

- Méret: `M`
- Függőség: BSS-002, BSS-004, BSS-014

Cél: egyszerű, sessionönként egyszer számoló playerindítás rögzítése.

Tartalom:

- anonim, böngésző bezárásáig élő session cookie;
- első sikeres `play` esemény feldolgozása;
- idempotens videó-session kapcsolat;
- párhuzamos kérések kezelése;
- adminlekérdezés.

Elfogadási feltételek:

- pause és újraindítás nem növel újra;
- másik böngésző-session növelhet;
- IP és felhasználói előzmény nem tárolódik;
- publikus válasz nem tartalmaz megtekintésszámot.

### BSS-017 - Homepage, kiemelés, live és Rólunk-domain

- Méret: `L`
- Függőség: BSS-007, BSS-009, BSS-010, BSS-011, BSS-013, BSS-014

Cél: a homepage prioritás és vezetőségi beállítások szerveroldali megvalósítása.

Tartalom:

- live, kiemelt és normál prioritás;
- publikus kiemelt videó kiválasztása;
- live időablak, átfedés-tiltás és előzmény;
- `Adás hamarosan` 24 órás szabály;
- `Indítás most` és `Lezárás most`;
- aktiváláskori oEmbed ellenőrzés és fallback;
- Rólunk oldal legfeljebb hat rendezett videója;
- öt vagy hat friss videó és hat esemény lekérdezése.

Elfogadási feltételek:

- aktív live mindig felülírja a kiemelést;
- átfedő időablak nem menthető;
- nem publikus vagy archivált videó nem marad kiemelve;
- befejezett live csak adminelőzményben marad;
- Rólunk-listából kiesik az érvénytelen videó.

### BSS-018 - Keresési szolgáltatás

- Méret: `L`
- Függőség: BSS-004, BSS-007, BSS-008, BSS-012, BSS-013, BSS-014

Cél: súlyozott globális keresés és összetett videószűrés PostgreSQL-ben.

Tartalom:

- szükséges `pg_trgm` és ékezetfüggetlen keresési támogatás;
- videó, esemény, tag és címke találatok;
- elfogadott súlyozás;
- videó részletes szűrői;
- címkék `ÉS` logikája;
- relevancia és választható rendezések;
- szerveroldali lapozás;
- jogosultsági feltételek a lekérdezésben.

Elfogadási feltételek:

- cím- és névegyezés megelőzi a leírástalálatot;
- zeneszöveg nem kereshető;
- ékezet nélküli és kisebb elgépeléses keresés működik;
- jogosulatlan találat és találatszám sem szivárog;
- azonos lekérdezés stabil sorrendet ad.

### BSS-019 - Alkalmazásváz, publikus route-ok és hibaoldalak

- Méret: `M`
- Függőség: BSS-006, BSS-007, BSS-009

Cél: a végleges route-struktúra és közös oldalállapotok kialakítása.

Tartalom:

- elfogadott angol útvonalak;
- slugfeloldás és régi slug redirect;
- közös navbar, footer és login állapot;
- magyar `403`, `404`, betöltési és hibaoldalak;
- mentetlen űrlap kliensoldali megőrzésének alapja.

Elfogadási feltételek:

- piszkozat, archív és lomtár publikus route-ja `404`;
- jogosult és jogosulatlan állapot nem keveredik;
- régi slug az új canonical route-ra irányít;
- mobil navigáció használható.

### BSS-020 - Publikus videólista

- Méret: `L`
- Függőség: BSS-014, BSS-018, BSS-019

Cél: valós adatokkal működő videókatalógus.

Tartalom:

- thumbnail és cím kártya;
- három rendezés;
- elfogadott részletes szűrők;
- címkék `ÉS` kapcsolata;
- 10, 25, 50, 100 oldalméret, alapból 50;
- URL-ben megmaradó állapot;
- jogosultság szerinti eredmények.

Elfogadási feltételek:

- lapozáskor nincs duplikáció vagy kihagyás;
- hiányzó `recordedAt` időrendi listában hátul van;
- frissítés és megosztott URL megtartja a szűrőket;
- üres találat külön magyar állapotot mutat.

### BSS-021 - Videórészlet, player és kapcsolódó tartalom

- Méret: `L`
- Függőség: BSS-014, BSS-015, BSS-016, BSS-019

Cél: a teljes videóoldal valós adatokkal.

Tartalom:

- elfogadott blokk-sorrend;
- natív MP4 player, poster és `preload="metadata"`;
- `play` esemény számlálása;
- esemény-, címke- és tagprofil-linkek;
- plain text blokkok;
- kapcsolódó videók;
- médiahiba és újrapróbálás.

Elfogadási feltételek:

- autoplay és külön download gomb nincs;
- üres opcionális blokkok nem jelennek meg;
- tiltott kapcsolódó videó nem látszik;
- ugyanaz a session csak egyszer növel számlálót.

### BSS-022 - Publikus eseménylista és részletoldal

- Méret: `M`
- Függőség: BSS-013, BSS-014, BSS-019

Cél: események listázása és részlete jogosultsággal szűrt származtatott adatokkal.

Tartalom:

- thumbnail, cím és videószám overlay;
- kezdődátum szerinti rendezés;
- 50-es alaplapozás;
- részletoldal és videólista;
- thumbnail fallback;
- videókból származtatott, titulus nélküli stáblista.

Elfogadási feltételek:

- videószám csak a látható videókat számolja;
- a stáblista nem szivárogtat korlátozott videót;
- esemény videó nélkül is publikus marad;
- `recordedAt` szerinti sorrend működik.

### BSS-023 - Publikus taglista és tagprofil

- Méret: `L`
- Függőség: BSS-008, BSS-013, BSS-014, BSS-019

Cél: Authentik-cache-ből kiszolgált csoportos tagoldalak és tevékenység.

Tartalom:

- vezetőség és tagsági csoportok;
- külön archivált és közreműködő aloldal;
- tagkártya;
- profiladatok;
- év és szerep nézet;
- több szerepnél tudatos ismétlés;
- 50-es `Továbbiak betöltése`;
- jogosultsági videószűrés.

Elfogadási feltételek:

- vezetőségi tag nem ismétlődik másik csoportban;
- ismeretlen státuszú profil nem publikus;
- email és mobil nem kerül válaszba;
- a nézet URL-ből visszaállítható.

### BSS-024 - Homepage és YouTube live felület

- Méret: `L`
- Függőség: BSS-013, BSS-014, BSS-017, BSS-019

Cél: a három homepage-prioritás megjelenítése frissítés nélküli váltással.

Tartalom:

- live és kiemelt hero öt friss videóval;
- normál állapot hat videóval;
- minden állapot alatt hat esemény;
- `Adás hamarosan` sáv;
- YouTube nocookie embed autoplay nélkül;
- következő váltás kliensoldali időzítése és percenkénti ellenőrzés.

Elfogadási feltételek:

- hero videó nem ismétlődik az oldalsó listában;
- live kezdése és vége kézi frissítés nélkül megjelenik;
- hibás aktiválás fallbacket mutat;
- mobilon minden blokk használható.

### BSS-025 - Globális kereső és találati oldal

- Méret: `L`
- Függőség: BSS-018, BSS-019, BSS-020, BSS-022, BSS-023

Cél: navbar popover és teljes keresőoldal.

Tartalom:

- két karakteres minimum és 250 ms késleltetés;
- öt találat típusonként;
- billentyűzetes kezelés;
- Összes, Videók, Események és Tagok fülek;
- típusonként tíz találat az Összes fülön;
- címke átirányítás aktív videószűrőre;
- üres keresési útmutató.

Elfogadási feltételek:

- tag és címke megnevezése nem keveredik;
- popover billentyűzettel nyitható és bezárható;
- tiltott videó metaadata nem jelenik meg;
- részletes videókeresés megtartja a queryt.

### BSS-026 - Rólunk oldal és tanfolyam-átirányítás

- Méret: `S`
- Függőség: BSS-017, BSS-019, BSS-021

Cél: a két egyszerű publikus útvonal véglegesítése.

Tartalom:

- verziókezelt Rólunk-szöveg;
- legfeljebb hat rendezett publikus videó;
- `/courses` átirányítás ugyanabban a fülben.

Elfogadási feltételek:

- érvénytelen videó nem marad a Rólunk-listában;
- helyi tanfolyaműrlap és ál-sikerüzenet megszűnik;
- az átirányítás szerveroldalon is működik.

### BSS-027 - Adminváz és sidebar

- Méret: `M`
- Függőség: BSS-007, BSS-019

Cél: YouTube Studio jellegű információs szerkezet BSS-arculattal.

Tartalom:

- elfogadott sidebar-elemek;
- tag- és vezetőségi elemek eltérő megjelenése;
- belépés utáni Videók kezdőoldal;
- közös táblázat és mobil kártyanézet;
- sessionlejárati és jogosultsági hibaállapot.

Elfogadási feltételek:

- tag nem lát vezetőségi menüpontot;
- közvetlen URL-en a szerver is tilt;
- mobilon nem kell vízszintesen kezelhetetlen táblát görgetni;
- nincs üres dashboard.

### BSS-028 - Videó-adminlista és szerkesztő

- Méret: `L`
- Függőség: BSS-014, BSS-015, BSS-027

Cél: a teljes videóéletciklus kezelése adatbázis-kézi beavatkozás nélkül.

Tartalom:

- elfogadott listaoszlopok és szűrők;
- létrehozás és szerkesztés;
- piszkozat vagy azonnali publikálás;
- médiaellenőrzés visszajelzése;
- címke-, esemény-, stáb- és manuális kapcsolódóvideó-kezelés;
- dátumwarningok;
- archiválás és lomtár;
- elavult mentési konfliktus;
- mentetlen adat megőrzése új belépésnél.

Elfogadási feltételek:

- tag nem tud új címkét létrehozni az űrlapon;
- kötelező mező nélkül publikálás nem sikerül;
- médiahiba mellett piszkozat menthető;
- az elavult mentés nem írja felül a frissebb adatot;
- tömeges művelet nincs.

### BSS-029 - Esemény-adminlista és szerkesztő

- Méret: `M`
- Függőség: BSS-013, BSS-027

Cél: esemény CRUD és vezetőségi végleges törlés.

Tartalom:

- elfogadott listaoszlopok és szűrők;
- piszkozat, publikálás és archiválás;
- dátumintervallum és thumbnail;
- videószám;
- címbeírásos végleges törlés vezetőségnek;
- érintett videók leválasztásának összefoglalója.

Elfogadási feltételek:

- tag nem kap végleges törlés gombot;
- vezetőség látja, hány videó válik le;
- törlés tranzakciós;
- tömeges törlés nincs.

### BSS-030 - Címke- és stábszerep-admin

- Méret: `M`
- Függőség: BSS-012, BSS-027

Cél: a két vezetőségi katalógus kezelőfelülete.

Tartalom:

- címke létrehozás, átnevezés, összevonás és törlés;
- használati szám és warning;
- címbeírásos használtcímke-törlés;
- stábszerep létrehozás, átnevezés, összevonás és drag vagy gombos sorrendezés;
- használt szerep törlésének blokkolása.

Elfogadási feltételek:

- hasonló, ékezetelt címke figyelmeztetést ad;
- kapcsolatbontás és összevonás eredménye előre látható;
- tag közvetlen API-hívással sem módosíthat katalógust;
- `displayOrder` minden publikus stábnézetben érvényes.

### BSS-031 - Live, kiemelés és Rólunk admin

- Méret: `L`
- Függőség: BSS-017, BSS-027

Cél: a vezetőség minden homepage- és Rólunk-beállítást elvégezhet egy helyen.

Tartalom:

- publikus kiemelt videó választása és törlése;
- YouTube URL normalizálás és előnézet;
- live kezdés, befejezés, átfedésjelzés;
- `Indítás most`, `Lezárás most`, másolatként új ütemezés;
- befejezett live előzmény;
- legfeljebb hat Rólunk-videó rendezése;
- aktiválási hibák.

Elfogadási feltételek:

- nem publikus videó nem választható kiemelésnek;
- hibás YouTube azonosító nem publikálható;
- átfedés kliensen és szerveren is blokkolt;
- tag nem látja vagy hívhatja a műveleteket.

### BSS-032 - Rejtett tagdiagnosztika

- Méret: `M`
- Függőség: BSS-008, BSS-027

Cél: a vezetőség lássa az Authentik-cache állapotát helyi profilszerkesztés nélkül.

Tartalom:

- profilok és utolsó szinkron;
- hiányzó vagy hibás mappingek;
- Authentikből eltűnt tagok;
- kézi szinkron;
- Authentik adminra mutató link;
- tartós szinkronhiba-sáv.

Elfogadási feltételek:

- helyi profil- és jogosultságmódosítás nincs;
- kézi szinkron auditált;
- tag nem látja a menüpontot vagy az adatot;
- nyers hiba nem szivárogtat titkot.

### BSS-033 - Lomtár és audit admin

- Méret: `L`
- Függőség: BSS-009, BSS-010, BSS-014, BSS-027

Cél: törölt videók és minden adminmódosítás ellenőrizhető kezelése.

Tartalom:

- minden tag számára látható videólomtár;
- törlő, időpont és hátralévő idő;
- vezetőségi visszaállítás archivált állapotba;
- napi végleges törlés állapota;
- vezetőségi auditlista;
- szereplő-, művelet-, entitás- és dátumszűrő;
- előtte-utána részletnézet.

Elfogadási feltételek:

- tag nem állíthat vissza;
- visszaállítás megtartja a kapcsolatokat;
- audit nem szerkeszthető, törölhető vagy exportálható;
- rendszerfeladat csak változásnál vagy hibánál jelenik meg.

### BSS-034 - Scraper és seed importer

- Méret: `L`
- Függőség: BSS-004, BSS-005, BSS-012, BSS-013, BSS-014

Cél: ismételhető, előre kinyert lokális tesztadat létrehozása.

Tartalom:

- 50 videó és kapcsolódó események begyűjtése;
- cím, leírás, zene, dátumok, MP4 és thumbnail URL;
- címkék, stábszerepek és kapcsolatok;
- stabil álnevesítés;
- legfeljebb öt párhuzamos kérés;
- retry, backoff és folytatható checkpoint;
- gitignore-olt JSON;
- idempotens seed importer.

Elfogadási feltételek:

- médiafájl nem töltődik le;
- email és profilbemutatkozás nem kerül a seedbe;
- újrafuttatás nem duplikál adatot;
- megszakítás után nem indul elölről;
- a seedelt stáblista Authentik tesztprofilokra mutat.

### BSS-035 - SEO, sitemap és biztonsági headerek

- Méret: `M`
- Függőség: BSS-019, BSS-021, BSS-022, BSS-023, BSS-024, BSS-026

Cél: helyes publikus metaadatok és szűk külső tartalmi engedélyek.

Tartalom:

- egyedi title, description, canonical és Open Graph;
- csak publikus tartalmú sitemap;
- robots.txt;
- CSP a `v.bsstudio.hu` és YouTube nocookie forrásokra;
- alap biztonsági headerek;
- admin és keresési technikai oldalak indexelésének tiltása.

Elfogadási feltételek:

- korlátozott videó nem kerül sitemapbe vagy metaadatba;
- thumbnail helyesen jelenik meg Open Graph képként;
- CSP mellett a player és YouTube live működik;
- régi slug canonicalként az új útvonalra mutat.

### BSS-036 - Reszponzív, billentyűzetes és állapotpolírozás

- Méret: `L`
- Függőség: BSS-020 - BSS-033

Cél: egységes, magyar és mobilon is használható teljes rendszer.

Tartalom:

- mobil publikus kártyák és admin kártyanézet;
- billentyűzetes kereső és űrlapok;
- fókuszkezelés modáloknál;
- karakterhátralék-jelzés;
- külön üres, betöltési és hibaállapotok;
- média-, Authentik-, jogosultsági és konfliktusüzenetek;
- vizuális egyeztetés a meglévő BSS prototípussal.

Elfogadási feltételek:

- kulcsfolyamatok egér nélkül is végigvihetők;
- admin mobilon nem kényszerít használhatatlan táblára;
- hibaüzenet megmondja, mi történt és mi a következő lépés;
- formális WCAG audit nélkül is javul a szemantika és a fókuszkezelés.

### BSS-037 - Integrációs és végponttól végpontig tesztcsomag

- Méret: `L`
- Függőség: BSS-020 - BSS-036

Cél: a specifikáció 20. fejezetének automatizált lefedése.

Tartalom:

- négy hozzáférési szereplő;
- videóállapotok, dátumok, média és lomtár;
- eseménytörlés és kapcsolatbontás;
- címke- és stábszerep-szabályok;
- tagcache és Authentik-kiesés;
- keresési adatszivárgás;
- homepage-prioritás és live;
- elavult mentés;
- slug redirect;
- 30 napos törlés vezérelt órával.

Elfogadási feltételek:

- minden elfogadási forgatókönyvhöz van automata teszt vagy indokolt, dokumentált kézi ellenőrzés;
- külső hívások determinisztikus mockot használnak;
- a tesztcsomag tiszta adatbázison indul;
- hiba esetén a teszt megnevezi a sérült üzleti szabályt.

### BSS-038 - Dokumentáció és lokális átadási próba

- Méret: `M`
- Függőség: BSS-005, BSS-034, BSS-035, BSS-037

Cél: bizonyítani, hogy egy új fejlesztő OOB csomaggal fel tudja építeni és végig tudja mutatni a V0-t.

Tartalom:

- README telepítési és indítási lépések;
- OOB fájllista és validáció;
- Authentik bootstrap;
- migráció és seed;
- tesztparancsok;
- szereplőnkénti demo forgatókönyv;
- ismert V0-korlátok és production előtti backlog;
- tiszta klónból végzett átadási próba.

Elfogadási feltételek:

- a dokumentált parancsok másolhatóak és működnek;
- hiányzó OOB elem konkrét hibát ad;
- a teljes elfogadási bemutató adatbázis-kézi módosítás nélkül végigvihető;
- a rating, komment, médiafeltöltés, tanfolyamkezelés, production és más kizárt elemek nem csúsztak vissza a V0-ba.

## 5. Production előtti, külön backlog

Ezek nem blokkolják a fenti kártyákat:

- teljes régioldal-migráció;
- Drupal linkek átirányítása;
- production telepítési pipeline;
- UptimeRobot beállítása;
- backup és visszaállítás;
- ténylegesen védett média;
- IP-alapú egyedi nézettség;
- tanfolyam- és felkéréskezelő integráció;
- tömeges adminműveletek;
- formális akadálymentességi audit.
