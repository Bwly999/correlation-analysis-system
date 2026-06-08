#!/usr/bin/env python3
"""
生成手机尺寸分析评测基准数据集。

输出：
- part_measurements.csv
- assembly_measurements.csv
- mapping_or_lot_bridge.csv
- field_dictionary.json
- dataset_truth.json
- README.md
"""

from __future__ import annotations

import csv
import json
import math
from collections import OrderedDict
from pathlib import Path
from typing import Dict, List

import numpy as np


SEED = 20260608
ASSEMBLY_COUNT = 480
PART_TYPES = ("frame", "display", "battery")
OUTPUT_DIR = Path(__file__).resolve().parent
ROOT_DIR = OUTPUT_DIR.parent
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


def build_part_row(
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
    near_match_code = f"NM-{sub_batch_id}-{cavity_index % 2}"

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
        base_thk = 4.35 + battery_swelling_base * 0.1 + rng.normal(0, 0.02)
        main_influence = battery_swelling_base
        local_variation = cooling_profile

    row: Dict[str, object] = OrderedDict(
        part_id=f"P-{assembly_id}-{part_type.upper()}",
        assembly_id=assembly_id,
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
        near_match_code=near_match_code,
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
    )

    anchor_measurements = {
        "measure_anchor_01": base_len + main_influence * 0.12 + rng.normal(0, 0.012),
        "measure_anchor_02": base_len - main_influence * 0.08 + rng.normal(0, 0.014),
        "measure_anchor_03": base_wid + local_variation * 0.05 + rng.normal(0, 0.01),
        "measure_anchor_04": base_wid - env_drift * 0.04 + rng.normal(0, 0.01),
        "measure_anchor_05": base_thk + main_influence * 0.06 + rng.normal(0, 0.006),
        "measure_anchor_06": base_thk - fixture_wear * 0.04 + rng.normal(0, 0.006),
        "measure_anchor_07": row["flatness_ref"] + press_alignment * 0.02 + rng.normal(0, 0.004),
        "measure_anchor_08": row["profile_warp"] + display_flex_bias * 0.02 + rng.normal(0, 0.004),
        "measure_anchor_09": row["hole_position_x"] + material_shrink * 0.01 + rng.normal(0, 0.003),
        "measure_anchor_10": row["hole_position_y"] - cooling_profile * 0.01 + rng.normal(0, 0.003),
        "measure_anchor_11": row["diagonal_delta"] + main_influence * 0.03 + rng.normal(0, 0.004),
        "measure_anchor_12": row["edge_collapse"] + fixture_wear * 0.02 + rng.normal(0, 0.003),
    }
    row.update(anchor_measurements)

    for idx in range(1, 181):
        group = idx % 6
        if group == 0:
            value = base_len * (0.08 + idx * 0.0004) + env_drift * 0.18 + rng.normal(0, 0.05)
        elif group == 1:
            value = base_wid * (0.07 + idx * 0.00035) + fixture_wear * 0.16 + rng.normal(0, 0.045)
        elif group == 2:
            value = base_thk * (0.35 + idx * 0.0007) + main_influence * 0.1 + rng.normal(0, 0.02)
        elif group == 3:
            value = row["profile_warp"] * (1.5 + idx * 0.01) + local_variation * 0.06 + rng.normal(0, 0.015)
        elif group == 4:
            value = row["flatness_ref"] * (1.2 + idx * 0.008) + display_flex_bias * 0.05 + rng.normal(0, 0.015)
        else:
            value = (
                10
                + idx * 0.2
                + machine_group * 0.8
                + is_night_shift * 1.1
                + rng.normal(0, 0.25)
            )
        row[f"part_feature_{idx:03d}"] = value

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


def build_assembly_row(
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
    camera_tilt = (
        0.05
        + press_alignment * 0.26
        + fixture_wear * 0.12
        + rng.normal(0, 0.009)
    )
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
    cosmetic_score = (
        92
        - final_flush_gap * 12
        - final_back_cover_step * 8
        - camera_tilt * 22
        + rng.normal(0, 1.2)
    )
    leak_risk_score = (
        8
        + seal_step * 35
        + glue_variation * 8
        + battery_swelling_base * 4
        + rng.normal(0, 0.7)
    )
    pseudo_station_score = (
        station_id.endswith("3") * 6
        + fixture_wear * 4.5
        + env_drift * 2.1
        + rng.normal(0, 0.8)
    )

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

    anchor_metrics = {
        "assembly_anchor_01": final_flush_gap + rng.normal(0, 0.01),
        "assembly_anchor_02": final_back_cover_step + rng.normal(0, 0.01),
        "assembly_anchor_03": stress_proxy + rng.normal(0, 0.008),
        "assembly_anchor_04": seal_step + rng.normal(0, 0.008),
        "assembly_anchor_05": camera_tilt + rng.normal(0, 0.006),
        "assembly_anchor_06": touch_failure_risk + rng.normal(0, 0.01),
        "assembly_anchor_07": cosmetic_score + rng.normal(0, 0.5),
        "assembly_anchor_08": leak_risk_score + rng.normal(0, 0.2),
        "assembly_anchor_09": pseudo_station_score + rng.normal(0, 0.3),
        "assembly_anchor_10": (final_flush_gap * 0.7 + camera_tilt * 0.5 + rng.normal(0, 0.01)),
        "assembly_anchor_11": (seal_step * 0.8 + stress_proxy * 0.4 + rng.normal(0, 0.01)),
        "assembly_anchor_12": (touch_failure_risk * 0.9 + final_back_cover_step * 0.3 + rng.normal(0, 0.01)),
    }
    row.update(anchor_metrics)

    for idx in range(1, 181):
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


def inject_missing_values(rows: List[Dict[str, object]], field_names: List[str], rate: float, protected: set):
    for row in rows:
        for field_name in field_names:
            if field_name in protected:
                continue
            if rng.random() < rate:
                row[field_name] = ""


def inject_outliers(assembly_rows: List[Dict[str, object]]):
    sample_indexes = [35, 119, 233, 401]
    for sample_index in sample_indexes:
        if sample_index >= len(assembly_rows):
            continue
        row = assembly_rows[sample_index]
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


def build_field_dictionary(part_fields: List[str], assembly_fields: List[str], bridge_fields: List[str]):
    def classify_field(field_name: str) -> str:
        if field_name.endswith("_id") or "code" in field_name or "lot" in field_name or field_name in {
            "shift",
            "part_type",
            "product_model",
            "line_code",
            "operator_team",
            "machine_group",
            "cavity_id",
            "timestamp_bucket",
        }:
            return "categorical"
        if field_name == "timestamp_bucket":
            return "datetime_bucket"
        return "numeric"

    entries = []
    for table_name, fields in (
        ("part_measurements", part_fields),
        ("assembly_measurements", assembly_fields),
        ("mapping_or_lot_bridge", bridge_fields),
    ):
        for field_name in fields:
            entries.append(
                {
                    "table": table_name,
                    "field_name": field_name,
                    "field_type": classify_field(field_name),
                    "role_hint": (
                        "join_key"
                        if field_name in {"part_id", "assembly_id", "sub_batch_id", "station_id", "fixture_id"}
                        else "analysis_feature"
                    ),
                    "description": f"{table_name}::{field_name} 字段，用于手机尺寸分析评测。",
                }
            )
    return entries


def build_truth():
    return {
        "dataset_summary": {
            "name": "agentic_phone_dimension_benchmark_v1",
            "seed": SEED,
            "assembly_count": ASSEMBLY_COUNT,
            "part_count": ASSEMBLY_COUNT * len(PART_TYPES),
            "tables": [
                "part_measurements.csv",
                "assembly_measurements.csv",
                "mapping_or_lot_bridge.csv",
            ],
            "goal": "验证 Agent 在高维手机尺寸数据中主动发现跨表复杂规律的能力。",
        },
        "analysis_topics": [
            "整机齐平度与外观段差的根因定位",
            "显示模组柔性偏移与夜班温漂的交互效应",
            "电池膨胀代理量与背盖台阶的路径传播",
            "伪相关机台分组与真实根因拆解",
        ],
        "causal_chains": [
            {
                "chain_id": "chain_frame_flush_gap",
                "steps": [
                    "frame_wall_bias",
                    "intermediate_gap",
                    "final_flush_gap",
                    "cosmetic_score",
                ],
            },
            {
                "chain_id": "chain_battery_back_step",
                "steps": [
                    "battery_swelling_index",
                    "stress_proxy",
                    "final_back_cover_step",
                    "leak_risk_score",
                ],
            },
            {
                "chain_id": "chain_display_interaction",
                "steps": [
                    "display_flex_bias",
                    "env_temp/env_humidity",
                    "interaction_trigger",
                    "touch_failure_risk",
                ],
            },
        ],
        "rules": [
            {
                "rule_id": "R1",
                "category": "direct_linear",
                "source_fields": ["frame_wall_bias", "frame_critical_wall_delta"],
                "target_fields": ["intermediate_gap", "final_flush_gap"],
                "relationship_type": "positive_linear",
                "activation_condition": "全样本稳定生效",
                "strength": "strong",
                "is_root_cause": True,
                "expected_discovery_statement": "中框壁厚偏置越大，组装中间间隙和最终齐平间隙越差，是外观段差的主根因之一。",
            },
            {
                "rule_id": "R2",
                "category": "multi_variable_interaction",
                "source_fields": ["display_flex_bias", "env_temp", "env_humidity"],
                "target_fields": ["interaction_trigger", "touch_failure_risk", "final_flush_gap"],
                "relationship_type": "interaction_amplification",
                "activation_condition": "display_flex_bias > 0.58 且 env_drift > 0.45",
                "strength": "strong",
                "is_root_cause": True,
                "expected_discovery_statement": "显示柔性偏移在高温漂/高湿度班次下被放大，显著推高触控失效率和最终段差。",
            },
            {
                "rule_id": "R3",
                "category": "threshold_effect",
                "source_fields": ["frame_wall_bias"],
                "target_fields": ["threshold_trigger", "stress_proxy", "final_back_cover_step"],
                "relationship_type": "piecewise_jump",
                "activation_condition": "frame_wall_bias > 0.82",
                "strength": "medium",
                "is_root_cause": True,
                "expected_discovery_statement": "当中框关键壁厚偏置超过阈值后，应力代理值和背盖台阶出现明显突增。",
            },
            {
                "rule_id": "R4",
                "category": "path_propagation",
                "source_fields": ["battery_swelling_index", "battery_shell_hint"],
                "target_fields": ["stress_proxy", "final_back_cover_step", "leak_risk_score"],
                "relationship_type": "mediated_path",
                "activation_condition": "全样本稳定生效",
                "strength": "strong",
                "is_root_cause": True,
                "expected_discovery_statement": "电池膨胀代理量不会直接决定所有外观问题，但会先抬高装配应力，再推高背盖台阶和漏液风险。",
            },
            {
                "rule_id": "R5",
                "category": "spurious_common_cause",
                "source_fields": ["station_id", "pseudo_station_score"],
                "target_fields": ["final_flush_gap", "cosmetic_score"],
                "relationship_type": "spurious_correlation",
                "activation_condition": "浅层分析或未控制 fixture_wear_index/env_drift 时明显",
                "strength": "medium",
                "is_root_cause": False,
                "expected_discovery_statement": "某些工站看起来和外观不良强相关，但主要是治具磨损和环境漂移共同造成的表面相关。",
            },
            {
                "rule_id": "R6",
                "category": "misleading_proxy",
                "source_fields": ["near_match_code", "join_hint_key"],
                "target_fields": ["touch_failure_risk", "leak_risk_score"],
                "relationship_type": "weak_proxy",
                "activation_condition": "仅做批次聚合时可能出现",
                "strength": "weak",
                "is_root_cause": False,
                "expected_discovery_statement": "近似关联键可能带来伪模式，必须通过稳定主键 join 和控制变量验证。",
            },
        ],
        "misleading_signals": [
            {
                "signal": "pseudo_station_score",
                "why_misleading": "与段差结果显著相关，但本质是 fixture_wear_index 和 env_drift 的共因代理。",
            },
            {
                "signal": "near_match_code",
                "why_misleading": "可形成看似可用的近似关联，但不是稳定主键，可能引入错误归因。",
            },
            {
                "signal": "operator_team",
                "why_misleading": "和班次、工站同时变化，未分层时容易被误判成人员差异。",
            },
        ],
        "recommended_analysis_path": [
            "先用 mapping_or_lot_bridge.csv 建立 part_id 到 assembly_id 的稳定关联",
            "先看 assembly_measurements 中 final_flush_gap、final_back_cover_step、touch_failure_risk 的分布和异常值",
            "跨表回溯 frame_wall_bias、display_flex_bias、battery_swelling_index 等根因字段",
            "对工站/班次相关信号做控制变量或分层分析，排除伪相关",
            "对阈值规则尝试分箱、分组和树模型验证",
        ],
        "standard_conclusions": [
            {
                "title": "外观段差主链",
                "statement": "中框关键壁厚偏置是 final_flush_gap 的第一主链，且通过 intermediate_gap 传导到 cosmetic_score。",
                "evidence_anchor_fields": ["frame_wall_bias", "intermediate_gap", "final_flush_gap", "cosmetic_score"],
            },
            {
                "title": "温漂交互效应",
                "statement": "display_flex_bias 单独影响有限，但在高温漂条件下会显著放大触控失败风险和最终段差。",
                "evidence_anchor_fields": ["display_flex_bias", "env_temp", "env_humidity", "interaction_trigger", "touch_failure_risk"],
            },
            {
                "title": "背盖台阶路径传播",
                "statement": "battery_swelling_index 主要通过 stress_proxy 影响 final_back_cover_step，而不是简单直接线性关系。",
                "evidence_anchor_fields": ["battery_swelling_index", "stress_proxy", "final_back_cover_step", "leak_risk_score"],
            },
            {
                "title": "工站伪相关",
                "statement": "station_id 和 pseudo_station_score 的显著性不能直接解释为工站根因，需要先控制治具磨损和环境漂移。",
                "evidence_anchor_fields": ["station_id", "pseudo_station_score", "fixture_wear_index", "env_temp", "final_flush_gap"],
            },
        ],
    }


def build_readme(part_fields: int, assembly_fields: int, bridge_rows: int) -> str:
    return f"""# 手机尺寸分析评测数据集

这是一套面向 Agent 化数据分析与 Python 沙盒执行的手机尺寸评测基准数据。

## 文件清单

- `part_measurements.csv`：单体物料测量数据，列数 {part_fields}
- `assembly_measurements.csv`：组装后测量数据，列数 {assembly_fields}
- `mapping_or_lot_bridge.csv`：多表桥接关系表，行数 {bridge_rows}
- `field_dictionary.json`：字段字典
- `dataset_truth.json`：结构化规律真值与标准结论

## 设计特点

- 两张主表均为高维数据，便于考察特征筛选、回归、树模型和多表关联能力
- 同时包含真实根因、中介变量、阈值效应、交互项、伪相关和误导项
- 提供稳定主键与近似可关联键，便于评测 Agent 的 join 策略是否稳健

## 推荐分析起手式

1. 先读取桥表，确认 `part_id -> assembly_id` 的稳定关联关系
2. 以 `final_flush_gap`、`final_back_cover_step`、`touch_failure_risk` 为优先目标做画像
3. 回溯 `frame_wall_bias`、`display_flex_bias`、`battery_swelling_index` 等单体因子
4. 对 `station_id`、`operator_team`、`near_match_code` 等可疑伪相关项做控制变量验证
"""


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    part_rows: List[Dict[str, object]] = []
    assembly_rows: List[Dict[str, object]] = []
    bridge_rows: List[Dict[str, object]] = []

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

        assembly_rows.append(
            build_assembly_row(
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
        )

        for cavity_index, part_type in enumerate(PART_TYPES, start=1):
            part_row = build_part_row(
                assembly_index,
                assembly_id,
                sub_batch_id,
                station_id,
                fixture_id,
                shift,
                timestamp_bucket,
                part_type,
                cavity_index,
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
            part_rows.append(part_row)
            bridge_rows.append(
                OrderedDict(
                    part_id=part_row["part_id"],
                    sub_batch_id=sub_batch_id,
                    assembly_id=assembly_id,
                    station_id=station_id,
                    fixture_id=fixture_id,
                    shift=shift,
                    timestamp_bucket=timestamp_bucket,
                    part_type=part_type,
                    cavity_id=part_row["cavity_id"],
                    machine_group=part_row["machine_group"],
                    material_lot=part_row["material_lot"],
                    product_model=assembly_rows[-1]["product_model"],
                    join_hint_key=assembly_rows[-1]["join_hint_key"],
                    near_match_code=part_row["near_match_code"],
                    bridge_quality_flag="stable_join",
                )
            )

    part_fields = list(part_rows[0].keys())
    assembly_fields = list(assembly_rows[0].keys())
    bridge_fields = list(bridge_rows[0].keys())

    inject_missing_values(
        part_rows,
        [field for field in part_fields if field.startswith("part_feature_") or field.startswith("measure_anchor_")],
        rate=0.022,
        protected={"part_id", "assembly_id"},
    )
    inject_missing_values(
        assembly_rows,
        [field for field in assembly_fields if field.startswith("assembly_feature_") or field.startswith("assembly_anchor_")],
        rate=0.018,
        protected={"assembly_id"},
    )
    inject_outliers(assembly_rows)

    write_csv(DATA_DIR / "part_measurements.csv", part_rows)
    write_csv(DATA_DIR / "assembly_measurements.csv", assembly_rows)
    write_csv(DATA_DIR / "mapping_or_lot_bridge.csv", bridge_rows)

    field_dictionary = build_field_dictionary(part_fields, assembly_fields, bridge_fields)
    with (DATA_DIR / "field_dictionary.json").open("w", encoding="utf-8") as handle:
        json.dump(field_dictionary, handle, ensure_ascii=False, indent=2)

    with (DATA_DIR / "dataset_truth.json").open("w", encoding="utf-8") as handle:
        json.dump(build_truth(), handle, ensure_ascii=False, indent=2)

    print(f"输出目录: {DATA_DIR}")
    print(f"part_measurements.csv 行数={len(part_rows)} 列数={len(part_fields)}")
    print(f"assembly_measurements.csv 行数={len(assembly_rows)} 列数={len(assembly_fields)}")
    print(f"mapping_or_lot_bridge.csv 行数={len(bridge_rows)} 列数={len(bridge_fields)}")


if __name__ == "__main__":
    main()
