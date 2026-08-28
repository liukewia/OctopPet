use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    window::Color, AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, WebviewWindow,
};
use tauri_plugin_opener::OpenerExt;

/// Logical pixels between the chat window bottom edge and the work-area bottom.
pub const CHAT_BOTTOM_GAP_LOGICAL: f64 = 96.0;

/// Back-compat alias used by older call sites / docs.
pub const BOTTOM_GAP_LOGICAL: f64 = CHAT_BOTTOM_GAP_LOGICAL;

static SETTINGS_HAS_BEEN_SHOWN: AtomicBool = AtomicBool::new(false);
static KEEP_WINDOWS_VISIBLE: AtomicBool = AtomicBool::new(true);

pub fn should_hide_on_close(label: &str) -> bool {
    matches!(label, "chat" | "settings")
}

/// Chat and settings hide on click-away only when the setting is off.
/// The pet never hides this way.
pub fn should_hide_on_unfocus(label: &str, keep_windows_visible: bool) -> bool {
    !keep_windows_visible && matches!(label, "chat" | "settings")
}

fn keep_windows_visible() -> bool {
    KEEP_WINDOWS_VISIBLE.load(Ordering::SeqCst)
}

/// Apply macOS hide-on-deactivate / Transient vs Stationary.
fn apply_macos_deactivate_behavior(window: &WebviewWindow, keep_visible: bool) {
    #[cfg(target_os = "macos")]
    {
        let _ = window.with_webview(move |webview| {
            use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};
            unsafe {
                let ns_window: &NSWindow = &*webview.ns_window().cast();
                ns_window.setHidesOnDeactivate(!keep_visible);
                let mut behavior = ns_window.collectionBehavior();
                if keep_visible {
                    behavior.remove(NSWindowCollectionBehavior::Transient);
                    behavior.insert(NSWindowCollectionBehavior::Stationary);
                } else {
                    behavior.remove(NSWindowCollectionBehavior::Stationary);
                    behavior.insert(NSWindowCollectionBehavior::Transient);
                }
                ns_window.setCollectionBehavior(behavior);
            }
        });
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window;
        let _ = keep_visible;
    }
}

/// Keep a window on screen after the user clicks another app.
pub fn keep_visible_on_app_deactivate(window: &WebviewWindow) {
    apply_macos_deactivate_behavior(window, true);
}

/// Load the setting and apply it to chat/settings. Pet always stays visible.
#[tauri::command]
pub fn apply_window_deactivate_policy(app: AppHandle) -> Result<(), String> {
    let keep = crate::config_cmd::load_config(app.clone())
        .map(|cfg| cfg.keep_windows_visible)
        .unwrap_or(true);
    KEEP_WINDOWS_VISIBLE.store(keep, Ordering::SeqCst);

    if let Some(pet) = app.get_webview_window("pet") {
        keep_visible_on_app_deactivate(&pet);
    }
    if let Some(chat) = app.get_webview_window("chat") {
        let _ = chat.set_always_on_top(keep);
        apply_macos_deactivate_behavior(&chat, keep);
    }
    if let Some(settings) = app.get_webview_window("settings") {
        apply_macos_deactivate_behavior(&settings, keep);
    }
    Ok(())
}

pub fn handle_window_focus_change(window: &tauri::Window, focused: bool) {
    let label = window.label();
    if label == "pet" {
        ensure_pet_transparent(window.app_handle());
        return;
    }

    if keep_windows_visible() {
        if let Some(win) = window.app_handle().get_webview_window(label) {
            apply_macos_deactivate_behavior(&win, true);
            if label == "chat" {
                let _ = win.set_always_on_top(true);
            }
        }
        return;
    }

    if !focused && should_hide_on_unfocus(label, false) {
        let _ = window.hide();
    }
}

#[cfg(windows)]
mod windows_dwm {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use tauri::WebviewWindow;

    /// Windows 11 DWMWA_COLOR_NONE — hide the 1px HWND border.
    const COLOR_NONE: u32 = 0xFFFF_FFFE;
    const DWMWA_BORDER_COLOR: u32 = 34;
    const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33;
    const DWMWCP_DONOTROUND: i32 = 1;

