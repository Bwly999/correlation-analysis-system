from dataclasses import dataclass
from typing import Iterable, List, Optional, Union

import pandas as pd


@dataclass
class RegressionDataset:
    frame: pd.DataFrame
    features: pd.DataFrame
    target: pd.Series
    feature_names: List[str]
    sample_count: int


def _coerce_dataframe(source: Union[pd.DataFrame, Iterable[dict]]) -> pd.DataFrame:
    if isinstance(source, pd.DataFrame):
        frame = source.copy()
    else:
        frame = pd.DataFrame(list(source))

    if frame.empty:
        raise ValueError('未提供可分析的数据')

    return frame


def prepare_regression_dataset(
    source: Union[pd.DataFrame, Iterable[dict]],
    target_col: str,
    feature_names: Optional[List[str]] = None,
) -> RegressionDataset:
    frame = _coerce_dataframe(source)
    if target_col not in frame.columns:
        raise ValueError(f"目标字段 '{target_col}' 不存在")

    candidate_names = feature_names or [column for column in frame.columns if column != target_col]
    if not candidate_names:
        raise ValueError('未提供可用于建模的特征字段')

    normalized_target = pd.to_numeric(frame[target_col], errors='coerce')
    valid_target_mask = normalized_target.notna()
    filtered_frame = frame.loc[valid_target_mask, :].reset_index(drop=True)
    filtered_target = normalized_target.loc[valid_target_mask].reset_index(drop=True)

    numeric_features = {}
    kept_feature_names: List[str] = []
    for feature_name in candidate_names:
        if feature_name == target_col or feature_name not in filtered_frame.columns:
            continue
        normalized_feature = pd.to_numeric(filtered_frame[feature_name], errors='coerce')
        if normalized_feature.notna().sum() == 0:
            continue
        median_value = normalized_feature.median()
        numeric_features[feature_name] = normalized_feature.fillna(median_value)
        kept_feature_names.append(feature_name)

    if not kept_feature_names:
        raise ValueError('未识别到可用于回归的数值特征字段')

    feature_frame = pd.DataFrame(numeric_features)
    return RegressionDataset(
        frame=filtered_frame,
        features=feature_frame,
        target=filtered_target,
        feature_names=kept_feature_names,
        sample_count=len(feature_frame),
    )
