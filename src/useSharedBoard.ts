import { useCallback, useEffect, useRef, useState } from "react";
import { NOT_CONFIGURED, type SharedBoardRepository } from "./storage";
import type { Snapshot } from "./model";
const EMPTY: Snapshot = {
  items: [],
  lights: [1, 2, 3].map((id) => ({ id, on: false, revision: 0 })),
  userId: "",
  canUndo: false,
};
export function useSharedBoard(repository: SharedBoardRepository | null) {
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(repository ? "" : NOT_CONFIGURED);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    setReady(false);
    if (!repository) {
      setError(NOT_CONFIGURED);
      return;
    }
    return repository.connect(
      (value) => {
        setSnapshot(value);
        setReady(true);
        setError("");
      },
      (message) => {
        setReady(false);
        setError(message);
      },
    );
  }, [repository, retry]);
  const run = useCallback(
    async (operation: (repository: SharedBoardRepository) => Promise<void>) => {
      if (!repository || !ready || pending.current) return false;
      pending.current = true;
      setBusy(true);
      setError("");
      try {
        await operation(repository);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "儲存失敗，請重試。");
        return false;
      } finally {
        pending.current = false;
        setBusy(false);
      }
    },
    [repository, ready],
  );
  return {
    snapshot,
    ready,
    busy,
    error,
    run,
    reconnect: () => setRetry((value) => value + 1),
  };
}
