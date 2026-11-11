# 🎧 Soundboard Frontend (FE)

The **Soundboard Frontend** is a modern, responsive **React + TypeScript** application for managing, uploading, and playing sound clips.  
It integrates with a backend API for authentication, media management, and real-time event handling.

---

## 🚀 Features

- 🔐 **Authentication** — Secure login with JWT token management.  
- 🎵 **Soundboard Interface** — Upload, play, and organize sound clips.  
- ⚡ **Real-time Notifications** — Live updates via WebSockets.  
- 🎨 **Responsive Design** — Built with **TailwindCSS** for a fluid, mobile-friendly experience.  
- 🧩 **State Management** — Powered by **Redux Toolkit**.  
- 💾 **API Integration** — Communicates seamlessly with the Soundboard backend.

---

## 🧩 Run
|`npm i`| 
| `npm start` | Starts the app in development mode. Open [http://localhost:3000](http://localhost:3000) in your browser.
---

## 📂 Project Structure

```
src/
 ├── components/      # Reusable UI components
 ├── pages/           # Page-level components for routing
 ├── hooks/           # Custom React hooks
 ├── store/           # Redux slices and store configuration
 ├── modules/         # API and WebSocket integration
 ├── assets/          # Static assets (icons, images, etc.)
 ├── App.tsx          # Root application component
 └── index.tsx        # Application entry point
```


## 🧠 Development Notes

- The project uses 
- **TypeScript**
- **TailwindCSS** 
- **Redux Toolkit** 
- WebSocket connections are initialized in the `src/modules` directory 



## 🗺️ D&D-Builder unter `/bilder`

Dieses Repo enthaelt zusaetzlich einen Three.js/Vite-Builder (D&D-Welt)
als Sub-App unter dem Ordner [`bilder/`](./bilder). Deployed wird er unter
der Route `/bilder/` derselben Static Site (kein eigener Service, kein Link
im Soundboard — nur per direkter URL erreichbar, `noindex`).

```bash
# Dev (Vite dev-server, Port 5173)
cd bilder && npm install
npm run dev

# Build (manuell, nur Builder)
npm --prefix bilder run build         # -> build/bilder/

# Full-Build (CRA + Builder, das macht Render auto-matisch)
npm run build                         # react-scripts build && vite build
```

Routing: `public/_redirects` leitet `/bilder` und `/bilder/*` auf
`/bilder/index.html` um, `/*` weiter auf die React-SPA. Als Fallback gibt
es in `CustomRouter` eine `/bilder`-Route, die hart auf `/bilder/` umlenkt.

## 🧑‍💻 Author

**Dennis G.** — Lead Frontend Developer  
📧 Contact: `dennisgoericke@yahoo.de`

---

## 🪪 License

This project is licensed under the **MIT License**.  
See the [LICENSE](./LICENSE) file for more details.
