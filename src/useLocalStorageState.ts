import { useEffect, useState } from "react";
import type { PersistedState } from "./types";

const STORAGE_KEY = "velora";

export function useLocalStorageState(initial: PersistedState) {
    const [state, setState] = useState<PersistedState>(() => {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : initial;
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }, [state]);

    return [state, setState] as const;
}
