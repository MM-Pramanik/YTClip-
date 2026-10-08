const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ytclip", {
  detectTools: () => ipcRenderer.invoke("tools:detect"),
  chooseFolder: () => ipcRenderer.invoke("dialog:folder"),
  startJob: spec => ipcRenderer.invoke("job:start", spec),
  cancelJob: id => ipcRenderer.invoke("job:cancel", id),
  openFolder: folder => ipcRenderer.invoke("folder:open", folder),
  onJobEvent: callback => ipcRenderer.on("job:event", (_, data) => callback(data))
});