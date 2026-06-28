// Prevent an extra console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// G-Orchestra v2 — Tauri shell (Face A of ADR-O-006).
// Phase 0/1: supervise the proven Node engine (server.mjs on :4577) as a sidecar
// child process and host the studio webview, which talks to it over the existing
// REST contract (vite proxies /api -> :4577 in dev). The Rust core + OrchestratorPort
// IPC (DESIGN §9.3) replaces this transport in Phase 2.

use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

/// Holds the supervised engine sidecar so we can kill it on app exit.
struct EngineSidecar(Mutex<Option<Child>>);

/// Spawn `node server.mjs` against the G-Orchestra backlog, with no flashing
/// console window on Windows (see memory: every Command spawn needs CREATE_NO_WINDOW).
fn spawn_engine() -> Option<Child> {
    // Dev: the orchestration dir is the parent of this crate (src-tauri).
    // TODO(phase-1): in a bundled build resolve this from the resource dir, not CARGO_MANIFEST_DIR.
    let orch_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent()?;

    let mut cmd = Command::new("node");
    cmd.arg("server.mjs")
        .current_dir(orch_dir)
        .env("GORCH_BACKLOG", "gks/backlog.gorch.json");

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    match cmd.spawn() {
        Ok(child) => {
            eprintln!("[g-orchestra] engine sidecar started (node server.mjs @ :4577)");
            Some(child)
        }
        Err(e) => {
            eprintln!("[g-orchestra] WARN: could not start engine sidecar: {e}");
            None
        }
    }
}

fn main() {
    tauri::Builder::default()
        .manage(EngineSidecar(Mutex::new(spawn_engine())))
        .build(tauri::generate_context!())
        .expect("error while building the G-Orchestra application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<EngineSidecar>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        });
}
