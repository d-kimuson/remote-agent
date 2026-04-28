use gpui::prelude::*;
use gpui::{
    div, px, rgb, Context, IntoElement, MouseButton, MouseDownEvent, Render,
    StatefulInteractiveElement,
};

use crate::api::types::{ChatMessage, Project, SessionSummary};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Screen {
    Projects,
    Sessions,
    Chat,
    Settings,
}

pub struct AcpPlaygroundApp {
    screen: Screen,
    api_base_url: String,
    selected_project: Option<Project>,
    selected_session: Option<SessionSummary>,
    projects: Vec<Project>,
    sessions: Vec<SessionSummary>,
    messages: Vec<ChatMessage>,
    draft_prompt: String,
    status_text: String,
    dark_mode: bool,
}

impl AcpPlaygroundApp {
    pub fn new() -> Self {
        Self {
            screen: Screen::Projects,
            api_base_url: "http://127.0.0.1:3000".to_string(),
            selected_project: None,
            selected_session: None,
            projects: Vec::new(),
            sessions: Vec::new(),
            messages: Vec::new(),
            draft_prompt: String::new(),
            status_text: "Connect to the ACP Playground server to load projects.".to_string(),
            dark_mode: true,
        }
    }

    fn show_projects(&mut self) {
        self.screen = Screen::Projects;
    }

    fn show_sessions(&mut self) {
        self.screen = Screen::Sessions;
    }

    fn show_chat(&mut self) {
        self.screen = Screen::Chat;
    }

    fn show_settings(&mut self) {
        self.screen = Screen::Settings;
    }
}

impl Render for AcpPlaygroundApp {
    fn render(&mut self, _window: &mut gpui::Window, cx: &mut Context<Self>) -> impl IntoElement {
        let palette = Palette::from_dark_mode(self.dark_mode);

        div()
            .flex()
            .flex_col()
            .size_full()
            .bg(rgb(palette.surface))
            .text_color(rgb(palette.text))
            .child(self.render_header(cx, palette))
            .child(
                div()
                    .id("native-content-scroll")
                    .flex_1()
                    .overflow_y_scroll()
                    .child(match self.screen {
                        Screen::Projects => self.render_projects(cx, palette).into_any_element(),
                        Screen::Sessions => self.render_sessions(cx, palette).into_any_element(),
                        Screen::Chat => self.render_chat(cx, palette).into_any_element(),
                        Screen::Settings => self.render_settings(cx, palette).into_any_element(),
                    }),
            )
            .child(self.render_tab_bar(cx, palette))
    }
}

