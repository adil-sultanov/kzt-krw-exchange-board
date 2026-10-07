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
import { CounterOffer } from "./screens/CounterOffer";
import { Created } from "./screens/Created";
import { DealScreen } from "./screens/Deal";
import { Guide } from "./screens/Guide";
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
      return <NewRequest active={active} prefill={route.prefill} buy={route.buy} />;
    case "edit":
      return <NewRequest active={active} edit={route.request} />;
    case "created":
      return <Created active={active} result={route.result} />;
    case "request":
      return <RequestDetail id={route.id} active={active} />;
    case "counter":
      return <CounterOffer active={active} request={route.request} />;
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
    case "guide":
      return <Guide />;
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

/** How the screen coming to the top slides in: from the right when opened, from the left when gone back to. */
type Motion = "forward" | "back";

/**
 * Keeps every screen in the stack mounted (so the Board keeps its filters) but shows only the
 * top. The ones underneath are hidden without `display: none`, which would replay every
 * animation inside them when they're back on top.
 */
function Navigator() {
  const [state, setState] = useState<{ stack: Route[]; motion: Motion | null }>(() => ({
    stack: initialStack(startParam()),
    motion: null,
  }));
  const { stack, motion } = state;
  const scrollPositions = useRef<number[]>([]);
  const pendingScroll = useRef<number | null>(null);

  const nav = useMemo<Nav>(() => {
    const go = (next: (stack: Route[]) => Route[], scrollTo: (stack: Route[]) => number, motion: Motion) => {
      setState((current) => {
        const stack = next(current.stack);
        // Nothing to go to (e.g. home from the Board): no replayed slide.
        if (stack.length === current.stack.length && stack.every((route, i) => route === current.stack[i])) {
          return current;
        }
        scrollPositions.current[current.stack.length - 1] = window.scrollY;
        pendingScroll.current = scrollTo(current.stack);
        return { stack, motion };
      });
    };
    return {
      push: (route) => go((s) => [...s, route], () => 0, "forward"),
      replace: (route) => go((s) => [...s.slice(0, -1), route], () => 0, "forward"),
      pop: () =>
        go((s) => (s.length > 1 ? s.slice(0, -1) : s), (s) => scrollPositions.current[s.length - 2] ?? 0, "back"),
      home: () => go((s) => s.slice(0, 1), () => scrollPositions.current[0] ?? 0, "back"),
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
      <div className="screens">
        {stack.map((route, index) => {
          const active = index === stack.length - 1;
          return (
            <div
              key={`${index}-${route.name}`}
              className={active ? `screen-view ${motion ?? ""}` : "screen-view inactive"}
              aria-hidden={!active || undefined}
              inert={!active}
            >
              <Screen route={route} active={active} />
            </div>
          );
        })}
      </div>
      <Footer />
    </NavContext.Provider>
  );
}
