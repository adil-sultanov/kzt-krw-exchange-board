// All UI strings. The UI is English only; keep every user-visible string here.
import type {
  BoardSort,
  Currency,
  DealRole,
  DealStatus,
  Direction,
  RequestStatus,
} from "./types";

export const t = {
  appTitle: "KZT ↔ KRW Exchange Board",
  loading: "Loading…",
  retry: "Try again",

  openInTelegram: {
    title: "Open this app in Telegram",
    body: "This board works only inside Telegram. Open it from the bot's menu button.",
  },

  flag: { KZT: "🇰🇿", KRW: "🇰🇷" } satisfies Record<Currency, string>,
  // A request is named by what its author buys: KZT_KRW pays KZT to buy KRW.
  direction: {
    KZT_KRW: "Buy KRW 🇰🇷",
    KRW_KZT: "Buy KZT 🇰🇿",
  } satisfies Record<Direction, string>,
  directionLong: {
    KZT_KRW: "Buying KRW 🇰🇷 with KZT 🇰🇿",
    KRW_KZT: "Buying KZT 🇰🇿 with KRW 🇰🇷",
  } satisfies Record<Direction, string>,

  status: {
    open: "Open",
    in_progress: "In progress",
    completed: "Completed",
    closed: "Cancelled",
    expired: "Expired",
  } satisfies Record<RequestStatus, string>,

  rate: {
    reference: "Reference rate",
    perKzt: (rate: string) => `🇰🇿 1 KZT = ${rate} KRW 🇰🇷`,
    perKrw: (rate: string) => `🇰🇷 1 KRW = ${rate} KZT 🇰🇿`,
    unavailable: "Reference rate unavailable right now",
    updated: (time: string) => `Updated ${time}`,
    attribution: "Rates by ExchangeRate-API",
    market: "Market rate",
    above: (percent: string) => `${percent} above market`,
    below: (percent: string) => `${percent} below market`,
    now: (rate: string, value: string) => `${rate} (≈ ${value} now)`,
  },

  board: {
    all: "All",
    filters: "Filters",
    hideFilters: "Hide filters",
    minAmount: (currency: string) => `Min amount, ${currency}`,
    maxAmount: (currency: string) => `Max amount, ${currency}`,
    amountNeedsDirection: "Pick Buy KRW or Buy KZT to filter by amount.",
    sortBy: "Sort by",
    sort: {
      newest: "Newest",
      amount_asc: "Amount: low to high",
      amount_desc: "Amount: high to low",
      rate_asc: "Rate: low to high",
      rate_desc: "Rate: high to low",
    } satisfies Record<BoardSort, string>,
    empty: "No open requests match these filters.",
    emptyHint: "Post your own request, and people will find you.",
    loadMore: "Load more",
    newRequest: "Post a request",
    myDeals: "My deals",
    needsAction: (count: number) =>
      count === 1 ? "1 deal needs your action" : `${count} deals need your action`,
    profile: "Profile",
  },

  card: {
    wants: (amount: string) => `for ≈ ${amount}`,
    deals: (count: number) => (count === 1 ? "1 completed deal" : `${count} completed deals`),
    timeLeft: (left: string) => `${left} left`,
  },

  detail: {
    title: "Request",
    gives: "Gives",
    wants: "Wants about",
    rate: "Rate",
    author: "Author",
    posted: "Posted",
    expires: "Expires",
    own:
      "This is your request. When someone wants to take it, the bot will message you " +
      "and you'll see them in My deals.",
    notOpen: (status: string) => `This request is no longer on the board (${status.toLowerCase()}).`,
    take: "I'll take it",
    takeConfirm:
      "The author will get a message that you want to take this request. " +
      "If they accept, you'll both see each other's Telegram contact and payment details. Continue?",
    responded: (status: string) => `You responded to this request: ${status.toLowerCase()}.`,
    openDeal: "Open my deal",
    usernameRequired:
      "You need a Telegram username to take a request: it's how the author contacts you " +
      "once you both agree. Set one in Telegram Settings → Username, then reopen this app.",
    banned: "Your account can't take requests.",
  },

  dealStatus: {
    pending: "Waiting for the author",
    accepted: "In progress",
    declined: "Declined",
    completed: "Completed",
  } satisfies Record<DealStatus, string>,
  dealRole: {
    author: "Your request",
    responder: "You took it",
  } satisfies Record<DealRole, string>,

  deal: {
    title: "Deal",
    needsAnswer: "Waiting for your answer",
    needsConfirm: "Confirm you received the money",
    request: "Request",
    theirDeals: "Their record",
    started: "Started",
    authorPending: (deals: string) =>
      `Someone wants to take your request. They have ${deals}. ` +
      "Accept to swap Telegram contacts and payment details with them.",
    responderPending:
      "Waiting for the author to accept. The bot will message you when they do.",
    accepted:
      "Deal accepted! Message the other person on Telegram to agree on the details. " +
      "This app never handles money: you pay each other directly. " +
      "When their money arrives, tap “I received the money”. " +
      "An accepted deal can't be cancelled: it ends when you both confirm.",
    waitingForThem:
      "You confirmed you received their money. Waiting for them to confirm they received yours.",
    otherConfirmed:
      "They confirmed they received your money. Once theirs is in your account, confirm below " +
      "to complete the deal.",
    declinedAuthor: "You declined this response.",
    declinedResponder: "The author declined, or the request went to someone else.",
    cancelledAuthor: "You cancelled this request, so this response was declined.",
    cancelledResponder: "The author cancelled this request.",
    expired: "The request expired before this response was accepted.",
    completed: "This deal is completed.",
    accept: "Accept",
    acceptConfirm:
      "Accept this person? You'll see each other's Telegram contact, and your request " +
      "leaves the board. Anyone else waiting will be declined. " +
      "Once accepted, the deal can't be cancelled.",
    decline: "Decline",
    declineConfirm:
      "Decline this person? They'll see it in My deals, and can't respond to this request again.",
    contact: "Message on Telegram",
    confirm: "I received the money",
    confirmQuestion:
      "Only confirm once their money is actually in your account. This can't be undone. " +
      "When you both confirm, the deal is completed.",
    payTo: (currency: string) => `Send your ${currency} here`,
    payToMissing: (currency: string) =>
      `They haven't added where they receive ${currency} yet. Ask them in chat.`,
    copy: "Copy",
    copied: "Copied ✓",
  },

  refresh: "Refresh",

  cancelRequest: {
    button: "Cancel request",
    confirm:
      "Cancel this request? It's removed from the board, and anyone waiting for your answer " +
      "is declined.",
  },

  receiveHint: {
    missing: (currency: string) =>
      `Add where you receive ${currency} in your profile, so the other person knows where to pay you.`,
    open: "Open profile",
  },

  profile: {
    title: "Profile",
    record: "Your record",
    receiving: "Where you receive money",
    receivingHint:
      "Shown only to the other person once a deal is accepted, so they know where to pay you.",
    bank: "Bank and account holder",
    account: "Account, card or phone number",
    details: {
      KZT: {
        title: "🇰🇿 Receiving KZT ₸",
        bankPlaceholder: "e.g. Kaspi, Adil",
        accountPlaceholder: "e.g. +7 707 123 45 67",
      },
      KRW: {
        title: "🇰🇷 Receiving KRW ₩",
        bankPlaceholder: "e.g. Toss Bank, Zhibek",
        accountPlaceholder: "e.g. 1000-1234-5678",
      },
    } satisfies Record<Currency, { title: string; bankPlaceholder: string; accountPlaceholder: string }>,
    save: "Save",
    saved: "Saved",
    about: "About",
    aboutBody:
      "A free noticeboard for students exchanging KZT ↔ KRW. It never holds or moves money: " +
      "you agree and pay each other directly, at your own risk.",
    author: "Author",
    terms: "Terms of use",
    privacy: "Privacy policy",
  },

  footer: {
    madeBy: (username: string) => `Made by @${username}`,
  },

  myDeals: {
    title: "My deals",
    empty: "No deals yet.",
    emptyHint: "Take a request from the board, or wait for someone to take yours.",
    onBoard: "Your requests on the board",
    active: "Active deals",
    noActive: "No active deals right now.",
    completed: "Completed",
    declined: "Declined",
  },

  form: {
    title: "New request",
    direction: "What do you want?",
    amount: (currency: string) => `Amount you give, ${currency}`,
    amountPlaceholder: "e.g. 100,000",
    amountHint: (amount: string) => `You'll get ≈ ${amount}`,
    rate: "Rate",
    rateChoice: {
      market: "Market",
      above: "Above market",
      below: "Below market",
    } satisfies Record<"market" | "above" | "below", string>,
    percentLabel: {
      above: "How much above the market rate, %",
      below: "How much below the market rate, %",
    },
    percentPlaceholder: "e.g. 1.5",
    rateHint: (rate: string) => `Right now that's ≈ ${rate} KRW per 1 KZT.`,
    rateExplainer:
      "The rate follows the market: it's recalculated from the reference rate shown on the board.",
    duration: "Show on the board for",
    days: (days: number) => (days === 1 ? "1 day" : `${days} days`),
    durationHint:
      "It's removed from the board once you accept someone or cancel it (in My deals), " +
      "or when this time runs out.",
    submit: "Publish request",
    errors: {
      amount: "Enter an amount.",
      amountTooLarge: "That amount is too large.",
      percent: "Enter a percentage.",
      percentRange: (max: number) => `The percentage can be at most ${max}%.`,
    },
    usernameRequired:
      "You need a Telegram username to post a request: it's how the other person contacts you " +
      "once you both agree. Set one in Telegram Settings → Username, then reopen this app.",
    banned: "Your account can't post requests.",
    disclaimer:
      "This board never handles money. You agree on the details and pay each other directly, " +
      "at your own risk.",
  },

  created: {
    title: "Your request is live",
    body:
      "It's on the board now. When someone wants to take it, the bot will message you " +
      "and you'll see them in My deals.",
    matches: "Requests going the other way",
    noMatches: "No matching requests yet. We'll show yours to people looking for it.",
    backToBoard: "Back to the board",
  },

  time: {
    days: (n: number) => `${n}d`,
    hours: (n: number) => `${n}h`,
    minutes: (n: number) => `${n}m`,
    kst: (formatted: string) => `${formatted} KST`,
  },
};

