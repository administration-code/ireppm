"use client";

import { Suspense, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useStaff } from "@/lib/useStaff";
import { COUNTS_EVENT, loadNavCounts } from "@/lib/admin-nav";

// Edit this array to move pages between groups. The current item is worked out from the URL;
// `count` is a key from loadNavCounts(). Muted counts show only inside the menu.
export const NAV_GROUPS = [
  { key: "dashboard", label: "Dashboard", href: "/admin" },
  { key: "workflow", label: "Staff Workflow", href: "/admin/workflow" },
  { key: "hours", label: "My Hours", href: "/admin/hours" },
  {
    key: "leasing",
    label: "Leasing",
    items: [
      { key: "listings", label: "Listings", href: "/admin/listings", count: "drafts", note: "drafts", muted: true },
      { key: "showings", label: "Showings", href: "/admin/requests?tab=showings", count: "showings", note: "new" },
      { key: "applications", label: "Applications", href: "/admin/requests?tab=applications", count: "applications", note: "new", count2: "landlordDecided", note2: "landlord decided" },
      { key: "turnovers", label: "Turnovers", href: "/admin/turnovers", count: "openTurnovers", note: "open", muted: true },
    ],
  },
  {
    key: "tenants",
    label: "Tenants",
    items: [
      { key: "manage-tenants", label: "Manage Tenants", href: "/admin/tenants" },
      { key: "rent", label: "Rent", href: "/admin/rent", count: "unmatchedPayments", note: "to match" },
      { key: "draw", label: "Paid by 7th & Draw", href: "/admin/rent/draw" },
      { key: "payprop-letters", label: "PayProp Letters", href: "/admin/payprop-letters" },
      { key: "maintenance", label: "Maintenance", href: "/admin/maintenance", count: "maintenanceNew", note: "new" },
      { key: "notices", label: "Notices", href: "/admin/notices", count: "earlyMoveOuts", note: "early move-out" },
      { key: "signatures", label: "Signatures", href: "/admin/signatures", count: "awaitingSignatures", note: "awaiting signature" },
      { key: "insurance", label: "Tenant Insurance", href: "/admin/insurance", count: "insuranceToReview", note: "to review" },
    ],
  },
  {
    key: "landlords",
    label: "Landlords",
    items: [
      { key: "properties", label: "Properties", href: "/admin/properties" },
      { key: "owners", label: "Owners", href: "/admin/owners" },
      { key: "invites", label: "Portal Invitations", href: "/admin/invites" },
      { key: "work-orders", label: "Work Orders", href: "/admin/work-orders" },
      { key: "payouts", label: "Landlord Payouts", href: "/admin/payouts" },
      { key: "letters", label: "Landlord Letters", href: "/admin/letters" },
      { key: "inquiries", label: "New Landlord Inquiries", href: "/admin/requests?tab=inquiries", count: "inquiries", note: "new" },
      { key: "referrals", label: "Referrals", href: "/admin/referrals" },
    ],
  },
  {
    key: "accounting",
    label: "Accounting",
    items: [
      { key: "reconciliation", label: "Reconciliation", href: "/admin/accounting", count: "unmatchedBankLines", note: "bank lines to match" },
      { key: "bank-imports", label: "Bank Imports", href: "/admin/accounting/import" },
      { key: "year-end", label: "Year End", href: "/admin/accounting/year" },
      { key: "landlord-year-end", label: "Landlord Year-End", href: "/admin/accounting/landlords" },
      { key: "commissions", label: "Commissions & Loans", href: "/admin/accounting/commissions" },
      { key: "dividends", label: "Dividends & T5", href: "/admin/accounting/dividends" },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    items: [
      { key: "partners", label: "Partners", href: "/admin/partners" },
      { key: "rates", label: "Add-Ons & Rates", href: "/admin/rates" },
      { key: "privacy-breaches", label: "Privacy Breach Record", href: "/admin/privacy-breaches" },
    ],
  },
];

const CLOSE_DELAY_MS = 150;

function Count({ value, note, muted }) {
  if (!value) return null;
  return (
    <span className={muted ? "tab-count muted" : "tab-count"}>
      {value}
      <span className="visually-hidden"> {note}</span>
    </span>
  );
}

function groupTotal(group, c) {
  return (group.items || []).reduce((sum, i) => (i.count && !i.muted ? sum + (Number(c[i.count]) || 0) : sum), 0);
}

function groupOf(active) {
  return NAV_GROUPS.find((g) => g.key === active || g.items?.some((i) => i.key === active));
}

function currentLabel(active) {
  for (const g of NAV_GROUPS) {
    if (g.key === active) return g.label;
    const item = g.items?.find((i) => i.key === active);
    if (item) return item.label;
  }
  return "Staff";
}

function ItemLink({ item, active, c, onNavigate }) {
  const isCurrent = item.key === active;
  return (
    <Link
      href={item.href}
      scroll={item.href.includes("?tab=") ? false : undefined}
      aria-current={isCurrent ? "page" : undefined}
      className="staff-nav-item"
      onClick={onNavigate}
    >
      <span>{item.label}</span>
      {item.count ? <Count value={c[item.count]} note={item.note} muted={item.muted} /> : null}
      {item.count2 && c[item.count2] ? (
        <span className="tab-count decided" title={`${c[item.count2]} ${item.note2}`}>
          {c[item.count2]}
          <span className="visually-hidden"> {item.note2}</span>
        </span>
      ) : null}
    </Link>
  );
}

function focusItem(panel, index) {
  const links = panel ? [...panel.querySelectorAll("a")] : [];
  if (!links.length) return;
  links[(index + links.length) % links.length].focus();
}

function Group({ group, active, c, open, onOpen, onClose }) {
  const id = useId();
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const timer = useRef(null);
  const hoverOpened = useRef(false);
  const total = groupTotal(group, c);
  const isActive = groupOf(active)?.key === group.key;

  useEffect(() => () => clearTimeout(timer.current), []);

  function openByHover(e) {
    if (e.pointerType !== "mouse") return;
    clearTimeout(timer.current);
    if (!open) {
      hoverOpened.current = true;
      onOpen(group.key);
    }
  }

  function closeByHover(e) {
    if (e.pointerType !== "mouse") return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onClose(group.key), CLOSE_DELAY_MS);
  }

  function toggle() {
    if (open && !hoverOpened.current) onClose(group.key);
    else onOpen(group.key);
    hoverOpened.current = false;
  }

  function onButtonKey(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      onOpen(group.key);
      requestAnimationFrame(() => focusItem(panelRef.current, 0));
    } else if (e.key === "ArrowUp" && open) {
      e.preventDefault();
      focusItem(panelRef.current, -1);
    } else if (e.key === "Escape" && open) {
      onClose(group.key);
    }
  }

  function onPanelKey(e) {
    const links = [...panelRef.current.querySelectorAll("a")];
    const at = links.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItem(panelRef.current, at + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusItem(panelRef.current, at - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusItem(panelRef.current, 0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusItem(panelRef.current, -1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose(group.key);
      buttonRef.current?.focus();
    }
  }

  function onBlur(e) {
    if (open && !e.currentTarget.contains(e.relatedTarget)) onClose(group.key);
  }

  return (
    <li
      className={isActive ? "staff-nav-group is-active" : "staff-nav-group"}
      onPointerEnter={openByHover}
      onPointerLeave={closeByHover}
      onBlur={onBlur}
    >
      <button
        ref={buttonRef}
        type="button"
        className="staff-nav-top"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={toggle}
        onKeyDown={onButtonKey}
      >
        {group.label}
        <Count value={total} note="need attention" />
        <svg className="staff-nav-caret" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      <ul id={`${id}-panel`} ref={panelRef} className="staff-nav-panel" hidden={!open} onKeyDown={onPanelKey}>
        {group.items.map((item) => (
          <li key={item.key}>
            <ItemLink item={item} active={active} c={c} onNavigate={() => onClose(group.key)} />
          </li>
        ))}
      </ul>
    </li>
  );
}

function DesktopNav({ active, c }) {
  const [open, setOpen] = useState(null);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function outside(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(null);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const pathname = usePathname();
  useEffect(() => setOpen(null), [pathname]);

  return (
    <ul ref={rootRef} className="staff-nav-row">
      {NAV_GROUPS.map((g) =>
        g.items ? (
          <Group
            key={g.key}
            group={g}
            active={active}
            c={c}
            open={open === g.key}
            onOpen={setOpen}
            onClose={(key) => setOpen((cur) => (cur === key ? null : cur))}
          />
        ) : (
          <li key={g.key} className={active === g.key ? "staff-nav-group is-active" : "staff-nav-group"}>
            <Link href={g.href} className="staff-nav-top" aria-current={active === g.key ? "page" : undefined}>
              {g.label}
            </Link>
          </li>
        ),
      )}
    </ul>
  );
}

function MobileNav({ active, c }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const buttonRef = useRef(null);
  const total = NAV_GROUPS.reduce((sum, g) => sum + groupTotal(g, c), 0);

  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  function onKey(e) {
    if (e.key === "Escape" && open) {
      setOpen(false);
      buttonRef.current?.focus();
    }
  }

  return (
    <div className="staff-nav-mobile" onKeyDown={onKey}>
      <button
        ref={buttonRef}
        type="button"
        className="staff-nav-menu-btn"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        onClick={() => setOpen((o) => !o)}
      >
        <span>
          Menu <span aria-hidden="true">·</span> {currentLabel(active)}
        </span>
        <Count value={total} note="need attention" />
        <svg className="staff-nav-caret" width="12" height="12" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      <div id={`${id}-menu`} className="staff-nav-sheet" hidden={!open}>
        {NAV_GROUPS.map((g) => (
          <div key={g.key} className="staff-nav-sheet-group">
            {g.items ? (
              <>
                <h2 className="eyebrow">{g.label}</h2>
                <ul>
                  {g.items.map((item) => (
                    <li key={item.key}>
                      <ItemLink item={item} active={active} c={c} onNavigate={() => setOpen(false)} />
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <Link
                href={g.href}
                className="staff-nav-item"
                aria-current={active === g.key ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                {g.label}
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const REFRESH_MS = 60000;
const EXTRA_PREFIXES = [
  ["/admin/units", "properties"],
  ["/admin/inspections", "properties"],
  ["/admin/rent", "rent"],
  ["/admin/signatures", "signatures"],
];
const REQUEST_TABS = ["showings", "applications", "inquiries"];

function under(path, prefix) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function activeFor(pathname, tab) {
  const path = (pathname || "/admin").replace(/\/$/, "") || "/admin";
  if (path === "/admin") return "dashboard";
  if (under(path, "/admin/requests")) return REQUEST_TABS.includes(tab) ? tab : "showings";
  let best = { key: null, length: 0 };
  const consider = (prefix, key) => {
    if (under(path, prefix) && prefix.length > best.length) best = { key, length: prefix.length };
  };
  for (const g of NAV_GROUPS) for (const item of g.items || []) consider(item.href.split("?")[0], item.key);
  for (const [prefix, key] of EXTRA_PREFIXES) consider(prefix, key);
  return best.key;
}

function useNavCounts(enabled) {
  const [counts, setCounts] = useState({});
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () =>
      loadNavCounts().then(
        (c) => alive && setCounts(c),
        () => {},
      );
    load();
    const timer = setInterval(load, REFRESH_MS);
    window.addEventListener(COUNTS_EVENT, load);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener(COUNTS_EVENT, load);
    };
  }, [enabled]);
  return counts;
}

function NavBody({ active, c }) {
  return (
    <nav className="staff-nav" aria-label="Staff sections">
      <DesktopNav active={active} c={c} />
      <MobileNav active={active} c={c} />
    </nav>
  );
}

function NavWithTab({ pathname, c }) {
  const params = useSearchParams();
  return <NavBody active={activeFor(pathname, params.get("tab"))} c={c} />;
}

// Rendered once in the admin layout. Hidden until we know the visitor is staff.
export default function StaffNav() {
  const { checking, isStaff } = useStaff();
  const pathname = usePathname();
  const c = useNavCounts(isStaff);
  if (checking || !isStaff) return null;
  return (
    <Suspense fallback={<NavBody active={activeFor(pathname, null)} c={c} />}>
      <NavWithTab pathname={pathname} c={c} />
    </Suspense>
  );
}
