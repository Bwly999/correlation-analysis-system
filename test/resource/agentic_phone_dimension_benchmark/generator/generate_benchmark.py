#!/usr/bin/env python3
"""
生成手机尺寸分析评测宽表数据集。

输出：
- phone_dimension_benchmark.csv
- field_dictionary.json
- dataset_truth.json
"""

from __future__ import annotations

import csv
import json
from collections import OrderedDict
from pathlib import Path
from typing import Dict, List

import numpy as np


SEED = 20260608
ASSEMBLY_COUNT = 480
PART_TYPES = ("frame", "display", "battery")
ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
rng = np.random.default_rng(SEED)


def round_value(value):
    if isinstance(value, (float, np.floating)):
        return round(float(value), 6)
    return value


def compute_timestamp_bucket(index: int) -> str:
    month = 1 + (index % 4)
    day = 1 + (index % 28)
    hour = 8 + (index % 10)
    return f"2026-{month:02d}-{day:02d}T{hour:02d}"


def build_part_features(
    assembly_index: int,
    assembly_id: str,
    sub_batch_id: str,
    station_id: str,
    fixture_id: str,
    shift: str,
    timestamp_bucket: str,
    part_type: str,
    cavity_index: int,
    env_drift: float,
    fixture_wear: float,
    material_shrink: float,
    cooling_profile: float,
    press_alignment: float,
    glue_variation: float,
    display_flex_bias: float,
    battery_swelling_base: float,
    frame_wall_bias: float,
) -> Dict[str, object]:
    is_night_shift = 1 if shift == "N" else 0
    machine_group = 1 + ((assembly_index + cavity_index) % 6)

    if part_type == "frame":
        base_len = 158.2 + env_drift * 0.06 + material_shrink * 0.09 + rng.normal(0, 0.03)
        base_wid = 74.5 + env_drift * 0.02 + rng.normal(0, 0.025)
        base_thk = 7.65 + frame_wall_bias * 0.12 + rng.normal(0, 0.018)
        main_influence = frame_wall_bias
        local_variation = press_alignment
    elif part_type == "display":
        base_len = 157.9 + env_drift * 0.03 + display_flex_bias * 0.08 + rng.normal(0, 0.03)
        base_wid = 74.25 + cooling_profile * 0.04 + rng.normal(0, 0.022)
        base_thk = 1.12 + display_flex_bias * 0.06 + rng.normal(0, 0.01)
        main_influence = display_flex_bias
        local_variation = glue_variation
    else:
        base_len = 108.4 + env_drift * 0.05 + battery_swelling_base * 0.12 + rng.normal(0, 0.04)
        base_wid = 69.7 + material_shrink * 0.02 + rng.normal(0, 0.03)
        base_thk = 4.35 + battery_swelling_base * 0.10 + rng.normal(0, 0.02)
        main_influence = battery_swelling_base
        local_variation = cooling_profile

    row: Dict[str, object] = OrderedDict(
        part_id=f"P-{assembly_id}-{part_type.upper()}",
        part_type=part_type,
        sub_batch_id=sub_batch_id,
        station_id=station_id,
        fixture_id=fixture_id,
        shift=shift,
        timestamp_bucket=timestamp_bucket,
        cavity_id=f"CAV-{cavity_index:02d}",
        machine_group=f"MFG-{machine_group}",
        material_lot=f"MAT-{1 + (assembly_index % 9):02d}",
        operator_code=f"OP-{1 + (assembly_index % 12):02d}",
        near_match_code=f"NM-{sub_batch_id}-{cavity_index % 2}",
        env_temp=23.8 + env_drift * 1.4 + rng.normal(0, 0.25),
        env_humidity=46 + env_drift * 3.8 + is_night_shift * 2.1 + rng.normal(0, 1.4),
        env_pressure=101.3 + rng.normal(0, 0.06),
        fixture_wear_index=fixture_wear,
        material_shrink_index=material_shrink,
        cooling_profile_index=cooling_profile,
        press_alignment_index=press_alignment,
        glue_variation_index=glue_variation,
        display_flex_bias=display_flex_bias,
        battery_swelling_index=battery_swelling_base,
        frame_wall_bias=frame_wall_bias,
        base_length=base_len,
        base_width=base_wid,
        base_thickness=base_thk,
        flatness_ref=0.09 + abs(env_drift) * 0.02 + rng.normal(0, 0.01),
        profile_warp=0.06 + abs(main_influence) * 0.04 + local_variation * 0.01 + rng.normal(0, 0.008),
        edge_collapse=0.03 + fixture_wear * 0.02 + rng.normal(0, 0.006),
        hole_position_x=0.02 + press_alignment * 0.04 + rng.normal(0, 0.005),
        hole_position_y=-0.01 + env_drift * 0.02 + rng.normal(0, 0.005),
        diagonal_delta=0.04 + main_influence * 0.05 + rng.normal(0, 0.008),
        measure_anchor_01=base_len + main_influence * 0.12 + rng.normal(0, 0.012),
        measure_anchor_02=base_len - main_influence * 0.08 + rng.normal(0, 0.014),
        measure_anchor_03=base_wid + local_variation * 0.05 + rng.normal(0, 0.01),
        measure_anchor_04=base_wid - env_drift * 0.04 + rng.normal(0, 0.01),
        measure_anchor_05=base_thk + main_influence * 0.06 + rng.normal(0, 0.006),
        measure_anchor_06=base_thk - fixture_wear * 0.04 + rng.normal(0, 0.006),
        measure_anchor_07=0.09 + press_alignment * 0.02 + rng.normal(0, 0.004),
        measure_anchor_08=0.06 + display_flex_bias * 0.02 + rng.normal(0, 0.004),
        measure_anchor_09=0.02 + material_shrink * 0.01 + rng.normal(0, 0.003),
        measure_anchor_10=-0.01 - cooling_profile * 0.01 + rng.normal(0, 0.003),
        measure_anchor_11=0.04 + main_influence * 0.03 + rng.normal(0, 0.004),
        measure_anchor_12=0.03 + fixture_wear * 0.02 + rng.normal(0, 0.003),
    )

    for idx in range(1, 121):
        group = idx % 6
        if group == 0:
            value = base_len * (0.08 + idx * 0.0005) + env_drift * 0.18 + rng.normal(0, 0.05)
        elif group == 1:
            value = base_wid * (0.07 + idx * 0.00035) + fixture_wear * 0.16 + rng.normal(0, 0.045)
        elif group == 2:
            value = base_thk * (0.35 + idx * 0.0007) + main_influence * 0.10 + rng.normal(0, 0.02)
        elif group == 3:
            value = row["profile_warp"] * (1.5 + idx * 0.01) + local_variation * 0.06 + rng.normal(0, 0.015)
        elif group == 4:
            value = row["flatness_ref"] * (1.2 + idx * 0.008) + display_flex_bias * 0.05 + rng.normal(0, 0.015)
        else:
            value = 10 + idx * 0.2 + machine_group * 0.8 + is_night_shift * 1.1 + rng.normal(0, 0.25)
        row[f"feature_{idx:03d}"] = value

    if part_type == "frame":
        row["frame_critical_wall_delta"] = frame_wall_bias * 0.85 + rng.normal(0, 0.03)
        row["display_flex_tail"] = display_flex_bias * 0.4 + rng.normal(0, 0.03)
        row["battery_shell_hint"] = battery_swelling_base * 0.25 + rng.normal(0, 0.03)
    elif part_type == "display":
        row["frame_critical_wall_delta"] = frame_wall_bias * 0.3 + rng.normal(0, 0.03)
        row["display_flex_tail"] = display_flex_bias * 0.9 + rng.normal(0, 0.03)
        row["battery_shell_hint"] = battery_swelling_base * 0.2 + rng.normal(0, 0.03)
    else:
        row["frame_critical_wall_delta"] = frame_wall_bias * 0.2 + rng.normal(0, 0.03)
        row["display_flex_tail"] = display_flex_bias * 0.25 + rng.normal(0, 0.03)
        row["battery_shell_hint"] = battery_swelling_base * 0.95 + rng.normal(0, 0.03)

    return {key: round_value(value) for key, value in row.items()}


