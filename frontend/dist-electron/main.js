import { app as n, BrowserWindow as t, ipcMain as d, desktopCapturer as c, session as p } from "electron";
import e from "path";
process.env.DIST = e.join(__dirname, "../dist");
process.env.PUBLIC = n.isPackaged ? process.env.DIST : e.join(process.env.DIST, "../public");
let s;
function r() {
  s = new t({
    width: 1200,
    height: 800,
    icon: e.join(process.env.PUBLIC, "logo-light.png"),
    webPreferences: {
      preload: e.join(__dirname, "preload.js"),
      nodeIntegration: !1,
      contextIsolation: !0
    }
  }), p.defaultSession.setPermissionRequestHandler((a, o, i) => {
    i(o === "media");
  }), process.env.VITE_DEV_SERVER_URL ? s.loadURL(process.env.VITE_DEV_SERVER_URL) : s.loadFile(e.join(process.env.DIST, "index.html"));
}
n.on("ready", r);
n.on("window-all-closed", () => {
  process.platform !== "darwin" && n.quit();
});
n.on("activate", () => {
  t.getAllWindows().length === 0 && r();
});
d.handle("get-desktop-sources", async () => (await c.getSources({ types: ["window", "screen"], fetchWindowIcons: !1 })).map((o) => ({
  id: o.id,
  name: o.name
})));
