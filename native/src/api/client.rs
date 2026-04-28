use reqwest::{Client, Method, StatusCode};
use serde::de::DeserializeOwned;
use serde::Serialize;
use url::Url;

use super::types::{
    AgentModelCatalogResponse, AgentProvidersResponse, AgentSlashCommandsResponse, AppInfo,
    CreateSessionRequest, ErrorResponse, MessageRequest, MessageResponse, PrepareSessionRequest,
    PrepareSessionResponse, ProjectSettingsResponse, ProjectsResponse, SessionMessagesResponse,
    SessionResponse, SessionsResponse,
};

#[derive(Debug, thiserror::Error)]
pub enum AcpApiError {
    #[error("invalid API base URL: {0}")]
    InvalidBaseUrl(#[from] url::ParseError),
    #[error("HTTP {status}: {message}")]
    Http { status: StatusCode, message: String },
    #[error("request failed: {0}")]
    Request(#[from] reqwest::Error),
}

#[derive(Clone)]
pub struct AcpApiClient {
    base_url: Url,
    http: Client,
}

impl AcpApiClient {
    pub fn new(base_url: &str) -> Result<Self, AcpApiError> {
        Ok(Self {
            base_url: Url::parse(base_url)?,
            http: Client::new(),
        })
    }

    pub fn localhost() -> Result<Self, AcpApiError> {
        Self::new("http://127.0.0.1:3000")
    }

    pub async fn app_info(&self) -> Result<AppInfo, AcpApiError> {
        self.get("/api/info").await
    }

    pub async fn projects(&self) -> Result<ProjectsResponse, AcpApiError> {
        self.get("/api/projects").await
    }

    pub async fn project_settings(
        &self,
        project_id: &str,
    ) -> Result<ProjectSettingsResponse, AcpApiError> {
        self.get(&format!(
            "/api/projects/{}/settings",
            urlencoding::encode(project_id)
        ))
        .await
    }

    pub async fn providers(&self) -> Result<AgentProvidersResponse, AcpApiError> {
        self.get("/api/acp/providers").await
    }

    pub async fn model_catalog(
        &self,
        project_id: &str,
        preset_id: &str,
    ) -> Result<AgentModelCatalogResponse, AcpApiError> {
        self.get(&format!(
            "/api/acp/agent/model-catalog?projectId={}&presetId={}",
            urlencoding::encode(project_id),
            urlencoding::encode(preset_id)
        ))
        .await
    }

    pub async fn slash_commands(
        &self,
        project_id: &str,
        preset_id: &str,
    ) -> Result<AgentSlashCommandsResponse, AcpApiError> {
        self.get(&format!(
            "/api/acp/agent/slash-commands?projectId={}&presetId={}",
            urlencoding::encode(project_id),
            urlencoding::encode(preset_id)
        ))
        .await
    }

    pub async fn sessions(&self) -> Result<SessionsResponse, AcpApiError> {
        self.get("/api/acp/sessions").await
    }

    pub async fn session_messages(
        &self,
        session_id: &str,
    ) -> Result<SessionMessagesResponse, AcpApiError> {
        self.get(&format!(
            "/api/acp/sessions/{}/messages",
            urlencoding::encode(session_id)
        ))
        .await
    }

    pub async fn create_session(
        &self,
        request: &CreateSessionRequest,
    ) -> Result<SessionResponse, AcpApiError> {
        self.json(Method::POST, "/api/acp/sessions", request).await
    }

    pub async fn prepare_session(
        &self,
        request: &PrepareSessionRequest,
    ) -> Result<PrepareSessionResponse, AcpApiError> {
        self.json(Method::POST, "/api/acp/agent/prepare", request)
            .await
    }

    pub async fn send_message(
        &self,
        session_id: &str,
        request: &MessageRequest,
    ) -> Result<MessageResponse, AcpApiError> {
        self.json(
            Method::POST,
            &format!(
                "/api/acp/sessions/{}/messages",
                urlencoding::encode(session_id)
            ),
            request,
        )
        .await
    }

    pub fn sse_url(&self) -> Result<Url, AcpApiError> {
        Ok(self.base_url.join("/api/acp/sse")?)
    }

    async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T, AcpApiError> {
        self.request(Method::GET, path).await
    }

    async fn json<T: DeserializeOwned, B: Serialize + ?Sized>(
        &self,
        method: Method,
        path: &str,
        body: &B,
    ) -> Result<T, AcpApiError> {
        let url = self.base_url.join(path)?;
        let response = self.http.request(method, url).json(body).send().await?;
        self.decode(response).await
    }

    async fn request<T: DeserializeOwned>(
        &self,
        method: Method,
        path: &str,
    ) -> Result<T, AcpApiError> {
        let url = self.base_url.join(path)?;
        let response = self.http.request(method, url).send().await?;
        self.decode(response).await
    }

    async fn decode<T: DeserializeOwned>(
        &self,
        response: reqwest::Response,
    ) -> Result<T, AcpApiError> {
        let status = response.status();
        if status.is_success() {
            return Ok(response.json::<T>().await?);
        }

        let message = match response.json::<ErrorResponse>().await {
            Ok(error) => error.error,
            Err(error) => error.to_string(),
        };

        Err(AcpApiError::Http { status, message })
    }
}