const errorMessages: Record<string, string> = {
  auth_required: "Please open this app from Telegram.",
  init_data_invalid: "Couldn't verify your Telegram login. Please reopen the app.",
  init_data_expired: "Your session has expired. Please close and reopen the app.",
  invalid_input: "Some fields are invalid. Please check and try again.",
  username_required: t.form.usernameRequired,
  user_banned: t.form.banned,
  too_many_open_requests: "You already have 5 open requests. Close one before posting another.",
  rate_limited: "You're posting too often. Please try again in an hour.",
  request_not_found: "This request doesn't exist or was removed.",
  own_request: "This is your own request.",
  already_responded: "You've already responded to this request.",
  request_not_open: "This request is no longer open.",
  deal_not_found: "This deal doesn't exist.",
  not_request_author: "Only the request's author can do this.",
  deal_not_pending: "This response was already handled.",
  deal_not_accepted: "This deal isn't active any more.",
  deal_state_changed: "This deal just changed. Please reload it.",
  contact_unavailable: "The contact is shown once the deal is accepted.",
  contact_no_username:
    "The other person has no Telegram username right now, so there's no link to open. " +
    "Try again later.",
  network_error: "No connection. Check your internet and try again.",
  unknown_error: "Something went wrong. Please try again.",
};

/** User-facing message for an API error code. */
export function errorMessage(code: string): string {
  return errorMessages[code] ?? errorMessages.unknown_error!;
}