impl AcpPlaygroundApp {
    fn render_header(&self, cx: &mut Context<Self>, palette: Palette) -> impl IntoElement {
        let title = match self.screen {
            Screen::Projects => "Projects",
            Screen::Sessions => "Sessions",
            Screen::Chat => "Chat",
            Screen::Settings => "Settings",
        };
        let subtitle = self
            .selected_project
            .as_ref()
            .map(|project| project.name.clone())
            .unwrap_or_else(|| "ACP Playground Native".to_string());

        div()
            .flex()
            .flex_row()
            .items_center()
            .justify_between()
            .gap_3()
            .px_4()
            .py_3()
            .border_b_1()
            .border_color(rgb(palette.border))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap_1()
                    .child(
                        div()
                            .text_lg()
                            .font_weight(gpui::FontWeight::SEMIBOLD)
                            .child(title),
                    )
                    .child(
                        div()
                            .text_xs()
                            .text_color(rgb(palette.subtle))
                            .child(subtitle),
                    ),
            )
            .child(
                pill(
                    if self.dark_mode { "Dark" } else { "Light" },
                    palette.accent,
                    palette.surface_high,
                    palette.text,
                )
                .on_mouse_down(
                    MouseButton::Left,
                    cx.listener(|this, _event: &MouseDownEvent, _window, cx| {
                        this.dark_mode = !this.dark_mode;
                        cx.notify();
                    }),
                ),
            )
    }

    fn render_projects(&self, cx: &mut Context<Self>, palette: Palette) -> impl IntoElement {
        let content = if self.projects.is_empty() {
            empty_panel(
                "No projects loaded",
                "The native shell uses the existing Hono BFF. Start the server, then wire the generated client into this screen.",
                palette,
            )
            .into_any_element()
        } else {
            div()
                .flex()
                .flex_col()
                .gap_2()
                .children(self.projects.iter().cloned().map(|project| {
                    let selected_project = project.clone();
                    project_row(
                        project,
                        palette,
                        cx.listener(move |this, _event: &MouseDownEvent, _window, cx| {
                            this.selected_project = Some(selected_project.clone());
                            this.status_text = "Project selected".to_string();
                            this.show_sessions();
                            cx.notify();
                        }),
                    )
                }))
                .into_any_element()
        };

        page(palette)
            .child(section_title(
                "Your projects",
                "Open a project to view ACP sessions.",
                palette,
            ))
            .child(content)
            .child(action_button(
                "Refresh projects",
                palette,
                cx.listener(|this, _event, _window, cx| {
                    this.status_text = format!("Refresh requested for {}", this.api_base_url);
                    cx.notify();
                }),
            ))
    }

    fn render_sessions(&self, cx: &mut Context<Self>, palette: Palette) -> impl IntoElement {
        let content = if self.sessions.is_empty() {
            empty_panel(
                "No sessions loaded",
                "Session list, search, load-session, and new-session flows map to the existing Web UI contract.",
                palette,
            )
            .into_any_element()
        } else {
            div()
                .flex()
                .flex_col()
                .gap_2()
                .children(
                    self.sessions
                        .iter()
                        .map(|session| session_row(session, palette)),
                )
                .into_any_element()
        };

        page(palette)
            .child(section_title(
                "Recent sessions",
                "Select a session or start a draft chat.",
                palette,
            ))
            .child(content)
            .child(action_button(
                "New chat",
                palette,
                cx.listener(|this, _event, _window, cx| {
                    this.selected_session = None;
                    this.messages.clear();
                    this.show_chat();
                    cx.notify();
                }),
            ))
    }

    fn render_chat(&self, cx: &mut Context<Self>, palette: Palette) -> impl IntoElement {
        let transcript = if self.messages.is_empty() {
            empty_panel(
                "No messages yet",
                "Draft prompt, model/mode tuning, attachments, and SSE hydration are represented by the generated API boundary.",
                palette,
            )
            .into_any_element()
        } else {
            div()
                .flex()
                .flex_col()
                .gap_3()
                .children(
                    self.messages
                        .iter()
                        .map(|message| message_bubble(message, palette)),
                )
                .into_any_element()
        };

        page(palette)
            .child(section_title(
                "Conversation",
                "Assistant responses, reasoning, and tool output follow the Web transcript model.",
                palette,
            ))
            .child(transcript)
            .child(
                div()
                    .flex()
                    .flex_row()
                    .items_center()
                    .gap_2()
                    .rounded_lg()
                    .border_1()
                    .border_color(rgb(palette.border))
                    .bg(rgb(palette.surface_high))
                    .p_2()
                    .child(
                        div()
                            .flex_1()
                            .min_h(px(40.0))
                            .rounded_md()
                            .bg(rgb(palette.surface))
                            .px_3()
                            .py_2()
                            .text_sm()
                            .text_color(rgb(if self.draft_prompt.is_empty() {
                                palette.subtle
                            } else {
                                palette.text
                            }))
                            .child(if self.draft_prompt.is_empty() {
                                "Message ACP agent".to_string()
                            } else {
                                self.draft_prompt.clone()
                            }),
                    )
                    .child(action_button("Send", palette, cx.listener(|this, _event, _window, cx| {
                        this.status_text = "Send requested; API client is ready for session/message endpoints.".to_string();
                        cx.notify();
                    }))),
            )
    }

    fn render_settings(&self, cx: &mut Context<Self>, palette: Palette) -> impl IntoElement {
        page(palette)
            .child(section_title(
                "Server",
                "Native app connects to the existing ACP Playground BFF.",
                palette,
            ))
            .child(
                card(palette)
                    .child(label_value("Base URL", &self.api_base_url, palette))
                    .child(label_value("Status", &self.status_text, palette)),
            )
            .child(section_title(
                "Provider Setup",
                "Provider enablement and model catalog checks use existing settings endpoints.",
                palette,
            ))
            .child(
                card(palette)
                    .child(label_value("Providers", "/api/acp/providers", palette))
                    .child(label_value(
                        "Catalog",
                        "/api/acp/agent/model-catalog",
                        palette,
                    )),
            )
            .child(action_button(
                "Toggle theme",
                palette,
                cx.listener(|this, _event, _window, cx| {
                    this.dark_mode = !this.dark_mode;
                    cx.notify();
                }),
            ))
    }

    fn render_tab_bar(&self, cx: &mut Context<Self>, palette: Palette) -> impl IntoElement {
        div()
            .flex()
            .flex_row()
            .justify_around()
            .gap_2()
            .border_t_1()
            .border_color(rgb(palette.border))
            .bg(rgb(palette.surface_high))
            .px_3()
            .py_2()
            .child(
                nav_item("Projects", self.screen == Screen::Projects, palette).on_mouse_down(
                    MouseButton::Left,
                    cx.listener(|this, _event: &MouseDownEvent, _window, cx| {
                        this.show_projects();
                        cx.notify();
                    }),
                ),
            )
            .child(
                nav_item("Sessions", self.screen == Screen::Sessions, palette).on_mouse_down(
                    MouseButton::Left,
                    cx.listener(|this, _event: &MouseDownEvent, _window, cx| {
                        this.show_sessions();
                        cx.notify();
                    }),
                ),
            )
            .child(
                nav_item("Chat", self.screen == Screen::Chat, palette).on_mouse_down(
                    MouseButton::Left,
                    cx.listener(|this, _event: &MouseDownEvent, _window, cx| {
                        this.show_chat();
                        cx.notify();
                    }),
                ),
            )
            .child(
                nav_item("Settings", self.screen == Screen::Settings, palette).on_mouse_down(
                    MouseButton::Left,
                    cx.listener(|this, _event: &MouseDownEvent, _window, cx| {
                        this.show_settings();
                        cx.notify();
                    }),
                ),
            )
    }
}

