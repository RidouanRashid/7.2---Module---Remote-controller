# Tetris — Remote Play

Multiplayer Tetris waarbij één apparaat het scherm (host) is en andere apparaten als controller verbinden via een roomcode. Gebruikt PeerJS voor peer-to-peer verbinding.

**Live:** [https://seven-2-module-remote-controller-1.onrender.com/](https://seven-2-module-remote-controller-1.onrender.com/)

## Gebruik

1. Open de link op een **groot scherm** en klik **Create Game** → je krijgt een roomcode.
2. Open de link op een **telefoon**, klik **Join as Controller**, vul je naam + roomcode in.
3. Host klikt **Start Game** — speel via het D-pad op je telefoon of met het toetsenbord op desktop.

### Toetsenbord (desktop)

| Toets | Actie |
|-------|-------|
| ← → | Links / Rechts |
| ↑ | Draaien |
| ↓ | Soft drop |
| Spatie | Hard drop |
| Z / C | Hold |
| P | Pauze |

## Features

- Meerdere spelers tegelijk via roomcode
- Blokken vallen sneller naarmate je meer lijnen cleart
- Toetsenbord-besturing op desktop
- Controller ondersteunt ook toetsenbord (pijltjes, spatie, Z/C, P)
- Mini Tetris-scherm op controller zodat je je eigen bord kunt volgen
- Lichtere, beter zichtbare blokkleuren

## Technologieën

HTML · CSS · JavaScript · [PeerJS](https://peerjs.com/) · [Render](https://render.com/)

## Feedback / Feedforward

### Feedback (wat goed gaat)
- Peer-to-peer verbinding werkt snel zonder eigen server
- Roomcode-systeem is simpel in gebruik
- Mobiel D-pad werkt goed als controller

### Feedforward (verwerkt)

| Tip | Status |
|-----|--------|
| Blokken sneller laten vallen over tijd | ✅ Verwerkt — snelheid stijgt elke 10 lijnen |
| Keyboard-besturing voor desktop | ✅ Verwerkt — pijltjestoetsen, spatie, Z/C, P |
| Lichtere kleuren | ✅ Verwerkt — blokken hebben nu heldere, lichtere kleuren |
| Controller toetsenbord + mini scherm | ✅ Verwerkt — controller werkt met keyboard en toont live mini-bord |