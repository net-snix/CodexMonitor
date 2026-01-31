use std::fs;
use std::path::{Path, PathBuf};

use toml::Value as TomlValue;

use crate::codex::home::resolve_default_codex_home_with_settings;
use crate::types::AppSettings;

const FEATURES_TABLE: &str = "[features]";
const AUTH_STORE_KEY: &str = "cli_auth_credentials_store";

pub(crate) fn read_steer_enabled_with_settings(
    settings: Option<&AppSettings>,
) -> Result<Option<bool>, String> {
    read_feature_flag_with_settings("steer", settings)
}

pub(crate) fn read_collab_enabled_with_settings(
    settings: Option<&AppSettings>,
) -> Result<Option<bool>, String> {
    read_feature_flag_with_settings("collab", settings)
}

pub(crate) fn read_collaboration_modes_enabled_with_settings(
    settings: Option<&AppSettings>,
) -> Result<Option<bool>, String> {
    read_feature_flag_with_settings("collaboration_modes", settings)
}

pub(crate) fn read_unified_exec_enabled_with_settings(
    settings: Option<&AppSettings>,
) -> Result<Option<bool>, String> {
    read_feature_flag_with_settings("unified_exec", settings)
}

pub(crate) fn write_steer_enabled_with_settings(
    enabled: bool,
    settings: Option<&AppSettings>,
) -> Result<(), String> {
    write_feature_flag_with_settings("steer", enabled, settings)
}

pub(crate) fn write_collab_enabled_with_settings(
    enabled: bool,
    settings: Option<&AppSettings>,
) -> Result<(), String> {
    write_feature_flag_with_settings("collab", enabled, settings)
}

pub(crate) fn write_collaboration_modes_enabled_with_settings(
    enabled: bool,
    settings: Option<&AppSettings>,
) -> Result<(), String> {
    write_feature_flag_with_settings("collaboration_modes", enabled, settings)
}

pub(crate) fn write_unified_exec_enabled_with_settings(
    enabled: bool,
    settings: Option<&AppSettings>,
) -> Result<(), String> {
    write_feature_flag_with_settings("unified_exec", enabled, settings)
}

pub(crate) fn read_auth_store_with_settings(
    settings: Option<&AppSettings>,
) -> Result<Option<String>, String> {
    let path = config_toml_path_with_settings(settings)
        .ok_or("Unable to resolve CODEX_HOME".to_string())?;
    read_auth_store_from_path(&path)
}

pub(crate) fn write_auth_store_file_with_settings(
    settings: Option<&AppSettings>,
) -> Result<(), String> {
    write_auth_store_with_settings("file", settings)
}