#[derive(Clone, Copy)]
struct Palette {
    surface: u32,
    surface_high: u32,
    text: u32,
    subtle: u32,
    border: u32,
    accent: u32,
}

impl Palette {
    fn from_dark_mode(dark_mode: bool) -> Self {
        if dark_mode {
            Self {
                surface: 0x111318,
                surface_high: 0x1d2027,
                text: 0xe6e7ee,
                subtle: 0xaeb4c0,
                border: 0x363b45,
                accent: 0x7dd3fc,
            }
        } else {
            Self {
                surface: 0xf8f7f3,
                surface_high: 0xffffff,
                text: 0x1e252b,
                subtle: 0x65717c,
                border: 0xd7d2c8,
                accent: 0x0f766e,
            }
        }
    }
}

fn page(palette: Palette) -> gpui::Div {
    div()
        .flex()
        .flex_col()
        .gap_4()
        .px_4()
        .py_5()
        .bg(rgb(palette.surface))
}

fn section_title(title: &str, subtitle: &str, palette: Palette) -> impl IntoElement {
    div()
        .flex()
        .flex_col()
        .gap_1()
        .child(
            div()
                .text_base()
                .font_weight(gpui::FontWeight::SEMIBOLD)
                .child(title.to_string()),
        )
        .child(
            div()
                .text_xs()
                .text_color(rgb(palette.subtle))
                .child(subtitle.to_string()),
        )
}

