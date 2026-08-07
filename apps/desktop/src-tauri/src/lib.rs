use std::fs::File;
use std::net::TcpStream;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use flate2::read::GzDecoder;
use tar::Archive;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Manager, WindowEvent};

const SERVER_PORT: u16 = 3100;

// Keeps the spawned Node server's child handle alive for the app's lifetime so
// it isn't dropped (and killed) as soon as `setup()` returns. Not read anywhere
// else — its only job is to outlive the app.
struct ServerProcess(#[allow(dead_code)] Option<Child>);

// Replaces the still-loaded placeholder page's content in-place via eval —
// avoids needing to know Tauri's local-asset URL scheme to navigate to a
// second static HTML file. Without this, a user without Node.js installed
// just sees the placeholder's "Starting…" forever, with the real reason
// buried in a log file they'd never think to open.
fn show_startup_error(window: &tauri::WebviewWindow, title: &str, message: &str, link: Option<&str>) {
  let link_html = match link {
    Some(url) => format!(
      "<a href={} style=\"color:#a78bfa\">{}</a>",
      serde_json::to_string(url).unwrap_or_default(),
      serde_json::to_string(url).unwrap_or_default(),
    ),
    None => String::new(),
  };
  let body_html = format!(
    "<div style=\"max-width:420px;text-align:center;font-family:sans-serif\"><h2 style=\"margin:0 0 12px\">{}</h2><p style=\"color:#b7bcd6;line-height:1.5\">{}</p>{}</div>",
    title, message, link_html
  );
  let js = format!(
    "document.body.style.cssText='background:#0b0c12;color:#e4e6f0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'; document.body.innerHTML = {};",
    serde_json::to_string(&body_html).unwrap_or_default()
  );
  let _ = window.eval(&js);
}

fn wait_for_server_ready(port: u16, timeout: Duration) -> bool {
  let deadline = std::time::Instant::now() + timeout;
  while std::time::Instant::now() < deadline {
    if TcpStream::connect(("127.0.0.1", port)).is_ok() {
      return true;
    }
    std::thread::sleep(Duration::from_millis(200));
  }
  false
}

// GUI apps launched from Finder/Dock/`open` do NOT inherit the PATH set up
// by the user's shell profile (.zshrc/.bash_profile) — which is exactly
// where nvm (and many other Node installs) put `node`. A bare
// `Command::new("node")` reliably fails in that context even though `node`
// works fine from any terminal. Resolving it through a login shell picks up
// the same PATH a terminal would have.
fn resolve_node_path() -> Option<std::path::PathBuf> {
  let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
  let output = Command::new(&shell).arg("-lc").arg("command -v node").output().ok()?;
  if !output.status.success() {
    return None;
  }
  let trimmed = String::from_utf8(output.stdout).ok()?.trim().to_string();
  if trimmed.is_empty() {
    None
  } else {
    Some(std::path::PathBuf::from(trimmed))
  }
}

// `resource_dir()` (and other Tauri path APIs) return `\\?\`-prefixed
// (verbatim) paths on Windows. Node's module resolution (`resolveMainPath` /
// `fs.realpathSync`) mishandles that prefix and throws `EISDIR: illegal
// operation on a directory, lstat 'C:'` instead of finding the entry script.
// Passing the plain (non-verbatim) path avoids the bug.
#[cfg(windows)]
fn strip_verbatim_prefix(path: &std::path::Path) -> std::path::PathBuf {
  let s = path.to_string_lossy();
  match s.strip_prefix(r"\\?\") {
    Some(stripped) => std::path::PathBuf::from(stripped),
    None => path.to_path_buf(),
  }
}

#[cfg(not(windows))]
fn strip_verbatim_prefix(path: &std::path::Path) -> std::path::PathBuf {
  path.to_path_buf()
}

// Bundled as a single .tar.gz (see build-desktop.sh) instead of thousands of
// individual files under `bundle.resources`. Per-file NSIS bundling failed
// on this app: many paths here — deeply nested node_modules files, or
// Next.js dynamic API routes like [projectId]/session/runs/[runId]/outputs —
// exceed Windows' 260-char MAX_PATH once prefixed with this repo's absolute
// path, and makensis.exe isn't long-path-aware. One archive is one short
// path, sidestepping the problem entirely.
//
// Extracted once into the app's local data dir (writable — unlike the
// install directory under Program Files, which is often read-only for
// non-admin users) and re-extracted only when the bundled app version
// changes, so ordinary launches don't pay a ~400MB unzip cost every time.
fn ensure_server_extracted(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
  let resource_dir = app.path().resource_dir().ok()?;
  let archive_path = strip_verbatim_prefix(&resource_dir.join("next-standalone.tar.gz"));
  if !archive_path.exists() {
    log::error!("bundled archive not found at {:?}", archive_path);
    return None;
  }

  let data_dir = strip_verbatim_prefix(&app.path().app_local_data_dir().ok()?);
  let extract_dir = data_dir.join("next-standalone");
  let version_marker = data_dir.join("next-standalone.version");
  let current_version = app.package_info().version.to_string();

  let already_extracted = extract_dir.join("apps").join("promptfarm").join("server.js").exists()
    && std::fs::read_to_string(&version_marker)
      .map(|v| v == current_version)
      .unwrap_or(false);

  if already_extracted {
    return Some(extract_dir);
  }

  log::info!("extracting bundled server to {:?}", extract_dir);
  let _ = std::fs::remove_dir_all(&extract_dir);
  if let Err(e) = std::fs::create_dir_all(&extract_dir) {
    log::error!("failed to create extraction dir {:?}: {e}", extract_dir);
    return None;
  }

  let file = match File::open(&archive_path) {
    Ok(f) => f,
    Err(e) => {
      log::error!("failed to open bundled archive {:?}: {e}", archive_path);
      return None;
    }
  };
  let mut archive = Archive::new(GzDecoder::new(file));
  if let Err(e) = archive.unpack(&extract_dir) {
    log::error!("failed to extract bundled archive: {e}");
    return None;
  }

  if let Err(e) = std::fs::write(&version_marker, &current_version) {
    log::error!("failed to write extraction version marker: {e}");
  }

  Some(extract_dir)
}

// A portable Node.js binary is fetched at build time and bundled inside
// next-standalone.tar.gz (see fetch-portable-node.sh) so the app never
// depends on the end user having Node.js installed system-wide. Falls back
// to a system install only if that's somehow missing — e.g. a dev build
// that skipped the fetch step.
fn resolve_bundled_node_path(extract_dir: &std::path::Path) -> Option<std::path::PathBuf> {
  let bin_name = if cfg!(windows) { "node.exe" } else { "node" };
  let bundled = extract_dir.join("node-runtime").join(bin_name);
  if bundled.exists() {
    Some(bundled)
  } else {
    None
  }
}

fn spawn_production_server(app: &tauri::AppHandle) -> Option<Child> {
  let extract_dir = ensure_server_extracted(app)?;
  let server_js = extract_dir.join("apps").join("promptfarm").join("server.js");
  let server_cwd = server_js.parent().unwrap().to_path_buf();

  if !server_js.exists() {
    log::error!("bundled server.js not found at {:?}", server_js);
    return None;
  }

  let node_path = resolve_bundled_node_path(&extract_dir)
    .or_else(resolve_node_path)
    .unwrap_or_else(|| std::path::PathBuf::from("node"));
  log::info!("using node at {:?}", node_path);

  // The bundled server's own stdout/stderr (Next.js startup errors, uncaught
  // exceptions, etc.) — piped but never read would just fill an OS buffer and
  // eventually stall the child; a file gives us both a sink and a way to
  // diagnose "the server exited immediately" after the fact.
  let log_dir = app.path().app_log_dir().unwrap_or(server_cwd.clone());
  let _ = std::fs::create_dir_all(&log_dir);
  let stdout_log = std::fs::File::create(log_dir.join("next-server.log")).ok();
  let stderr_log = stdout_log
    .as_ref()
    .and_then(|f| f.try_clone().ok());

  // The SQLite database and uploaded project files default to living under
  // the server's cwd (see db.ts/localFileStorage.ts) — but that cwd is
  // *inside* the extracted next-standalone folder, which gets deleted and
  // re-extracted on every version change (see ensure_server_extracted).
  // Without this, every app update would silently wipe all of the user's
  // projects. PROMPTFARM_DATA_DIR points them at the stable parent instead.
  let data_dir = app
    .path()
    .app_local_data_dir()
    .ok()
    .map(|d| strip_verbatim_prefix(&d));

  let mut command = Command::new(&node_path);
  command
    .arg(&server_js)
    .current_dir(&server_cwd)
    .env("PORT", SERVER_PORT.to_string());
  if let Some(data_dir) = &data_dir {
    command.env("PROMPTFARM_DATA_DIR", data_dir);
  } else {
    log::error!("could not resolve app_local_data_dir — database/files will live inside the versioned extraction folder and be wiped on update");
  }
  match command
    // Provider choice now lives in the Settings screen (AppSetting table in
    // SQLite), not here — first run redirects to /tofo/settings until the
    // user picks Ollama / Claude API key / Claude CLI.
    .stdout(stdout_log.map(Stdio::from).unwrap_or_else(Stdio::null))
    .stderr(stderr_log.map(Stdio::from).unwrap_or_else(Stdio::null))
    .spawn()
  {
    Ok(child) => {
      log::info!("spawned bundled Next.js server: {:?}", server_js);
      Some(child)
    }
    Err(e) => {
      log::error!(
        "failed to spawn `node` for the bundled server (tried {:?}) — is Node.js installed? {e}",
        node_path
      );
      None
    }
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      // Kept on in release too: this spawns a bundled background server the
      // user never directly interacts with, so a log file is the only way to
      // diagnose "it didn't start" without a debug build.
      app.handle().plugin(
        tauri_plugin_log::Builder::default()
          .level(log::LevelFilter::Info)
          .build(),
      )?;

      // Dev mode already has a live Next.js dev server via `devUrl` +
      // `beforeDevCommand` (see tauri.conf.json) — nothing to spawn here.
      // Release builds have no such thing: the window opens on a static
      // placeholder (`frontendDist`) and this is what replaces it with the
      // bundled, real Next.js server once it's ready.
      if !cfg!(debug_assertions) {
        // Everything here — the `node --version` probe, extracting the
        // bundled archive (up to ~400MB on first run or after an update),
        // spawning the server, and polling for it to come up — used to run
        // inline in .setup(), which is the main UI thread. On a slow disk
        // the extraction alone could block the event loop for seconds; the
        // TCP poll added up to 30s more on top. Either way the placeholder
        // window couldn't repaint and looked hung rather than loading.
        // Running the whole sequence on a background thread keeps the UI
        // responsive; run_on_main_thread hands only the final window
        // mutation (navigate / show_startup_error) back to the main thread,
        // which Tauri's webview APIs require.
        let app_handle = app.handle().clone();
        std::thread::spawn(move || {
          let node_missing = resolve_node_path().is_none() && Command::new("node").arg("--version").output().is_err();
          let child = spawn_production_server(&app_handle);
          let spawn_failed = child.is_none();
          app_handle.manage(Mutex::new(ServerProcess(child)));

          let server_ready = !spawn_failed && wait_for_server_ready(SERVER_PORT, Duration::from_secs(30));
          let main_thread_handle = app_handle.clone();
          let _ = app_handle.run_on_main_thread(move || {
            let Some(window) = main_thread_handle.get_webview_window("main") else { return };
            if server_ready {
              let url = format!("http://127.0.0.1:{SERVER_PORT}/").parse().unwrap();
              let _ = window.navigate(url);
            } else {
              log::error!("bundled server did not become ready within 30s");
              if node_missing {
                show_startup_error(
                  &window,
                  "Node.js required",
                  "TOFO needs Node.js installed to run its local server. Install it from nodejs.org, then restart TOFO.",
                  Some("https://nodejs.org/"),
                );
              } else {
                show_startup_error(
                  &window,
                  "TOFO failed to start",
                  "The local server didn't start in time. Check the log file for details, or restart TOFO.",
                  None,
                );
              }
            }
          });
        });
      }

      // ── System tray: closing the window hides it instead of quitting the
      // app, so a long-running simulation survives minimizing/closing to tray. ──
      let show_item = MenuItem::with_id(app, "show", "Show TOFO", true, None::<&str>)?;
      let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

      TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
          "show" => {
            if let Some(window) = app.get_webview_window("main") {
              let _ = window.show();
              let _ = window.set_focus();
            }
          }
          "quit" => app.exit(0),
          _ => {}
        })
        .on_tray_icon_event(|tray, event| {
          if let tauri::tray::TrayIconEvent::Click {
            button: tauri::tray::MouseButton::Left,
            button_state: tauri::tray::MouseButtonState::Up,
            ..
          } = event
          {
            let app = tray.app_handle();
            if let Some(window) = app.get_webview_window("main") {
              let _ = window.show();
              let _ = window.set_focus();
            }
          }
        })
        .build(app)?;

      Ok(())
    })
    .on_window_event(|window, event| {
      if let WindowEvent::CloseRequested { api, .. } = event {
        let _ = window.hide();
        api.prevent_close();
      }
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| {
      // `Child` is not killed automatically when dropped, and app.exit(0)
      // (the tray "Quit" handler) tears down the process without ever
      // dropping the managed state — so without this, the bundled Node
      // server survives as an orphan holding the SQLite DB lock and
      // port 3100, breaking the *next* launch until it's killed manually.
      if let tauri::RunEvent::Exit = event {
        if let Some(state) = app_handle.try_state::<Mutex<ServerProcess>>() {
          if let Ok(mut guard) = state.lock() {
            if let Some(child) = guard.0.as_mut() {
              let _ = child.kill();
            }
          }
        }
      }
    });
}
