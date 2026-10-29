# Getting listed

1. **Run the suite** against your production endpoint. The runner needs a reachable
   HTTPS name of its own for the duration of the run, for example a tunnel:

   ```sh
   git clone https://github.com/Hakiwen/intertie && cd intertie && npm install
   # The home role: your implementation issues an invite, and the runner joins it.
   node packages/conformance/src/cli.ts home --invite 'intertie:your.org/<token>' \
     --org runner.example.net --endpoint https://runner.example.net/intertie --port 8790 --out report.json
   # The peer role: the runner prints an invite, and you accept it in your implementation.
   node packages/conformance/src/cli.ts peer --org runner.example.net --endpoint https://runner.example.net/intertie --out peer.json
   ```

2. **Sign** the report with your org's Intertie key. That is the key whose public half
   your `/.well-known/intertie` publishes:

   ```sh
   node packages/conformance/src/cli.ts sign report.json --key path/to/key.json --keyid your.org#<kid> --out signed.json
   node packages/conformance/src/cli.ts verify signed.json
   ```

3. **Open a pull request** that does two things:
   - adds `reports/<your-slug>.json` (the signed report);
   - adds one object to `implementations.json`:

   ```json
   { "name": "Acme Chat", "vendor": "Acme Inc", "url": "https://acme.example/chat",
     "org": "connect.acme.example", "kind": "native", "roles": ["home", "peer-push"],
     "levels": ["core", "threads", "reactions"], "protocol": "0.1",
     "date": "2026-10-29", "report": "reports/acme-chat.json", "license": "proprietary" }
   ```

   The rules:
   - `levels` and `roles` may only list what your signed report claims;
   - a report must be under about 13 months old;
   - your key must stay published for as long as you want the entry valid.

CI validates the entry. A listing claims that you tested your implementation; it does
not mean the maintainer audited it.
