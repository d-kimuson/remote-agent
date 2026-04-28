#[cfg(target_os = "ios")]
fn main() {
    acp_playground_native::ios_main();
}

#[cfg(target_os = "android")]
fn main() {
    eprintln!("Android enters through android_main() in the native library.");
}

#[cfg(not(any(target_os = "ios", target_os = "android")))]
fn main() {
    acp_playground_native::desktop_main();
}