    #[repr(C)]
    struct Margins {
        cx_left_width: i32,
        cx_right_width: i32,
        cy_top_height: i32,
        cy_bottom_height: i32,
    }

    #[link(name = "dwmapi")]
    extern "system" {
        fn DwmSetWindowAttribute(
            hwnd: isize,
            dw_attribute: u32,
            pv_attribute: *const std::ffi::c_void,
            cb_attribute: u32,
        ) -> i32;
        fn DwmExtendFrameIntoClientArea(hwnd: isize, pmarinset: *const Margins) -> i32;
    }

    pub fn apply_transparent_chrome(window: &WebviewWindow) {
        let hwnd = match window.window_handle().ok().map(|h| h.as_raw()) {
            Some(RawWindowHandle::Win32(handle)) => handle.hwnd.get(),
            _ => return,
        };
        unsafe {
            let color = COLOR_NONE;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_BORDER_COLOR,
                (&color as *const u32).cast(),
                std::mem::size_of_val(&color) as u32,
            );
            let preference = DWMWCP_DONOTROUND;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWA_WINDOW_CORNER_PREFERENCE,
                (&preference as *const i32).cast(),
                std::mem::size_of_val(&preference) as u32,
            );
            // Margins of -1 turn the HWND into a DWM "sheet of glass":
            // white client fill + caption buttons on frameless windows.
            // Keep the frame collapsed so only WebView2 pixels show.
            let margins = Margins {
                cx_left_width: 0,
                cx_right_width: 0,
                cy_top_height: 0,
                cy_bottom_height: 0,
            };
            let _ = DwmExtendFrameIntoClientArea(hwnd, &margins);
        }
    }
}

#[cfg(not(windows))]
fn apply_windows_dwm_transparent_chrome(_window: &WebviewWindow) {}

#[cfg(windows)]
fn apply_windows_dwm_transparent_chrome(window: &WebviewWindow) {
    windows_dwm::apply_transparent_chrome(window);
}

