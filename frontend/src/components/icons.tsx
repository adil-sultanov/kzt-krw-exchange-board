// Small inline icons (stroke-based, 24×24), colored by the surrounding text color.
import type { ReactNode } from "react";

function Icon(props: { children: ReactNode; className?: string }) {
  return (
    <svg
      className={props.className ?? "icon"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {props.children}
    </svg>
  );
}

/** Two opposite arrows: an exchange between two people. */
export function DealsIcon() {
  return (
    <Icon>
      <path d="M7 4 3 8l4 4" />
      <path d="M3 8h14" />
      <path d="m17 12 4 4-4 4" />
      <path d="M21 16H7" />
    </Icon>
  );
}

export function ProfileIcon() {
  return (
    <Icon>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </Icon>
  );
}

export function RefreshIcon(props: { spinning?: boolean }) {
  return (
    <Icon className={props.spinning ? "icon spinning" : "icon"}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </Icon>
  );
}

/** From what you pay to what you get. */
export function ArrowIcon(props: { down?: boolean }) {
  return (
    <Icon className={props.down ? "icon arrow down" : "icon arrow"}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </Icon>
  );
}

/** Down for descending, up for ascending; turns over when the order flips. */
export function SortOrderIcon(props: { up: boolean }) {
  return (
    <Icon className={props.up ? "icon sort-order up" : "icon sort-order"}>
      <path d="M12 5v14" />
      <path d="m6 13 6 6 6-6" />
    </Icon>
  );
}

export function CheckIcon() {
  return (
    <Icon>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Icon>
  );
}

export function FiltersIcon() {
  return (
    <Icon>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h9M17 18h3" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="15" cy="18" r="2" />
    </Icon>
  );
}

/** A bell, filled while alerts are on (it rings when they're switched on, see `.icon.bell`). */
export function BellIcon(props: { on: boolean }) {
  return (
    <Icon className={props.on ? "icon bell on" : "icon bell"}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" fill={props.on ? "currentColor" : "none"} />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </Icon>
  );
}

/** Points down when open, right when folded. */
export function ChevronIcon(props: { open: boolean }) {
  return (
    <Icon className={props.open ? "icon chevron open" : "icon chevron"}>
      <path d="m9 6 6 6-6 6" />
    </Icon>
  );
}

export function FlagIcon() {
  return (
    <Icon>
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </Icon>
  );
}

export function HeartIcon() {
  return (
    <Icon>
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
    </Icon>
  );
}
