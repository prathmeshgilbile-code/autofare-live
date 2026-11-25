# AutoFare Live — Mumbai Auto Meter Monitor

A public, no-login React/Vite website that tracks a passenger's GPS route in the browser and continuously estimates an Mumbai MMR auto-rickshaw fare. It includes a Google Map, GPS route polyline, trip timer, slow/stationary-time estimate, fare breakdown, optional manual meter comparison and shareable trip summary.

## Important tariff basis

Default configuration is Mumbai Metropolitan Region, effective 1 September 2026:

- Minimum fare: ₹27 (minimum distance 1.5 km)
- Distance rate: ₹18.22/km
- Waiting rate: 10% of the per-km rate per minute = ₹1.822/minute
- Night uplift: 25%, 00:00–05:00
- Qualifying large luggage: ₹6/package (not automatically added)

The calculation follows the MMR fare method: distance fare is `max(minimum fare, distance × per-km rate)`, plus qualifying waiting charge, with final rounding to the nearest rupee. Verify the current tariff card and any updated meter instructions before public launch.

Sources to verify before production:
- Maharashtra Motor Vehicle Department tariff-card list: https://transport.maharashtra.gov.in/Site/Common/ViewPdfList.aspx?Doctype=1d1f28f9-a4e5-4b09-ab8b-1d4576adca18
- MVD / Khatua Committee report on meter waiting calculation: https://transport.maharashtra.gov.in/Site/Upload/GR/Khatua%20Committee%20Report%20Part%202.pdf
- September 2026 fare revision coverage: https://indianexpress.com/article/cities/mumbai/auto-taxi-tariff-card-maharashtra-fare-hike-minimum-rates-september-1-10857022/

## Run locally

1. Install Node.js 20+.
2. In this folder run `npm install`.
3. Copy `.env.example` to `.env`.
4. Create a Google Maps JavaScript API key in Google Cloud Console, enable **Maps JavaScript API**, configure billing, and restrict the key to your development/deployment domains.
5. Put the key in `.env`:

   `VITE_GOOGLE_MAPS_API_KEY=your_real_key_here`

6. Run `npm run dev` and open the localhost URL printed by Vite.
7. For public deployment, run `npm run build` and deploy the generated `dist/` folder to Vercel, Netlify or another static host. Set the same environment variable in the hosting dashboard. Use HTTPS because browser geolocation requires a secure context (localhost is also allowed).

## How tracking works

- The browser Geolocation API collects high-accuracy location fixes while the trip is active.
- GPS points are filtered for poor accuracy, tiny jitter and implausible jumps, then drawn on Google Maps.
- Distance is the sum of accepted GPS segments (Haversine distance).
- Waiting is approximated using a speed threshold below 6 km/h and stationary GPS fixes. This is a proxy for the published meter convention (waiting at junctions / speed below 1 km in 10 minutes), not a certified meter emulator. The browser cannot reliably identify traffic junctions or duplicate the internal meter pulse algorithm.
- No login or backend is required. The route remains in browser memory and is not sent to a server by this application.

## Before real public launch

- Have the fare logic checked against the latest official tariff card by the relevant RTO/MMRTA.
- Add city-specific tariff profiles only after sourcing each official tariff.
- Test GPS traces on real devices and compare against calibrated auto meters over controlled routes.
- Keep API keys restricted; never commit a production key to a public repository. A browser Maps key is visible to visitors, so restrict it by HTTP referrer and API.
- Explain that GPS estimates are not evidence of meter tampering. Accuracy depends on device sensors, GPS reception and meter rules.

## Limitations

A website cannot guarantee uninterrupted background GPS on every phone/browser. Keep the page open and screen awake during the ride. Tunnels, buildings, low-power modes and poor reception may interrupt tracking. This initial version is a front-end MVP and does not store trip history across refreshes.
