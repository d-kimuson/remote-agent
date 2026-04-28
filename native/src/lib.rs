extern crate gpui_mobile;

pub mod api;
pub mod ui;

#[cfg(any(target_os = "ios", target_os = "android"))]
use gpui::{App, AppContext, WindowOptions};

#[cfg(target_os = "android")]
use gpui::Application;

#[cfg(any(target_os = "ios", target_os = "android"))]
use ui::AcpPlaygroundApp;

#[cfg(target_os = "android")]
use gpui_mobile::android::jni;

#[cfg(target_os = "android")]
#[no_mangle]
fn android_main(app: android_activity::AndroidApp) {
    android_logger::init_once(
        android_logger::Config::default()
            .with_max_level(log::LevelFilter::Info)
            .with_tag("acp-playground-native"),
    );
    jni::install_panic_hook();

    let _platform = jni::init_platform(&app);
    let Some(shared) = jni::shared_platform() else {
        log::error!("android_main: shared_platform() returned None");
        return;
    };

    Application::with_platform(shared.into_rc()).run(open_main_window);
}

#[cfg(target_os = "ios")]
struct NsLogLogger;

#[cfg(target_os = "ios")]
impl log::Log for NsLogLogger {
    fn enabled(&self, _metadata: &log::Metadata) -> bool {
        true
    }

    fn log(&self, record: &log::Record) {
        if self.enabled(record.metadata()) {
            nslog(&format!(
                "[{}] {}: {}",
                record.level(),
                record.target(),
                record.args()
            ));
        }
    }

    fn flush(&self) {}
}

#[cfg(target_os = "ios")]
fn nslog(message: &str) {
    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send};

    unsafe {
        extern "C" {
            fn NSLog(format: *mut AnyObject, ...);
        }
        let c_message = std::ffi::CString::new(message).unwrap_or_default();
        let ns_message: *mut AnyObject = msg_send![class!(NSString), alloc];
        let ns_message: *mut AnyObject =
            msg_send![ns_message, initWithUTF8String: c_message.as_ptr()];
        let c_format = std::ffi::CString::new("%@").unwrap_or_default();
        let ns_format: *mut AnyObject = msg_send![class!(NSString), alloc];
        let ns_format: *mut AnyObject = msg_send![ns_format, initWithUTF8String: c_format.as_ptr()];
        NSLog(ns_format, ns_message);
    }
}

#[cfg(target_os = "ios")]
#[unsafe(no_mangle)]
pub extern "C" fn gpui_ios_register_app() {
    let _ = log::set_logger(&NsLogLogger).map(|()| log::set_max_level(log::LevelFilter::Info));
    std::panic::set_hook(Box::new(|info| nslog(&format!("GPUI panic: {info}"))));

    gpui_mobile::ios::ffi::set_app_callback(Box::new(open_main_window));
}

#[cfg(target_os = "ios")]
pub fn ios_main() {
    gpui_ios_register_app();
    gpui_mobile::ios::ffi::run_app();
}

pub fn desktop_main() {
    eprintln!("ACP Playground Native is intended for iOS and Android GPUI Mobile targets.");
}

#[cfg(any(target_os = "ios", target_os = "android"))]
fn open_main_window(cx: &mut App) {
    let http_client: reqwest_client::ReqwestClient = reqwest::Client::new().into();
    cx.set_http_client(std::sync::Arc::new(http_client));

    let result = cx.open_window(
        WindowOptions {
            window_bounds: None,
            ..Default::default()
        },
        |_, cx| cx.new(|_| AcpPlaygroundApp::new()),
    );

    if let Err(error) = result {
        log::error!("failed to open ACP Playground window: {error:#}");
    }
    cx.activate(true);
}
