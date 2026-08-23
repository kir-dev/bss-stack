# BSS weboldal V0 követelményspecifikáció

## Dokumentumállapot

| Mező           | Érték                                                       |
| -------------- | ----------------------------------------------------------- |
| Állapot        | Elfogadott termékdöntések alapján készített V0 specifikáció |
| Nyelv          | Magyar                                                      |
| Időzóna        | Europe/Budapest                                             |
| Célkörnyezet   | Dokumentáltan indítható lokális környezet                   |
| Éles telepítés | Nem része a V0-nak                                          |
| Vizuális alap  | A repóban lévő publikus prototípus                          |

Ez a dokumentum az egyeztetés során elfogadott döntések egyetlen forrása. Ha a jelenlegi prototípus, a Figma vagy a régi bsstudio.hu működése eltér tőle, ez a specifikáció az irányadó.

## 1. Cél és átadási határ

A V0 egy lokálisan működő videóarchívum és szerkesztői rendszer. A publikus oldalak mellett az adminfolyamatoknak is használhatóknak kell lenniük. Adatbázis-kézi módosítás nem válthat ki hiányzó adminfunkciót.

A V0 akkor tekinthető késznek, ha lokálisan bemutatható:

- a névtelen, schönherzes és BSS-tag nézői hozzáférés;
- a tag és vezetőségi tag adminjogosultsága;
- a videó teljes életciklusa;
- az események kezelése;
- a tagok Authentikből történő szinkronja;
- a globális és részletes keresés;
- a live, kiemelt és normál homepage-prioritás;
- az auditnapló és a 30 napos videótörlés szimulációja.

## 2. Külső bemenetek

A következő fájlok OOB érkeznek, és nem kerülnek gitbe:

- Authentik attribútum- és csoportmappinget tartalmazó config;
- helyi titkok;
- előre kinyert seed JSON.

A README-nek fel kell sorolnia a fájlok pontos helyét, formáját és ellenőrzési módját. Hiányzó fájlnál az alkalmazás konkrét hibaüzenettel álljon meg. Ne használjon kitalált alapértékeket.

## 3. Szereplők és jogosultságok

### 3.1 Nézői szintek

| Szereplő                   | Látható videók               | Admin                     |
| -------------------------- | ---------------------------- | ------------------------- |
| Névtelen látogató          | `public`                     | Nem                       |
| Bejelentkezett schönherzes | `public`, `schonherz`        | Nem                       |
| BSS-tag                    | `public`, `schonherz`, `bss` | Igen                      |
| Vezetőségi tag             | `public`, `schonherz`, `bss` | Igen, kibővített jogokkal |

Az Authentik `vezetoseg` csoportja kiegészíti a tagságot. Nem helyettesíti azt.

### 3.2 Adminjogok

| Művelet                                                 | Tag  | Vezetőségi tag                   |
| ------------------------------------------------------- | ---- | -------------------------------- |
| Videó és esemény létrehozása, szerkesztése, publikálása | Igen | Igen                             |
| Videó és esemény archiválása                            | Igen | Igen                             |
| Videó lomtárba helyezése                                | Igen | Igen                             |
| Videólomtár megtekintése                                | Igen | Igen                             |
| Videó visszaállítása                                    | Nem  | Igen                             |
| Esemény végleges törlése                                | Nem  | Igen                             |
| Meglévő címkék videóhoz rendelése                       | Igen | Igen                             |
| Címkekatalógus kezelése                                 | Nem  | Igen                             |
| Stábszerepek kezelése                                   | Nem  | Igen                             |
| Stáblista kezelése egy videón                           | Igen | Igen                             |
| Live, kiemelés és Rólunk-videók kezelése                | Nem  | Igen                             |
| Taglista és Authentik-szinkron diagnosztika             | Nem  | Igen, csak olvasható profilokkal |
| Auditnapló megtekintése                                 | Nem  | Igen                             |

Minden tag látja és szerkesztheti más tagok piszkozatait. Nincs tartalmi tulajdonjog szerző szerint. A szerver minden műveletnél újra ellenőrzi a jogosultságot.

## 4. Közös tartalmi szabályok

