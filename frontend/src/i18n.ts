// All UI strings. The UI is English only; keep every user-visible string here.
// Everything is worded from the viewer's side: what *you* pay and get.
import type {
  AdminSource,
  BoardSort,
  CloseReason,
  Currency,
  DealStatus,
  ReportCategory,
  RequestStatus,
  SortOrder,
} from "./types";

/** "2 offers left". */
function offersLeft(count: number): string {
  return count === 1 ? "1 offer left" : `${count} offers left`;
}

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
  /** Status `closed`, when an admin (or its author's ban) took it off the board. */
  removedStatus: "Removed by an admin",

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
    alerts: "Alerts",
    alertsNew: "New",
    alertsFor: (tab: string) => `Alerts for ${tab}`,
    alertsState: { off: "Off", on: "On" },
    alertsHint:
      "The bot messages you about each new request in this tab, and crosses the message out " +
      "once the request is gone. Turn it off any time.",
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
    take: "Take request",
    counterOffer: "Counter offer",
  },

  card: {
    deals: (count: number) => (count === 1 ? "1 deal" : `${count} deals`),
    timeLeft: (left: string) => `${left} left`,
    openProfile: (username: string) => `Open @${username}'s Telegram profile`,
    /** Under a counter offer's amounts: the request it's part of, from the viewer's side. */
    whole: (pay: string, get: string) => `Whole request: ${pay} → ${get}`,
    kztBank: "Preferred KZT bank:",
  },

  detail: {
    yours: "Your request",
    rate: "Rate",
    kztBank: "Preferred KZT bank",
    author: "Author",
    timeLeft: "Time left",
    until: (time: string) => `until ${time}`,
    status: "Status",
    own: "It's on the board. The bot will message you when someone takes it or sends a counter offer.",
    ownPending: "Someone is waiting for your answer in My deals.",
    expiresSoon: "It leaves the board soon. Extend it to keep it up.",
    edit: "Edit",
    editLocked: "Someone is waiting for your answer, so the terms can't change until you answer.",
    counterOffers: "Counter offers",
    counterFrom: (money: string) => `From ${money}`,
    counterOff: "Whole amount only",
    postAgain: "Post again",
    matches: "Requests going the other way",
    responded: {
      pending: "You took this request. Waiting for the author to answer.",
      accepted: "You took this request, and the author accepted.",
      declined: "You took this request, but the author declined or chose someone else.",
      cancelled: "You cancelled your offer on this request.",
      completed: "You completed this deal.",
    } satisfies Record<DealStatus, string>,
    /** After cancelling their offer, with offers left to send. */
    cancelledResend: (left: number) =>
      `You cancelled your offer. You can send a new one: ${offersLeft(left)} on this request.`,
    offersUsedUp: "You cancelled your offers on this request, and can't send another: 3 is the most.",
    notOpen: "This request is no longer on the board.",
    removed: "An admin took this request off the board.",
    take: "Take request",
    counterOffer: "Counter offer",
    takeConfirm: (get: string, pay: string) =>
      `You get ${get} and pay ${pay}.\n\n` +
      "The author gets a message. If they accept, you'll see each other's contact and payment details.",
    openDeal: "Open my deal",
    usernameRequired:
      "You need a Telegram username to take a request: it's how the author contacts you. " +
      "Set one in Telegram Settings, then reopen the app.",
    profileRequired:
      "Fill in your name, university and year of enrollment to take a request. " +
      "The author sees them, as you see theirs.",
    banned: "Your account can't take requests.",
    report: "Report this request",
  },

  deals: (count: number) => (count === 1 ? "1 completed deal" : `${count} completed deals`),

  dealStatus: {
    pending: "Waiting for the author",
    accepted: "In progress",
    declined: "Declined",
    cancelled: "Offer cancelled",
    completed: "Completed",
  } satisfies Record<DealStatus, string>,

  deal: {
    title: "Deal",
    counterTitle: "Counter offer",
    needsAnswer: "Waiting for your answer",
    needsConfirm: "Confirm you got the money",
    them: "With",
    theirDeals: "Their record",
    started: "Started",
    banner: {
      authorPending: {
        title: "Someone wants to take your request",
        body: "Accept to swap Telegram contacts and payment details.",
      },
      authorCounter: {
        title: "Someone sent a counter offer",
        body: (part: string, whole: string) =>
          `They want ${part} of the ${whole} you pay. Accept to swap contacts; the rest stays on the board.`,
      },
      responderPending: {
        title: "Waiting for the author",
        body: "The bot will message you when they accept. Until then, you can cancel your offer.",
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
      offerCancelledResponder: {
        title: "Offer cancelled",
        body: (left: number) =>
          left > 0
            ? `You cancelled it before the author answered. You can send a new one: ${offersLeft(left)}.`
            : "You cancelled it before the author answered. You've used all 3 offers on this request.",
      },
      offerCancelledAuthor: {
        title: "Offer withdrawn",
        body: "They cancelled their offer before you answered. Your request stays on the board.",
      },
      removed: { title: "Removed by an admin", body: "An admin took this request off the board." },
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
    acceptCounterConfirm: (left: string) =>
      `Accept this counter offer? You'll swap contacts, and ${left} stays on the board. ` +
      "Offers for more than that are declined. An accepted deal can't be cancelled.",
    decline: "Decline",
    declineConfirm: "Decline this person? They can't take this request again.",
    cancelOffer: "Cancel offer",
    cancelOfferConfirm: (left: number) =>
      "Cancel your offer? The author can no longer accept it.\n\n" +
      (left > 0
        ? `You can send a new one afterwards: ${offersLeft(left)} on this request.`
        : "This is your 3rd offer on this request, so you can't send another."),
    newOffer: "Send a new offer",
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

  counter: {
    title: "Counter offer",
    intro:
      "Ask for part of this request. If the author accepts, you exchange that part, " +
      "and the rest stays on the board for others.",
    yourOffer: "Your offer",
    range: (min: string, max: string) => `From ${min} up to ${max}.`,
    submit: "Send counter offer",
    unavailable: "You can't send a counter offer on this request any more.",
    off: "The author only deals in the whole amount. You can take the whole request instead.",
    errors: {
      amount: "Enter an amount.",
      belowMinimum: (money: string) => `At least ${money}: the author's minimum.`,
      aboveAmount: (money: string) => `At most ${money}, the whole request.`,
    },
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
    counterOffer: "Counter offer",
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
    reportsOnRequest: (count: number) => (count === 1 ? "1 open report" : `${count} open reports`),
    ban: "Ban",
    unban: "Unban",
    banConfirm: (name: string) =>
      `Ban ${name}? They can't post or take requests, their open requests are cancelled, and ` +
      "pending deals with them are declined. Deals already accepted carry on.",
    unbanConfirm: (name: string) => `Unban ${name}? Requests cancelled by the ban stay cancelled.`,
  },

  boardRequests: {
    title: "Board requests",
    hint: (count: number) =>
      `${count === 1 ? "1 request" : `${count} requests`} on the board now, newest first.`,
    empty: "The board is empty",
    exchange: (pay: string, get: string) => `Author pays ${pay}, gets ${get}`,
    posted: (time: string) => `Posted ${time}`,
    leaves: (left: string) => `leaves in ${left}`,
    author: "Author",
    waiting: (count: number) => `Waiting for the author's answer (${count})`,
    remove: "Remove from board",
    removeConfirm: (id: number, waiting: number) =>
      `Take request #${id} off the board?` +
      (waiting > 0 ? ` ${waiting === 1 ? "The person" : `The ${waiting} people`} waiting are declined.` : "") +
      " Nobody gets a message; the author and anyone who took it see that an admin removed it.",
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

  allDeals: {
    title: "All deals",
    active: "Active",
    finished: "Finished",
    cancelled: "Cancelled",
    activeHint: "Pending and accepted, least recently changed first.",
    finishedHint: "Completed, declined and cancelled by their sender, newest first.",
    cancelledHint:
      "Requests taken off the board by their author or an admin, most recent first. " +
      "Anyone who had taken one was declined.",
    empty: "No deals",
    emptyCancelled: "No cancelled requests",
    authorPays: (money: string, currency: string) => `Author pays ${money} for ${currency}`,
    closedAt: (time: string) => `Closed ${time}`,
    // `who` is the author or admin, e.g. "@aida".
    closedBy: {
      author: (who: string) => `Cancelled by its author, ${who}`,
      admin: (who: string) => `Removed from the board by ${who}`,
      ban: (who: string) => `Closed when ${who} banned its author`,
      deal_deleted: (who: string) => `Closed when ${who} deleted its accepted deal`,
    } satisfies Record<CloseReason, (who: string) => string>,
    closedByAdmin: "Removed by an admin",
    closedUnknown: "Cancelled (who did it wasn't recorded)",
    closer: "Closed by",
    takers: (count: number) => `Had taken it (${count})`,
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

  profileHint: {
    open: "Fill in profile",
  },

  receiveHint: {
    missing: (currency: string) =>
      `Add where you receive ${currency}, so the other person knows where to pay you.`,
    open: "Add details",
  },

  profile: {
    you: "About you",
    youHint: "Shown on your requests and deals. You need it to post or take a request.",
    firstName: "First name",
    firstNamePlaceholder: "e.g. Adil",
    lastName: "Last name",
    lastNamePlaceholder: "e.g. Sultanov",
    university: "University",
    universityPlaceholder: "e.g. UNIST",
    year: "Year of enrollment",
    yearPlaceholder: "Choose",
    preview: (tag: string) => `Others see: ${tag}`,
    invalid: "Use letters only in names (and digits in the university), with no commas or emoji.",
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
    boardRequests: "Admin: board requests",
    allDeals: "Admin: all deals",
    owner: "Owner",
    admins: "Admins",
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
    declined: "Declined & cancelled",
    counter: (status: string) => `Counter offer · ${status}`,
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
    durationHint: "It leaves the board early once you accept someone for all of it, or cancel it.",
    counter: "Counter offers",
    counterHint:
      "Let people take just part of your request: set the smallest part you'd accept. " +
      "Leave it empty to deal only in the whole amount.",
    counterLabel: "Smallest part",
    counterPlaceholder: "Optional",
    counterRange: (min: string, max: string) => `People can ask for ${min} up to ${max}.`,
    kztBank: "Preferred KZT bank",
    kztBankHint: "Optional. Shown on your request, so people can see which bank you'd rather use for KZT.",
    kztBankPlaceholder: "e.g. Kaspi",
    kztBankRemember: "Remember for my next requests",
    submit: "Post request",
    save: "Save changes",
    errors: {
      amount: "Enter an amount.",
      amountTooLarge: "That amount is too large.",
      percent: "Enter a percentage.",
      percentRange: (max: number) => `At most ${max}%.`,
      counterAboveAmount: "At most the amount you pay.",
      kztBank: "Use letters, digits and spaces only: no links or emoji.",
    },
    usernameRequired:
      "You need a Telegram username to post a request: it's how the other person contacts you. " +
      "Set one in Telegram Settings, then reopen the app.",
    profileRequired:
      "Fill in your name, university and year of enrollment to post a request. " +
      "They're shown on it, so people know who they're dealing with.",
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
  not_group_member: "This board is only for members of our group chat. Ask a member to add you, then try again.",
  membership_check_failed: "Couldn't check your group membership. Please try again in a minute.",
  invalid_input: "Some fields are invalid. Please check and try again.",
  username_required: t.form.usernameRequired,
  profile_required: "Fill in your name, university and year of enrollment in Profile first.",
  user_banned: t.form.banned,
  too_many_open_requests: "You already have 5 open requests. Cancel one to post another.",
  rate_limited: "You're posting too often. Please try again in an hour.",
  request_not_found: "This request doesn't exist or was removed.",
  own_request: "This is your own request.",
  already_responded: "You've already responded to this request.",
  too_many_offers: "You've already sent 3 offers on this request, the most allowed.",
  request_not_open: "This request is no longer open.",
  request_has_responders:
    "Someone is waiting for your answer, so the terms can't change. Answer them first.",
  counter_offers_off: "The author only deals in the whole amount.",
  counter_below_minimum: "That's below the author's minimum counter offer.",
  counter_above_amount: "That's more than what's left of this request.",
  counter_minimum_too_large: "The smallest counter offer can't be more than the amount you pay.",
  already_extended: "It's already on the board for longer than that.",
  deal_not_found: "This deal doesn't exist.",
  not_request_author: "Only the request's author can do this.",
  not_deal_responder: "Only the person who sent this offer can cancel it.",
  deal_not_pending: "This offer was already answered, or its request left the board.",
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