def build_assembly_features(
    assembly_index: int,
    assembly_id: str,
    sub_batch_id: str,
    station_id: str,
    fixture_id: str,
    shift: str,
    timestamp_bucket: str,
    env_drift: float,
    fixture_wear: float,
    material_shrink: float,
    cooling_profile: float,
    press_alignment: float,
    glue_variation: float,
    display_flex_bias: float,
    battery_swelling_base: float,
    frame_wall_bias: float,
) -> Dict[str, object]:
    is_night_shift = 1 if shift == "N" else 0
    threshold_trigger = 1 if frame_wall_bias > 0.82 else 0
    interaction_trigger = 1 if (display_flex_bias > 0.58 and env_drift > 0.45) else 0

    intermediate_gap = (
        0.16
        + frame_wall_bias * 0.42
        + display_flex_bias * 0.11
        + glue_variation * 0.18
        + rng.normal(0, 0.012)
    )
    seal_step = (
        0.08
        + glue_variation * 0.34
        + env_drift * 0.09
        + display_flex_bias * 0.05
        + rng.normal(0, 0.01)
    )
    stress_proxy = (
        0.12
        + battery_swelling_base * 0.31
        + press_alignment * 0.18
        + threshold_trigger * 0.07
        + rng.normal(0, 0.012)
    )
    camera_tilt = 0.05 + press_alignment * 0.26 + fixture_wear * 0.12 + rng.normal(0, 0.009)
    final_flush_gap = (
        0.22
        + frame_wall_bias * 0.58
        + display_flex_bias * 0.36
        + glue_variation * 0.21
        + env_drift * 0.16
        + interaction_trigger * 0.24
        + rng.normal(0, 0.016)
    )
    final_back_cover_step = (
        0.18
        + battery_swelling_base * 0.63
        + stress_proxy * 0.28
        + is_night_shift * 0.04
        + rng.normal(0, 0.015)
    )
    touch_failure_risk = (
        0.04
        + display_flex_bias * 0.44
        + env_drift * 0.18
        + interaction_trigger * 0.32
        + rng.normal(0, 0.02)
    )
    cosmetic_score = 92 - final_flush_gap * 12 - final_back_cover_step * 8 - camera_tilt * 22 + rng.normal(0, 1.2)
    leak_risk_score = 8 + seal_step * 35 + glue_variation * 8 + battery_swelling_base * 4 + rng.normal(0, 0.7)
    pseudo_station_score = station_id.endswith("3") * 6 + fixture_wear * 4.5 + env_drift * 2.1 + rng.normal(0, 0.8)

    row: Dict[str, object] = OrderedDict(
        assembly_id=assembly_id,
        sub_batch_id=sub_batch_id,
        station_id=station_id,
        fixture_id=fixture_id,
        shift=shift,
        timestamp_bucket=timestamp_bucket,
        product_model=f"PM-{1 + (assembly_index % 3)}",
        line_code=f"LINE-{1 + (assembly_index % 4)}",
        operator_team=f"TEAM-{1 + (assembly_index % 5)}",
        env_temp=24.2 + env_drift * 1.6 + rng.normal(0, 0.22),
        env_humidity=47 + env_drift * 4.1 + is_night_shift * 1.8 + rng.normal(0, 1.2),
        env_dew_proxy=9.5 + env_drift * 0.7 + rng.normal(0, 0.2),
        fixture_wear_index=fixture_wear,
        material_shrink_index=material_shrink,
        cooling_profile_index=cooling_profile,
        press_alignment_index=press_alignment,
        glue_variation_index=glue_variation,
        display_flex_bias=display_flex_bias,
        battery_swelling_index=battery_swelling_base,
        frame_wall_bias=frame_wall_bias,
        threshold_trigger=threshold_trigger,
        interaction_trigger=interaction_trigger,
        intermediate_gap=intermediate_gap,
        seal_step=seal_step,
        stress_proxy=stress_proxy,
        camera_tilt=camera_tilt,
        final_flush_gap=final_flush_gap,
        final_back_cover_step=final_back_cover_step,
        touch_failure_risk=touch_failure_risk,
        cosmetic_score=cosmetic_score,
        leak_risk_score=leak_risk_score,
        pseudo_station_score=pseudo_station_score,
        join_hint_key=f"JH-{sub_batch_id}-{shift}",
        near_match_code=f"NM-{sub_batch_id}-{assembly_index % 2}",
    )

    for idx in range(1, 121):
        group = idx % 7
        if group == 0:
            value = final_flush_gap * (1.6 + idx * 0.01) + rng.normal(0, 0.03)
        elif group == 1:
            value = final_back_cover_step * (1.4 + idx * 0.009) + battery_swelling_base * 0.08 + rng.normal(0, 0.03)
        elif group == 2:
            value = stress_proxy * (1.5 + idx * 0.008) + threshold_trigger * 0.06 + rng.normal(0, 0.025)
        elif group == 3:
            value = seal_step * (1.3 + idx * 0.007) + glue_variation * 0.06 + rng.normal(0, 0.02)
        elif group == 4:
            value = camera_tilt * (1.2 + idx * 0.009) + press_alignment * 0.07 + rng.normal(0, 0.02)
        elif group == 5:
            value = cosmetic_score * (0.12 + idx * 0.0005) + rng.normal(0, 0.35)
        else:
            value = 16 + idx * 0.18 + (assembly_index % 11) * 0.7 + rng.normal(0, 0.2)
        row[f"assembly_feature_{idx:03d}"] = value

    return {key: round_value(value) for key, value in row.items()}


