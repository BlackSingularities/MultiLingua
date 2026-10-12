# Zmiany

## [Nieopublikowane]

### Nauka
- **Pytania tylko o to, co było w materiale.** Każde pytanie i ćwiczenie jest przypinane do kroku teorii,
  którego dotyczy, i pojawia się dopiero, gdy uczeń zobaczył wszystkie potrzebne słowa i formy
  (np. pytanie o formę grzecznościową — zaraz po kroku „Forma grzecznościowa”). Odpowiedzi do wyboru
  i kafelki składają się ze słów już poznanych.
- Planer ścieżki układa lekcje słówek tak, by przed każdą teorią uczeń znał słowa z jej przykładów
  i pytań; jednostki idą rytmem słówka → teoria → słówka → teoria.
- Test treści i walidacja w panelu zgłaszają pytania, przykłady i zdania wychodzące poza materiał;
  treść kursu poprawiona (nowe słówka: nipote, formaggio, venti, treno, capire, fino a).
- Historyjki przepisane na słowa i formy poznane do tego miejsca kursu (pytania dopasowane do dialogów);
  przykłady na kartach słów i w teorii też tylko z poznanych słów. Test treści obejmuje teraz historyjki.
- **Sprawdzanie od razu po wyborze**: w ćwiczeniach z wyborem dotknięcie odpowiedzi ją ocenia,
  a po poprawnej aplikacja sama przechodzi dalej (można wyłączyć w ustawieniach).
- W treningach „Mówienie” i „Słuchanie” nie ma już przycisków „nie mogę teraz mówić/słuchać”.
- **Teoria przeplatana z praktyką.** Artykuły gramatyczne są dzielone na krótkie kroki; po każdym
  kroku od razu przychodzą ćwiczenia z form, o których była mowa („Zaraz przećwiczysz: …”).
- W lekcjach słówek pojawiają się krótkie wskazówki z teorii tuż przed słowami, których dotyczą.
- Przed lekcją arkusz z planem: nowe słowa, kroki teorii i wybór trybu — **teoria i ćwiczenia**,
  **tylko ćwiczenia** albo **tylko teoria**.
- Ekran wyniku pokazuje słowa poznane w lekcji.

### Wygląd
- Teoria w nowym układzie: zestawy zwrotów jako słowniczek z wymową (dotknij słowa w języku kursu),
  kompaktowe tabele odmian, wskazówki „Uwaga/Wskazówka”, przykłady w siatce, rozwijany „cały temat”
  w kroku lekcji; ekran teorii podzielony na kroki ze spisem treści i formami do odsłuchania.
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
