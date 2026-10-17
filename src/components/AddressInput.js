"use client";

import { useEffect, useId, useRef, useState } from "react";

// A street address field with Google suggestions as you type (via /api/places).
// It's a normal text input underneath: typing still calls onChange, and if suggestions are
// off (no API key) or Google is down, it simply works as plain text.
//   value, onChange(text)          the field's text
//   onSelect(address)              when a suggestion is picked:
//                                  { line, unit, street_number, street, city, province, postal_code, formatted }
//   fill = "line" | "formatted"    what goes into the field on pick (default "line": "1234 Ouellette Ave")
export default function AddressInput({
  id,
  value,
  onChange,
  onSelect,
  fill = "line",
  placeholder,
  required,
  className,
  ...rest
}) {
  const auto = useId();
  const listId = `${id || auto}-list`;
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [off, setOff] = useState(false);
  const session = useRef("");
  const timer = useRef(null);
  const typed = useRef(false);
  const box = useRef(null);

  const newSession = () => {
    session.current =
      typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
  };

  useEffect(() => {
    if (off || !typed.current) return undefined;
    const q = String(value || "").trim();
    clearTimeout(timer.current);
    if (q.length < 3) {
      setItems([]);
      return undefined;
    }
    if (!session.current) newSession();
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(q)}&session=${session.current}`);
        const data = await res.json();
        if (data.disabled) {
          setOff(true);
          return;
        }
        setItems(data.suggestions || []);
        setActive(-1);
        setOpen(true);
      } catch {
        setItems([]);
      }
    }, 250);
    return () => clearTimeout(timer.current);
  }, [value, off]);

  useEffect(() => {
    const close = (e) => {
      if (box.current && !box.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  async function pick(item) {
    setOpen(false);
    setItems([]);
    typed.current = false;
    onChange?.(fill === "formatted" ? [item.main, item.secondary].filter(Boolean).join(", ") : item.main);
    try {
      const res = await fetch(`/api/places?id=${encodeURIComponent(item.id)}&session=${session.current}`);
      const data = await res.json();
      if (data.address) {
        const a = data.address;
        onChange?.(fill === "formatted" ? a.formatted || item.main : a.line || item.main);
        onSelect?.(a);
      }
    } catch {
      // keep what we have
    }
    session.current = ""; // a Google "session" ends with the pick
  }

  function onKeyDown(e) {
    if (!open || !items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && items.length > 0;
  return (
    <div className="addr-auto" ref={box}>
      <input
        {...rest}
        id={id}
        className={className}
        value={value}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          typed.current = true;
          onChange?.(e.target.value);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => items.length && setOpen(true)}
      />
      {showList ? (
        <ul className="addr-auto-list" id={listId} role="listbox">
          {items.map((it, i) => (
            <li
              key={it.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? "on" : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(it);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="addr-main">{it.main}</span>
              {it.secondary ? <span className="addr-sub">{it.secondary}</span> : null}
            </li>
          ))}
          <li className="addr-credit" role="presentation">
            Powered by Google
          </li>
        </ul>
      ) : null}
    </div>
  );
}