### 4.1 Állapot és láthatóság

Az állapot és a láthatóság külön adat.

Videó és esemény állapotai:

- `draft`;
- `published`;
- `archived`.

A videó ezen felül `trash` állapotba kerülhet. Csak a live használ időzítést.

Az archivált tartalom nem látható publikus felületen. Bármely tag visszaállíthatja publikált állapotba. A lomtárból visszaállított videó archivált állapotba kerül, majd külön publikálható.

Videó láthatóságok:

- `public`;
- `schonherz`;
- `bss`.

Az új videó alapértelmezett láthatósága `public`. Az események és tagprofilok publikusak. A hozzájuk tartozó videókat és származtatott adatokat a néző jogosultsága szerint kell szűrni.

### 4.2 Azonosítók és slugok

- A belső azonosító UUID.
- A publikus útvonal egyedi slugot használ.
- A slug a címből kisbetűs, ékezet nélküli, kötőjeles formában képződik.
- Ütközéskor számozott utótag készül.
- A slug módosítható.
- A régi slug átirányításként megmarad, és végleges törlés után sem használható fel újra.
- A tagprofil stabil belső kulcsa az Authentik `sub` értéke. A profil slugja az Authentik felhasználónévből készül.

### 4.3 Szövegek

Minden leírás plain text, sortörések támogatásával. HTML, Markdown és rich text nem része a V0-nak.

| Mező                          | Maximális hossz |
| ----------------------------- | --------------: |
| Cím                           |    200 karakter |
| Slug                          |    200 karakter |
| Címke és stábszerep           |     64 karakter |
| Leírás és bemutatkozás        | 10 000 karakter |
| Vendégek és felhasznált zenék |  5 000 karakter |
| URL                           |  2 048 karakter |

A kliens és a szerver ugyanazokat a korlátokat ellenőrizze.

### 4.4 Dátumok

- A pontos időpontok UTC timestampként tárolódnak.
- A `recordedAt`, valamint az esemény kezdete és vége időzóna nélküli naptári dátum.
- Megjelenítéskor Europe/Budapest érvényes.
- Publikus dátumformátum: `2026. június 6.`
- Admin és audit formátum: `2026. június 6. 14:32`
- Eseményintervallum: `2026. június 6-8.`
- Csatlakozási félév: `2023 ősz`

## 5. Videók

### 5.1 Adatmodell

Egy videó mezői:

- UUID és slug;
- cím;
- leírás;
- vendégek, szabad szöveg;
- felhasznált zenék, szabad szöveg;
- MP4 URL;
- thumbnail URL;
- láthatóság és állapot;
- `createdAt`, `updatedAt`, `publishedAt`, `recordedAt`;
- megtekintésszám;
- opcionális esemény;
- címkék;
- stábtagok és stábszerepek;
- sorrendezett manuális kapcsolódó videók;
- létrehozó és utolsó módosító.

A felhasznált zenék formátuma soronként egy tétel:

```text
Előadó - Szám címe
Másik előadó - Másik szám
```

Egy videó legfeljebb egy eseményhez tartozhat. Az eseménykapcsolat nem kötelező.

### 5.2 Dátumszabályok

- A `createdAt` rendszeradat, nem módosítható.
- A `publishedAt` publikáláskor az aktuális időpontot kapja, de tag múltbeli időpontra módosíthatja.
- Jövőbeli `publishedAt` nem engedélyezett.
- Esemény nélküli videónál a `recordedAt` opcionális.
- Egynapos esemény hozzárendelése kitölti az üres `recordedAt` mezőt.
- Többnapos eseménynél publikálás előtt meg kell adni a `recordedAt` értéket.
- Az esemény intervallumán kívüli dátum megengedett, de figyelmeztetést kap.
- Esemény vagy eseménydátum módosítása nem írja felül csendben a videódátumot.
- Esemény leválasztásakor a `recordedAt` megmarad.

### 5.3 Piszkozat és publikálás

Piszkozat mentéséhez csak a cím kötelező.

Publikáláshoz kötelező:

