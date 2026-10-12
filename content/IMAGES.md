# Ilustracje słówek (SVG)

Każde słowo w kursie może mieć własną ilustrację. Aplikacja pokazuje ją na „tablicy”
(kwadrat z jasnym, kropkowanym tłem) w karcie nowego słowa, w ćwiczeniu z obrazkami,
w słowniku, w podglądzie lekcji i na ekranie wyniku. Dopóki ilustracji nie ma, tablica
pokazuje emoji ze słownika albo inicjał słowa — nic się nie psuje.

## Gdzie leżą pliki

```
content/courses/<kurs>/images/<klucz>.svg
```

Klucz to identyfikator słówka bez przedrostka `v-`. Dla większości słów to po prostu
samo słowo w uproszczonej pisowni (`ciao.svg`, `buongiorno.svg`, `per-favore.svg`).
Dokładne nazwy podaje panel administratora (zakładka **Ilustracje** → **Lista brakujących**).

Kilka słów może dzielić jedną ilustrację — w YAML słówka wpisz `img: nazwa-pliku`:

```yaml
- {t: amico, n: przyjaciel, pos: noun, g: m, art: "l'", img: przyjaciele}
- {t: amica, n: przyjaciółka, pos: noun, g: f, art: "l'", img: przyjaciele}
```

## Zasady rysowania

- **Format:** jeden element `<svg>` z atrybutem `viewBox`, najlepiej `viewBox="0 0 160 160"`.
  Bez stałych `width`/`height` — tablica sama skaluje grafikę.
- **Tło przezroczyste.** Tablica ma własny jasny papier (także w trybie ciemnym), więc rysunek
  ma wyglądać dobrze na `#f7f8fb`.
- **Margines:** zostaw ok. 10% pustego miejsca przy krawędziach — aplikacja zmniejsza grafikę do 88% tablicy.
- **Styl:** prosty, płaski rysunek przedmiotu lub sytuacji, czytelny w rozmiarze 40 px.
  Spójna paleta w całym kursie, grube kontury (4–6 jednostek przy viewBox 160) albo same plamy koloru.
  Bez tekstu i liter w grafice — ilustracja nie może podpowiadać pisowni słowa.
- **Rozmiar:** do 64 KiB (zwykle wystarczy 1–5 KiB). Upraszczaj ścieżki.
- **Bezpieczeństwo:** kompilator odrzuca pliki ze skryptami, atrybutami zdarzeń (`on…`),
  `foreignObject`, `<image>` i odwołaniami do zewnętrznych adresów. Gradienty i `<use>` wolno
  stosować tylko z odwołaniem do elementu w tym samym pliku (`href="#id"`, `url(#id)`).

## Jak dodać

- **Panel administratora** (web): zakładka **Ilustracje** → kliknij słowo → wybierz plik albo wklej kod →
  **Zapisz ilustrację**. Serwer sprawdzi plik, przebuduje kurs, a aplikacje pobiorą nowe obrazki.
- **Repozytorium:** wrzuć plik do `images/`, uruchom `npm run content` — kompilator sprawdzi go
  i wypisze, ile słów ma już ilustracje. Pliki bez pasującego słowa są zgłaszane jako ostrzeżenia.

Ilustracje trafiają do osobnej paczki (`GET /api/courses/<kurs>/images`), którą aplikacja
zapisuje na urządzeniu — działają też offline.
