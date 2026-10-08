// All UI strings. The UI is English only; keep every user-visible string here.
// Everything is worded from the viewer's side: what *you* pay and get.
import type {
  AdminSource,
  BoardSort,
  CloseReason,
  Currency,
  DealListState,
  DealStatus,
  ReportCategory,
  RequestStatus,
  SortOrder,
  UserListFilter,
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
    /** On an amount that follows the market rate as you type the other one. */
    payApprox: "You pay ≈",
    getApprox: "You get ≈",
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
      wise: "Wise",
      "currency-api": "Currency API",
      "open.er-api.com": "ExchangeRate-API",
    } as Partial<Record<string, string>>,
  },

  board: {
    howItWorks: "How it works",
    filters: "Filters",
    alerts: "Alerts",
    alertsNew: "New",
    alertsFor: (tab: string) => `Alerts for ${tab}`,
    alertsState: { off: "Off", on: "On" },
    alertsHint: "A bot message for each new request here.",
    sort: {
      date: "Date",
      amount: "Amount",
    } satisfies Record<BoardSort, string>,
    // What comes first, on the button that flips the order.
    order: {
      date: { desc: "Newest first", asc: "Oldest first" },
      amount: { desc: "Largest first", asc: "Smallest first" },
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
    // Under "My deals": something waits on the viewer, or (if not) how many deals are under way.
    actionNeeded: "Action needed",
    activeDeals: (count: number) => `${count} active`,
    profile: "Profile",
    profileIncomplete: "Your profile isn't filled in yet",
    confirmTitle: (count: number) =>
      count === 1 ? "Did you get the money?" : `Did you get the money? ${count} deals are waiting`,
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
    // The viewer's deal on a request on the board, still waiting: a take or a counter offer alike.
    myOfferPending: "Your offer · waiting for the author",
  },

  detail: {
    yours: "Your request",
    rate: "Rate",
    kztBank: "Preferred KZT bank",
    author: "Author",
    timeLeft: "Time left",
    until: (time: string) => `until ${time}`,
    status: "Status",
    ownPending: "Someone is waiting for your answer in My deals.",
    expiresSoon: "It leaves the board soon. Extend it to keep it up.",
    edit: "Edit",
    editLocked: "Answer the person waiting before you edit.",
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
    cancelledResend: (left: number) => `You cancelled your offer. ${offersLeft(left)}.`,
    offersUsedUp: "You've used all 3 offers on this request.",
    notOpen: "This request is no longer on the board.",
    removed: "An admin took this request off the board.",
    take: "Take request",
    counterOffer: "Counter offer",
    takeConfirm: (get: string, pay: string) => `Take this request?\n\nYou get ${get} and pay ${pay}.`,
    openDeal: "Open my deal",
    usernameRequired: "You need a Telegram username: set one in Telegram Settings, then reopen the app.",
    profileRequired: "Fill in your profile to take a request.",
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
    noProfile: "No profile",
    details: "Deal details",
    wholeRequest: "Whole request",
    started: "Started",
    acceptedAt: "Accepted",
    rateLocked: "Locked when accepted",
    banner: {
      authorPending: {
        title: "Someone wants to take your request",
        body: "Accept to swap contacts and payment details.",
      },
      authorCounter: {
        title: "Someone sent a counter offer",
        body: (part: string, whole: string, buying: boolean) =>
          `They offer ${part} of the ${whole} you're ${buying ? "buying" : "selling"}.`,
      },
      responderPending: {
        title: "Waiting for the author",
        body: "The bot will message you when they accept.",
      },
      accepted: {
        title: "Deal accepted",
        body: "Message them, then pay each other directly.",
      },
      waitingForThem: {
        title: "Waiting for them",
        body: "They still need to confirm your payment.",
      },
      otherConfirmed: {
        title: "They got your money",
        body: "Confirm once theirs is in your account.",
      },
      completed: { title: "Deal completed", body: "You both confirmed receiving the money." },
      declinedAuthor: { title: "Declined", body: "You declined this person." },
      declinedResponder: { title: "Declined", body: "The author declined or chose someone else." },
      cancelledAuthor: { title: "Request cancelled", body: "You cancelled the request." },
      cancelledResponder: { title: "Request cancelled", body: "The author cancelled it." },
      expired: { title: "Request expired", body: "It expired before an answer." },
      offerCancelledResponder: {
        title: "Offer cancelled",
        body: (left: number) => (left > 0 ? `You can send a new one: ${offersLeft(left)}.` : "No offers left on this request."),
      },
      offerCancelledAuthor: {
        title: "Offer withdrawn",
        body: "Your request stays on the board.",
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
    message: "Message",
    confirm: "Received payment",
    confirmed: "You confirmed",
    confirmQuestion:
      "Only confirm once their money is in your account. This can't be undone.",
    payTo: (money: string) => `Send ${money} to`,
    payToMissing: (currency: string) =>
      `They haven't added where they receive ${currency} yet. Ask them in chat.`,
    copy: "Copy",
    copied: "Copied",
    reportShort: "Report",
    reportedShort: "Reported",
    reported: "You reported this deal. An admin will review it.",
  },

  counter: {
    title: "Counter offer",
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
    introRequest: "The author won't know it was you.",
    introDeal: "An admin will review it. Admins can ban users, but can't move or return money.",
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
    request: (buys: string, pays: string) => `Request: buys ${buys} for ${pays}`,
    deal: (status: string) => `Deal: ${status}`,
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
    removeConfirm: (waiting: number) =>
      "Take this request off the board?" +
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
    tabs: {
      active: "Active",
      completed: "Completed",
      cancelled: "Cancelled",
    } satisfies Record<DealListState, string>,
    // Groups within the tabs.
    inProgress: "In progress",
    waiting: "Waiting for the author's answer",
    removed: "Requests taken off the board",
    declined: "Declined or withdrawn offers",
    lastWeek: "Last 7 days",
    earlier: "Earlier",
    activeHint: "Oldest first: a red dot marks deals accepted over a day ago and not finished.",
    completedHint: "Newest first. Finished deals are deleted 30 days after they end.",
    emptyActive: "No active deals",
    emptyCompleted: "No completed deals",
    emptyCancelled: "Nothing cancelled",
    // A deal's status, as admins see it (not from a side's point of view).
    status: {
      pending: "Waiting for the author",
      accepted: "In progress",
      declined: "Declined",
      cancelled: "Withdrawn by the taker",
      completed: "Completed",
    } satisfies Record<DealStatus, string>,
    counter: (status: string) => `${status} · counter offer`,
    // On the head of a card, how long ago it last changed (or was accepted).
    acceptedAgo: (ago: string) => `accepted ${ago}`,
    author: "Author",
    taker: "Taker",
    pays: "pays",
    // Whether this side confirmed receiving the other's payment.
    received: "Received",
    notReceived: "Not confirmed",
    rate: (pair: string, locked: boolean) => (locked ? `Locked at ${pair}` : `${pair} now`),
    started: (time: string) => `Started ${time}`,
    wanted: (buys: string, pays: string) => `Wanted ${buys} for ${pays}`,
    // `who` is the author or admin, e.g. "@aida".
    closedBy: {
      author: () => "Cancelled by its author",
      admin: (who: string) => `Removed by ${who}`,
      ban: (who: string) => `Closed when ${who} banned its author`,
      deal_deleted: (who: string) => `Closed when ${who} deleted its deal`,
    } satisfies Record<CloseReason, (who: string) => string>,
    closedByAdmin: "Removed by an admin",
    closedUnknown: "Cancelled (who did it wasn't recorded)",
    closer: "Closed it",
    takers: (count: number) => `Had taken it (${count})`,
    delete: "Delete deal",
    deleteConfirm: (accepted: boolean) =>
      "Delete this deal for both sides? Nobody is notified." +
      (accepted ? " Its request is cancelled, since no one else can take it." : "") +
      " Completed-deal counts don't change.",
  },

  adminUsers: {
    title: "Users",
    search: "Name, @username, university or ID",
    show: {
      all: "All",
      reported: "Reported",
      banned: "Banned",
    } satisfies Record<UserListFilter, string>,
    stats: {
      total: "Users",
      week: "Seen this week",
      reported: "Reported",
    },
    empty: "No users",
    emptySearch: "Nobody matches",
    more: (shown: number) => `Showing the ${shown} most recently seen. Search to find others.`,
    seen: (ago: string) => `seen ${ago}`,
    neverSeen: "not seen yet",
    // A user's page.
    noUsername: "No Telegram username: they can't post or take requests until they set one.",
    bannedNotice: "Banned: they can't post or take requests.",
    activity: {
      onBoard: "On the board",
      active: "Active deals",
      completed: "Completed",
    },
    account: "Account",
    telegramId: "Telegram ID",
    telegramName: "Telegram name",
    username: "Username",
    none: "None",
    joined: "Joined",
    lastSeen: "Last seen",
    alerts: "Alerts",
    alertsOff: "Off",
    receiving: "Receiving details",
    // Only whether they added them: admins never see the details.
    receivingState: (kzt: boolean, krw: boolean) =>
      `KZT ${kzt ? "added" : "missing"} · KRW ${krw ? "added" : "missing"}`,
    reportsAbout: "Reports about them",
    reportsAboutValue: (open: number, total: number) => (open > 0 ? `${open} open · ${total} in all` : String(total)),
    reportsSent: "Reports they sent",
    profile: "Profile",
    notFilled: "Not filled in",
    deals: "Recent deals",
    requests: "Recent requests",
    request: (buys: string, pays: string) => `Buys ${buys} for ${pays}`,
    posted: (time: string) => `Posted ${time}`,
    message: (username: string) => `Message @${username}`,
    open: "User info",
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
    missing: (currency: string) => `Add where you receive ${currency}, so they know where to pay you.`,
    open: "Add details",
  },

  profile: {
    you: "About you",
    youHint: "Shown on your requests and deals.",
    complete: "Profile complete",
    incomplete: "Profile incomplete",
    incompleteHint: "Fill in the fields marked in red to post and take requests.",
    usernameMissing: "To post and take requests you need a Telegram username: set one in Telegram Settings, then reopen the app.",
    required: "required",
    firstName: "First name",
    firstNamePlaceholder: "e.g. Adil",
    lastName: "Last name",
    lastNamePlaceholder: "e.g. Sultanov",
    university: "University",
    universityPlaceholder: "e.g. UNIST",
    year: "Year of enrollment",
    yearPlaceholder: "Choose",
    preview: "Others see",
    invalid: "Use letters only in names (and digits in the university), with no commas or emoji.",
    receiving: "Where you receive money",
    receivingHint: "Optional. Shown only to the other side of an accepted deal.",
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
    guide: "How it works",
    about: "About & support",
    admin: "Admin: reports",
    users: "Admin: users",
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
    history: "History",
    counter: (status: string) => `Counter offer · ${status}`,
    post: "Post a request",
    // The summary on top: counts of what's under way, what waits on the viewer, what's done.
    stats: {
      active: "Active",
      needsYou: "Need you",
      completed: "Completed",
    },
  },

  form: {
    title: "New request",
    editTitle: "Edit request",
    amountPlaceholder: "0",
    rateNow: (rate: string) => `Market rate: ${rate}`,
    duration: "Keep on the board",
    days: (days: number) => (days === 1 ? "1 day" : `${days} days`),
    counter: "Counter offers",
    counterHint: "Let people take just part of it.",
    counterLabel: "Smallest part",
    counterPlaceholder: "Smallest part (optional)",
    counterRange: (min: string, max: string) => `People can ask for ${min} up to ${max}.`,
    kztBank: "Preferred KZT bank",
    kztBankPlaceholder: "Optional, e.g. Kaspi",
    kztBankRemember: "Remember for my next requests",
    submit: "Post request",
    save: "Save changes",
    errors: {
      amount: "Enter an amount.",
      amountTooLarge: "That amount is too large.",
      counterAboveAmount: "At most the amount you get.",
      kztBank: "Use letters, digits and spaces only: no links or emoji.",
    },
    usernameRequired: "You need a Telegram username: set one in Telegram Settings, then reopen the app.",
    profileRequired: "Fill in your profile to post a request.",
    banned: "Your account can't post requests.",
  },

  created: {
    title: "Request posted",
    body: "The bot will message you when someone takes it.",
    matches: "Matches you can take now",
    noMatches: "No matches yet.",
    done: "Done",
  },

  guide: {
    title: "How it works",
    sections: [
      {
        title: "The basics",
        points: [
          "A free board for KZT ↔ KRW exchanges between students.",
          "The app never touches money: you pay each other directly.",
          "You need a Telegram username and a filled-in profile.",
        ],
      },
      {
        title: "Posting",
        points: [
          "The amount you type last (pay or get) is fixed. The other (≈) follows the market rate until you accept someone.",
          "Allow counter offers to let people take just part of it.",
          "It stays up 1 or 3 days. You can extend it.",
        ],
      },
      {
        title: "Market rate",
        points: [
          "Wise's live mid-market rate, refreshed every 15 minutes.",
          "If Wise is unavailable: ExchangeRate-API, then Currency API.",
          "It can differ a little from Google, which uses another data provider.",
          "Shown to 2 decimals; amounts use the exact rate.",
        ],
      },
      {
        title: "Taking",
        points: [
          "Take the whole request, or send a counter offer for part of it.",
          "Up to 3 offers per request. Once declined, you can't try again.",
        ],
      },
      {
        title: "Deals",
        points: [
          "Once accepted, you see each other's contact and where to pay.",
          "Tap Received payment when their money arrives.",
          "Accepted deals can't be cancelled. Problem? Tap Report.",
        ],
      },
      {
        title: "Alerts & privacy",
        points: [
          "Turn on alerts in a Board tab to hear about new requests.",
          "Your payment details are shown only to the other side of an accepted deal.",
        ],
      },
    ],
  },

  time: {
    days: (n: number) => `${n}d`,
    hours: (n: number) => `${n}h`,
    minutes: (n: number) => `${n}m`,
    kst: (formatted: string) => `${formatted} KST`,
    ago: (span: string) => `${span} ago`,
    justNow: "just now",
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