- cím;
- érvényes MP4 URL;
- érvényes thumbnail URL;
- láthatóság;
- nem jövőbeli `publishedAt`;
- többnapos eseménynél `recordedAt`.

Az adminűrlap mentéskor választható műveleteket ad: `Piszkozat mentése` és `Publikálás`. Nincs automatikus mentés. Mentetlen változásokkal navigáláskor megerősítés szükséges.

### 5.4 Média-URL-ek

Az alkalmazás fájlt nem tölt fel, nem kódol át és nem töröl a médiaszerverről. Csak távoli URL-t tárol.

Videó és thumbnail esetén:

- csak `https://v.bsstudio.hu` host engedélyezett;
- a szerver `HEAD` kérést küld 5 másodperces kapcsolódási és 15 másodperces teljes timeouttal;
- csak átirányítás nélküli `200` válasz fogadható el;
- videónál `video/mp4`, thumbnailnél `image/*` content type szükséges;
- `3xx`, `4xx`, timeout és `5xx` nem enged publikálást;
- hibás vagy még nem ellenőrizhető URL piszkozatban menthető;
- `405` vagy `501` esetén egybájtos Range GET használható tartalék ellenőrzésként.

A láthatóság csak az oldal metaadatait védi. A külső MP4 URL publikus, ezért a link birtokában a fájl az alkalmazás megkerülésével is elérhető.

### 5.5 Player és megtekintésszám

- Natív videóvezérlők.
- A thumbnail a poster.
- `preload="metadata"`.
- Nincs autoplay.
- Nincs külön letöltés gomb.
- Nincs lejátszási pozíció mentése.
- Médiahiba esetén magyar hibaüzenet és újrapróbálás jelenik meg.

A számláló az első sikeres `play` eseménynél nő. Egy böngésző-session ugyanazt a videót egyszer számolja, több fülből is. A session cookie a böngésző bezárásáig él. IP-cím, felhasználói megtekintéstörténet és kézi számlálómódosítás nincs. A megtekintésszám csak adminban látható.

### 5.6 Kapcsolódó videók

A kiválasztás sorrendje:

1. sorrendezett manuális lista, ha van;
2. azonos esemény öt legutóbb publikált videója;
3. esemény nélkül az öt legjobb, legalább egy közös címkével rendelkező videó.

Közös címkés találatnál a több közös címke erősebb. Egyezésnél a `publishedAt` csökkenő sorrendje dönt.

Manuálisan bármely publikált videó kiválasztható, láthatóságtól függetlenül. Piszkozat, archivált, lomtárban lévő, önhivatkozás vagy duplikáció nem engedélyezett. Megjelenítéskor a néző jogosultsága minden esetben szűr.

### 5.7 Videórészlet

A blokkok sorrendje:

1. player;
2. cím;
3. készült és feltöltve dátum;
4. esemény linkje;
5. leírás;
6. vendégek;
7. felhasznált zenék;
8. címkék;
9. stáb pozíciónként;
10. kapcsolódó videók.

Üres opcionális blokk nem jelenik meg. A stábtag neve a tagprofilra visz. A címke a videólistát nyitja aktív címkeszűrővel.

### 5.8 Videólista

A videókártya csak thumbnailt és címet mutat.

Rendezések:

- alapértelmezett és utoljára feltöltött: `publishedAt` csökkenő;
- időrendi: `recordedAt` csökkenő, hiányzó értékek hátul;
- legnézettebb: megtekintésszám csökkenő.

Egyezésnél `publishedAt`, majd UUID ad stabil sorrendet.

Szűrők:

- szabad szöveg;
- több címke `ÉS` kapcsolattal;
- esemény;
- `recordedAt` dátumtartomány;
- stábtag;
- stábszerep.

Alapértelmezett oldalméret 50. Választható értékek: 10, 25, 50, 100. A rendezés, lapozás és szűrők az URL-ben maradnak.

## 6. Események

### 6.1 Adatmodell és publikálás

Egy esemény mezői:

- UUID és slug;
- cím;
- plain text leírás;
- opcionális thumbnail URL;
- kezdődátum;
- opcionális befejezési dátum;
- állapot;
- létrehozó, utolsó módosító és időbélyegek.

