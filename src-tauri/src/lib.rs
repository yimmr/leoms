use std::net::{SocketAddr, TcpStream};
use std::process::Command;
use std::thread;
use std::time::Duration;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(serde::Serialize, serde::Deserialize, Default, Clone, Debug)]
pub struct DesktopConfig {
    pub workspace_path: Option<String>,
    pub port: Option<u16>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct BackendInfo {
    pub is_alive: bool,
    pub port: u16,
    pub workspace_path: Option<String>,
}

fn get_config_path() -> std::path::PathBuf {
    #[cfg(target_os = "windows")]
    let base = std::env::var("APPDATA")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    #[cfg(not(target_os = "windows"))]
    let base = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());

    std::path::Path::new(&base).join(".config").join("leoms").join("desktop.json")
}

pub fn load_desktop_config() -> DesktopConfig {
    let path = get_config_path();
    if let Ok(content) = std::fs::read_to_string(&path) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        DesktopConfig::default()
    }
}

pub fn save_desktop_config(config: &DesktopConfig) -> Result<(), String> {
    let path = get_config_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let content = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// Checks if leoms backend is listening on the given host and port
pub fn is_backend_alive(host: &str, port: u16) -> bool {
    let addr_str = format!("{}:{}", host, port);
    if let Ok(mut addrs) = std::net::ToSocketAddrs::to_socket_addrs(&addr_str) {
        if let Some(addr) = addrs.next() {
            return TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok();
        }
    }
    let socket = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&socket, Duration::from_millis(300)).is_ok()
}

/// Discovers the active port: reads .leoms/ui.json first, then probes 3200..=3209
pub fn find_active_port(workspace_dir: Option<&str>) -> u16 {
    // 1. Check workspace .leoms/ui.json metadata if workspace_dir exists
    if let Some(dir) = workspace_dir {
        let meta_path = std::path::Path::new(dir).join(".leoms").join("ui.json");
        if let Ok(content) = std::fs::read_to_string(&meta_path) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(port) = val.get("port").and_then(|p| p.as_u64()) {
                    let p16 = port as u16;
                    if is_backend_alive("127.0.0.1", p16) {
                        return p16;
                    }
                }
            }
        }
    }

    // 2. Fallback: probe ports 3200..=3209
    for p in 3200..=3209 {
        if is_backend_alive("127.0.0.1", p) {
            return p;
        }
    }

    3200
}

/// Start leoms backend daemon silently, optionally targeting a specific workspace directory
pub fn launch_backend_daemon(workspace_dir: Option<&str>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("wsl.exe");
        if let Some(dir) = workspace_dir {
            cmd.args(["--cd", dir]);
        }
        cmd.args(["-e", "leoms", "ui", "--daemon"]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        match cmd.spawn() {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("Failed to launch WSL leoms daemon: {}", e)),
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let mut cmd = Command::new("leoms");
        if let Some(dir) = workspace_dir {
            cmd.current_dir(dir);
        }
        cmd.args(["ui", "--daemon"]);
        match cmd.spawn() {
            Ok(_) => Ok(()),
            Err(_) => {
                let sh_cmd = if let Some(dir) = workspace_dir {
                    format!("cd \"{}\" && leoms ui --daemon", dir)
                } else {
                    "leoms ui --daemon".to_string()
                };
                match Command::new("sh").args(["-c", &sh_cmd]).spawn() {
                    Ok(_) => Ok(()),
                    Err(e) => Err(format!("Failed to launch leoms daemon: {}", e)),
                }
            }
        }
    }
}

/// Stop leoms backend daemon
pub fn kill_backend_daemon() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("wsl.exe");
        cmd.args(["-e", "leoms", "ui", "stop"]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        match cmd.status() {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("Failed to stop WSL leoms daemon: {}", e)),
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let mut cmd = Command::new("leoms");
        cmd.args(["ui", "stop"]);
        match cmd.status() {
            Ok(_) => Ok(()),
            Err(_) => {
                match Command::new("sh").args(["-c", "leoms ui stop"]).status() {
                    Ok(_) => Ok(()),
                    Err(e) => Err(format!("Failed to stop leoms daemon: {}", e)),
                }
            }
        }
    }
}

#[tauri::command]
fn check_backend_status() -> bool {
    let cfg = load_desktop_config();
    let port = find_active_port(cfg.workspace_path.as_deref());
    is_backend_alive("127.0.0.1", port)
}

#[tauri::command]
fn get_desktop_config() -> DesktopConfig {
    load_desktop_config()
}

#[tauri::command]
fn set_workspace_path(path: String) -> Result<(), String> {
    let mut cfg = load_desktop_config();
    cfg.workspace_path = Some(path);
    save_desktop_config(&cfg)
}

#[tauri::command]
fn get_backend_info() -> BackendInfo {
    let cfg = load_desktop_config();
    let ws = cfg.workspace_path.as_deref();
    let port = find_active_port(ws);
    let alive = is_backend_alive("127.0.0.1", port);
    BackendInfo {
        is_alive: alive,
        port,
        workspace_path: cfg.workspace_path,
    }
}

#[tauri::command]
fn start_backend(workspace_path: Option<String>) -> Result<BackendInfo, String> {
    let mut cfg = load_desktop_config();
    if let Some(ref p) = workspace_path {
        cfg.workspace_path = Some(p.clone());
        let _ = save_desktop_config(&cfg);
    }

    let target_dir = workspace_path.or(cfg.workspace_path.clone());
    let current_port = find_active_port(target_dir.as_deref());

    if is_backend_alive("127.0.0.1", current_port) {
        return Ok(BackendInfo {
            is_alive: true,
            port: current_port,
            workspace_path: target_dir,
        });
    }

    launch_backend_daemon(target_dir.as_deref())?;

    for _ in 0..30 {
        thread::sleep(Duration::from_millis(200));
        let p = find_active_port(target_dir.as_deref());
        if is_backend_alive("127.0.0.1", p) {
            return Ok(BackendInfo {
                is_alive: true,
                port: p,
                workspace_path: target_dir,
            });
        }
    }

    Ok(BackendInfo {
        is_alive: false,
        port: current_port,
        workspace_path: target_dir,
    })
}

#[tauri::command]
fn stop_backend() -> Result<bool, String> {
    kill_backend_daemon()?;
    Ok(true)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            check_backend_status,
            get_desktop_config,
            set_workspace_path,
            get_backend_info,
            start_backend,
            stop_backend
        ])
        .setup(|_app| {
            thread::spawn(|| {
                let cfg = load_desktop_config();
                let port = find_active_port(cfg.workspace_path.as_deref());
                if !is_backend_alive("127.0.0.1", port) {
                    log::info!("leoms backend not detected on 127.0.0.1:{}, auto-launching daemon...", port);
                    let _ = launch_backend_daemon(cfg.workspace_path.as_deref());
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
