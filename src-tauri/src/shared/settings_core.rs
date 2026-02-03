use std::path::PathBuf;

use tokio::sync::Mutex;

use crate::codex::config as codex_config;
use crate::storage::write_settings;
use crate::types::AppSettings;

fn normalize_personality(value: &str) -> Option<&'static str> {
    match value.trim() {
        "friendly" => Some("friendly"),
        "pragmatic" => Some("pragmatic"),
        _ => None,
    }
}

pub(crate) async fn get_app_settings_core(app_settings: &Mutex<AppSettings>) -> AppSettings {
    let mut settings = app_settings.lock().await.clone();
    if let Ok(Some(collab_enabled)) =
        codex_config::read_collab_enabled_with_settings(Some(&settings))
    {
        settings.experimental_collab_enabled = collab_enabled;
    }
    if let Ok(Some(collaboration_modes_enabled)) =
        codex_config::read_collaboration_modes_enabled_with_settings(Some(&settings))
    {
        settings.collaboration_modes_enabled = collaboration_modes_enabled;
    }
    if let Ok(Some(steer_enabled)) =
        codex_config::read_steer_enabled_with_settings(Some(&settings))
    {
        settings.experimental_steer_enabled = steer_enabled;
    }
    if let Ok(Some(unified_exec_enabled)) =
        codex_config::read_unified_exec_enabled_with_settings(Some(&settings))
    {
        settings.experimental_unified_exec_enabled = unified_exec_enabled;
    }
    if let Ok(Some(apps_enabled)) =
        codex_config::read_apps_enabled_with_settings(Some(&settings))
    {
        settings.experimental_apps_enabled = apps_enabled;
    }
    if let Ok(personality) = codex_config::read_personality_with_settings(Some(&settings)) {
        settings.personality = personality
            .as_deref()
            .and_then(normalize_personality)
            .unwrap_or("friendly")
            .to_string();
    }
    settings
}

pub(crate) async fn update_app_settings_core(
    settings: AppSettings,
    app_settings: &Mutex<AppSettings>,
    settings_path: &PathBuf,
) -> Result<AppSettings, String> {
    let _ = codex_config::write_collab_enabled_with_settings(
        settings.experimental_collab_enabled,
        Some(&settings),
    );
    let _ = codex_config::write_collaboration_modes_enabled_with_settings(
        settings.collaboration_modes_enabled,
        Some(&settings),
    );
    let _ = codex_config::write_steer_enabled_with_settings(
        settings.experimental_steer_enabled,
        Some(&settings),
    );
    let _ = codex_config::write_unified_exec_enabled_with_settings(
        settings.experimental_unified_exec_enabled,
        Some(&settings),
    );
    let _ =
        codex_config::write_apps_enabled_with_settings(settings.experimental_apps_enabled, Some(&settings));
    let _ = codex_config::write_personality_with_settings(
        settings.personality.as_str(),
        Some(&settings),
    );
    write_settings(settings_path, &settings)?;
    let mut current = app_settings.lock().await;
    *current = settings.clone();
    Ok(settings)
}

pub(crate) async fn get_codex_config_path_core(
    app_settings: &Mutex<AppSettings>,
) -> Result<String, String> {
    let settings = app_settings.lock().await.clone();
    codex_config::config_toml_path_with_settings(Some(&settings))
        .ok_or_else(|| "Unable to resolve CODEX_HOME".to_string())
        .and_then(|path| {
            path.to_str()
                .map(|value| value.to_string())
                .ok_or_else(|| "Unable to resolve CODEX_HOME".to_string())
        })
}