Piszkozathoz csak cím kell. Publikáláshoz cím és kezdődátum szükséges. A befejezés nem lehet korábbi a kezdésnél. Jövőbeli esemény publikálható.

Az esemény thumbnailje opcionális. Hiányában a legújabb, néző számára látható videó thumbnailje használható, majd placeholder következik.

### 6.2 Láthatóság és származtatott adatok

Az esemény mindig publikus. A videólista, a videók száma és a stáblista csak a néző számára látható videókból készül.

Az eseményhez nincs külön stáblista. Az oldal a videók egyedi stábtagjait mutatja név szerint rendezve, titulus nélkül.

### 6.3 Lista és részletoldal

Az eseménykártyán jelenik meg:

- thumbnail;
- cím;
- a néző számára látható videók száma a thumbnailre helyezett overlayben.

Az eseménylista kezdődátum szerint csökkenő sorrendű. Alapértelmezett oldalmérete 50, a videólistával azonos választható méretekkel.

Az eseményrészleten jelenik meg:

- cím, thumbnail, dátumintervallum és leírás;
- videók `recordedAt` szerint csökkenő sorrendben, 50-es lapozással;
- a származtatott stáblista.

### 6.4 Végleges törlés

Eseményt csak vezetőségi tag törölhet. A művelet azonnali és végleges.

Egy tranzakción belül:

1. minden videó eseménykapcsolata megszűnik;
2. az esemény törlődik;
3. teljes auditbejegyzés készül.

A videók `recordedAt` értéke megmarad. A megerősítéshez az esemény címét be kell írni.

## 7. Címkék és stábszerepek

### 7.1 Címkék

Külön kategóriarendszer nincs. Egy videóhoz több címke, egy címkéhez több videó tartozhat.

- Tag csak meglévő címkét rendelhet videóhoz.
- Vezetőségi tag létrehozhat, átnevezhet, összevonhat és törölhet címkét.
- Használt címke törölhető figyelmeztetés és címbeírás után.
- Törléskor minden videókapcsolat megszűnik.
- Összevonáskor minden kapcsolat a célcímkére kerül.
- Kis- és nagybetű, valamint felesleges szóköz nem hozhat létre duplikációt.
- Az ékezet jelentésmegkülönböztető. A rendszer csak figyelmeztet az ékezet nélkül hasonló névre.

### 7.2 Stábszerepek

A jogosultsági szerepek és a stábszerepek külön táblában élnek.

- Vezetőségi tag hozhat létre, nevezhet át, rendezhet és vonhat össze stábszerepet.
- A szerepnek `displayOrder` értéke van.
- Használatban lévő szerep nem törölhető.
- Egy videó azonos szerepéhez több tag tartozhat.
- Egy tag ugyanazon a videón több szerepet is kaphat.

## 8. Tagok

### 8.1 Authentik mint forrás

Az Authentik a profil- és jogosultsági adatok egyetlen írható forrása. Az alkalmazás profiloldala és adminfelülete csak olvas.

Az OOB config leképezi:

- a stabil `sub` azonosítót;
- felhasználónevet;
- teljes nevet;
- becenevet;
- profilkép URL-t;
- tagsági státuszt;
- csatlakozási évet és félévet;
- bemutatkozást;
- `tag` és `vezetoseg` csoportot.

A csatlakozási félév szabad szövegként is érkezhet. A cache tárolja a nyers értéket, valamint a config alapján feldolgozott évet és `spring | autumn` értéket. Ismeretlen formátum vagy státusz szinkronhibát okoz. A profil ilyenkor nem jelenik meg a publikus listán.

Emailt és mobilszámot az alkalmazás nem kér, nem cache-el és nem jelenít meg.

### 8.2 Cache és szinkron

- Szinkron induláskor, óránként és vezetőségi kézi indításra fut.
- A publikus kérés nem hívja közvetlenül az Authentiket.
- Authentik-kieséskor az utolsó cache marad publikus.
- Új belépés nem lehetséges, a meglévő session legfeljebb egy óráig él.
- Authentikből eltűnt tag utolsó ismert, nem szerkeszthető rekordja megmarad.
- A történelmi stáblista és tevékenység nem törlődik.
- A rejtett vezetőségi felület mutatja a szinkronállapotot, hibákat és az utolsó futást.

