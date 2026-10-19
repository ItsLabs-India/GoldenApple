# Security

Golden Apple is a static website. There is no server, no database and no password: on your own everything stays in your browser, and in a room it lives in the host's browser and travels directly between players.

## Reporting a problem

Please report security problems privately, not as a public issue: on GitHub, open **Security → Report a vulnerability** on this repository. Include what you did, what you expected and what happened. Reports are read and answered as soon as possible.

## What to know

- **Rooms are for teams you trust.** Anyone with the 6-letter room code can join and can sign in with any email in that room (there are no passwords), so they could open another member's profile and inbox. Emails are visible only to the host, never to other guests.
- **Guests can't harm the host.** The host checks every message a guest sends: profile fields, gifts and budgets, and player-state messages are validated and trimmed, and a guest that floods the host is cut off.
- **Everything players type is escaped** before it is shown, and the game page has a Content Security Policy that blocks injected and foreign scripts.
- **Scripts from other sites are pinned.** The three libraries (three.js, PeerJS, QR code) load from cdnjs with integrity hashes, so a changed file is refused.
- **Counts only.** If visitor counts are switched on they carry only a random anonymous ID, never a name or email.
- **Rooms use the public PeerJS signalling service** only to make the first connection. It sees room codes and network addresses of the people connecting, not game data. Rooms work on one shared Wi-Fi network.
