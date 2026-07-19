"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { LocationSuggestion } from "@/app/api/geocode/search/route";

// Controlled location field with place autocomplete. Behaves like a plain
// text input to its parent (value/onChange are the raw string), but surfaces a
// debounced dropdown of real, validated places from /api/geocode/search so the
// reader picks the *right* city/state/country instead of a free-text guess.
export function LocationInput({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  autoFocus,
  inputClassName,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  inputClassName?: string;
}) {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  // Set right after a pick so the value-change it causes doesn't re-query.
  const skipNext = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Debounced lookup as the reader types. Aborts the in-flight request when the
  // query changes so stale responses can't clobber fresh ones.
  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const q = value.trim();
    const ctrl = new AbortController();
    // All state updates live inside the debounced callback so none run
    // synchronously in the effect body (avoids cascading renders).
    const t = setTimeout(async () => {
      if (q.length < 3) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const data = (await res.json()) as { results: LocationSuggestion[] };
        setSuggestions(data.results);
        setOpen(data.results.length > 0);
        setActive(-1);
      } catch {
        // aborted or offline — leave prior suggestions untouched
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value]);

  // Close when focus/click leaves the widget entirely.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function pick(s: LocationSuggestion) {
    skipNext.current = true;
    onChange(s.label);
    setSuggestions([]);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      if (active >= 0) {
        // Selecting from the list must not also submit the surrounding form.
        e.preventDefault();
        pick(suggestions[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        id={id}
        type="text"
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        className={inputClassName}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 text-sm shadow-lg"
        >
          {loading && suggestions.length === 0 ? (
            <li className="px-3 py-2 text-xs text-neutral-500">Searching…</li>
          ) : (
            suggestions.map((s, i) => (
              <li key={s.label} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  // onMouseDown (not onClick) so the pick lands before the
                  // input's blur closes the list.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(s);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`block w-full px-3 py-1.5 text-left ${
                    i === active
                      ? "bg-[color-mix(in_srgb,var(--accent)_14%,var(--surface))] text-[var(--foreground)]"
                      : "text-neutral-700 dark:text-neutral-200"
                  }`}
                >
                  {s.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