### 8.3 Tagsági státuszok

Egy személynek pontosan egy tagsági státusza van:

- stúdiós;
- stúdiósjelölt;
- stúdiósjelölt-jelölt;
- aktív öregtag;
- archivált öregtag;
- dolgozott még velünk.

A vezetőségi szerep ettől külön áll. A vezetőségi tag csak a Vezetőség blokkban jelenik meg, saját státuszának blokkjában nem ismétlődik.

### 8.4 Taglista és profil

Aktív tagoldal blokkjai:

1. vezetőség;
2. stúdiósok;
3. stúdiósjelöltek;
4. stúdiósjelölt-jelöltek;
5. aktív öregtagok.

Az archivált öregtagok és a korábbi közreműködők külön publikus aloldalt kapnak, 50-es lapozással. Az aktív tagoldalon nincs lapozás.

A tagkártya profilképet, teljes nevet és becenevet mutat.

A profil sorrendje:

1. profilkép, név és becenév;
2. státusz és vezetőségi szerep;
3. csatlakozási félév;
4. bemutatkozás;
5. tevékenység.

A tevékenység év és szerep nézet között váltható. Mindkettő `recordedAt` szerint csökkenő.

- Év nézetben az évek alatt stábszerep szerinti csoportok jelennek meg.
- Szerep nézetben a szerepek alatt időrendben jelennek meg a videók.
- Több szerepnél ugyanaz a videó minden érintett csoportban megjelenik.
- Nézetenként 50 videó töltődik be, majd `Továbbiak betöltése` folytatja.
- A nézet és a kiválasztott csoport az URL-ben marad.
- Csak a néző számára látható videók jelennek meg.

## 9. Homepage és live

### 9.1 Prioritás

A homepage állapota számított prioritás:

1. aktív live;
2. kiemelt videó;
3. normál állapot.

Live és kiemelt állapotban a hero mellett öt legutóbbi publikus videó jelenik meg. A hero videó nem ismétlődhet a listában. Normál állapotban hat legutóbbi publikus videó jelenik meg.

Mindhárom állapot alatt hat esemény látható, kezdődátum szerint csökkenő sorrendben. Jövőbeli publikált esemény is szerepelhet.

### 9.2 Kiemelés

- Csak publikált, publikus videó emelhető ki.
- A vezetőség választja ki.
- A kiemelés nem időzíthető.
- Archiválás, lomtár vagy láthatóság-szűkítés ugyanabban a tranzakcióban megszünteti a kiemelést.

### 9.3 Live

A live egy YouTube-videóhoz tartozó ütemezés:

- elfogadott URL-formák: `youtube.com/watch`, `youtube.com/live`, `youtu.be`, YouTube embed;
- a rendszer videóazonosítóra normalizálja az URL-t;
- a megjelenítés `youtube-nocookie.com` embedet használ;
- az oEmbed ellenőrzés mentéskor és aktiváláskor fut;
- kezdési és befejezési idő kötelező;
- egymást átfedő live-ok nem menthetők;
- a vezetőség `Indítás most` és `Lezárás most` műveletet kap;
- nincs autoplay;
- a kezdés előtti 24 órában `Adás hamarosan` sáv jelenik meg;
- a sáv nem váltja le a normál vagy kiemelt hero tartalmát;
- a homepage frissítés nélkül vált, és percenként ellenőrzi az állapotot;
- aktiválási hibánál a homepage kiemelt vagy normál állapotra esik vissza;
- futó live-ot átmeneti YouTube-hiba nem kapcsol le automatikusan.

Befejezett live nem jelenik meg publikus archívumban. Az admin olvasható előzményt tart meg. Korábbi live csak másolatként ütemezhető újra.

A live-ból nem készül automatikusan videó. Az editor új normál videót vesz fel, és kézzel rendelheti hozzá az `Adás` címkét.

## 10. További publikus oldalak

### 10.1 Rólunk

