# 2D-Editor Asset-Lizenz

Alle in `palette.ts` enthaltenen Stempel sind **eigene Zeichnungen**, prozedural
mit dem HTML-Canvas-2D-Context erzeugt. Keine Fremdbilder, kein Hotlinking,
kein Abhängen von Online-Ressourcen.

- Quellcode: `src/mapEditor/palette.ts` (Runde 3d)
- Lizenz: **CC0 / Public Domain** — darfst du beliebig weiterverwenden.

User-Assets, die GMs über die Upload-Route hochladen (`/api/assets/upload`,
Firebase-Bucket), liegen in der Verantwortung des hochladenden Users. Der
Firebase-Bucket wird mit `public: true` bepackt; sensible Inhalte dort NICHT
hochladen.

Falls du eigene Fremdpakete (z. B. Kenney.nl, OpenGameArt) ergänzt:
1. Nur CC0 oder CC-BY-Pakete.
2. Bilder ins Repo (`public/assets/<pack>/`) oder in Firebase, nie hotlinken.
3. Bei CC-BY: Namensnennung hier ergänzen.
