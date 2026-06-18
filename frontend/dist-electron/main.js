import { app as o, BrowserWindow as t, ipcMain as c, desktopCapturer as l, session as p } from "electron";
import e from "path";
import { fileURLToPath as m } from "url";
const f = m(import.meta.url), r = e.dirname(f);
process.env.DIST = e.join(r, "../dist");
process.env.PUBLIC = o.isPackaged ? process.env.DIST : e.join(process.env.DIST, "../public");
let s;
function a() {
  s = new t({
    width: 1200,
    height: 800,
    icon: e.join(process.env.PUBLIC, "logo-light.png"),
    webPreferences: {
      preload: e.join(r, "preload.js"),
      nodeIntegration: !1,
      contextIsolation: !0
    }
  }), p.defaultSession.setPermissionRequestHandler((d, n, i) => {
    i(n === "media");
  }), process.env.VITE_DEV_SERVER_URL ? s.loadURL(process.env.VITE_DEV_SERVER_URL) : s.loadFile(e.join(process.env.DIST, "index.html"));
}
o.on("ready", a);
o.on("window-all-closed", () => {
  process.platform !== "darwin" && o.quit();
});
o.on("activate", () => {
  t.getAllWindows().length === 0 && a();
});
c.handle("get-desktop-sources", async () => (await l.getSources({ types: ["window", "screen"], fetchWindowIcons: !1 })).map((n) => ({
  id: n.id,
  name: n.name
})));