- A szöveg verziókezelt plain text tartalom.
- Módosítása kódváltozást igényel.
- Az oldal alján legfeljebb hat, vezetőség által választott és sorrendezett publikus videó jelenik meg.
- Archivált, lomtárban lévő vagy nem publikus videó automatikusan kiesik.

### 10.2 Tanfolyam

A `/courses` útvonal ugyanabban a böngészőfülben a `https://tanfolyam.bsstudio.hu/` oldalra irányít.

Helyi tanfolyami űrlap, adatmodell, admin, export és email nincs.

## 11. Keresés

### 11.1 Globális kereső

A navbar keresője két karaktertől indul, 250 ms késleltetéssel. Csoportonként legfeljebb öt találatot mutat, billentyűzettel is használható.

Találattípusok:

- videó, amely a videórészletre visz;
- esemény, amely az eseményrészletre visz;
- tag, amely a tagprofilra visz;
- címke, amely aktív szűrővel a videólistára visz.

A felületen a személy `Tag`, a videóhoz rendelt adat `Címke` néven jelenik meg.

### 11.2 Súlyozás

Fontossági sorrend:

1. pontos cím, név vagy becenév;
2. cím, név vagy címke elejének egyezése;
3. videócímke és eseménycím;
4. vendégek és stáblista;
5. leírás és bemutatkozás.

A felhasznált zenékben nincs keresés. A keresés kis- és nagybetűtől, valamint ékezettől független. A kisebb elgépeléseket trigram alapú hasonlóság kezeli.

Keresőkifejezésnél a relevancia az alapértelmezett rendezés, egyezésnél `publishedAt` csökkenő. A felhasználó ezt felülírhatja a videólista rendezéseivel.

### 11.3 Teljes keresőoldal

A `/search` fülei:

- Összes;
- Videók;
- Események;
- Tagok.

Az Összes fül típusonként legfeljebb tíz találatot mutat. A részletes videókeresés a `/videos` oldal elfogadott szűrőit használja. A dátum csak külön dátummezőként kereshető, természetes nyelvű dátumfelismerés nincs.

Üres keresés nem listázza ki az adatbázist. Keresési útmutatót és linket mutat a részletes videószűrőhöz.

### 11.4 Hozzáférés

A keresési lekérdezés már az adatbázisban kizárja a nem látható videókat. Cím, thumbnail, találatszám és más metaadat sem szivároghat ki kliensoldali utószűrés előtt.

## 12. Adminfelület

### 12.1 Navigáció

A sidebar elemei:

- Videók;
- Események;
- Live és kiemelés;
- Címkekatalógus;
- Stábszerepek;
- Tagok, csak vezetőségnek és csak olvashatóan;
- Lomtár;
- Auditnapló, csak vezetőségnek.

Külön dashboard nincs. Belépés után a Videók lista nyílik meg. Az admin mobilon is használható. Az összetett táblák kártyanézetre válthatnak.

### 12.2 Videólista

Oszlopok:

- thumbnail és cím;
- állapot;
- láthatóság;
- esemény;
- `recordedAt`;
- `publishedAt`;
- megtekintésszám;
- utolsó módosító és módosítás ideje.

Szűrők:

- keresés;
- állapot;
- láthatóság;
- esemény;
- címke.

Tömeges törlés, archiválás és láthatóság-módosítás nincs a V0-ban.

### 12.3 Eseménylista

Oszlopok:

- cím;
- dátum vagy intervallum;
- állapot;
- videók száma;
- utolsó módosító és módosítás ideje.

Szűrők: keresés, állapot és dátum. Tömeges törlés nincs.

### 12.4 Párhuzamos szerkesztés

Az alkalmazás optimista verzióellenőrzést használ. Ha más közben módosította a rekordot, a második mentés blokkolódik. A felület konfliktusüzenetet és frissítési lehetőséget ad. Csendes, utolsó mentés nyer működés nincs.

Session lejártakor a szerver elutasítja a mentést. A kliens megőrzi a kitöltött adatot, új belépést kér, majd engedi az újraküldést.

## 13. Törlés és audit

### 13.1 Videólomtár

