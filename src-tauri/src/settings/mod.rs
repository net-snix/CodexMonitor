use tauri::{Manager, State, Window};

use crate::remote_backend;
use crate::state::AppState;
use crate::shared::settings_core::{
    get_app_settings_core, get_codex_config_path_core, update_app_settings_core,
};
use crate::shared::workspaces_core;
use crate::types::AppSettings;
use crate::window;
use crate::codex::spawn_workspace_session;

#[tauri::command]
pub(crate) async fn get_app_settings(
    state: State<'_, AppState>,
    window: Window,
) -> Result<AppSettings, String> {
    let settings = if remote_backend::is_remote_mode(&*state).await {
        let response = remote_backend::call_remote(
            &*state,
            window.app_handle().clone(),
            "get_app_settings",
            serde_json::Value::Null,
        )
        .await?;
        serde_json::from_value(response).map_err(|err| err.to_string())?
    } else {
        get_app_settings_core(&state.app_settings).await
    };
    let _ = window::apply_window_appearance(&window, settings.theme.as_str());
    Ok(settings)
}

#[tauri::command]
pub(crate) async fn update_app_settings(
    settings: AppSettings,
    state: State<'_, AppState>,
    window: Window,
) -> Result<AppSettings, String> {
    let previous_settings = state.app_settings.lock().await.clone();
    let updated = if remote_backend::is_remote_mode(&*state).await {
        let response = remote_backend::call_remote(
            &*state,
            window.app_handle().clone(),
            "update_app_settings",
            serde_json::to_value(&settings).map_err(|err| err.to_string())?,
        )
        .await?;
        serde_json::from_value(response).map_err(|err| err.to_string())?
    } else {
        update_app_settings_core(settings, &state.app_settings, &state.settings_path).await?
    };
    if !remote_backend::is_remote_mode(&*state).await {
        let app_handle = window.app_handle();
        let _ = workspaces_core::respawn_sessions_for_app_settings_change_core(
            &state.workspaces,
            &state.sessions,
            &previous_settings,
            &updated,
            move |entry, default_bin, codex_args, codex_home| {
                spawn_workspace_session(entry, default_bin, codex_args, app_handle.clone(), codex_home)
            },
        )
        .await;
    }
    let _ = window::apply_window_appearance(&window, updated.theme.as_str());
    Ok(updated)
}

#[tauri::command]
pub(crate) async fn get_codex_config_path(
    state: State<'_, AppState>,
    window: Window,
) -> Result<String, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let response = remote_backend::call_remote(
            &*state,
            window.app_handle().clone(),
            "get_codex_config_path",
            serde_json::Value::Null,
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    get_codex_config_path_core(&state.app_settings).await
}
