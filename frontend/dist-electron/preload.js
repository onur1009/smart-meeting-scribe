import { contextBridge as e, ipcRenderer as o } from "electron";
e.exposeInMainWorld("electronAPI", {
  getDesktopSources: () => o.invoke("get-desktop-sources")
});