/// Chat/settings: on Windows, OS `shadow` is a rectangular NC inset that
/// reads as an outer frame around the CSS-rounded card.
pub fn ensure_dialog_window_transparent(window: &WebviewWindow) {
    #[cfg(windows)]
    {
        if let Err(error) = window.set_decorations(false) {
            eprintln!("failed to disable {} decorations: {error}", window.label());
        }
        if let Err(error) = window.set_shadow(false) {
            eprintln!("failed to disable {} shadow: {error}", window.label());
        }
        if let Err(error) = window.set_background_color(Some(Color(0, 0, 0, 0))) {
            eprintln!("failed to clear {} background: {error}", window.label());
        }
        apply_windows_dwm_transparent_chrome(window);
    }
    #[cfg(not(windows))]
    {
        let _ = window;
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransparentChromeTarget {
    Pet,
    Dialog,
}

pub fn transparent_chrome_target(label: &str) -> Option<TransparentChromeTarget> {
    match label {
        "pet" => Some(TransparentChromeTarget::Pet),
        "chat" | "settings" => Some(TransparentChromeTarget::Dialog),
        _ => None,
    }
}

pub fn ensure_window_surface_transparent(window: &tauri::Window) {
    match transparent_chrome_target(window.label()) {
        Some(TransparentChromeTarget::Pet) => ensure_pet_transparent(window.app_handle()),
        Some(TransparentChromeTarget::Dialog) => {
            if let Some(win) = window.app_handle().get_webview_window(window.label()) {
                ensure_dialog_window_transparent(&win);
            }
        }
        None => {}
    }
}

/// Apply Windows transparent chrome to chat/settings (pet is handled separately).
pub fn ensure_dialog_windows_transparent(app: &AppHandle) {
    for label in ["chat", "settings"] {
        if let Some(win) = app.get_webview_window(label) {
            ensure_dialog_window_transparent(&win);
        }
    }
}

/// macOS often paints an opaque gray canvas / OS shadow on the pet window
/// when it enters drag mode or resigns key (e.g. chat takes focus).
/// Windows 11 also draws a 1px HWND border and an opaque client canvas.
/// Re-assert clear background / no OS shadow on the main thread.
pub fn ensure_pet_transparent(app: &AppHandle) {
    let Some(pet) = app.get_webview_window("pet") else {
        return;
    };
    let _ = pet.set_focusable(false);
    if let Err(error) = pet.set_decorations(false) {
        eprintln!("failed to disable pet decorations: {error}");
    }
    if let Err(error) = pet.set_shadow(false) {
        eprintln!("failed to disable pet shadow: {error}");
    }
    // Clears NSWindow + WKWebView (drawsBackground / underPageBackgroundColor).
    if let Err(error) = pet.set_background_color(Some(Color(0, 0, 0, 0))) {
        eprintln!("failed to clear pet background: {error}");
    }

    #[cfg(target_os = "macos")]
    {
        // Tauri set_shadow can race with AppKit drag/focus; force NSWindow flags.
        let _ = pet.with_webview(|webview| {
            use objc2_app_kit::{NSColor, NSWindow};
            unsafe {
                let ns_window: &NSWindow = &*webview.ns_window().cast();
                ns_window.setHasShadow(false);
                ns_window.setOpaque(false);
                ns_window.setBackgroundColor(Some(&NSColor::clearColor()));
                ns_window.invalidateShadow();
            }
        });
    }
    apply_windows_dwm_transparent_chrome(&pet);
    keep_visible_on_app_deactivate(&pet);

    // Force the page canvas clear in case CSS left a gray layer.
    let _ = pet.eval(
        r#"(function(){
  var root=document.documentElement;
  root.style.setProperty('background','transparent','important');
  root.style.setProperty('background-color','transparent','important');
  root.style.colorScheme='normal';
  if(document.body){
    document.body.style.setProperty('background','transparent','important');
    document.body.style.setProperty('background-color','transparent','important');
  }
  var el=document.getElementById('root');
  if(el){
    el.style.setProperty('background','transparent','important');
    el.style.setProperty('background-color','transparent','important');
  }
})()"#,
    );
}

/// Re-clear pet chrome after focus/drag races settle (chat becoming key, etc.).
pub fn ensure_pet_transparent_after_focus_race(app: &AppHandle) {
    ensure_pet_transparent(app);
    let handle = app.clone();
    std::thread::spawn(move || {
        for delay_ms in [16_u64, 50, 150, 400] {
            std::thread::sleep(std::time::Duration::from_millis(delay_ms));
            let app = handle.clone();
            let _ = handle.run_on_main_thread(move || {
                ensure_pet_transparent(&app);
            });
        }
    });
}

/// Periodically re-assert pet transparency on the **main thread**.
/// Calling AppKit/WebView chrome APIs from a worker thread can itself
/// corrupt the transparent layer into a gray rectangle.
pub fn spawn_pet_transparency_watchdog(app: &AppHandle) {
    let handle = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(2));
        let app = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            ensure_pet_transparent(&app);
        });
    });
}

pub fn home_url(base_url: &str) -> Result<String, String> {
    let base_url = base_url.trim().trim_end_matches('/');
    if base_url.is_empty() {
        return Err("base URL cannot be empty".into());
    }
    Ok(format!("{base_url}/"))
}

/// macOS window resize animation. AppKit's default `setFrame:animate:` is ~0.2s
/// and reads as a snap for compact ↔ expanded chat.
pub const RESIZE_ANIMATION_DURATION: f64 = 0.36;

/// Keep the top-left origin's x, and shift y so the bottom edge stays put.
pub fn bottom_anchored_position(
    old_position: (i32, i32),
    old_outer: (u32, u32),
    new_outer: (u32, u32),
) -> (i32, i32) {
    let dy = old_outer.1 as i32 - new_outer.1 as i32;
    (old_position.0, old_position.1 + dy)
}

