import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useApp } from './data/store.ts';
import { setupNative, syncStatusBar } from './platform/native.ts';
import { Shell } from './components/Shell.tsx';
import { Spinner, Toasts } from './components/ui.tsx';
import { Home } from './screens/Home.tsx';
import { Courses } from './screens/Courses.tsx';
import { SessionScreen } from './screens/Session.tsx';
import { Practice } from './screens/Practice.tsx';
import { GrammarList, GrammarArticleScreen } from './screens/Grammar.tsx';
import { Vocabulary } from './screens/Vocabulary.tsx';
import { Stories } from './screens/Stories.tsx';
import { Conjugations } from './screens/Conjugations.tsx';
import { Profile } from './screens/Profile.tsx';
import { SettingsScreen } from './screens/Settings.tsx';

// Panel administratora ładuje się osobno — uczniowie nie pobierają jego kodu.
const AdminScreen = lazy(() => import('./admin/AdminScreen.tsx'));

function useTheme() {
  const theme = useApp((s) => s.settings.theme);
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      if (theme === 'system') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', theme);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d1022' : '#eef0f5');
      void syncStatusBar(dark);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

function NativeBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    // Rejestrujemy raz — ścieżkę czytamy z adresu, bo listener żyje dłużej niż render.
    void setupNative(() => {
      const path = window.location.hash.replace(/^#/, '') || '/';
      if (path === '/') return false;
      navigate(-1);
      return true;
    });
  }, [navigate]);
  return null;
}

/** Bez wybranego kursu wszystko prowadzi do wyboru kursu. */
function RequireCourse({ children }: { children: React.ReactNode }) {
  const onboarded = useApp((s) => s.settings.onboarded);
  const active = useApp((s) => s.settings.activeCourse);
  if (!onboarded || !active) return <Navigate to="/kursy" replace />;
  return <>{children}</>;
}

export function App() {
  const ready = useApp((s) => s.ready);
  const init = useApp((s) => s.init);
  useTheme();
  useEffect(() => {
    void init();
  }, [init]);

  if (!ready) {
    return (
      <div className="boot">
        <Spinner label="Uruchamiam MultiLingua…" />
      </div>
    );
  }

  return (
    <HashRouter>
      <NativeBridge />
      <Routes>
        <Route path="/lekcja/:lessonId" element={<RequireCourse><SessionScreen /></RequireCourse>} />
        <Route path="/jednostka/:unitId/:action" element={<RequireCourse><SessionScreen /></RequireCourse>} />
        <Route path="/trening/:kind/:tableId?" element={<RequireCourse><SessionScreen /></RequireCourse>} />
        <Route path="/admin" element={<Suspense fallback={<Spinner label="Wczytuję panel…" />}><AdminScreen /></Suspense>} />
        <Route element={<Shell />}>
          <Route index element={<RequireCourse><Home /></RequireCourse>} />
          <Route path="/kursy" element={<Courses />} />
          <Route path="/cwiczenia" element={<RequireCourse><Practice /></RequireCourse>} />
          <Route path="/teoria" element={<RequireCourse><GrammarList /></RequireCourse>} />
          <Route path="/teoria/:id" element={<RequireCourse><GrammarArticleScreen /></RequireCourse>} />
          <Route path="/odmiana" element={<RequireCourse><Conjugations /></RequireCourse>} />
          <Route path="/slownik" element={<RequireCourse><Vocabulary /></RequireCourse>} />
          <Route path="/historie" element={<RequireCourse><Stories /></RequireCourse>} />
          <Route path="/profil" element={<Profile />} />
          <Route path="/ustawienia" element={<SettingsScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toasts />
    </HashRouter>
  );
}
