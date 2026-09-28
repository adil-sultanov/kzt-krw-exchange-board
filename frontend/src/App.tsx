import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api, errorCode } from "./api";
import { ErrorBox, Footer, Loading } from "./components/ui";
import { t } from "./i18n";
import { MeContext, SetMeContext } from "./me";
import { initialStack, type Nav, NavContext, type Route } from "./nav";
import { About } from "./screens/About";
import { Admin } from "./screens/Admin";
import { Admins } from "./screens/Admins";
import { AllDeals } from "./screens/AllDeals";
import { Board } from "./screens/Board";
import { BoardRequests } from "./screens/BoardRequests";
import { Created } from "./screens/Created";
import { DealScreen } from "./screens/Deal";
import { MyDeals } from "./screens/MyDeals";
import { NewRequest } from "./screens/NewRequest";
import { Profile } from "./screens/Profile";
import { Report } from "./screens/Report";
import { RequestDetail } from "./screens/RequestDetail";
import { insideTelegram, startParam, useBackButton } from "./telegram";
import type { Me } from "./types";

function Screen(props: { route: Route; active: boolean }) {
  const { route, active } = props;
  switch (route.name) {
    case "board":
      return <Board active={active} />;
    case "new":
      return <NewRequest active={active} prefill={route.prefill} />;
    case "edit":
      return <NewRequest active={active} edit={route.request} />;
    case "created":
      return <Created active={active} result={route.result} />;
    case "request":
      return <RequestDetail id={route.id} active={active} />;
    case "deal":
      return <DealScreen id={route.id} active={active} />;
    case "deals":
      return <MyDeals active={active} />;
    case "profile":
      return <Profile active={active} />;
    case "report":
      return <Report target={route.target} active={active} />;
    case "about":
      return <About active={active} />;
    case "admin":
      return <Admin active={active} />;
    case "boardRequests":
      return <BoardRequests active={active} />;
    case "admins":
      return <Admins active={active} />;
    case "allDeals":
      return <AllDeals active={active} />;
  }
}

export function App() {
  if (!insideTelegram) {
    return (
      <div className="screen">
        <h1 className="title">{t.openInTelegram.title}</h1>
        <p className="hint">{t.openInTelegram.body}</p>
      </div>
    );
  }
  return <SignedIn />;
}

function SignedIn() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Also refreshes the cached username on the server.
  const loadMe = useCallback(() => {
    setError(null);
    api.me().then(setMe, (e: unknown) => setError(errorCode(e)));
  }, []);
  useEffect(loadMe, [loadMe]);

  if (error) return <div className="screen"><ErrorBox code={error} onRetry={loadMe} /></div>;
  if (!me) return <div className="screen"><Loading /></div>;
  return (
    <MeContext.Provider value={me}>
      <SetMeContext.Provider value={setMe}>
        <Navigator />
      </SetMeContext.Provider>
    </MeContext.Provider>
  );
}

/** Keeps every screen in the stack mounted (so the Board keeps its filters) but shows only the top. */
function Navigator() {
  const [stack, setStack] = useState<Route[]>(() => initialStack(startParam()));
  const scrollPositions = useRef<number[]>([]);
  const pendingScroll = useRef<number | null>(null);

  const nav = useMemo<Nav>(() => {
    const go = (next: (stack: Route[]) => Route[], scrollTo: (stack: Route[]) => number) => {
      setStack((current) => {
        scrollPositions.current[current.length - 1] = window.scrollY;
        pendingScroll.current = scrollTo(current);
        return next(current);
      });
    };
    return {
      push: (route) => go((s) => [...s, route], () => 0),
      replace: (route) => go((s) => [...s.slice(0, -1), route], () => 0),
      pop: () => go((s) => (s.length > 1 ? s.slice(0, -1) : s), (s) => scrollPositions.current[s.length - 2] ?? 0),
      home: () => go((s) => s.slice(0, 1), () => scrollPositions.current[0] ?? 0),
    };
  }, []);

  useLayoutEffect(() => {
    if (pendingScroll.current !== null) {
      window.scrollTo(0, pendingScroll.current);
      pendingScroll.current = null;
    }
  }, [stack]);

  useBackButton(stack.length > 1 ? nav.pop : null);

  return (
    <NavContext.Provider value={nav}>
      {stack.map((route, index) => {
        const active = index === stack.length - 1;
        return (
          <div key={`${index}-${route.name}`} hidden={!active}>
            <Screen route={route} active={active} />
          </div>
        );
      })}
      <Footer />
    </NavContext.Provider>
  );
}
