# MultiLingua

Aplikacja do nauki języków obcych — w przeglądarce, na Androidzie i iOS.
Rozbudowany system nauki: lekcje słówek, teoria gramatyki po polsku, historyjki,
mówienie, słuchanie, odmiana czasowników, liczby, powtórki rozłożone w czasie.

**Web:** https://redzikowski.com/multilingua/ ·
**Android / iOS:** [najnowsze wydanie](https://github.com/BlackSingularities/MultiLingua/releases/latest)

## Co potrafi wersja 1.0

- **Kursy jako kompletne systemy nauki** dla pary języków (np. polski → włoski):
  słownictwo z rodzajnikami i liczbą mnogą, zdania z wariantami tłumaczeń,
  artykuły gramatyczne z tabelami i przykładami, tabele odmian, historyjki z pytaniami.
- **20 typów ćwiczeń**: karta nowego słowa, wybór tłumaczenia, obrazki, pary,
  układanie zdań z kafelków, tłumaczenie pisane, luka (wybór i wpisywanie),
  „co słyszysz?”, dyktando, mówienie z rozpoznawaniem mowy, odmiana, rodzajnik,
  ocena tłumaczenia, „znajdź błąd”, literowanie, liczby ze słuchu i słownie,
  pytania do teorii, czytanie historyjki, układanie dialogu.
- **Inteligentny dobór ćwiczeń**: każde słówko i zdanie ma własny model pamięci
  (w duchu FSRS). Słabo znane elementy dostają ćwiczenia rozpoznawania, dobrze znane —
  samodzielnej produkcji. Słabsze umiejętności (np. słuchanie) dostają więcej ćwiczeń.
  Błędy wracają na koniec sesji i trafiają do treningu „Popraw błędy”.
- **Sprawdzanie odpowiedzi** odporne na literówki, brak akcentów i pominięty zaimek
  (języki pro-drop), z podświetleniem różnic i opcją „moja odpowiedź też była poprawna”.
- **Teoria małymi krokami, od razu z praktyką**: artykuł gramatyczny dzieli się na kroki
  (nagłówki `###`), a po każdym kroku przychodzą ćwiczenia z form, które ten krok wyróżnia.
  Lekcje słówek wplatają krótkie wskazówki z teorii tuż przed słowami, których dotyczą.
  Każdą lekcję można zrobić w trybie „teoria i ćwiczenia”, „tylko ćwiczenia” albo przeczytać samą teorię.
- **Pytamy tylko o to, co było w materiale**: pytania i ćwiczenia trafiają za krok teorii, którego dotyczą,
  i używają wyłącznie słów już poznanych. Pilnuje tego test treści (`tests/coverage.test.ts`)
  i walidacja w panelu administratora.
- **Ścieżka nauki** jako trasa z przystankami: plan lekcji przed startem, sprawdzian jednostki,
  „przeskocz tutaj testem”.
- **Ilustracje słówek**: każde słowo ma swoją „tablicę” z miejscem na grafikę SVG
  (zasady: [content/IMAGES.md](content/IMAGES.md)); do czasu jej dodania — emoji albo inicjał.
- **Panel administratora** (tylko web): edycja treści, generowanie rozdziałów przez AI (OpenRouter,
  wybór modelu), ilustracje.
- **Statystyki i motywacja**: XP, dzienny cel, seria dni, mapa aktywności,
  trafność według umiejętności, odznaki.
- **Offline**: kurs pobiera się raz z serwera i działa bez sieci; aktualizacje treści
  przychodzą same.
- **Bez konta**: postępy tylko na urządzeniu (IndexedDB), z eksportem i importem kopii.

## Architektura

```
content/courses/<para>/          treść kursu (YAML) — źródło prawdy
  course.yaml                    języki, reguły (zaimki, rodzajniki, znaki specjalne)
  units/NN-*.yaml                jednostki: słówka, zdania, gramatyka, odmiany, historyjki
  images/<klucz>.svg             ilustracje słówek (opcjonalne)
scripts/content-lib.ts           YAML → walidacja → plan lekcji (+ sprawdzanie SVG)
scripts/content-db.ts            kursy → data/content.db (SQLite + FTS5), używane też przez serwer
server/app.ts                    Fastify: API treści + statyczna aplikacja webowa
server/admin.ts, server/ai.ts    panel administratora i generowanie treści przez OpenRouter
src/engine/                      silnik nauki: sprawdzanie odpowiedzi, SRS, generator sesji,
                                 teoria w krokach (theory.ts)
src/admin/                       interfejs panelu (ładowany osobno, tylko web)
src/data/                        IndexedDB (postępy), klient API, stan aplikacji
src/exercises/                   komponenty 20 typów ćwiczeń
src/screens/                     ekrany aplikacji
android/, ios/                   projekty natywne (Capacitor 8)
```

Ta sama baza treści na serwerze zasila wersję webową i aplikacje mobilne
(`GET /api/courses`, `GET /api/courses/:id/pack` z ETag i kompresją brotli/gzip,
`GET /api/courses/:id/search` — wyszukiwanie pełnotekstowe bez akcentów).
Dane użytkowników **nie** trafiają na serwer.

## Panel administratora

Adres: `#/admin` w wersji webowej (link także w Ustawieniach). W aplikacjach mobilnych panelu nie ma.

1. Przy pierwszym uruchomieniu serwer wypisuje w logu **kod startowy** (albo użyje zmiennej
   `ADMIN_SETUP_CODE`, min. 8 znaków). Wpisz go w panelu i ustaw hasło (min. 10 znaków).
2. **Model AI**: wklej klucz OpenRouter (albo ustaw `OPENROUTER_API_KEY`) i wybierz model z listy.
3. **Nowy rozdział**: opisz temat — model dostaje reguły kursu, wszystko, co uczeń już zna, i wzorcowy
   plik, a zwraca szkic rozdziału. Szkic trafia do edytora; zapisujesz go po przejrzeniu.
4. **Rozdziały**: edycja każdego pliku (także `course.yaml`) z walidacją; zapis przebudowuje kurs bez
   restartu serwera, a aplikacje pobierają nową treść same. Polecenia „popraw z AI” działają na otwartym pliku.
5. **Ilustracje**: wgrywanie SVG dla słów i lista brakujących.

W kontenerze treść edytowana w panelu leży na wolumenie `/app/var` (razem z bazą i kontem administratora).
Nowa treść z repozytorium jest wgrywana przy wdrożeniu, chyba że w panelu są lokalne zmiany — wtedy panel
o tym informuje, a zmiany pobierzesz eksportem (zakładka **Konto**) i dołączysz do repozytorium.

| zmienna | znaczenie |
|---|---|
| `ADMIN_SETUP_CODE` | stały kod startowy panelu (inaczej losowy, w logu) |
| `OPENROUTER_API_KEY` | klucz OpenRouter (ma pierwszeństwo przed zapisanym w panelu) |
| `OPENROUTER_MODEL` | domyślny model, gdy nie wybrano innego w panelu |
| `ADMIN_DISABLED=1` | wyłącza panel |
| `CONTENT_DIR`, `DATA_DIR`, `CONTENT_DB` | katalog kursów, dane serwera, plik bazy |

## Jak dodać nowy kurs (nową parę języków)

Kolejne rozdziały istniejącego kursu najwygodniej dodawać w panelu administratora. Nowa para języków:

1. Utwórz `content/courses/pl-xx/course.yaml` (wzór: `pl-it`). Ustaw reguły języka:
   `dropPronouns`, `persons`, `articles`, `specialChars`, `elisions`.
2. Dodaj jednostki `units/01-*.yaml`: `vocab`, `sentences`, `grammar`, `conjugations`, `stories`.
3. `npm run content` — kompilator sprawdzi poprawność i sam rozplanuje lekcje.
4. `npm test` — testy wygenerują ćwiczenia dla każdej lekcji i sprawdzą, czy da się je rozwiązać.
5. Push na `main` — serwer zaktualizuje treść, aplikacje pobiorą ją przy następnym uruchomieniu.

Dla liczebników w nowym języku dopisz regułę w `src/engine/numbers.ts`.

## Rozwój

```bash
npm install
npm run content        # zbuduj bazę treści
npm run dev:server     # API na :8787 (kod startowy panelu pojawi się w logu)
npm run dev            # aplikacja na :5173 (proxy /api → :8787)
npm run check          # treść + typy + testy + build
```

## Wydania

Wersja aplikacji jest w `package.json`. Podniesienie wersji na `main`
(np. `npm version minor && git push --follow-tags`) uruchamia workflow **Release**:
testy → podpisany APK (Android) + niepodpisany IPA (iOS) → wydanie `v<wersja>` na GitHubie
z opisem z `CHANGELOG.md`. Każdy wypchnięty tag `vX.Y.Z` wdraża też wersję webową na serwer.

Sekrety repozytorium: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS` (podpis APK), `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` (wdrożenie)
oraz zmienne `DEPLOY_HOST`, `DEPLOY_USER`.

## Licencja

MIT
