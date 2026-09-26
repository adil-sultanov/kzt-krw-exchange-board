// All UI strings. The UI is English only; keep every user-visible string here.
// Everything is worded from the viewer's side: what *you* pay and get.
import type { AdminSource, BoardSort, Currency, DealStatus, ReportCategory, RequestStatus, SortOrder } from "./types";

export const t = {
  appTitle: "KZT ↔ KRW Exchange Board",
  loading: "Loading…",
  retry: "Try again",

  openInTelegram: {
    title: "Open this app in Telegram",
    body: "This board works only inside Telegram. Open it from the bot's menu button.",
  },

  /** What the viewer buys: on the Board by taking a request, in New request by posting one. */
  buy: { KRW: "Buy KRW 🇰🇷", KZT: "Buy KZT 🇰🇿" } satisfies Record<Currency, string>,

  side: {
    pay: "You pay",
    get: "You get",
    approx: (money: string) => `≈ ${money}`,
    unknown: (symbol: string) => `— ${symbol}`,
  },

  status: {
    open: "Open",
    in_progress: "In progress",
    completed: "Completed",
    closed: "Cancelled",
    expired: "Expired",
  } satisfies Record<RequestStatus, string>,

  rate: {
    title: "Market rate",
    pair: (rate: string) => `1 ₸ = ${rate} ₩`,
    inverse: (rate: string) => `1 ₩ = ${rate} ₸`,
    unavailable: "Market rate unavailable right now.",
    // By the `source` the backend stores with the rate.
    attribution: {
      "currency-api": "Currency API",
      "open.er-api.com": "ExchangeRate-API",
    } as Partial<Record<string, string>>,
    // Always for the viewer: "better" means they get more than at the market rate.
    market: "Market rate",
    better: (percent: string) => `${percent} better rate`,
    worse: (percent: string) => `${percent} worse rate`,
  },

  board: {
    filters: "Filters",
    sort: {
      date: "Date",
      amount: "Amount",
      rate: "Rate",
    } satisfies Record<BoardSort, string>,
    // What comes first, on the button that flips the order.
    order: {
      date: { desc: "Newest first", asc: "Oldest first" },
      amount: { desc: "Largest first", asc: "Smallest first" },
      rate: { desc: "Best first", asc: "Worst first" },
    } satisfies Record<BoardSort, Record<SortOrder, string>>,
    sortBy: "Sort by",
    clear: "Clear",
    empty: "No requests here yet",
    emptyHint: "Post your own, and people will find you.",
    loadMore: "Load more",
    newRequest: "Post a request",
    myDeals: "My deals",
    needsAction: (count: number) =>
      count === 1 ? "1 thing needs your attention" : `${count} things need your attention`,
    profile: "Profile",
  },

  card: {
    deals: (count: number) => (count === 1 ? "1 deal" : `${count} deals`),
    timeLeft: (left: string) => `${left} left`,
  },

  detail: {
    yours: "Your request",
    rate: "Rate",
    author: "Author",
    timeLeft: "Time left",
    until: (time: string) => `until ${time}`,
    status: "Status",
    own: "It's on the board. The bot will message you when someone takes it.",
    ownPending: "Someone took it and is waiting for your answer in My deals.",
    expiresSoon: "It leaves the board soon. Extend it to keep it up.",
    edit: "Edit",
    editLocked: "Someone is waiting for your answer, so the amount and rate can't change until you answer.",
    postAgain: "Post again",
    matches: "Requests going the other way",
    responded: {
      pending: "You took this request. Waiting for the author to answer.",
      accepted: "You took this request, and the author accepted.",
      declined: "You took this request, but the author declined or chose someone else.",
      completed: "You completed this deal.",
    } satisfies Record<DealStatus, string>,
    notOpen: "This request is no longer on the board.",
    take: "I'll take it",
    takeConfirm: (get: string, pay: string) =>
      `You get ${get} and pay ${pay}.\n\n` +
      "The author gets a message. If they accept, you'll see each other's contact and payment details.",
    openDeal: "Open my deal",
    usernameRequired:
      "You need a Telegram username to take a request: it's how the author contacts you. " +
      "Set one in Telegram Settings, then reopen the app.",
    banned: "Your account can't take requests.",
    report: "Report this request",
  },

  deals: (count: number) => (count === 1 ? "1 completed deal" : `${count} completed deals`),

  dealStatus: {
    pending: "Waiting for the author",
    accepted: "In progress",
    declined: "Declined",
    completed: "Completed",
  } satisfies Record<DealStatus, string>,

  deal: {
    title: "Deal",
    needsAnswer: "Waiting for your answer",
    needsConfirm: "Confirm you got the money",
    theirDeals: "Their record",
    started: "Started",
    banner: {
      authorPending: {
        title: "Someone wants to take your request",
        body: "Accept to swap Telegram contacts and payment details.",
      },
      responderPending: {
        title: "Waiting for the author",
        body: "The bot will message you when they accept.",
      },
      accepted: {
        title: "Deal accepted",
        body: "Message them to agree on the details, then pay each other directly.",
      },
      waitingForThem: {
        title: "Waiting for them",
        body: "You confirmed their payment. Now they need to confirm yours.",
      },
      otherConfirmed: {
        title: "They got your money",
        body: "Confirm below once theirs is in your account.",
      },
      completed: { title: "Deal completed", body: "You both confirmed receiving the money." },
      declinedAuthor: { title: "Declined", body: "You declined this person." },
      declinedResponder: { title: "Declined", body: "The author declined or chose someone else." },
      cancelledAuthor: { title: "Request cancelled", body: "You cancelled the request." },
      cancelledResponder: { title: "Request cancelled", body: "The author cancelled it." },
      expired: { title: "Request expired", body: "It expired before an answer." },
    },
    progress: {
      theyReceived: (currency: string) => `They received your ${currency}`,
      youReceived: (currency: string) => `You received their ${currency}`,
    },
    noCancel: "An accepted deal can't be cancelled: it ends when you both confirm.",
    accept: "Accept",
    acceptConfirm:
      "Accept this person? You'll swap contacts, and your request leaves the board. " +
      "Anyone else waiting is declined. An accepted deal can't be cancelled.",
    decline: "Decline",
    declineConfirm: "Decline this person? They can't take this request again.",
    contact: "Message on Telegram",
    confirm: "I received the money",
    confirmQuestion:
      "Only confirm once their money is in your account. This can't be undone.",
    payTo: (money: string) => `Send ${money} to`,
    payToMissing: (currency: string) =>
      `They haven't added where they receive ${currency} yet. Ask them in chat.`,
    copy: "Copy",
    copied: "Copied",
    report: "Report a problem",
    reported:
      "You reported this deal, and an admin will review it. It stays open until you both confirm.",
  },

  report: {
    title: "Report",
    titleDeal: "Report a problem",
    introRequest: "Tell an admin what's wrong with this request. The author isn't told who reported it.",
    introDeal:
      "Tell an admin what went wrong. The deal stays open until you both confirm. " +
      "Admins can ban users, but can't move or return money.",
    reason: "What's wrong?",
    categories: {
      scam: "Scam or fraud",
      no_payment: "They didn't pay",
      disappeared: "They stopped replying",
      spam: "Spam or fake request",
      other: "Something else",
    } satisfies Record<ReportCategory, string>,
    note: "Details (optional)",
    notePlaceholder: "What happened? Dates or amounts help.",
    submit: "Send report",
    sent: "Report sent",
    sentBody: "An admin will review it. Thanks for keeping the board safe.",
    done: "Done",
  },

  about: {
    title: "About",
    body:
      "A free noticeboard for students exchanging KZT\u00a0↔\u00a0KRW. It never holds or moves money: " +
      "you pay each other directly, at your own risk.",
    terms: "Terms",
    privacy: "Privacy",
    madeBy: "Made by",
    source: "Source code",
    github: "GitHub",
    support: "Support the project",
    supportTagline: "Help keep the board free and running",
    supportHint:
      "Donations are voluntary and help pay for hosting. They don't unlock anything: " +
      "the board is free for everyone.",
    noOptions: "No donate options yet. Only you see this section until you add some.",
    open: "Open",
    edit: "Edit",
    cancel: "Cancel",
    save: "Save",
    saved: "Saved",
    note: "Note (optional)",
    notePlaceholder: "e.g. Thanks for using the board!",
    label: "Label",
    labelPlaceholder: "e.g. Kaspi",
    value: "Link or number",
    valuePlaceholder: "https://… or +7 707 …",
    add: "Add a way to donate",
    remove: "Remove",
    incomplete: "Fill in both the label and the link or number, or remove the row.",
  },

  admin: {
    title: "Reports",
    open: "Open",
    resolved: "Resolved",
    empty: "No open reports",
    emptyResolved: "No resolved reports yet",
    request: (id: number) => `Request #${id}`,
    deal: (id: number) => `Deal #${id}`,
    from: "From",
    about: "About",
    author: "author",
    responder: "responder",
    paid: (who: string, done: boolean) => `${who} ${done ? "confirmed" : "hasn't confirmed"} payment`,
    noUsername: "no username",
    banned: "Banned",
    isAdmin: "Admin",
    openReports: (count: number) => (count === 1 ? "1 open report" : `${count} open reports`),
    resolvedAt: (time: string) => `Resolved ${time}`,
    resolve: "Resolve",
    ban: "Ban",
    unban: "Unban",
    banConfirm: (name: string) =>
      `Ban ${name}? They can't post or take requests, their open requests are cancelled, and ` +
      "pending deals with them are declined. Deals already accepted carry on.",
    unbanConfirm: (name: string) => `Unban ${name}? Requests cancelled by the ban stay cancelled.`,
  },

  admins: {
    title: "Admins",
    addTitle: "Add an admin",
    username: "Telegram username",
    usernamePlaceholder: "@username",
    addHint:
      "They must have opened the app or the bot at least once. Admins review reports and can " +
      "ban users.",
    add: "Add admin",
    remove: "Remove admin",
    removeConfirm: (name: string) => `Remove ${name} as an admin?`,
    source: {
      owner: "owner",
      config: "from ADMIN_IDS",
      granted: "added in the app",
    } satisfies Record<AdminSource, string>,
  },

  ownerDeals: {
    title: "All deals",
    active: "Active",
    finished: "Finished",
    activeHint: "Pending and accepted, least recently changed first.",
    finishedHint: "Completed and declined, newest first.",
    empty: "No deals",
    delete: "Delete deal",
    deleteConfirm: (id: number, accepted: boolean) =>
      `Delete deal #${id} for both sides? Nobody is notified.` +
      (accepted ? " Its request is cancelled, since no one else can take it." : "") +
      " Completed-deal counts don't change.",
  },

  refresh: "Refresh",

  extend: {
    button: "Extend",
    question: "Keep your request on the board for how long from now?",
    option: (days: number) => (days === 1 ? "1 day" : `${days} days`),
  },

  cancelRequest: {
    button: "Cancel request",
    confirm: "Cancel this request? It leaves the board, and anyone waiting is declined.",
  },

  receiveHint: {
    missing: (currency: string) =>
      `Add where you receive ${currency}, so the other person knows where to pay you.`,
    open: "Add details",
  },

  profile: {
    receiving: "Where you receive money",
    receivingHint: "Shown only to the other side of an accepted deal.",
    bank: "Bank and name",
    account: "Account, card or phone number",
    details: {
      KZT: {
        title: "KZT ₸",
        bankPlaceholder: "e.g. Kaspi, Adil S.",
        accountPlaceholder: "e.g. +7 707 123 45 67",
      },
      KRW: {
        title: "KRW ₩",
        bankPlaceholder: "e.g. Toss Bank, Zhibek A.",
        accountPlaceholder: "e.g. 1000-1234-5678",
      },
    } satisfies Record<Currency, { title: string; bankPlaceholder: string; accountPlaceholder: string }>,
    save: "Save",
    saved: "Saved",
    more: "More",
    about: "About & support",
    admin: "Admin: reports",
    owner: "Owner",
    admins: "Admins",
    ownerDeals: "All deals",
  },

  footer: {
    madeBy: (username: string) => `Made by @${username}`,
  },

  myDeals: {
    title: "My deals",
    empty: "No deals yet",
    emptyHint: "Take a request on the board, or post your own.",
    expired: "Expired in the last day",
    expiresSoon: (left: string) => `Leaves the board in ${left}`,
    active: "Active",
    noActive: "No active deals right now.",
    completed: "Completed",
    declined: "Declined",
    show: "Show",
    hide: "Hide",
  },

  form: {
    title: "New request",
    editTitle: "Edit request",
    amountPlaceholder: "0",
    rate: "Rate",
    rateChoice: {
      market: "Market",
      ask: "Ask more",
      offer: "Offer more",
    } satisfies Record<"market" | "ask" | "offer", string>,
    rateHint: {
      market: "Follows the market rate as it moves.",
      ask: "You get more, but it may take longer to find someone.",
      offer: "The other person gets a better rate, so it's taken sooner.",
    } satisfies Record<"market" | "ask" | "offer", string>,
    percentLabel: "By how much",
    percentPlaceholder: "1.5",
    rateNow: (rate: string) => `Now ${rate}`,
    duration: "Keep on the board",
    days: (days: number) => (days === 1 ? "1 day" : `${days} days`),
    durationHint: "It leaves the board early once you accept someone or cancel it.",
    submit: "Post request",
    save: "Save changes",
    errors: {
      amount: "Enter an amount.",
      amountTooLarge: "That amount is too large.",
      percent: "Enter a percentage.",
      percentRange: (max: number) => `At most ${max}%.`,
    },
    usernameRequired:
      "You need a Telegram username to post a request: it's how the other person contacts you. " +
      "Set one in Telegram Settings, then reopen the app.",
    banned: "Your account can't post requests.",
    disclaimer: "The app never handles money: you pay each other directly, at your own risk.",
  },

  created: {
    title: "Request posted",
    body: "The bot will message you when someone takes it.",
    matches: "Matches you can take now",
    noMatches: "No matches yet. People looking for it will see yours on the board.",
    done: "Done",
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
  init_data_expired: "Your session has expired. Please reopen the app.",
  invalid_input: "Some fields are invalid. Please check and try again.",
  username_required: t.form.usernameRequired,
  user_banned: t.form.banned,
  too_many_open_requests: "You already have 5 open requests. Cancel one to post another.",
  rate_limited: "You're posting too often. Please try again in an hour.",
  request_not_found: "This request doesn't exist or was removed.",
  own_request: "This is your own request.",
  already_responded: "You've already taken this request.",
  request_not_open: "This request is no longer open.",
  request_has_responders:
    "Someone is waiting for your answer, so the amount and rate can't change. Answer them first.",
  already_extended: "It's already on the board for longer than that.",
  deal_not_found: "This deal doesn't exist.",
  not_request_author: "Only the request's author can do this.",
  deal_not_pending: "This was already answered.",
  deal_not_accepted: "This deal isn't active any more.",
  deal_state_changed: "This deal just changed. Please refresh.",
  contact_unavailable: "The contact is shown once the deal is accepted.",
  contact_no_username:
    "They have no Telegram username right now, so there's no link to open. Try again later.",
  already_reported: "You already reported this. An admin will review it.",
  too_many_reports: "You've sent several reports today. Please try again tomorrow.",
  admin_only: "Only admins can do this.",
  owner_only: "Only the app's owner can do this.",
  username_not_found:
    "No one with that username has used the app yet. Ask them to open it, then try again.",
  already_admin: "They're already an admin.",
  cannot_promote_banned: "This user is banned, so they can't be an admin.",
  admin_in_config: "This admin is set in the server config (ADMIN_IDS / OWNER_ID).",
  admin_not_found: "They're not an admin any more.",
  cannot_ban_admin: "Admins can't be banned.",
  report_already_resolved: "This report was already resolved.",
  report_not_found: "This report doesn't exist.",
  user_not_found: "This user doesn't exist.",
  network_error: "No connection. Check your internet and try again.",
  unknown_error: "Something went wrong. Please try again.",
};

/** User-facing message for an API error code. */
export function errorMessage(code: string): string {
  return errorMessages[code] ?? errorMessages.unknown_error!;
}
