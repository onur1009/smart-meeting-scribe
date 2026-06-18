import { app as s, BrowserWindow as r, ipcMain as p, desktopCapturer as m, session as w } from "electron";
import o from "path";
import { fileURLToPath as f } from "url";
const u = f(import.meta.url), a = o.dirname(u);
process.env.DIST = o.join(a, "../dist");
process.env.PUBLIC = s.isPackaged ? process.env.DIST : o.join(process.env.DIST, "../public");
let e;
function l() {
  e = new r({
    width: 1200,
    height: 800,
    icon: o.join(process.env.PUBLIC, "logo-light.png"),
    webPreferences: {
      preload: o.join(a, "preload.js"),
      nodeIntegration: !1,
      contextIsolation: !0
    }
  }), w.defaultSession.setPermissionRequestHandler((i, n, t) => {
    t(n === "media");
  }), process.env.VITE_DEV_SERVER_URL ? (e.loadURL(process.env.VITE_DEV_SERVER_URL), e.webContents.openDevTools()) : (e.loadFile(o.join(process.env.DIST, "index.html")), e.webContents.openDevTools()), e.webContents.on("console-message", (i, n, t, c, d) => {
    console.log(`[Renderer] ${t} (at ${d}:${c})`);
  });
}
s.on("ready", l);
s.on("window-all-closed", () => {
  process.platform !== "darwin" && s.quit();
});
s.on("activate", () => {
  r.getAllWindows().length === 0 && l();
});
p.handle("get-desktop-sources", async () => (await m.getSources({ types: ["window", "screen"], fetchWindowIcons: !1 })).map((n) => ({
  id: n.id,
  name: n.name
})));