- Bármely tag lomtárba tehet videót normál megerősítés után.
- Minden tag látja a lomtárat és a törlés szereplőjét, illetve idejét.
- Csak vezetőségi tag állíthat vissza.
- Visszaállításkor a videó archivált lesz.
- A címke-, stáb-, esemény- és kapcsolódóvideó-kapcsolatok a lomtárban megmaradnak.
- Napi feladat törli végleg a legalább 30 napja lomtárban lévő rekordot.
- A külső médiafájlok nem törlődnek.

### 13.2 Auditnapló

Minden létrehozás, módosítás, publikálás, archiválás, lomtár, visszaállítás, végleges törlés és konfigurált adminművelet naplózódik.

Az audit tartalma:

- Authentik-azonosító vagy `system` szereplő;
- pontos idő;
- entitástípus és azonosító;
- művelet;
- változás előtti és utáni érték.

A naplót csak a vezetőség látja. Szereplőre, műveletre, entitásra és dátumra szűrhető. Nem törölhető, nem exportálható és nem kínál automatikus visszaállítást. Megőrzése korlátlan.

Rendszerművelet csak tényleges változásnál, hibánál vagy törlésnél ír auditot. Változatlan óránkénti szinkron nem.

## 14. Authentik és alkalmazásbiztonság

- OIDC Authorization Code flow PKCE-vel.
- Access token nem kerül `localStorage`-ba.
- Session HTTP-only cookie-ban él.
- Productionben a cookie `Secure`, mindig `SameSite=Lax`.
- Jogosultságot minden szerveroldali lekérdezés és módosítás ellenőriz.
- Szerepváltozás legfeljebb egy órán belül érvényesül.
- Névtelen felhasználó korlátozott linknél belépési lehetőséget kap, megtartott visszatérési URL-lel.
- Bejelentkezett, de jogosulatlan felhasználó `403` oldalt kap.
- A tiltott videó címe és thumbnailje nem kerül a HTML-be.
- Piszkozat, archivált, lomtárban lévő, végleg törölt vagy nem létező publikus útvonal egységes `404` oldalt ad.

## 15. Háttérfolyamatok és health

Az alkalmazásszerver indítja:

- az óránkénti Authentik-szinkront;
- a napi videólomtár-törlést;
- a live kezdési és befejezési állapotváltásait.

PostgreSQL advisory lock akadályozza meg a párhuzamos, kétszeres futást. Külön worker és Redis nem kell.

Health végpontok:

- `/health/live`, amely az alkalmazás futását ellenőrzi;
- `/health/ready`, amely az adatbázist és a migrációk állapotát ellenőrzi.

Authentik-, live- és médiaellenőrzési hiba tartós vezetőségi figyelmeztető sávban és részletes naplóban jelenik meg. Külső email vagy SMS nincs.

## 16. Útvonalak és metaadatok

Publikus útvonalak:

- `/videos`;
- `/videos/{slug}`;
- `/events`;
- `/events/{slug}`;
- `/members`;
- `/members/{slug}`;
- külön archivált tag- és közreműködő-aloldalak;
- `/about`;
- `/courses`;
- `/search`;
- `/admin`.

A régi Drupal `/video`, `/event` és `/user` linkek átirányítása nem része a lokális V0-nak. Production átállás előtt külön feladat.

Minden publikus videó-, esemény- és tagoldal kap:

- egyedi címet;
- leírást;
- canonical URL-t;
- Open Graph képet.

Legyen robots.txt és csak publikus tartalmat felsoroló sitemap. Külön megosztás gomb nincs.

## 17. Seed és lokális környezet

### 17.1 Scraper

Egy agent futtatja a scraper folyamatot. Az eredmény előre kinyert, gitignore-olt JSON.

A minta tartalma:

- 50 videó;
- a hozzájuk tartozó események és címkék;
- cím, leírás, zene, dátumok, MP4 URL és thumbnail URL;
- stábszerepek és kapcsolatok;
- következetes álnevekre cserélt személyek.

Profilbemutatkozás, email és médiafájl nem kerül a JSON-ba. A scrapernek kifejezett üzemeltetői engedélye van a robots.txt crawl delay figyelmen kívül hagyására.

