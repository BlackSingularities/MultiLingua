# Zmiany

## [Nieopublikowane]

### Nauka
- **Teoria przeplatana z praktyką.** Artykuły gramatyczne są dzielone na krótkie kroki; po każdym
  kroku od razu przychodzą ćwiczenia z form, o których była mowa („Zaraz przećwiczysz: …”).
- W lekcjach słówek pojawiają się krótkie wskazówki z teorii tuż przed słowami, których dotyczą.
- Przed lekcją arkusz z planem: nowe słowa, kroki teorii i wybór trybu — **teoria i ćwiczenia**,
  **tylko ćwiczenia** albo **tylko teoria**.
- Ekran wyniku pokazuje słowa poznane w lekcji.

### Wygląd
- Nowy styl „leksykonu podróżnego”: szeryfowa Literata dla słów i nagłówków, przyciski w kolorze
  atramentu, zakreślacz dla tego, co ćwiczysz.
- Ścieżka nauki jako trasa z przystankami, karta „następny przystanek” z podglądem słów lekcji,
  panel dnia i słowo dnia.
- Telefon: pływający dok nawigacji, arkusze wysuwane od dołu. Komputer: trzy kolumny na szerokim ekranie.
- Słownik z widokiem tablic (siatka z ilustracjami) i listy oraz kartą szczegółów słowa.

### Ilustracje słówek
- Każde słowo ma miejsce na ilustrację SVG (`content/courses/<kurs>/images/<klucz>.svg`, zasady w
  `content/IMAGES.md`). Do czasu dodania obrazka tablica pokazuje emoji albo inicjał.
- Ilustracje są sprawdzane przy kompilacji, pobierane osobną paczką i działają offline.

### Panel administratora (tylko web, `#/admin`)
- Pierwsze konto zakłada się kodem startowym z logu serwera; potem logowanie hasłem.
- Edycja każdego pliku kursu z walidacją, spisem treści i przebudową kursu bez restartu serwera.
- Generowanie nowych rozdziałów i poprawki przez AI (OpenRouter) z wyborem modelu;
  model dostaje to, co uczeń już zna, i pisze teorię w krokach.
- Wgrywanie ilustracji SVG, lista brakujących, eksport treści.

## [1.0.0] — 2026-10-13

Pierwsze wydanie MultiLingua.

- Kurs **włoskiego** dla Polaków (A1–A2): jednostki od powitań do czasu przeszłego,
  teoria gramatyki po polsku, historyjki, tabele odmian.
- 20 typów ćwiczeń, w tym mówienie z rozpoznawaniem mowy, dyktanda, układanie zdań,
  szukanie błędów i liczby ze słuchu.
- Powtórki rozłożone w czasie i adaptacyjny dobór ćwiczeń do poziomu i słabszych umiejętności.
- Treningi: powtórka, popraw błędy, mówienie, słuchanie, odmiana, liczby, szybka runda.
- Statystyki, seria dni, dzienny cel, odznaki, mapa aktywności.
- Działanie offline, eksport i import postępów, motyw jasny i ciemny.
- Aplikacja webowa (PWA), Android (APK) i iOS (niepodpisany IPA).
