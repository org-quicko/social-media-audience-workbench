/**
 * Electron main process.
 *
 * Dev mode  → loads http://localhost:3000 (run `npm run dev` in parallel)
 * Production → serves the Next.js static export from the bundled `out/` dir
 *              via electron-serve (custom app:// protocol, avoids file:// quirks)
 */

const { app, BrowserWindow, shell } = require('electron')
const path = require('path')

// electron-serve registers a custom protocol so that Next.js asset paths
// (_next/static/…) resolve correctly inside a packaged Electron app.
// electron-serve v2+ is ESM-only; require() returns the module namespace
const serve = require('electron-serve').default

const isDev = !app.isPackaged

// Register the app:// protocol that maps to the static export directory.
// This is only needed (and only works) in production; in dev we load localhost.
const loadURL = isDev
  ? null
  : serve({ directory: path.join(__dirname, '../out') })

let mainWindow

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    // Don't show the window until content is ready — avoids a white flash
    show: false,
    webPreferences: {
      // Keep the renderer isolated; we don't expose any Node.js APIs to it
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  if (isDev) {
    // Point at the Next.js dev server
    await mainWindow.loadURL('http://localhost:3000')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    // Serve the statically exported Next.js app
    await loadURL(mainWindow)
  }

  // Any link that opens a new window (target="_blank") should open in the
  // user's default browser rather than a new Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(createWindow)

// On macOS keep the app running even when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  // On macOS re-create the window when the dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