Futtatási szabályok:

- legfeljebb öt párhuzamos kérés;
- `429` és `5xx` esetén exponenciális visszalépés;
- oldalanként legfeljebb három próbálkozás;
- megszakítás után folytatható működés.

A seedhez tartozó álneveket a lokális Authentik bootstrap tesztprofiljai képviselik.

### 17.2 Indítás

A dokumentált lokális folyamat:

1. függőségek telepítése;
2. OOB fájlok ellenőrzése;
3. PostgreSQL és Authentik indítása;
4. tiszta migrációk futtatása;
5. Authentik blueprint vagy bootstrap futtatása;
6. seed betöltése;
7. alkalmazás indítása;
8. typecheck, lint és tesztek futtatása.

A jelenlegi prototípus adatbázissémája eldobható. Új, tiszta migrációs alap készül.

## 18. Minőségi követelmények

- Magyar felület.
- Reszponzív publikus és adminoldalak.
- Mobil és asztali használat.
- Billentyűzettel kezelhető kereső és alapvető űrlapok.
- Az akadálymentesség hasznos cél, de formális WCAG megfelelés nem V0 kiadási feltétel.
- Magyar, eltérő üres, betöltési és hibaállapotok.
- Stabil, szerveroldali lapozás és rendezés.
- Typecheck és lint hibamentes.
- Tiszta adatbázison lefutó migrációk.
- Jogosultság-, állapot-, keresés- és törlésfolyamatokat lefedő integrációs tesztek.
- Belépést, videópublikálást, eseménykezelést és live prioritást lefedő végponttól végpontig tesztek.
- Külső média- és YouTube-hívások tesztben mockolva.
- A 30 napos törlés tesztelhető órával, valós várakozás nélkül.

## 19. V0-n kívüli elemek

- rating;
- kommentek;
- share és download gomb;
- IP-alapú egyedi megtekintés;
- médiafeltöltés és transzkódolás;
- az MP4-fájlok tényleges hozzáférés-védelme;
- tanfolyami űrlap, admin, export és email;
- felkéréskezelő;
- live publikus archívum és automatikus replay-videó;
- a régi oldal teljes migrációja;
- régi Drupal linkek átirányítása;
- production telepítés;
- külső UptimeRobot-konfiguráció;
- email- és mobilmezők;
- audit export és automatikus visszaállítás;
- tömeges adminműveletek.

## 20. Elfogadási forgatókönyvek

1. Névtelen látogató csak publikus videót talál és nyit meg.
2. Schönherzes felhasználó publikus és schönherzes videót lát, adminba nem léphet.
3. Tag minden láthatóságot elér, piszkozatot készít, publikál, archivál és lomtárba helyez.
4. Vezetőségi tag visszaállít videót, végleg töröl eseményt, címkét és stábszerepet kezel.
5. Hibás vagy átirányító média-URL piszkozatban menthető, de nem publikálható.
6. Egy videó egynapos eseménynél automatikus dátumot kap. Többnapos eseménynél a tartományon kívüli dátum figyelmeztetést ad.
7. Kapcsolódó videók manuális, eseményes és közöscímkés ága is működik, jogosultsági szűréssel.
8. Az esemény videószáma, videólistája és stáblistája nem szivárogtat korlátozott videót.
9. A tagprofil tevékenysége év és szerep szerint váltható, és jogosultság szerint szűrt.
10. A globális kereső nem ad ki nem látható videómetaadatot.
11. A homepage live, kiemelt és normál prioritása frissítés nélkül vált.
12. Átfedő live nem menthető, hibás YouTube live nem aktiválódik.
13. Két egyidejű szerkesztés közül az elavult mentést a szerver blokkolja.
14. A lomtár visszaállítása megőrzi a kapcsolatokat, majd archivált állapotot ad.
15. A tesztóra 30 nap után végleg törli a videó rekordját, a külső média érintése nélkül.
16. Authentik-kieséskor a publikus cache működik, új belépés nem.
17. Tiszta klón dokumentált lépésekkel elindítható az OOB csomag birtokában.