fn apply_bottom_anchored_size_fallback(
    window: &WebviewWindow,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let old_outer = window
        .outer_size()
        .map_err(|error| format!("failed to read window size: {error}"))?;
    let old_pos = window
        .outer_position()
        .map_err(|error| format!("failed to read window position: {error}"))?;
    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|error| format!("failed to resize window: {error}"))?;
    let new_outer = window
        .outer_size()
        .map_err(|error| format!("failed to read window size: {error}"))?;
    let (x, y) = bottom_anchored_position(
        (old_pos.x, old_pos.y),
        (old_outer.width, old_outer.height),
        (new_outer.width, new_outer.height),
    );
    if x != old_pos.x || y != old_pos.y {
        window
            .set_position(PhysicalPosition::new(x, y))
            .map_err(|error| format!("failed to position window: {error}"))?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn apply_bottom_anchored_size_macos(
    window: &WebviewWindow,
    width: f64,
    height: f64,
    animate: bool,
) -> Result<(), String> {
    let scale = window
        .scale_factor()
        .map_err(|error| format!("failed to read scale factor: {error}"))?;
    let inner = window
        .inner_size()
        .map_err(|error| format!("failed to read inner size: {error}"))?;
    let outer = window
        .outer_size()
        .map_err(|error| format!("failed to read window size: {error}"))?;
    let extra_w = (outer.width as f64 - inner.width as f64) / scale;
    let extra_h = (outer.height as f64 - inner.height as f64) / scale;
    let frame_w = width + extra_w;
    let frame_h = height + extra_h;
    window
        .with_webview(move |webview| {
            use objc2_app_kit::{NSAnimatablePropertyContainer, NSAnimationContext, NSWindow};
            use objc2_quartz_core::{kCAMediaTimingFunctionEaseInEaseOut, CAMediaTimingFunction};
            unsafe {
                let ns_window: &NSWindow = &*webview.ns_window().cast();
                let mut frame = ns_window.frame();
                // AppKit origin is bottom-left, so keeping origin.y pins the bottom edge.
                frame.size.width = frame_w;
                frame.size.height = frame_h;
                if !animate {
                    ns_window.setFrame_display(frame, true);
                    return;
                }
                NSAnimationContext::beginGrouping();
                let ctx = NSAnimationContext::currentContext();
                ctx.setDuration(RESIZE_ANIMATION_DURATION);
                ctx.setTimingFunction(Some(&CAMediaTimingFunction::functionWithName(
                    kCAMediaTimingFunctionEaseInEaseOut,
                )));
                ns_window.animator().setFrame_display(frame, true);
                NSAnimationContext::endGrouping();
            }
        })
        .map_err(|error| format!("failed to resize window: {error}"))
}

/// Resize the calling window while keeping its bottom edge in place.
/// On macOS this uses a single `NSWindow` frame change (optionally animated).
#[tauri::command]
pub fn apply_bottom_anchored_size(
    window: WebviewWindow,
    width: f64,
    height: f64,
    animate: Option<bool>,
) -> Result<(), String> {
    if width < 1.0 || height < 1.0 {
        return Err("window size must be positive".into());
    }
    let animate = animate.unwrap_or(false);
    #[cfg(target_os = "macos")]
    {
        match apply_bottom_anchored_size_macos(&window, width, height, animate) {
            Ok(()) => return Ok(()),
            Err(error) => eprintln!("macos bottom-anchored resize failed: {error}"),
        }
    }
    #[cfg(not(target_os = "macos"))]
    let _ = animate;
    apply_bottom_anchored_size_fallback(&window, width, height)
}

/// Horizontally center a window and pin it near the bottom of the work area.
pub fn bottom_centered_position(
    window_size: (u32, u32),
    work_position: (i32, i32),
    work_size: (u32, u32),
    bottom_gap: i32,
) -> (i32, i32) {
    let win_w = window_size.0 as i64;
    let win_h = window_size.1 as i64;
    let work_left = work_position.0 as i64;
    let work_top = work_position.1 as i64;
    let work_w = work_size.0 as i64;
    let work_h = work_size.1 as i64;
    let gap = i64::from(bottom_gap.max(0));

    let desired_x = work_left + (work_w - win_w) / 2;
    let desired_y = work_top + work_h - win_h - gap;
    let max_x = (work_left + work_w - win_w).max(work_left);
    let max_y = (work_top + work_h - win_h).max(work_top);

    (
        desired_x.clamp(work_left, max_x) as i32,
        desired_y.clamp(work_top, max_y) as i32,
    )
}

/// Place the chat window beside the pet: prefer the pet's right side, else left.
/// Clamp into the monitor work area so the chat stays on-screen.
pub fn chat_position(
    pet_position: (i32, i32),
    pet_size: (u32, u32),
    chat_size: (u32, u32),
    work_position: (i32, i32),
    work_size: (u32, u32),
) -> (i32, i32) {
    let pet_width = pet_size.0 as i64;
    let chat_width = chat_size.0 as i64;
    let chat_height = chat_size.1 as i64;
    let work_left = work_position.0 as i64;
    let work_top = work_position.1 as i64;
    let work_right = work_left + work_size.0 as i64;
    let work_bottom = work_top + work_size.1 as i64;
    let pet_x = pet_position.0 as i64;
    let pet_y = pet_position.1 as i64;

    let right_x = pet_x + pet_width;
    let desired_x = if right_x + chat_width <= work_right {
        right_x
    } else {
        pet_x - chat_width
    };
    let max_x = (work_right - chat_width).max(work_left);
    let max_y = (work_bottom - chat_height).max(work_top);

    (
        desired_x.clamp(work_left, max_x) as i32,
        pet_y.clamp(work_top, max_y) as i32,
    )
}

fn place_chat_near_pet(app: &AppHandle, chat: &WebviewWindow) -> Result<(), String> {
    let pet = app
        .get_webview_window("pet")
        .ok_or_else(|| "pet window not found".to_string())?;
    let pet_position = pet
        .outer_position()
        .map_err(|error| format!("failed to read pet position: {error}"))?;
    let pet_size = pet
        .outer_size()
        .map_err(|error| format!("failed to read pet size: {error}"))?;
    let chat_size = chat
        .outer_size()
        .map_err(|error| format!("failed to read chat size: {error}"))?;
    let monitor = pet
        .current_monitor()
        .map_err(|error| format!("failed to find pet monitor: {error}"))?
        .ok_or_else(|| "pet window is not on an available monitor".to_string())?;
    let work_area = monitor.work_area();
    let (x, y) = chat_position(
        (pet_position.x, pet_position.y),
        (pet_size.width, pet_size.height),
        (chat_size.width, chat_size.height),
        (work_area.position.x, work_area.position.y),
        (work_area.size.width, work_area.size.height),
    );
    chat.set_position(PhysicalPosition::new(x, y))
        .map_err(|error| format!("failed to position chat window: {error}"))
}

/// Horizontally and vertically center a window in the monitor work area.
pub fn centered_position(
    window_size: (u32, u32),
    work_position: (i32, i32),
    work_size: (u32, u32),
) -> (i32, i32) {
    let win_w = window_size.0 as i64;
    let win_h = window_size.1 as i64;
    let work_left = work_position.0 as i64;
    let work_top = work_position.1 as i64;
    let work_w = work_size.0 as i64;
    let work_h = work_size.1 as i64;

    let desired_x = work_left + (work_w - win_w) / 2;
    let desired_y = work_top + (work_h - win_h) / 2;
    let max_x = (work_left + work_w - win_w).max(work_left);
    let max_y = (work_top + work_h - win_h).max(work_top);

    (
        desired_x.clamp(work_left, max_x) as i32,
        desired_y.clamp(work_top, max_y) as i32,
    )
}

fn place_bottom_centered(
    win: &tauri::WebviewWindow,
    bottom_gap_logical: f64,
) -> Result<(), String> {
    let size = win
        .outer_size()
        .map_err(|error| format!("failed to read window size: {error}"))?;
    let monitor = win
        .current_monitor()
        .map_err(|error| format!("failed to find window monitor: {error}"))?
        .ok_or_else(|| "window is not on an available monitor".to_string())?;
    let work = monitor.work_area();
    let gap = (bottom_gap_logical * monitor.scale_factor()).round() as i32;
    let (x, y) = bottom_centered_position(
        (size.width, size.height),
        (work.position.x, work.position.y),
        (work.size.width, work.size.height),
        gap,
    );
    win.set_position(PhysicalPosition::new(x, y))
        .map_err(|error| format!("failed to position window: {error}"))
}

fn place_centered(win: &tauri::WebviewWindow) -> Result<(), String> {
    let size = win
        .outer_size()
        .map_err(|error| format!("failed to read window size: {error}"))?;
    let monitor = win
        .current_monitor()
        .map_err(|error| format!("failed to find window monitor: {error}"))?
        .ok_or_else(|| "window is not on an available monitor".to_string())?;
    let work = monitor.work_area();
    let (x, y) = centered_position(
        (size.width, size.height),
        (work.position.x, work.position.y),
        (work.size.width, work.size.height),
    );
    win.set_position(PhysicalPosition::new(x, y))
        .map_err(|error| format!("failed to position window: {error}"))
}

#[tauri::command]
pub fn place_window_bottom_center(app: AppHandle, label: String) -> Result<(), String> {
    let win = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("{label} window not found"))?;
    place_bottom_centered(&win, CHAT_BOTTOM_GAP_LOGICAL)
}