def flatten_part(prefix: str, row: Dict[str, object]) -> Dict[str, object]:
    return OrderedDict((f"{prefix}_{key}", value) for key, value in row.items())


def inject_missing_values(rows: List[Dict[str, object]], field_names: List[str], rate: float, protected: set):
    for row in rows:
        for field_name in field_names:
            if field_name in protected:
                continue
            if rng.random() < rate:
                row[field_name] = ""


def inject_outliers(rows: List[Dict[str, object]]):
    for sample_index in [35, 119, 233, 401]:
        if sample_index >= len(rows):
            continue
        row = rows[sample_index]
        row["final_flush_gap"] = round_value(float(row["final_flush_gap"]) + 0.55)
        row["touch_failure_risk"] = round_value(float(row["touch_failure_risk"]) + 0.42)
        row["cosmetic_score"] = round_value(float(row["cosmetic_score"]) - 12.5)
        row["leak_risk_score"] = round_value(float(row["leak_risk_score"]) + 9.2)


def write_csv(file_path: Path, rows: List[Dict[str, object]]):
    field_names = list(rows[0].keys())
    with file_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=field_names)
        writer.writeheader()
        writer.writerows(rows)


def build_field_dictionary(field_names: List[str]):
    entries = []
    for field_name in field_names:
        field_type = "categorical" if (
            field_name.endswith("_id")
            or "code" in field_name
            or "lot" in field_name
            or field_name in {"shift", "product_model", "line_code", "operator_team", "timestamp_bucket"}
        ) else "numeric"
        if field_name == "timestamp_bucket":
            field_type = "datetime_bucket"

        if field_name.startswith("frame_"):
            source_scope = "frame_part"
        elif field_name.startswith("display_"):
            source_scope = "display_part"
        elif field_name.startswith("battery_"):
            source_scope = "battery_part"
        else:
            source_scope = "assembly"

        entries.append(
            {
                "table": "phone_dimension_benchmark",
                "field_name": field_name,
                "field_type": field_type,
                "source_scope": source_scope,
                "role_hint": "identifier" if field_name.endswith("_id") else "analysis_feature",
                "description": f"{source_scope}::{field_name} 字段，用于手机尺寸分析评测宽表。",
            }
        )
    return entries


