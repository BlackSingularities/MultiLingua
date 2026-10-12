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
- **Ścieżka nauki** jak strony paszportu: lekcje-stemple, sprawdzian jednostki,
  „przeskocz tutaj testem”.
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
scripts/build-content.ts         YAML → walidacja → plan lekcji → data/content.db (SQLite + FTS5)
server/                          Fastify: API treści + statyczna aplikacja webowa
src/engine/                      silnik nauki: sprawdzanie odpowiedzi, SRS, generator sesji
src/data/                        IndexedDB (postępy), klient API, stan aplikacji
src/exercises/                   komponenty 20 typów ćwiczeń
src/screens/                     ekrany aplikacji
android/, ios/                   projekty natywne (Capacitor 8)
```

Ta sama baza treści na serwerze zasila wersję webową i aplikacje mobilne
(`GET /api/courses`, `GET /api/courses/:id/pack` z ETag i kompresją brotli/gzip,
`GET /api/courses/:id/search` — wyszukiwanie pełnotekstowe bez akcentów).
Dane użytkowników **nie** trafiają na serwer.

## Jak dodać nowy kurs (nową parę języków)

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
npm run dev:server     # API na :8787
npm run dev            # aplikacja na :5173 (proxy /api → :8787)
npm run check          # treść + typy + testy + build
```

## Wydania

Wersja aplikacji jest w `package.json`. Podniesienie wersji na `main`
(np. `npm version minor && git push --follow-tags`) uruchamia workflow **Release**:
testy → podpisany APK (Android) + niepodpisany IPA (iOS) → wydanie `v<wersja>` na GitHubie
z opisem z `CHANGELOG.md`. Każdy push na `main` wdraża też wersję webową na serwer.

Sekrety repozytorium: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS` (podpis APK), `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` (wdrożenie)
oraz zmienne `DEPLOY_HOST`, `DEPLOY_USER`.

## Licencja

MIT
