# Subscription URL length constraints

The adapter hands the user a subscription URL to paste into their calendar
application. That URL must survive every target client. The binding limit is
**not** the browser or the HTTP spec — it is Google Calendar.

## Findings

| Client | Practical cap on a subscribed feed URL | Source |
|---|---|---|
| **Google Calendar** ("Add by URL") | **~225 characters total** — longer URLs fail with `FAILED TO IMPORT` | widely reported (OneCal, usecarly, text-to-cal community guides) |
| Apple Calendar (macOS / iOS, "Subscribe") | no documented tight cap; follows general client limits (thousands of chars) | Apple support docs list event/attachment limits, not URL length |
| Microsoft Outlook / Outlook on the web | no documented tight cap; general HTTP/browser limits apply | Microsoft subscribe docs |
| Browsers (address bar / fetch) | ≥ 2000 chars safe everywhere; Chrome ~2 MB, Safari tens of thousands | general web guidance |

**Conclusion: design every subscription URL to fit within 225 characters** so it
works in Google Calendar without a third-party shortener.

## Budget

Total ≤ 225 chars, allocated roughly as:

```
https://<host>/<prefix>/<envelope>.ics
└─ 8 ─┘└── ~25 ──┘└ ~8 ┘└── envelope ──┘└ 4 ┘
```

- `https://` — 8
- host — assume up to ~25 (a per-core FQDN; longer hosts shrink the envelope budget further)
- path prefix — keep short (single short segment)
- `.ics` suffix — 4

That leaves roughly **180 characters for the opaque envelope segment**. The
signed/sealed URL mode must encode `{apiEndpoint, mappingId, exp}` plus its
authentication tag within that budget — which rules out a standard JWT (JSON +
base64 headers blow the budget) in favour of a compact binary envelope
(base64url, no padding).

## Measured (live)

Against a real account on a `*.pryv.me` host (14-char username, 30-day expiry on
the sealed URL):

| Mode | Example length | Margin under 225 |
|---|---|---|
| plaintext | 148 chars | 77 |
| sealed (AES-256-GCM) | 200 chars | 25 |

The host segment is the main variable: a longer username or a longer platform
domain eats directly into the sealed-mode margin, so very long hosts may need a
shorter route prefix or a shortener for Google specifically.

## Implications for the URL modes

- **Plaintext mode** (`feed/<apiEndpoint>/<token>/<mappingId>.ics`) only fits the
  225-char budget for short hosts and short mapping ids; it is the simplest mode
  and accepts that the token is visible in the URL.
- **Sealed mode** must be measured against this budget for the longest realistic
  `apiEndpoint`. Prefer the shortest authenticated binary envelope that still
  carries an expiry and supports revocation.