def build_truth():
    return {
        "dataset_summary": {
            "name": "agentic_phone_dimension_benchmark_v2_single_table",
            "seed": SEED,
            "row_count": ASSEMBLY_COUNT,
            "format": "single_wide_csv",
            "files": ["phone_dimension_benchmark.csv"],
            "goal": "验证 Agent 在单表宽表结构下发现手机尺寸复杂规律的能力。",
        },
        "analysis_topics": [
            "整机齐平度与外观段差的根因定位",
            "显示模组柔性偏移与高温漂交互效应",
            "电池膨胀代理量与背盖台阶的路径传播",
            "伪相关信号与错误归因风险识别",
        ],
        "causal_chains": [
            {
                "chain_id": "chain_frame_flush_gap",
                "steps": [
                    "frame_frame_wall_bias",
                    "intermediate_gap",
                    "final_flush_gap",
                    "cosmetic_score",
                ],
            },
            {
                "chain_id": "chain_battery_back_step",
                "steps": [
                    "battery_battery_swelling_index",
                    "stress_proxy",
                    "final_back_cover_step",
                    "leak_risk_score",
                ],
            },
            {
                "chain_id": "chain_display_interaction",
                "steps": [
                    "display_display_flex_bias",
                    "env_temp",
                    "env_humidity",
                    "interaction_trigger",
                    "touch_failure_risk",
                ],
            },
        ],
        "rules": [
            {
                "rule_id": "R1",
                "category": "direct_linear",
                "source_fields": ["frame_frame_wall_bias", "frame_frame_critical_wall_delta"],
                "target_fields": ["intermediate_gap", "final_flush_gap"],
                "relationship_type": "positive_linear",
                "activation_condition": "全样本稳定生效",
                "strength": "strong",
                "is_root_cause": True,
                "expected_discovery_statement": "frame_frame_wall_bias 越大，intermediate_gap 和 final_flush_gap 越差，是外观段差主根因。",
            },
            {
                "rule_id": "R2",
                "category": "multi_variable_interaction",
                "source_fields": ["display_display_flex_bias", "env_temp", "env_humidity"],
                "target_fields": ["interaction_trigger", "touch_failure_risk", "final_flush_gap"],
                "relationship_type": "interaction_amplification",
                "activation_condition": "display_display_flex_bias 高且 env_drift 高时更明显",
                "strength": "strong",
                "is_root_cause": True,
                "expected_discovery_statement": "display_display_flex_bias 在高温漂环境下被放大，显著推高 touch_failure_risk 与 final_flush_gap。",
            },
            {
                "rule_id": "R3",
                "category": "threshold_effect",
                "source_fields": ["frame_frame_wall_bias"],
                "target_fields": ["threshold_trigger", "stress_proxy", "final_back_cover_step"],
                "relationship_type": "piecewise_jump",
                "activation_condition": "frame_frame_wall_bias 超过阈值后突增",
                "strength": "medium",
                "is_root_cause": True,
                "expected_discovery_statement": "frame_frame_wall_bias 超阈值后，stress_proxy 与 final_back_cover_step 出现明显跳变。",
            },
            {
                "rule_id": "R4",
                "category": "path_propagation",
                "source_fields": ["battery_battery_swelling_index", "battery_battery_shell_hint"],
                "target_fields": ["stress_proxy", "final_back_cover_step", "leak_risk_score"],
                "relationship_type": "mediated_path",
                "activation_condition": "全样本稳定生效",
                "strength": "strong",
                "is_root_cause": True,
                "expected_discovery_statement": "battery_battery_swelling_index 通过 stress_proxy 传导到 final_back_cover_step 和 leak_risk_score。",
            },
            {
                "rule_id": "R5",
                "category": "spurious_common_cause",
                "source_fields": ["station_id", "pseudo_station_score"],
                "target_fields": ["final_flush_gap", "cosmetic_score"],
                "relationship_type": "spurious_correlation",
                "activation_condition": "未控制 fixture_wear_index / env_temp / env_humidity 时明显",
                "strength": "medium",
                "is_root_cause": False,
                "expected_discovery_statement": "station_id 与 pseudo_station_score 更像共因代理，而不是独立根因。",
            },
            {
                "rule_id": "R6",
                "category": "misleading_proxy",
                "source_fields": ["frame_near_match_code", "join_hint_key"],
                "target_fields": ["touch_failure_risk", "leak_risk_score"],
                "relationship_type": "weak_proxy",
                "activation_condition": "浅层聚合分析时可能出现",
                "strength": "weak",
                "is_root_cause": False,
                "expected_discovery_statement": "near_match_code / join_hint_key 易制造伪模式，必须避免替代真实结构关系。",
            },
        ],
        "misleading_signals": [
            {"signal": "pseudo_station_score", "why_misleading": "更像 fixture_wear_index 与环境漂移的共因代理。"},
            {"signal": "frame_near_match_code", "why_misleading": "近似关联键会制造错误模式。"},
            {"signal": "operator_team", "why_misleading": "与 shift、station_id 一起变化，易被误判。"},
        ],
        "recommended_analysis_path": [
            "直接在单表中以 final_flush_gap、final_back_cover_step、touch_failure_risk 为目标字段做画像。",
            "按前缀区分 assembly 字段、frame_ 字段、display_ 字段、battery_ 字段。",
            "优先验证 frame_frame_wall_bias、display_display_flex_bias、battery_battery_swelling_index 的主链。",
            "对 station_id、shift、pseudo_station_score、frame_near_match_code 做控制变量或分层分析。",
            "针对 threshold_trigger 与 interaction_trigger 关注阈值和交互效应。",
        ],
        "standard_conclusions": [
            {
                "title": "外观段差主链",
                "statement": "frame_frame_wall_bias 是 final_flush_gap 的第一主链，并通过 intermediate_gap 传导到 cosmetic_score。",
                "evidence_anchor_fields": ["frame_frame_wall_bias", "intermediate_gap", "final_flush_gap", "cosmetic_score"],
            },
            {
                "title": "温漂交互效应",
                "statement": "display_display_flex_bias 在高温漂环境下会放大 touch_failure_risk 与最终段差。",
                "evidence_anchor_fields": ["display_display_flex_bias", "env_temp", "env_humidity", "interaction_trigger", "touch_failure_risk"],
            },
            {
                "title": "背盖台阶路径传播",
                "statement": "battery_battery_swelling_index 主要通过 stress_proxy 影响 final_back_cover_step 和 leak_risk_score。",
                "evidence_anchor_fields": ["battery_battery_swelling_index", "stress_proxy", "final_back_cover_step", "leak_risk_score"],
            },
        ],
    }


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    rows: List[Dict[str, object]] = []

    for assembly_index in range(ASSEMBLY_COUNT):
        assembly_id = f"A-{assembly_index + 1:04d}"
        sub_batch_id = f"SB-{1 + (assembly_index // 24):03d}"
        station_id = f"ST-{1 + (assembly_index % 7):02d}"
        fixture_id = f"FX-{1 + (assembly_index % 9):02d}"
        shift = "N" if assembly_index % 5 in (3, 4) else "D"
        timestamp_bucket = compute_timestamp_bucket(assembly_index)

        env_drift = rng.normal(0, 0.7)
        fixture_wear = np.clip((assembly_index / ASSEMBLY_COUNT) * 1.4 + rng.normal(0, 0.12), 0, 1.6)
        material_shrink = rng.normal(0, 0.8)
        cooling_profile = rng.normal(0, 0.75)
        press_alignment = rng.normal(0, 0.65)
        glue_variation = rng.normal(0, 0.7)
        display_flex_bias = rng.normal(0.1 + (1 if shift == "N" else 0) * 0.08, 0.7)
        battery_swelling_base = rng.normal(0.05 + fixture_wear * 0.12, 0.68)
        frame_wall_bias = rng.normal(0.1 + env_drift * 0.05 + fixture_wear * 0.08, 0.72)

        assembly_row = build_assembly_features(
            assembly_index,
            assembly_id,
            sub_batch_id,
            station_id,
            fixture_id,
            shift,
            timestamp_bucket,
            env_drift,
            fixture_wear,
            material_shrink,
            cooling_profile,
            press_alignment,
            glue_variation,
            display_flex_bias,
            battery_swelling_base,
            frame_wall_bias,
        )

        frame_row = build_part_features(
            assembly_index, assembly_id, sub_batch_id, station_id, fixture_id, shift, timestamp_bucket, "frame", 1,
            env_drift, fixture_wear, material_shrink, cooling_profile, press_alignment, glue_variation,
            display_flex_bias, battery_swelling_base, frame_wall_bias,
        )
        display_row = build_part_features(
            assembly_index, assembly_id, sub_batch_id, station_id, fixture_id, shift, timestamp_bucket, "display", 2,
            env_drift, fixture_wear, material_shrink, cooling_profile, press_alignment, glue_variation,
            display_flex_bias, battery_swelling_base, frame_wall_bias,
        )
        battery_row = build_part_features(
            assembly_index, assembly_id, sub_batch_id, station_id, fixture_id, shift, timestamp_bucket, "battery", 3,
            env_drift, fixture_wear, material_shrink, cooling_profile, press_alignment, glue_variation,
            display_flex_bias, battery_swelling_base, frame_wall_bias,
        )

        merged = OrderedDict()
        merged.update(assembly_row)
        merged.update(flatten_part("frame", frame_row))
        merged.update(flatten_part("display", display_row))
        merged.update(flatten_part("battery", battery_row))
        rows.append(merged)

    field_names = list(rows[0].keys())
    inject_missing_values(
        rows,
        [field for field in field_names if "feature_" in field or "measure_anchor_" in field or "assembly_anchor_" in field],
        rate=0.02,
        protected={"assembly_id", "frame_part_id", "display_part_id", "battery_part_id"},
    )
    inject_outliers(rows)

    write_csv(DATA_DIR / "phone_dimension_benchmark.csv", rows)
    with (DATA_DIR / "field_dictionary.json").open("w", encoding="utf-8") as handle:
        json.dump(build_field_dictionary(field_names), handle, ensure_ascii=False, indent=2)
    with (DATA_DIR / "dataset_truth.json").open("w", encoding="utf-8") as handle:
        json.dump(build_truth(), handle, ensure_ascii=False, indent=2)

    print(f"输出目录: {DATA_DIR}")
    print(f"phone_dimension_benchmark.csv 行数={len(rows)} 列数={len(field_names)}")


if __name__ == "__main__":
    main()
