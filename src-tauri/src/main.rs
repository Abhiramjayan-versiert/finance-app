// FINANCE OS desktop shell (Windows, macOS, Linux).
// Opens the live FINANCE OS web app in a native window, so every update made
// to the website reaches desktop users instantly. No local data is stored by
// the shell itself; the in-app prompt handles new desktop builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running FINANCE OS");
}
