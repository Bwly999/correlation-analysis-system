from typing import Any, Dict, Iterable

import numpy as np
import pandas as pd


DEFAULT_MAX_DEPENDENCE_PLOTS = 8


def _normalize_bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in ('true', '1', 'yes', 'on'):
            return True
        if normalized in ('false', '0', 'no', 'off'):
            return False
    if value is None:
        return default
    return bool(value)


def _clamp_float(value: Any, default: float, lower: float, upper: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = default
    return min(max(number, lower), upper)


def _clamp_int(value: Any, default: int, lower: int, upper: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default
    return min(max(number, lower), upper)


def _normalize_max_dependence_plots(config: Dict[str, Any]) -> int:
    raw_value = config.get('maxDependencePlots', DEFAULT_MAX_DEPENDENCE_PLOTS)
    try:
        limit = int(raw_value)
    except (TypeError, ValueError):
        limit = DEFAULT_MAX_DEPENDENCE_PLOTS
    return max(1, limit)


def _normalize_model_config(config: Dict[str, Any]) -> Dict[str, Any]:
    return {
        'n_estimators': _clamp_int(config.get('nEstimators'), 500, 50, 5000),
        'learning_rate': _clamp_float(config.get('learningRate'), 0.05, 0.001, 0.5),
        'max_depth': _clamp_int(config.get('maxDepth'), 6, 2, 12),
        'test_size': _clamp_float(config.get('testSize'), 0.2, 0.05, 0.4),
        'random_seed': _clamp_int(config.get('randomSeed'), 42, 0, 2**32 - 1),
        'shap_sample_limit': _clamp_int(config.get('shapSampleLimit'), 2000, 100, 1000000),
        'auto_tune_enabled': _normalize_bool(config.get('autoTuneEnabled'), True),
        'auto_tune_threshold': _clamp_float(config.get('autoTuneThreshold'), 0.6, 0.0, 1.0),
        'tuning_iterations': _clamp_int(config.get('tuningIterations'), 20, 1, 100),
        'tuning_cv': _clamp_int(config.get('tuningCv'), 5, 2, 10),
    }


def _normalize_outlier_method(config: Dict[str, Any]) -> str | None:
    method = config.get('outlierMethod', 'none')
    if method in ('iqr', 'isolation_forest'):
        return method
    return None


def _normalize_outlier_max_samples(value: Any) -> Any:
    if value in ('auto', 'all'):
        return value
    try:
        return max(1, int(value))
    except (TypeError, ValueError):
        return 'auto'


def analyze_xgboost_shap(data: Iterable[Dict[str, Any]], target: str, config: Dict[str, Any]) -> Dict[str, Any]:
    try:
        from backend.algorithm.robust_insight_tool import (
            DataEngine,
            InsightEngine,
            ModelCore,
            SystemContext,
            VisualStudio,
        )
    except ImportError:
        from algorithm.robust_insight_tool import (
            DataEngine,
            InsightEngine,
            ModelCore,
            SystemContext,
            VisualStudio,
        )

    df = pd.DataFrame(list(data))
    if df.empty:
        raise ValueError('未提供可分析的数据')
    if target not in df.columns:
        raise ValueError(f"目标字段 '{target}' 不存在")

    include_cols = config.get('factorNames', [])
    if not isinstance(include_cols, list):
        include_cols = []

    data_engine_kwargs = {
        'target_col': target,
        'include_cols': include_cols if include_cols else None,
        'use_regex': False,
    }
    outlier_method = _normalize_outlier_method(config)
    if outlier_method:
        data_engine_kwargs.update(
            {
                'clean_outliers_method': outlier_method,
                'iqr_threshold': _clamp_float(config.get('iqrThreshold'), 1.5, 0.5, 5.0),
                'outlier_contamination': _clamp_float(
                    config.get('outlierContamination'), 0.05, 0.001, 0.5
                ),
                'outlier_n_estimators': _clamp_int(config.get('outlierNEstimators'), 100, 50, 1000),
                'outlier_max_samples': _normalize_outlier_max_samples(
                    config.get('outlierMaxSamples', 'auto')
                ),
                'random_seed': _clamp_int(config.get('randomSeed'), 42, 0, 2**32 - 1),
            }
        )
    engine = DataEngine(**data_engine_kwargs)
    df_clean = engine.load_data(df)
    X, y = engine.get_X_y(df_clean)

    if len(X) < 10:
        raise ValueError('有效数据过少，无法训练模型')

    model_config = _normalize_model_config(config)
    model_core = ModelCore(
        n_estimators=model_config['n_estimators'],
        learning_rate=model_config['learning_rate'],
        max_depth=model_config['max_depth'],
        test_size=model_config['test_size'],
        random_seed=model_config['random_seed'],
        auto_tune_enabled=model_config['auto_tune_enabled'],
        auto_tune_threshold=model_config['auto_tune_threshold'],
        tuning_iterations=model_config['tuning_iterations'],
        tuning_cv=model_config['tuning_cv'],
    )
    model_core.train(X, y, metric='r2')

    insight_engine = InsightEngine(
        model_core.model,
        X,
        shap_sample_limit=model_config['shap_sample_limit'],
        random_seed=model_config['random_seed'],
    )
    X_sample, y_sample, shap_values = insight_engine.compute(y)

    feature_names = X_sample.columns.tolist()
    mean_abs_shap = np.abs(shap_values.values).mean(axis=0)
    max_dependence_plots = min(len(feature_names), _normalize_max_dependence_plots(config))
    top_indices = np.argsort(-mean_abs_shap)[:max_dependence_plots]
    top_feature_names = [feature_names[index] for index in top_indices]
    importance = [
        {
            'name': feature_name,
            'value': float(value),
            'rank': index + 1,
        }
        for index, (feature_name, value) in enumerate(
            sorted(zip(feature_names, mean_abs_shap), key=lambda item: item[1], reverse=True)
        )
    ]

    dependence = []
    dependence_images = []
    for feature_index, feature_name in zip(top_indices, top_feature_names):
        dependence.append(
            {
                'feature': feature_name,
                'x': X_sample[feature_name].values.tolist(),
                'shap': shap_values.values[:, feature_index].tolist(),
                'actualY': y_sample.tolist() if y_sample is not None else [],
                'xRange': [
                    float(np.min(X_sample[feature_name].values)),
                    float(np.max(X_sample[feature_name].values)),
                ],
                'shapRange': [
                    float(np.min(shap_values.values[:, feature_index])),
                    float(np.max(shap_values.values[:, feature_index])),
                ],
            }
        )
        dependence_images.append(
            {
                'feature': feature_name,
                'image': VisualStudio.get_dependence_plot_base64(shap_values, X_sample, feature_name),
            }
        )

    SystemContext._fix_matplotlib_chinese()
    import matplotlib.pyplot as plt

    plt.close('all')

    beeswarm_image = VisualStudio.get_beeswarm_base64(shap_values, X_sample)
    full_report_image = VisualStudio.get_full_report_base64(
        shap_values,
        X_sample,
        y_sample,
        model_r2=model_core.r2_score,
        model_mae=model_core.mae,
        target_col=target,
        max_dependence_plots=max_dependence_plots,
        detail_feature_names=top_feature_names,
    )

    return {
        'summary': {
            'targetField': target,
            'sampleCount': int(len(X_sample)),
            'featureCount': int(len(feature_names)),
            'r2': round(model_core.r2_score, 4),
            'mae': round(model_core.mae, 4),
        },
        'importance': importance,
        'dependence': dependence,
        'assets': {
            'beeswarmImage': beeswarm_image,
            'fullReportImage': full_report_image,
            'dependenceImages': dependence_images,
        },
        'message': '分析完成',
    }