fn write_auth_store_with_settings(
    value: &str,
    settings: Option<&AppSettings>,
) -> Result<(), String> {
    let Some(path) = config_toml_path_with_settings(settings) else {
        return Ok(());
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let contents = fs::read_to_string(&path).unwrap_or_default();
    let updated = upsert_top_level_string(&contents, AUTH_STORE_KEY, value);
    fs::write(&path, updated).map_err(|err| err.to_string())
}

fn read_feature_flag_with_settings(
    key: &str,
    settings: Option<&AppSettings>,
) -> Result<Option<bool>, String> {
    let path = config_toml_path_with_settings(settings)
        .ok_or("Unable to resolve CODEX_HOME".to_string())?;
    if !path.exists() {
        return Ok(None);
    }
    let contents = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    Ok(find_feature_flag(&contents, key))
}

fn write_feature_flag_with_settings(
    key: &str,
    enabled: bool,
    settings: Option<&AppSettings>,
) -> Result<(), String> {
    let Some(path) = config_toml_path_with_settings(settings) else {
        return Ok(());
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let contents = fs::read_to_string(&path).unwrap_or_default();
    let updated = upsert_feature_flag(&contents, key, enabled);
    fs::write(&path, updated).map_err(|err| err.to_string())
}

pub(crate) fn config_toml_path_with_settings(
    settings: Option<&AppSettings>,
) -> Option<PathBuf> {
    resolve_default_codex_home_with_settings(settings).map(|home| home.join("config.toml"))
}

pub(crate) fn read_config_model(codex_home: Option<PathBuf>) -> Result<Option<String>, String> {
    let path = codex_home
        .or_else(crate::codex::home::resolve_default_codex_home)
        .map(|home| home.join("config.toml"));
    let Some(path) = path else {
        return Err("Unable to resolve CODEX_HOME".to_string());
    };
    read_config_model_from_path(&path)
}

fn read_config_model_from_path(path: &Path) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let contents = fs::read_to_string(path).map_err(|err| err.to_string())?;
    Ok(parse_model_from_toml(&contents))
}

fn parse_model_from_toml(contents: &str) -> Option<String> {
    let parsed: TomlValue = toml::from_str(contents).ok()?;
    let model = parsed.get("model")?.as_str()?;
    let trimmed = model.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn read_auth_store_from_path(path: &Path) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let contents = fs::read_to_string(path).map_err(|err| err.to_string())?;
    let parsed: TomlValue = match toml::from_str(&contents) {
        Ok(value) => value,
        Err(_) => return Ok(None),
    };
    let value = parsed
        .get(AUTH_STORE_KEY)
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    Ok(value)
}

fn upsert_top_level_string(contents: &str, key: &str, value: &str) -> String {
    let mut lines: Vec<String> = contents.lines().map(|line| line.to_string()).collect();
    let mut key_index: Option<usize> = None;
    let mut first_table_index: Option<usize> = None;
    let mut in_table = false;

    for (idx, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            if first_table_index.is_none() {
                first_table_index = Some(idx);
            }
            in_table = true;
            continue;
        }
        if in_table || trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some((candidate_key, _)) = trimmed.split_once('=') {
            if candidate_key.trim() == key {
                key_index = Some(idx);
                break;
            }
        }
    }

    let line_value = format!("{key} = \"{value}\"");
    if let Some(idx) = key_index {
        lines[idx] = line_value;
    } else if let Some(index) = first_table_index {
        lines.insert(index, line_value);
    } else {
        if !lines.is_empty() && !lines.last().unwrap().trim().is_empty() {
            lines.push(String::new());
        }
        lines.push(line_value);
    }

    let mut updated = lines.join("\n");
    if contents.ends_with('\n') || updated.is_empty() {
        updated.push('\n');
    }
    updated
}

fn find_feature_flag(contents: &str, key: &str) -> Option<bool> {
    let mut in_features = false;
    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_features = trimmed == FEATURES_TABLE;
            continue;
        }
        if !in_features || trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let (candidate_key, value) = trimmed.split_once('=')?;
        if candidate_key.trim() != key {
            continue;
        }
        let value = value.split('#').next().unwrap_or("").trim();
        return match value {
            "true" => Some(true),
            "false" => Some(false),
            _ => None,
        };
    }
    None
}

fn upsert_feature_flag(contents: &str, key: &str, enabled: bool) -> String {
    let mut lines: Vec<String> = contents.lines().map(|line| line.to_string()).collect();
    let mut in_features = false;
    let mut features_start: Option<usize> = None;
    let mut features_end: Option<usize> = None;
    let mut key_index: Option<usize> = None;

    for (idx, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            if in_features {
                features_end = Some(idx);
                break;
            }
            in_features = trimmed == FEATURES_TABLE;
            if in_features {
                features_start = Some(idx);
            }
            continue;
        }
        if !in_features || trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some((candidate_key, _)) = trimmed.split_once('=') {
            if candidate_key.trim() == key {
                key_index = Some(idx);
                break;
            }
        }
    }

    let flag_line = format!("{key} = {}", if enabled { "true" } else { "false" });

    if let Some(start) = features_start {
        let end = features_end.unwrap_or(lines.len());
        if let Some(index) = key_index {
            lines[index] = flag_line;
        } else {
            let insert_at = if end > start + 1 { end } else { start + 1 };
            lines.insert(insert_at, flag_line);
        }
    } else {
        if !lines.is_empty() && !lines.last().unwrap().trim().is_empty() {
            lines.push(String::new());
        }
        lines.push(FEATURES_TABLE.to_string());
        lines.push(flag_line);
    }

    let mut updated = lines.join("\n");
    if contents.ends_with('\n') || updated.is_empty() {
        updated.push('\n');
    }
    updated
}