fn card(palette: Palette) -> gpui::Div {
    div()
        .flex()
        .flex_col()
        .gap_3()
        .rounded_lg()
        .border_1()
        .border_color(rgb(palette.border))
        .bg(rgb(palette.surface_high))
        .p_4()
}

fn empty_panel(title: &str, message: &str, palette: Palette) -> impl IntoElement {
    card(palette)
        .child(
            div()
                .text_sm()
                .font_weight(gpui::FontWeight::SEMIBOLD)
                .child(title.to_string()),
        )
        .child(
            div()
                .text_xs()
                .text_color(rgb(palette.subtle))
                .child(message.to_string()),
        )
}

fn label_value(label: &str, value: &str, palette: Palette) -> impl IntoElement {
    div()
        .flex()
        .flex_col()
        .gap_1()
        .child(
            div()
                .text_xs()
                .text_color(rgb(palette.subtle))
                .child(label.to_string()),
        )
        .child(
            div()
                .text_sm()
                .text_color(rgb(palette.text))
                .child(value.to_string()),
        )
}

fn pill(label: &str, accent: u32, bg: u32, text: u32) -> gpui::Div {
    div()
        .rounded_full()
        .border_1()
        .border_color(rgb(accent))
        .bg(rgb(bg))
        .px_3()
        .py_1()
        .text_xs()
        .text_color(rgb(text))
        .child(label.to_string())
}

fn action_button(
    label: &str,
    palette: Palette,
    handler: impl Fn(&MouseDownEvent, &mut gpui::Window, &mut gpui::App) + 'static,
) -> impl IntoElement {
    pill(label, palette.accent, palette.surface_high, palette.text)
        .on_mouse_down(MouseButton::Left, handler)
}

fn nav_item(label: &str, active: bool, palette: Palette) -> gpui::Div {
    div()
        .flex_1()
        .items_center()
        .justify_center()
        .rounded_lg()
        .bg(rgb(if active {
            palette.accent
        } else {
            palette.surface_high
        }))
        .px_2()
        .py_2()
        .text_xs()
        .text_color(rgb(if active {
            palette.surface
        } else {
            palette.text
        }))
        .child(label.to_string())
}

fn project_row(
    project: Project,
    palette: Palette,
    handler: impl Fn(&MouseDownEvent, &mut gpui::Window, &mut gpui::App) + 'static,
) -> impl IntoElement {
    card(palette)
        .child(
            div()
                .text_sm()
                .font_weight(gpui::FontWeight::SEMIBOLD)
                .child(project.name),
        )
        .child(
            div()
                .text_xs()
                .text_color(rgb(palette.subtle))
                .child(project.working_directory),
        )
        .on_mouse_down(MouseButton::Left, handler)
}

fn session_row(session: &SessionSummary, palette: Palette) -> impl IntoElement {
    let title = session
        .title
        .as_ref()
        .or(session.first_user_message_preview.as_ref())
        .cloned()
        .unwrap_or_else(|| session.session_id.clone());

    card(palette)
        .child(
            div()
                .text_sm()
                .font_weight(gpui::FontWeight::SEMIBOLD)
                .child(title),
        )
        .child(
            div()
                .text_xs()
                .text_color(rgb(palette.subtle))
                .child(format!("{} · {}", session.status, session.cwd)),
        )
}

fn message_bubble(message: &ChatMessage, palette: Palette) -> impl IntoElement {
    let is_user = message.role == "user";
    div()
        .flex()
        .justify_end()
        .when(!is_user, |element| element.justify_start())
        .child(
            div()
                .max_w(px(520.0))
                .rounded_lg()
                .bg(rgb(if is_user {
                    palette.accent
                } else {
                    palette.surface_high
                }))
                .px_3()
                .py_2()
                .text_sm()
                .text_color(rgb(if is_user {
                    palette.surface
                } else {
                    palette.text
                }))
                .child(message.text.clone()),
        )
}
