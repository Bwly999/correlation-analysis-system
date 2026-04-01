from typing import Any, Dict, Iterable

import numpy as np
import pandas as pd


DEFAULT_MAX_DEPENDENCE_PLOTS = 8


def _normalize_max_dependence_plots(config: Dict[str, Any]) -> int:
    raw_value = config.get('maxDependencePlots', DEFAULT_MAX_DEPENDENCE_PLOTS)
    try:
        limit = int(raw_value)
    except (TypeError, ValueError):
        limit = DEFAULT_MAX_DEPENDENCE_PLOTS
    return max(1, limit)


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

    engine = DataEngine(
        target_col=target,
        include_cols=include_cols if include_cols else None,
        use_regex=False,
    )
    df_clean = engine.load_data(df)
    X, y = engine.get_X_y(df_clean)

    if len(X) < 10:
        raise ValueError('有效数据过少，无法训练模型')

    model_core = ModelCore()
    model_core.train(X, y, metric='r2')

    insight_engine = InsightEngine(model_core.model, X)
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
