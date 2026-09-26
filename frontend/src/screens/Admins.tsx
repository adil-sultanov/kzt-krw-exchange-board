import { useCallback, useEffect, useState } from "react";
import { api, errorCode } from "../api";
import { displayName, Person } from "../components/AdminPerson";
import { ErrorBox, Section, SkeletonList, TitleWithRefresh } from "../components/ui";
import { t } from "../i18n";
import { useReactivated } from "../nav";
import { confirm, haptic, useMainButton } from "../telegram";
import type { AdminEntry } from "../types";

// Telegram usernames: 4–32 letters, digits and underscores.
const USERNAME = /^@?[A-Za-z0-9_]{4,32}$/;

/** The owner adds admins by username and removes the ones they added. */
export function Admins(props: { active: boolean }) {
  const [admins, setAdmins] = useState<AdminEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setAdmins(await api.admins());
    } catch (e) {
      setError(errorCode(e));
    }
  }, []);
  useEffect(() => void load(), [load]);
  useReactivated(props.active, () => void load());

  const act = async (action: () => Promise<unknown>) => {
    if (busy) return false;
    setBusy(true);
    setActionError(null);
    try {
      await action();
      haptic("success");
      return true;
    } catch (e) {
      haptic("error");
      setActionError(errorCode(e));
      return false;
    } finally {
      setBusy(false);
      void load();
    }
  };

  const trimmed = username.trim();
  const valid = USERNAME.test(trimmed);
  const add = async () => {
    if (!valid) return;
    if (await act(() => api.addAdmin(trimmed))) setUsername("");
  };
  useMainButton(props.active && (trimmed || busy) ? { text: t.admins.add, onClick: add, loading: busy } : null);

  const remove = async (admin: AdminEntry) => {
    if (!(await confirm(t.admins.removeConfirm(displayName(admin))))) return;
    void act(() => api.removeAdmin(admin.telegram_id));
  };

  return (
    <div className="screen">
      <TitleWithRefresh title={t.admins.title} onRefresh={load} />
      <Section title={t.admins.addTitle}>
        <label className="field">
          <span className="field-label">{t.admins.username}</span>
          <input
            className={trimmed && !valid ? "input invalid" : "input"}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={33}
            placeholder={t.admins.usernamePlaceholder}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void add();
            }}
          />
        </label>
        <p className="hint small">{t.admins.addHint}</p>
      </Section>
      {actionError && <ErrorBox code={actionError} />}
      {error ? (
        <ErrorBox code={error} onRetry={() => void load()} />
      ) : !admins ? (
        <SkeletonList />
      ) : (
        <div className="list">
          {admins.map((admin) => (
            <div key={admin.telegram_id} className="card">
              <Person user={admin} role={t.admins.source[admin.source]} />
              {admin.source === "granted" && (
                <button
                  type="button"
                  className="secondary-button destructive"
                  disabled={busy}
                  onClick={() => void remove(admin)}
                >
                  {t.admins.remove}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
