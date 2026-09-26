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