#[tauri::command]
pub fn place_window_centered(app: AppHandle, label: String) -> Result<(), String> {
    let win = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("{label} window not found"))?;
    place_centered(&win)
}

#[tauri::command]
pub fn open_home(app: AppHandle, base_url: String) -> Result<(), String> {
    app.opener()
        .open_url(home_url(&base_url)?, None::<String>)
        .map_err(|error| format!("failed to open home URL: {error}"))
}

#[tauri::command]
pub fn show_chat_near_pet(app: AppHandle) -> Result<(), String> {
    let chat = app
        .get_webview_window("chat")
        .ok_or_else(|| "chat window not found".to_string())?;

    // Always dock beside the pet: hide/re-open and pet moves should follow the icon.
    place_chat_near_pet(&app, &chat)?;
    // Apply chrome before the first paint so show() does not flash a white HWND.
    ensure_dialog_window_transparent(&chat);
    ensure_pet_transparent(&app);
    chat.show()
        .map_err(|error| format!("failed to show chat window: {error}"))?;
    apply_window_deactivate_policy(app.clone())?;
    chat.set_focus()
        .map_err(|error| format!("failed to focus chat window: {error}"))?;
    let _ = chat.emit("chat-shown", ());
    // Chat becoming key resigns the pet — clear chrome after the race settles.
    ensure_pet_transparent_after_focus_race(&app);
    Ok(())
}

#[tauri::command]
pub fn hide_chat(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("chat")
        .ok_or_else(|| "chat window not found".to_string())?
        .hide()
        .map_err(|error| format!("failed to hide chat window: {error}"))
}

#[tauri::command]
pub fn hide_pet(app: AppHandle) -> Result<(), String> {
    ensure_pet_transparent(&app);
    app.get_webview_window("pet")
        .ok_or_else(|| "pet window not found".to_string())?
        .hide()
        .map_err(|error| format!("failed to hide pet window: {error}"))
}

#[tauri::command]
pub fn show_settings(app: AppHandle) -> Result<(), String> {
    let settings = app
        .get_webview_window("settings")
        .ok_or_else(|| "settings window not found".to_string())?;
    ensure_dialog_window_transparent(&settings);
    settings
        .show()
        .map_err(|error| format!("failed to show settings window: {error}"))?;
    apply_window_deactivate_policy(app.clone())?;
    // First open only: true center. Later opens (and tab refits) keep position.
    if !SETTINGS_HAS_BEEN_SHOWN.swap(true, Ordering::SeqCst) {
        place_centered(&settings)?;
    }
    settings
        .set_focus()
        .map_err(|error| format!("failed to focus settings window: {error}"))?;
    let _ = settings.emit("settings-shown", ());
    Ok(())
}
